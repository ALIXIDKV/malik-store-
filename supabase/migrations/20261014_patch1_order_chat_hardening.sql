-- =====================================================================================
-- MALIK STORE V3 - PATCH 1: HARDENING ORDER, CHAT, VOUCHER DASAR
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261013_vouchers.sql. Idempotent (aman dijalankan ulang).
-- TIDAK mengubah: UI, auth, role, flow checkout, tabel/kolom, atau data lama (tidak ada UPDATE/DELETE data).
-- Validasi memakai TRIGGER BEFORE INSERT (bukan CHECK constraint) agar baris lama tidak pernah divalidasi ulang
-- (mis. admin mengubah status order lama tetap aman walau catatan lamanya panjang).
-- =====================================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.messages') is null or to_regclass('public.vouchers') is null then
    raise exception 'PATCH 1 DIBATALKAN: tabel orders / messages / vouchers tidak lengkap. Tidak ada yang diubah.';
  end if;
  if to_regprocedure('public.malik_is_admin()') is null
     or to_regprocedure('public.malik_voucher_calc(text,int,boolean)') is null then
    raise exception 'PATCH 1 DIBATALKAN: jalankan 20261013_vouchers.sql dulu. Tidak ada yang diubah.';
  end if;
end $$;

-- ---------- 1) ORDER: status awal dipaksa Pending, created_at dari server, catatan maks 500 ----------
-- Admin / service role (auth.uid() null) tidak dibatasi. Nama 'aa_malik_f...' berjalan setelah 'aa_malik_block_admin_order'.
create or replace function public.malik_force_order_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;
  new.status     := 'Pending';
  new.created_at := now();
  if char_length(coalesce(new.note, '')) > 500 then
    raise exception 'Catatan maksimal 500 karakter.' using errcode = '22023';   -- 22023: pesan diteruskan ke UI oleh orderError()
  end if;
  return new;
end $$;
revoke all on function public.malik_force_order_defaults() from public, anon, authenticated;

drop trigger if exists aa_malik_force_order_defaults on public.orders;
create trigger aa_malik_force_order_defaults before insert on public.orders
  for each row execute function public.malik_force_order_defaults();

-- ---------- 2) CHAT: user hanya boleh MEMBUAT pesan ----------
-- Kode aplikasi hanya memakai update/delete pesan di admin-chat.tsx (policy admin tetap utuh).
drop policy if exists "malik_msg_update_own" on public.messages;
drop policy if exists "malik_msg_delete_own" on public.messages;

-- Insert oleh non-admin: is_read / hidden_for_admin / created_at tidak boleh diatur sendiri, teks maks 2000
-- (sama dengan batas di malik_send_order_message). Pesan instruksi pembayaran (RPC) lolos: isinya jauh di bawah batas.
create or replace function public.malik_guard_message_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;
  new.is_read          := false;
  new.hidden_for_admin := false;
  new.created_at       := now();
  if char_length(coalesce(new.message, '')) > 2000 then
    raise exception 'Pesan maksimal 2000 karakter.' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.malik_guard_message_insert() from public, anon, authenticated;

drop trigger if exists malik_guard_message_insert on public.messages;
create trigger malik_guard_message_insert before insert on public.messages
  for each row execute function public.malik_guard_message_insert();

-- ---------- 3) VOUCHER DASAR ----------
-- 3a) Pesan error generik untuk kode tidak ada / nonaktif / kedaluwarsa / habis, supaya kode tidak bisa ditebak lewat
--     perbedaan pesan. Logika, signature, dan hak akses fungsi TIDAK berubah (hanya teks 4 pesan itu).
create or replace function public.malik_voucher_calc(p_code text, p_subtotal int, p_lock boolean default false)
returns table(out_id uuid, out_code text, out_discount int, out_error text)
language plpgsql security definer set search_path = public as $$
declare
  vcode text := upper(btrim(coalesce(p_code, '')));
  v public.vouchers%rowtype;
  d int;
