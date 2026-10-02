-- =====================================================================================
-- MALIK STORE - MIGRATION KATALOG PRODUK (admin bisa ubah harga / nama / deskripsi / aktif)
-- Jalankan di Supabase > SQL Editor. AMAN dijalankan ulang (idempotent).
--
-- YANG DILAKUKAN FILE INI
--   1. Membuat 2 tabel BARU: product_catalog (per paket) & product_catalog_groups (per produk).
--      Diisi dari js/products.js (harga & nama saat ini). Jalankan ulang TIDAK menimpa edit admin.
--   2. RLS aktif. Semua orang boleh MEMBACA (agar harga tampil untuk tamu). Hanya admin yang boleh
--      MENGUBAH, itupun hanya kolom label/price/active (grup: name/description). Tidak ada INSERT/DELETE.
--   3. Kolom order_name (nama produk lama, mis. "OPEN PANEL RAM 2GB") TERKUNCI. Nama tampilan boleh
--      diganti bebas, tetapi nama di tabel orders tetap sama -> riwayat & ulasan lama tidak rusak.
--   4. Trigger di orders: harga & status aktif DITEGAKKAN database (harga dari browser tidak dipercaya).
--   5. (Opsional, otomatis aman) Saat harga diubah, kolom price di tabel lama public.products ikut
--      disinkronkan agar trigger hitung-harga lama tetap sejalan. Jika tabel/kolomnya tidak cocok,
--      langkah ini hanya memberi WARNING dan TIDAK membatalkan apa pun.
--
-- TIDAK menghapus data, TIDAK mengubah tabel products/orders/messages/profiles/reviews (struktur),
-- TIDAK mengubah policy yang sudah ada.
--
-- ---- CEK DULU (opsional, hanya membaca) -------------------------------------------------
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--   select * from public.products limit 20;
-- ===================================================================================== 

-- 1) TABEL ----------------------------------------------------------------------------
create table if not exists public.product_catalog_groups (
  product_key text primary key,
  name        text not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.product_catalog (
  product_key text        not null,
  variant_id  text        not null,
  order_name  text        not null unique,   -- nama produk lama di orders.product (JANGAN diubah)
  label       text        not null,          -- nama paket yang tampil ke customer
  price       int         not null,          -- harga satuan (Rp)
  active      boolean     not null default true,
  sort        int         not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (product_key, variant_id)
);

-- 2) DATA AWAL (dari js/products.js; tidak menimpa jika sudah ada) --------------------------
insert into public.product_catalog_groups (product_key, name, description) values
  ('panel', 'OPEN PANEL', 'Panel Pterodactyl dengan RAM dedicated untuk menjalankan bot WhatsApp, Discord, Telegram, hingga aplikasi Node.js dan Python. Aktivasi cepat, console realtime, dan dukungan teknis langsung dari tim Malik Store.'),
  ('sewa_bot', 'SEWA BOT', 'Bot WhatsApp siap pakai tanpa perlu mengurus server sendiri. Aktif permanen, fitur selalu diperbarui, dan respons cepat untuk kebutuhan group Anda.'),
  ('reseller_admin', 'RESELLER & ADMIN', 'Akses untuk membangun bisnis layanan digital Anda sendiri: kelola panel, jual kembali server dan bot, dengan pendampingan teknis dari Malik Store.')
on conflict (product_key) do nothing;

insert into public.product_catalog (product_key, variant_id, order_name, label, price, sort) values
  ('panel', '1gb', 'OPEN PANEL RAM 1GB', '1GB', 1000, 1),
  ('panel', '2gb', 'OPEN PANEL RAM 2GB', '2GB', 2000, 2),
  ('panel', '3gb', 'OPEN PANEL RAM 3GB', '3GB', 3000, 3),
  ('panel', '4gb', 'OPEN PANEL RAM 4GB', '4GB', 4000, 4),
  ('panel', '5gb', 'OPEN PANEL RAM 5GB', '5GB', 5000, 5),
  ('panel', '6gb', 'OPEN PANEL RAM 6GB', '6GB', 6000, 6),
  ('panel', '7gb', 'OPEN PANEL RAM 7GB', '7GB', 7000, 7),
  ('panel', '8gb', 'OPEN PANEL RAM 8GB', '8GB', 8000, 8),
  ('panel', '9gb', 'OPEN PANEL RAM 9GB', '9GB', 9000, 9),
  ('panel', '10gb', 'OPEN PANEL RAM 10GB', '10GB', 10000, 10),
  ('panel', 'unlimited', 'OPEN PANEL RAM UNLIMITED', 'Unlimited', 12000, 11),
  ('sewa_bot', '1g', 'SEWA BOT - 1 GROUP PERMANEN', '1 Group', 15000, 12),
  ('sewa_bot', '2g', 'SEWA BOT - 2 GROUP PERMANEN', '2 Group', 20000, 13),
  ('sewa_bot', '3g', 'SEWA BOT - 3 GROUP PERMANEN', '3 Group', 25000, 14),
  ('reseller_admin', 'rpanel', 'RESELLER PANEL PTERODACTYL', 'Reseller Panel', 15000, 15),
  ('reseller_admin', 'apanel', 'ADMIN PANEL PTERODACTYL', 'Admin Panel', 20000, 16),
  ('reseller_admin', 'rbot', 'RESELLER BOT PERMANEN', 'Reseller Bot', 30000, 17)
