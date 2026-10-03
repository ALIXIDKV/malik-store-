-- =====================================================================================
-- MALIK STORE - MIGRATION ARSIP PRODUK (pengganti "hapus permanen")
-- Jalankan SEKALI di Supabase > SQL Editor. AMAN dijalankan ulang (idempotent).
-- PRASYARAT: supabase_catalog_migration.sql sudah pernah dijalankan (tabel product_catalog*).
--
-- YANG DILAKUKAN FILE INI
--   1. Menambah kolom BARU `archived` (boolean, default false) + `archived_at` di:
--        - public.product_catalog_groups  (arsip SELURUH produk, mis. "SEWA BOT")
--        - public.product_catalog         (arsip satu PAKET, mis. "OPEN PANEL RAM 3GB")
--      Semua baris lama otomatis archived = false -> tampilan website TIDAK berubah.
--   2. Admin boleh mengubah kolom archived (tetap dibatasi RLS: hanya role admin).
--   3. Guard: paket terakhir yang tampil tidak boleh diarsipkan (arsipkan seluruh produknya).
--   4. Order BARU untuk produk/paket yang diarsipkan ditolak database.
--
-- YANG TIDAK DILAKUKAN
--   - TIDAK ada DELETE. Tabel orders / reviews / messages / profiles tidak disentuh.
--   - Order & ulasan lama tetap utuh: trigger order hanya jalan saat INSERT (order baru).
--   - Tidak mengubah policy yang sudah ada, tidak menyentuh tabel lama public.products.
--
-- ---- CEK DULU (opsional, hanya membaca) -------------------------------------------------
--   select product_key, variant_id, active from public.product_catalog order by sort;   -- harus 17 baris
-- ===================================================================================== 

-- 1) KOLOM ARSIP -------------------------------------------------------------------------
alter table public.product_catalog_groups add column if not exists archived    boolean     not null default false;
alter table public.product_catalog_groups add column if not exists archived_at timestamptz;
alter table public.product_catalog        add column if not exists archived    boolean     not null default false;
alter table public.product_catalog        add column if not exists archived_at timestamptz;

-- 2) IZIN (RLS "malik_catalog_update" / "malik_cgroups_update" tetap membatasi ke admin saja) ----
grant update (archived) on public.product_catalog        to authenticated;
grant update (archived) on public.product_catalog_groups to authenticated;

-- 3) GUARD PAKET: tambah aturan arsip (isi lama dipertahankan) ---------------------------------------
create or replace function public.malik_catalog_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.product_key := old.product_key; new.variant_id := old.variant_id;
  new.order_name  := old.order_name;  new.sort := old.sort;
  new.label := btrim(coalesce(new.label, ''));
  if char_length(new.label) < 1 or char_length(new.label) > 40 then
    raise exception 'Nama paket harus 1-40 karakter.' using errcode = '22023';
  end if;
  if new.price is null or new.price < 1 or new.price > 100000000 then
    raise exception 'Harga harus antara Rp1 dan Rp100.000.000.' using errcode = '22023';
  end if;
  new.archived := coalesce(new.archived, false);
  -- paket yang tadinya tampil lalu dinonaktifkan / diarsipkan: harus masih ada paket lain yang aktif & tidak diarsipkan
  if (old.active and not old.archived) and (not new.active or new.archived) and not exists (
       select 1 from public.product_catalog c
       where c.product_key = old.product_key and c.variant_id <> old.variant_id and c.active and not c.archived) then
    raise exception 'Minimal satu paket harus aktif dan tidak diarsipkan untuk setiap produk. Arsipkan seluruh produknya jika ingin menyembunyikan semua paket.' using errcode = '22023';
  end if;
  if new.archived is distinct from old.archived then
    new.archived_at := case when new.archived then now() else null end;
  else
    new.archived_at := old.archived_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_catalog_guard on public.product_catalog;
create trigger malik_catalog_guard before update on public.product_catalog
  for each row execute function public.malik_catalog_guard();

-- 4) GUARD PRODUK (grup): catat waktu arsip ------------------------------------------------------------
create or replace function public.malik_catalog_group_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.product_key := old.product_key;
  new.name := btrim(coalesce(new.name, '')); new.description := btrim(coalesce(new.description, ''));
  if char_length(new.name) < 1 or char_length(new.name) > 60 then
    raise exception 'Nama produk harus 1-60 karakter.' using errcode = '22023';
  end if;
  if char_length(new.description) < 1 or char_length(new.description) > 800 then
    raise exception 'Deskripsi harus 1-800 karakter.' using errcode = '22023';
  end if;
  new.archived := coalesce(new.archived, false);
  if new.archived is distinct from old.archived then
    new.archived_at := case when new.archived then now() else null end;
  else
    new.archived_at := old.archived_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_catalog_group_guard on public.product_catalog_groups;
create trigger malik_catalog_group_guard before update on public.product_catalog_groups
  for each row execute function public.malik_catalog_group_guard();

-- 5) ORDER BARU DITOLAK UNTUK PRODUK DIARSIPKAN (order lama tidak disentuh: trigger hanya BEFORE INSERT) ----
create or replace function public.malik_apply_catalog_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text := upper(btrim(coalesce(new.product, ''))); m text[]; q int := 1; c record;
begin
  m := regexp_match(s, '^(.*)\s+X(\d{1,4})$');
  if m is not null then
    s := btrim(m[1]); q := m[2]::int;
    if q < 1 or q > 99 then raise exception 'Jumlah order harus 1-99.' using errcode = '22023'; end if;
  end if;
  select * into c from public.product_catalog where order_name = s;
  if not found then return new; end if;
  if not c.active or c.archived or exists (
       select 1 from public.product_catalog_groups g where g.product_key = c.product_key and g.archived) then
    raise exception 'Produk ini sedang tidak tersedia.' using errcode = '22023';
  end if;
  new.price := c.price * q;
  return new;
end $$;
drop trigger if exists zy_malik_apply_catalog_price on public.orders;
create trigger zy_malik_apply_catalog_price before insert on public.orders
  for each row execute function public.malik_apply_catalog_price();

-- 6) CEK HASIL (opsional) ---------------------------------------------------------------------------------
-- select product_key, archived from public.product_catalog_groups;                       -- semua false
-- select count(*) filter (where archived) as diarsipkan, count(*) as total from public.product_catalog;   -- 0 / 17
