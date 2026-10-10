-- =====================================================================================
-- MALIK STORE - TAHAP 2B (REVISI): HARGA ORDER DITENTUKAN DATABASE, PRODUK TAK DIKENAL DITOLAK
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261010_product_management.sql. Idempotent (create or replace).
--
-- MASALAH SEBELUMNYA
--   malik_apply_catalog_price() melakukan "if not found then return new" -> order dengan nama produk yang TIDAK ada
--   di katalog lolos dengan harga kiriman pelanggan (bisa dipalsukan dari browser).
--
-- YANG BERUBAH
--   Order BARU (BEFORE INSERT) hanya diterima jika product = order_name resmi di product_catalog (+ opsional " xN", N 1-99)
--   dengan varian aktif, tidak diarsipkan, dan produknya tidak diarsipkan. price DIISI ULANG = harga katalog x N.
--   Produk/varian tidak dikenal, nonaktif, atau diarsipkan -> ditolak (errcode 22023).
--   Nama produk dinormalkan ke bentuk resmi ("sc ourin deluxe - reseller" -> "SC OURIN DELUXE - RESELLER"; qty ditulis " xN" seperti app).
--
-- YANG TIDAK BERUBAH
--   - Trigger hanya BEFORE INSERT: order/riwayat lama TIDAK disentuh (tidak ada UPDATE data). Update status oleh admin tetap normal.
--   - Nama trigger & urutan sama (aa_ blokir admin -> zy_ harga -> zz_ meta). Fungsi lain, RLS, policy, tabel tidak diubah.
--   - Anti-duplikasi: bila id order sudah ada (retry klien setelah respons hilang), validasi dilewati dan insert tetap gagal 23505
--     di primary key seperti biasa, sehingga klien menemukan order yang sudah tersimpan (lib/order-flow.ts). Tidak ada baris baru.
--   - Insert order lewat jalur apa pun (termasuk service role / SQL Editor) juga divalidasi. Tidak ada kode aplikasi yang
--     menyisipkan order di luar katalog. Untuk impor data historis massal gunakan session_replication_role = replica secara sadar.
--
-- ---- CEK DULU (opsional, hanya membaca) ---------------------------------------------------------------
--   select proname from pg_proc where proname = 'malik_apply_catalog_price';
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--   -- order lama yang namanya tidak ada di katalog (hanya informasi; TIDAK diubah migrasi ini):
--   select o.id, o.product, o.price from public.orders o
--    where not exists (select 1 from public.product_catalog c
--                      where c.order_name = upper(btrim(regexp_replace(o.product, '\s+[xX]\d{1,4}$', '')))) limit 50;
-- =====================================================================================

do $$
begin
  if to_regclass('public.product_catalog') is null or to_regclass('public.product_catalog_groups') is null
     or to_regclass('public.orders') is null then
    raise exception 'MIGRASI DIBATALKAN: tabel orders / product_catalog / product_catalog_groups tidak lengkap. Tidak ada yang diubah.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'product_catalog' and column_name = 'archived')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'product_catalog_groups' and column_name = 'archived') then
    raise exception 'MIGRASI DIBATALKAN: kolom archived belum ada di katalog. Jalankan migrasi arsip + 20261010_product_management.sql dulu. Tidak ada yang diubah.';
  end if;
end $$;

create or replace function public.malik_apply_catalog_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s text := upper(btrim(coalesce(new.product, '')));
  m text[]; q int := 1; c record; total bigint;
begin
  -- Retry klien dengan id yang sama: biarkan primary key menolak (23505) agar klien memakai order yang sudah ada.
  if new.id is not null and exists (select 1 from public.orders o where o.id = new.id) then
    return new;
  end if;

  m := regexp_match(s, '^(.*)\s+X(\d{1,4})$');
  if m is not null then
    s := btrim(m[1]); q := m[2]::int;
    if q < 1 or q > 99 then raise exception 'Jumlah order harus 1-99.' using errcode = '22023'; end if;
  end if;

  select * into c from public.product_catalog where order_name = s;
  if not found then
    raise exception 'Produk tidak dikenali. Pilih produk dari katalog resmi.' using errcode = '22023';
  end if;
  if not c.active or c.archived or exists (
       select 1 from public.product_catalog_groups g where g.product_key = c.product_key and g.archived) then
    raise exception 'Produk ini sedang tidak tersedia.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_catalog_groups g where g.product_key = c.product_key) then
    raise exception 'Produk tidak dikenali. Pilih produk dari katalog resmi.' using errcode = '22023';
  end if;

  total := c.price::bigint * q;
  if total < 1 or total > 2147483647 then
    raise exception 'Total harga di luar batas. Kurangi jumlah order.' using errcode = '22023';
  end if;

  new.price   := total::int;                                           -- harga SELALU dari katalog, bukan dari klien
  new.product := c.order_name || case when q > 1 then ' x' || q else '' end;   -- bentuk resmi (qty " xN" seperti app)
  return new;
end $$;

-- Trigger sama seperti sebelumnya (nama/urutan tidak berubah); dibuat ulang agar pasti terpasang.
drop trigger if exists zy_malik_apply_catalog_price on public.orders;
create trigger zy_malik_apply_catalog_price before insert on public.orders
  for each row execute function public.malik_apply_catalog_price();

-- CEK HASIL (opsional, hanya membaca):
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--   -- urutan: aa_malik_block_admin_order, malik_protect_order(update), zy_malik_apply_catalog_price, zz_malik_order_meta
-- UJI di staging sebagai user biasa (jangan di production dengan data asli):
--   insert ... product 'PRODUK PALSU', price 1            -> ditolak "Produk tidak dikenali"
--   insert ... product 'SC OURIN DELUXE - RESELLER', price 1   -> tersimpan price 90000
--   insert ... product 'sc ourin deluxe - full update x2', price 1 -> tersimpan 'SC OURIN DELUXE - FULL UPDATE x2', price 120000
-- Rollback (kembali ke perilaku lama yang meloloskan produk tak dikenal; TIDAK disarankan): jalankan ulang bagian 5 dari
--   supabase/migrations-archive/11_archive_migration.sql.