on conflict (product_key, variant_id) do nothing;

-- 3) GUARD (validasi & kunci kolom penting) ---------------------------------------------------
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
  if old.active and not new.active and not exists (
       select 1 from public.product_catalog c
       where c.product_key = old.product_key and c.variant_id <> old.variant_id and c.active) then
    raise exception 'Minimal satu paket harus aktif untuk setiap produk.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_catalog_guard on public.product_catalog;
create trigger malik_catalog_guard before update on public.product_catalog
  for each row execute function public.malik_catalog_guard();

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
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_catalog_group_guard on public.product_catalog_groups;
create trigger malik_catalog_group_guard before update on public.product_catalog_groups
  for each row execute function public.malik_catalog_group_guard();

-- 4) RLS + IZIN -------------------------------------------------------------------------------
alter table public.product_catalog        enable row level security;
alter table public.product_catalog_groups enable row level security;

revoke all on public.product_catalog        from anon, authenticated;
revoke all on public.product_catalog_groups from anon, authenticated;
grant select on public.product_catalog, public.product_catalog_groups to anon, authenticated;
grant update (label, price, active) on public.product_catalog        to authenticated;   -- dibatasi RLS: admin saja
grant update (name, description)    on public.product_catalog_groups to authenticated;

drop policy if exists "malik_catalog_read"   on public.product_catalog;
drop policy if exists "malik_catalog_update" on public.product_catalog;
create policy "malik_catalog_read" on public.product_catalog for select to anon, authenticated using (true);
create policy "malik_catalog_update" on public.product_catalog for update to authenticated
  using ((select public.malik_is_admin())) with check ((select public.malik_is_admin()));

drop policy if exists "malik_cgroups_read"   on public.product_catalog_groups;
drop policy if exists "malik_cgroups_update" on public.product_catalog_groups;
create policy "malik_cgroups_read" on public.product_catalog_groups for select to anon, authenticated using (true);
create policy "malik_cgroups_update" on public.product_catalog_groups for update to authenticated
  using ((select public.malik_is_admin())) with check ((select public.malik_is_admin()));

-- 5) HARGA ORDER DITEGAKKAN DATABASE ------------------------------------------------------------
-- Nama trigger "zy_" -> jalan SETELAH trigger hitung-harga lama, dan SEBELUM zz_malik_order_meta
-- (yang mengisi unit_price dari harga final). Order dengan nama produk yang tidak ada di katalog
-- (mis. link lama) tidak disentuh.
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
  if not c.active then raise exception 'Produk ini sedang tidak tersedia.' using errcode = '22023'; end if;
  new.price := c.price * q;
  return new;
end $$;
drop trigger if exists zy_malik_apply_catalog_price on public.orders;
create trigger zy_malik_apply_catalog_price before insert on public.orders
  for each row execute function public.malik_apply_catalog_price();

-- 6) SINKRON KE TABEL LAMA public.products (aman: gagal = hanya WARNING) ---------------------------
create or replace function public.malik_catalog_sync_legacy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price is distinct from old.price and to_regclass('public.products') is not null then
    begin
      execute 'update public.products set price = $1 where upper(btrim(name)) = $2' using new.price, new.order_name;
    exception when others then
      raise warning 'Sinkron ke public.products dilewati: %', sqlerrm;
    end;
  end if;
  return null;
end $$;
drop trigger if exists malik_catalog_sync_legacy on public.product_catalog;
create trigger malik_catalog_sync_legacy after update on public.product_catalog
  for each row execute function public.malik_catalog_sync_legacy();

-- 7) CEK HASIL (opsional) ---------------------------------------------------------------------------
-- select product_key, variant_id, label, price, active from public.product_catalog order by sort;   -- 17 baris
-- select polname from pg_policy where polrelid = 'public.product_catalog'::regclass;                  -- 2 policy
