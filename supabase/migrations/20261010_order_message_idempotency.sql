-- MALIK STORE - IDEMPOTENSI PESAN ORDER (Tahap 1 stabilitas)
-- JANGAN dijalankan otomatis. Tinjau dulu, lalu jalankan MANUAL di Supabase > SQL Editor (staging dulu bila ada).
-- Aman dijalankan ulang (create or replace). TIDAK mengubah tabel, kolom, policy RLS, maupun data.
--
-- Masalah: pesan order dikirim dengan pola "cek dulu, baru insert" dari browser. Jika request pertama ternyata
-- sudah berhasil (timeout / respons hilang) atau ada klik ganda / dua tab, dua request bisa lolos pengecekan bersamaan
-- dan menghasilkan pesan dobel. Perbaikan: pengecekan + insert dilakukan atomik di database dengan advisory lock per order.
--
-- Aplikasi tetap berfungsi SEBELUM migrasi ini dijalankan (memakai jalur cadangan di client, tidak atomik);
-- setelah migrasi dijalankan, aplikasi otomatis memakai fungsi baru ini.

-- 1) Pesan order milik user (sender = 'user'), tepat satu per order.
create or replace function public.malik_send_order_message(p_order_id uuid, p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o    record;
  code text;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if public.malik_is_admin() then raise exception 'Akun admin tidak dapat memakai fungsi ini'; end if;

  select id, user_id into o from public.orders where id = p_order_id;
  if not found or o.user_id <> auth.uid() then raise exception 'Order tidak ditemukan'; end if;

  code := 'ORD-' || upper(substr(replace(o.id::text, '-', ''), 1, 8));

  if p_text is null or char_length(btrim(p_text)) = 0 or char_length(p_text) > 2000
     or position('Order ID: ' || code in p_text) = 0 then
    raise exception 'Pesan order tidak valid';
  end if;

  -- Serialkan semua pemanggilan untuk order yang sama sampai transaksi selesai.
  perform pg_advisory_xact_lock(hashtextextended('malik_order_msg:' || o.id::text, 0));

  if exists (
    select 1 from public.messages
    where user_id = o.user_id and sender = 'user'
      and position('Order ID: ' || code in message) > 0
  ) then
    return false;   -- sudah pernah dikirim
  end if;

  insert into public.messages (user_id, sender, message) values (o.user_id, 'user', p_text);
  return true;
end;
$$;

revoke all on function public.malik_send_order_message(uuid, text) from public, anon;
grant execute on function public.malik_send_order_message(uuid, text) to authenticated;

-- 2) Pesan instruksi pembayaran: isi & perilaku sama dengan versi sebelumnya (10_payment_message_migration.sql),
--    hanya ditambah advisory lock agar dua panggilan bersamaan tidak sama-sama lolos pengecekan "sudah dikirim".
create or replace function public.malik_send_payment_message(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o    record;
  code text;
  txt  text;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if public.malik_is_admin() then raise exception 'Akun admin tidak dapat memakai fungsi ini'; end if;

  select id, user_id into o from public.orders where id = p_order_id;
  if not found or o.user_id <> auth.uid() then raise exception 'Order tidak ditemukan'; end if;

  code := 'ORD-' || upper(substr(replace(o.id::text, '-', ''), 1, 8));   -- sama dengan orderCode() di lib/order-flow.ts

  perform pg_advisory_xact_lock(hashtextextended('malik_order_pay:' || o.id::text, 0));

  if exists (
    select 1 from public.messages
    where user_id = o.user_id and sender = 'admin'
      and message like E'\U0001F6D2 Pesanan Baru Berhasil Dibuat%'
      and message like '%Order ID: ' || code
  ) then
    return false;   -- sudah pernah dikirim
  end if;

  txt := E'\U0001F6D2 Pesanan Baru Berhasil Dibuat\n\n'
      || E'Terima kasih sudah order di Malik Store.\n\n'
      || E'Silakan lakukan pembayaran:\n\n'
      || E'QRIS:\n[QRIS]\n\n'
      || E'DANA:\n085881002051\n\n'
      || E'GoPay:\n085178132305\n\n'
      || E'Setelah transfer kirim bukti pembayaran melalui chat.\n\n'
      || 'Order ID: ' || code;

  insert into public.messages (user_id, sender, message) values (o.user_id, 'admin', txt);
  return true;
end;
$$;

revoke all on function public.malik_send_payment_message(uuid) from public, anon;
grant execute on function public.malik_send_payment_message(uuid) to authenticated;

-- Cek (opsional, hanya membaca):
--   select proname from pg_proc where proname in ('malik_send_order_message', 'malik_send_payment_message');
-- Rollback (opsional): drop function if exists public.malik_send_order_message(uuid, text);
--   (malik_send_payment_message tetap berfungsi; versi lama ada di migrations-archive/10_payment_message_migration.sql)
