-- =====================================================================================
-- MALIK STORE - TAHAP 2B: MANAJEMEN PRODUK DINAMIS (tambah produk/varian dari admin)
-- Jalankan MANUAL di Supabase > SQL Editor. AMAN dijalankan ulang (idempotent).
-- PRASYARAT: migration katalog + arsip sudah pernah dijalankan (tabel product_catalog*, kolom archived).
--
-- YANG DILAKUKAN FILE INI
--   1. reviews: mengganti HANYA CHECK whitelist lama (persis panel/sewa_bot/reseller_admin pada kolom product_key)
--      dengan cek bentuk kode produk, supaya produk baru bisa diberi ulasan. Constraint lain tidak disentuh.
--      Skema tidak sesuai asumsi -> migrasi berhenti dengan error jelas sebelum mengubah apa pun.
--   2. malik_product_meta(): produk yang TIDAK dikenali aturan lama dicari lewat product_catalog.order_name,
--      sehingga orders.product_key / variant terisi dan ulasan bisa dibuat. Perilaku produk lama TIDAK berubah
--      (aturan lama tetap dipakai untuk nama varian produk lama). Fungsi diubah immutable -> stable (membaca tabel).
--   3. Admin boleh INSERT produk (product_catalog_groups) dan varian (product_catalog):
--        - hanya role admin (RLS), hanya kolom yang aman (order_name & sort TIDAK bisa dikirim dari browser)
--        - trigger memvalidasi, membuat order_name stabil ("NAMA PRODUK - NAMA VARIAN") dan sort otomatis
--   4. Seed produk SC OURIN DELUXE (sc_ourin_deluxe) + 4 varian. Jalankan ulang TIDAK menimpa edit admin.
--
-- YANG TIDAK DILAKUKAN
--   - TIDAK ada DELETE (tidak ada grant/policy delete). TIDAK ada DROP TABLE / TRUNCATE.
--   - RLS tidak dinonaktifkan. Policy yang sudah ada tidak diubah. Tabel orders/messages/profiles tidak disentuh.
--   - Data order/ulasan lama tidak diubah.
--
-- ---- CEK DULU (opsional, hanya membaca) -------------------------------------------------
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.reviews'::regclass and contype = 'c';   -- rating & comment tetap ada
--   select product_key, variant_id, order_name, price, sort from public.product_catalog order by sort;   -- 17 baris sebelum migrasi
-- =====================================================================================

-- 0) PRASYARAT SKEMA: hentikan dengan error jelas bila skema aktual tidak sesuai asumsi ------------------------
do $$
declare t text; c text;
begin
  perform set_config('lock_timeout', '10s', true);   -- jangan menggantung bila tabel sedang dipakai; hanya berlaku di transaksi ini
  foreach t in array array['reviews', 'orders', 'product_catalog', 'product_catalog_groups'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'MIGRASI DIBATALKAN: tabel public.% tidak ditemukan. Jalankan migrasi dasar/katalog terlebih dahulu. Tidak ada yang diubah.', t;
    end if;
  end loop;
  foreach c in array array['reviews.product_key', 'orders.product_key', 'orders.variant', 'orders.qty',
                           'product_catalog.order_name', 'product_catalog.label', 'product_catalog.archived',
                           'product_catalog_groups.archived', 'product_catalog_groups.archived_at'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = split_part(c, '.', 1) and column_name = split_part(c, '.', 2)) then
      raise exception 'MIGRASI DIBATALKAN: kolom public.% tidak ditemukan (skema tidak sesuai asumsi; jalankan migrasi katalog/arsip dulu). Tidak ada yang diubah.', c;
    end if;
  end loop;
  if to_regprocedure('public.malik_is_admin()') is null then
    raise exception 'MIGRASI DIBATALKAN: fungsi public.malik_is_admin() tidak ditemukan. Tidak ada yang diubah.';
  end if;
end $$;

-- 1) REVIEWS: ganti HANYA whitelist produk lama ---------------------------------------------------------------
-- Dibuang: CHECK satu-kolom pada reviews.product_key yang daftar nilainya PERSIS {panel, sewa_bot, reseller_admin}
-- (apa pun nama constraint-nya). CHECK lain (rating 1-5, panjang comment, dll) dan constraint lain TIDAK disentuh.
-- Penggantinya hanya memeriksa BENTUK kode produk; kebenaran produk tetap dijaga trigger malik_review_guard
-- (product_key diambil dari order milik pembeli). Idempotent: dijalankan ulang = tidak ada perubahan.
do $$
declare
  pk_attnum smallint;
  r record;
  lits text[];
  dropped int := 0;
  cname constant text := 'malik_reviews_product_key_format_chk';