begin
  if vcode = '' then
    out_error := 'Kode voucher kosong.'; return next; return;
  end if;

  if p_lock then
    select * into v from public.vouchers where code = vcode for update;
  else
    select * into v from public.vouchers where code = vcode;
  end if;

  if not found or not v.active
     or (v.expires_at is not null and v.expires_at <= now())
     or (v.usage_limit is not null and v.used_count >= v.usage_limit) then
    out_error := 'Kode voucher tidak valid atau sudah tidak berlaku.'; return next; return;
  end if;
  if p_subtotal < v.min_purchase then
    out_error := 'Minimal pembelian Rp' || replace(to_char(v.min_purchase, 'FM999,999,999,999'), ',', '.') || ' untuk voucher ini.';
    return next; return;
  end if;

  if v.discount_type = 'percent' then
    d := floor(p_subtotal::numeric * v.discount_value / 100)::int;
  else
    d := least(v.discount_value, p_subtotal);
  end if;
  if d < 1 then
    out_error := 'Voucher tidak memberi potongan pada total ini.'; return next; return;
  end if;
  if d >= p_subtotal then
    out_error := 'Nilai voucher melebihi total order. Pilih total yang lebih besar atau voucher lain.'; return next; return;
  end if;

  out_id := v.id; out_code := v.code; out_discount := d;
  return next; return;
end $$;

-- 3b) Order yang dihapus dan BELUM Selesai mengembalikan 1 kuota voucher (order Selesai dihapus tidak mengembalikan,
--     jadi membersihkan riwayat tidak membuka kuota). Hanya berlaku untuk penghapusan SETELAH patch ini.
create or replace function public.malik_release_voucher_on_order_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.voucher_id is not null and old.status is distinct from 'Selesai' then
    update public.vouchers set used_count = greatest(used_count - 1, 0) where id = old.voucher_id;
  end if;
  return old;
end $$;
revoke all on function public.malik_release_voucher_on_order_delete() from public, anon, authenticated;

drop trigger if exists malik_release_voucher_on_order_delete on public.orders;
create trigger malik_release_voucher_on_order_delete after delete on public.orders
  for each row execute function public.malik_release_voucher_on_order_delete();

-- ---------- CEK (opsional, hanya membaca) ----------
--   select tgname from pg_trigger where tgrelid='public.orders'::regclass and not tgisinternal order by tgname;
--     -- harus ada: aa_malik_block_admin_order, aa_malik_force_order_defaults, malik_protect_order,
--     --            malik_release_voucher_on_order_delete, zy_malik_apply_catalog_price, zz_malik_order_meta, zzz_malik_apply_voucher
--   select policyname, cmd from pg_policies where schemaname='public' and tablename='messages' order by 1;
--     -- harus 5 policy: delete_admin, insert_admin, insert_user, select, update_admin (TANPA update_own / delete_own)
--   -- Jika masih ada policy lain berperintah UPDATE/DELETE yang bukan admin (dibuat manual di dashboard), hapus juga.
--
-- ---------- UJI DI STAGING, sebagai user biasa ----------
--   insert into orders (user_id, product, price, status) values (auth.uid(), 'OPEN PANEL RAM 1GB', 1, 'Selesai');  -- tersimpan 'Pending', price 1000
--   insert into orders (user_id, product, price, note) values (auth.uid(), 'OPEN PANEL RAM 1GB', 1, repeat('x',501)); -- ditolak
--   update messages set sender='admin' where user_id = auth.uid();   -- 0 baris berubah
--   delete from messages where user_id = auth.uid();                 -- 0 baris terhapus
--   insert into messages (user_id, sender, message, hidden_for_admin, is_read) values (auth.uid(),'user','tes',true,true); -- tersimpan false/false
--   select * from malik_preview_voucher('SALAH','OPEN PANEL RAM 1GB');  -- 'Kode voucher tidak valid atau sudah tidak berlaku.'
--
-- ---------- ROLLBACK (urutan bebas; tidak ada data yang hilang) ----------
--   drop trigger if exists aa_malik_force_order_defaults on public.orders;
--   drop function if exists public.malik_force_order_defaults();
--   drop trigger if exists malik_guard_message_insert on public.messages;
--   drop function if exists public.malik_guard_message_insert();
--   drop trigger if exists malik_release_voucher_on_order_delete on public.orders;
--   drop function if exists public.malik_release_voucher_on_order_delete();
--   create policy "malik_msg_update_own" on public.messages for update to authenticated
--     using (user_id = (select auth.uid()) and not public.malik_is_admin())
--     with check (user_id = (select auth.uid()) and not public.malik_is_admin());
--   create policy "malik_msg_delete_own" on public.messages for delete to authenticated
--     using (user_id = (select auth.uid()));
--   -- pesan voucher lama: jalankan ulang bagian "create or replace function public.malik_voucher_calc" dari 20261013_vouchers.sql
-- =====================================================================================
