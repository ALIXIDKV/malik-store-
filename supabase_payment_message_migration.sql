-- MALIK STORE - PESAN INSTRUKSI PEMBAYARAN OTOMATIS (manual, bukan payment gateway)
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang. TIDAK mengubah tabel, kolom, policy RLS, maupun data lama.
--
-- Kenapa pakai fungsi: policy messages hanya mengizinkan user mengirim sender='user'; sender='admin' hanya untuk akun admin.
-- Fungsi ini (SECURITY DEFINER) menyisipkan SATU pesan sender='admin' ke chat pemilik order dengan isi TEMPLATE TETAP.
-- User tidak bisa mengisi teks sendiri lewat fungsi ini, jadi tidak bisa memalsukan pesan admin.
--   - hanya pemilik order yang bisa memanggil (akun admin ditolak)
--   - 1 order = 1 pesan pembayaran (dipanggil ulang / klik ganda / refresh tidak membuat pesan dobel)
--   - baris "[QRIS]" diganti gambar assets/payment/qris.jpg oleh js/payment-message.js saat ditampilkan

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

  code := 'ORD-' || upper(substr(replace(o.id::text, '-', ''), 1, 8));   -- sama dengan MalikAuth.orderCode()

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

-- Cek (opsional): select proname from pg_proc where proname = 'malik_send_payment_message';