begin
  perform set_config('lock_timeout', '10s', true);
  select attnum into pk_attnum from pg_attribute
   where attrelid = 'public.reviews'::regclass and attname = 'product_key' and not attisdropped;
  if pk_attnum is null then
    raise exception 'MIGRASI DIBATALKAN: kolom reviews.product_key tidak ditemukan.';
  end if;

  -- Tahap A (hanya membaca): constraint tak dikenal yang menyebut product_key dan tampak whitelist -> berhenti sebelum mengubah apa pun.
  for r in
    select conname, conkey, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.reviews'::regclass and contype = 'c' and pk_attnum = any (conkey)
  loop
    select coalesce(array_agg(distinct x[1] order by x[1]), '{}') into lits
      from regexp_matches(r.def, '''([^'']*)''', 'g') as x;     -- literal string di definisi constraint
    if r.conkey = array[pk_attnum] and lits = array['panel', 'reseller_admin', 'sewa_bot'] then
      null;   -- whitelist lama yang dikenal: akan diganti di tahap B
    elsif r.conname <> cname and lits <> '{}' and r.def ~* '(\yany\y|\yin\y)' and r.def !~ '~' then
      raise exception 'MIGRASI DIBATALKAN: constraint "%" pada reviews.product_key tampak whitelist tetapi bukan whitelist lama yang dikenal (%). Tinjau manual; tidak ada yang diubah.', r.conname, r.def;
    end if;
  end loop;

  -- Tahap B: buang whitelist lama yang dikenal.
  for r in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.reviews'::regclass and contype = 'c' and conkey = array[pk_attnum]
  loop
    select coalesce(array_agg(distinct x[1] order by x[1]), '{}') into lits
      from regexp_matches(r.def, '''([^'']*)''', 'g') as x;
    if lits = array['panel', 'reseller_admin', 'sewa_bot'] then
      execute format('alter table public.reviews drop constraint %I', r.conname);
      dropped := dropped + 1;
      raise notice 'Whitelist produk lama dibuang: % (%)', r.conname, r.def;
    end if;
  end loop;

  -- Pengganti: hanya cek bentuk kode produk. Data lama (panel/sewa_bot/reseller_admin) lolos.
  if not exists (select 1 from pg_constraint where conrelid = 'public.reviews'::regclass and conname = cname) then
    if exists (select 1 from public.reviews where product_key !~ '^[a-z0-9][a-z0-9_]{1,39}$') then
      raise exception 'MIGRASI DIBATALKAN: ada baris reviews dengan product_key berbentuk tidak valid. Periksa manual; tidak ada yang diubah.';
    end if;
    execute format('alter table public.reviews add constraint %I check (product_key ~ %L)', cname, '^[a-z0-9][a-z0-9_]{1,39}$');
  end if;
  raise notice 'reviews: % whitelist lama dibuang (0 = sudah bersih / sudah pernah dimigrasi).', dropped;
end $$;

-- 2) malik_product_meta: aturan lama + pencarian katalog untuk produk baru ---------------------------------
create or replace function public.malik_product_meta(p_product text)
returns table(product_key text, variant text, qty int)
language plpgsql stable set search_path = public as $$
declare s text := upper(btrim(coalesce(p_product, ''))); m text[]; c record; hit boolean := false;
begin
  qty := 1;
  m := regexp_match(s, '^(.*)\s+X(\d+)$');
  if m is not null then s := btrim(m[1]); qty := greatest(1, least(m[2]::int, 9999)); end if;
  if s like 'OPEN PANEL RAM %' then
    product_key := 'panel';
    variant := case when s like '%UNLIMITED' then 'Unlimited' else (regexp_match(s, 'RAM\s+(\d+GB)'))[1] end;
  elsif s like 'SEWA BOT%' then
    product_key := 'sewa_bot';
    variant := (regexp_match(s, '(\d+)\s+GROUP'))[1] || ' Group';
  elsif s like 'RESELLER PANEL%' then product_key := 'reseller_admin'; variant := 'Reseller Panel';
  elsif s like 'ADMIN PANEL%'    then product_key := 'reseller_admin'; variant := 'Admin Panel';
  elsif s like 'RESELLER BOT%'   then product_key := 'reseller_admin'; variant := 'Reseller Bot';
  end if;
  -- Katalog adalah sumber kebenaran untuk produk baru / varian baru dari admin (cocok persis dengan order_name).
  select * into c from public.product_catalog pc where pc.order_name = s;
  hit := found;
  if hit then
    if product_key is distinct from c.product_key then
      product_key := c.product_key; variant := c.label;   -- produk di luar aturan lama (atau salah cocok awalan lama)
    else
      variant := coalesce(variant, c.label);               -- produk lama: varian dari aturan lama tetap dipertahankan
    end if;
  end if;
  return next;
end $$;

-- 3) INSERT PRODUK & VARIAN OLEH ADMIN -------------------------------------------------------------------
-- 3a) Guard produk (grup)
create or replace function public.malik_catalog_group_insert_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.product_key := btrim(coalesce(new.product_key, ''));
  if new.product_key !~ '^[a-z0-9][a-z0-9_]{1,39}$' then
    raise exception 'Kode produk harus 2-40 karakter: huruf kecil, angka, atau underscore.' using errcode = '22023';
  end if;
  new.name := regexp_replace(btrim(coalesce(new.name, '')), '\s+', ' ', 'g');
  new.description := btrim(coalesce(new.description, ''));
  if char_length(new.name) < 1 or char_length(new.name) > 60 then
    raise exception 'Nama produk harus 1-60 karakter.' using errcode = '22023';
  end if;
  if char_length(new.description) < 1 or char_length(new.description) > 800 then
    raise exception 'Deskripsi harus 1-800 karakter.' using errcode = '22023';
  end if;
  new.archived := coalesce(new.archived, false);
  new.archived_at := case when new.archived then coalesce(new.archived_at, now()) else null end;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_catalog_group_insert_guard on public.product_catalog_groups;
create trigger malik_catalog_group_insert_guard before insert on public.product_catalog_groups
  for each row execute function public.malik_catalog_group_insert_guard();

-- 3b) Guard varian: validasi, order_name stabil, sort otomatis.
--     Dari aplikasi (auth.uid() terisi) order_name & sort SELALU dibuat di sini. Dari SQL Editor / service role
--     (auth.uid() null, mis. seed di file ini) nilai eksplisit dihormati.
create or replace function public.malik_catalog_insert_guard()
returns trigger language plpgsql set search_path = public as $$
declare g record;
begin
  new.product_key := btrim(coalesce(new.product_key, ''));
  new.variant_id  := btrim(coalesce(new.variant_id, ''));
  if new.variant_id !~ '^[a-z0-9][a-z0-9_]{0,39}$' then
    raise exception 'Kode varian tidak valid.' using errcode = '22023';
  end if;
  select * into g from public.product_catalog_groups gr where gr.product_key = new.product_key;
  if not found then raise exception 'Produk tidak ditemukan.' using errcode = '22023'; end if;
  new.label := regexp_replace(btrim(coalesce(new.label, '')), '\s+', ' ', 'g');
  if char_length(new.label) < 1 or char_length(new.label) > 40 then
    raise exception 'Nama varian harus 1-40 karakter.' using errcode = '22023';
  end if;
  -- akhiran " X<angka>" dibaca sistem order sebagai jumlah (qty)
  if new.label ~* '\sx\d+$' then
    raise exception 'Nama varian tidak boleh berakhir dengan " x" diikuti angka.' using errcode = '22023';
  end if;
  if new.price is null or new.price < 1 or new.price > 100000000 then
    raise exception 'Harga harus antara Rp1 dan Rp100.000.000.' using errcode = '22023';
  end if;
  new.active := coalesce(new.active, true);
  new.archived := coalesce(new.archived, false);
  new.archived_at := case when new.archived then coalesce(new.archived_at, now()) else null end;
  if auth.uid() is not null or coalesce(btrim(new.order_name), '') = '' then
    new.order_name := upper(regexp_replace(btrim(g.name), '\s+', ' ', 'g') || ' - ' || new.label);
  else
    new.order_name := upper(regexp_replace(btrim(new.order_name), '\s+', ' ', 'g'));
  end if;
  if new.order_name ~ '\sX\d+$' then
    raise exception 'Nama produk + varian tidak boleh berakhir dengan " X" diikuti angka.' using errcode = '22023';
  end if;
  if auth.uid() is not null or new.sort is null or new.sort <= 0 then
    new.sort := (select coalesce(max(c.sort), 0) + 1 from public.product_catalog c);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_catalog_insert_guard on public.product_catalog;
create trigger malik_catalog_insert_guard before insert on public.product_catalog
  for each row execute function public.malik_catalog_insert_guard();

-- 3c) Izin kolom (order_name & sort sengaja TIDAK diberikan) + policy INSERT khusus admin
grant insert (product_key, name, description, archived) on public.product_catalog_groups to authenticated;
grant insert (product_key, variant_id, label, price, active) on public.product_catalog to authenticated;

drop policy if exists "malik_cgroups_insert" on public.product_catalog_groups;
create policy "malik_cgroups_insert" on public.product_catalog_groups for insert to authenticated
  with check ((select public.malik_is_admin()));
drop policy if exists "malik_catalog_insert" on public.product_catalog;
create policy "malik_catalog_insert" on public.product_catalog for insert to authenticated
  with check ((select public.malik_is_admin()));

-- 4) SEED: SC OURIN DELUXE ------------------------------------------------------------------------------------
-- order_name stabil dipakai orders.product / riwayat / ulasan. Jangan diubah setelah ada order.
insert into public.product_catalog_groups (product_key, name, description) values
  ('sc_ourin_deluxe', 'SC OURIN DELUXE',
   'Script bot Ourin Deluxe dengan pilihan paket update dan lisensi reseller. Pilih paket sesuai kebutuhan, lalu order dari dashboard.')
on conflict (product_key) do nothing;

insert into public.product_catalog (product_key, variant_id, order_name, label, price, sort) values
  ('sc_ourin_deluxe', 'no_update',   'SC OURIN DELUXE - NO UPDATE',   'No update',   25000, 18),
  ('sc_ourin_deluxe', '3x_update',   'SC OURIN DELUXE - 3X UPDATE',   '3x update',   35000, 19),
  ('sc_ourin_deluxe', 'full_update', 'SC OURIN DELUXE - FULL UPDATE', 'Full update', 60000, 20),
  ('sc_ourin_deluxe', 'reseller',    'SC OURIN DELUXE - RESELLER',    'Reseller',    90000, 21)
on conflict (product_key, variant_id) do nothing;

-- 5) CEK HASIL (opsional, hanya membaca) -----------------------------------------------------------------------
-- select product_key, variant_id, order_name, label, price, sort from public.product_catalog where product_key = 'sc_ourin_deluxe' order by sort;  -- 4 baris
-- select * from public.malik_product_meta('SC OURIN DELUXE - FULL UPDATE x2');   -- sc_ourin_deluxe | Full update | 2
-- select polname from pg_policy where polrelid in ('public.product_catalog'::regclass, 'public.product_catalog_groups'::regclass) order by 1;  -- +2 policy insert
