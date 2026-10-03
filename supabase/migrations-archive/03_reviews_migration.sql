-- MALIK STORE - migration: varian/qty order, ulasan produk (reviews) + RLS, penguncian role.
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang (idempotent).
-- Prasyarat: tabel profiles (role), orders (id uuid, user_id, product, price, status), dan fungsi malik_is_admin().

-- 0) Pengecekan admin (sama dengan supabase_delete_migration.sql; dibuat ulang supaya file ini berdiri sendiri)
create or replace function public.malik_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.malik_is_admin() from public, anon;
grant execute on function public.malik_is_admin() to authenticated;

-- 1) Kolom baru di orders: produk (panel | sewa_bot | reseller_admin), varian, qty, harga satuan.
alter table public.orders add column if not exists product_key text;
alter table public.orders add column if not exists variant     text;
alter table public.orders add column if not exists qty         int;
alter table public.orders add column if not exists unit_price  int;

-- Membaca nama order lama ("OPEN PANEL RAM 2GB x3") -> produk, varian, qty.
create or replace function public.malik_product_meta(p_product text)
returns table(product_key text, variant text, qty int)
language plpgsql immutable set search_path = public as $$
declare s text := upper(btrim(coalesce(p_product, ''))); m text[];
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
  return next;
end $$;

-- Isi otomatis saat order dibuat. Nama "zz_" supaya jalan SETELAH trigger hitung-harga yang sudah ada,
-- sehingga unit_price memakai total final dari database. Client tidak bisa memalsukan kolom ini.
create or replace function public.malik_order_meta()
returns trigger language plpgsql set search_path = public as $$
declare mt record;
begin
  select * into mt from public.malik_product_meta(new.product);
  new.product_key := mt.product_key;
  new.variant     := mt.variant;
  new.qty         := mt.qty;
  new.unit_price  := case when coalesce(mt.qty, 0) > 0 then round(coalesce(new.price, 0)::numeric / mt.qty)::int else new.price end;
  return new;
end $$;
drop trigger if exists zz_malik_order_meta on public.orders;
create trigger zz_malik_order_meta before insert on public.orders for each row execute function public.malik_order_meta();

-- Isi order lama.
update public.orders o set
  product_key = (select m.product_key from public.malik_product_meta(o.product) m),
  variant     = (select m.variant     from public.malik_product_meta(o.product) m),
  qty         = (select m.qty         from public.malik_product_meta(o.product) m),
  unit_price  = (select round(coalesce(o.price, 0)::numeric / greatest(m.qty, 1))::int from public.malik_product_meta(o.product) m)
where o.product_key is null;

create index if not exists orders_user_product_idx on public.orders (user_id, product_key);

-- 2) Keamanan di database (bukan hanya frontend)
-- 2a) User biasa tidak boleh mengubah status/harga/produk order (status "Selesai" syarat ulasan). Admin & server tetap boleh.
create or replace function public.malik_protect_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;
  if new.user_id is distinct from old.user_id or new.product is distinct from old.product
     or new.price is distinct from old.price or new.status is distinct from old.status then
    raise exception 'Order tidak boleh diubah.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists malik_protect_order on public.orders;
create trigger malik_protect_order before update on public.orders for each row execute function public.malik_protect_order();

-- 2b) User biasa tidak boleh menaikkan role dirinya menjadi admin.
create or replace function public.malik_protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'Role tidak boleh diubah.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists malik_protect_profile on public.profiles;
create trigger malik_protect_profile before update on public.profiles for each row execute function public.malik_protect_profile();

-- 3) Tabel ulasan: 1 order = 1 ulasan (unique order_id).
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_key text not null check (product_key in ('panel', 'sewa_bot', 'reseller_admin')),
  rating      int  not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 500),
  username    text not null default 'User',
  variant     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reviews_product_idx on public.reviews (product_key, created_at desc);
create index if not exists reviews_user_idx    on public.reviews (user_id);

-- Trigger: yang dipercaya hanya auth.uid() + data order di database.
--  INSERT: order harus milik user, status 'Selesai'; produk/varian/username diambil dari database.
--  UPDATE: hanya rating & komentar yang boleh berubah.
create or replace function public.malik_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o record; mt record; uname text;
begin
  if tg_op = 'INSERT' then
    if uid is null then raise exception 'Login dulu untuk memberi ulasan.' using errcode = '42501'; end if;
    select id, user_id, status, product, product_key, variant into o from public.orders where id = new.order_id;
    if not found or o.user_id <> uid then raise exception 'Ulasan hanya untuk pembeli produk ini.' using errcode = '42501'; end if;
    if o.status is distinct from 'Selesai' then raise exception 'Ulasan bisa ditulis setelah order berstatus Selesai.' using errcode = '42501'; end if;
    select * into mt from public.malik_product_meta(o.product);
    new.user_id     := uid;
    new.product_key := coalesce(o.product_key, mt.product_key);
    new.variant     := coalesce(o.variant, mt.variant);
    if new.product_key is null then raise exception 'Produk tidak dikenali.' using errcode = '22023'; end if;
    select coalesce(nullif(btrim(p.username), ''), split_part(p.email, '@', 1)) into uname from public.profiles p where p.id = uid;
    new.username   := coalesce(uname, 'User');
    new.created_at := now(); new.updated_at := now();
  else
    new.id := old.id; new.order_id := old.order_id; new.user_id := old.user_id; new.product_key := old.product_key;
    new.variant := old.variant; new.username := old.username; new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists malik_review_guard on public.reviews;
create trigger malik_review_guard before insert or update on public.reviews for each row execute function public.malik_review_guard();

-- 4) RLS: semua orang boleh MEMBACA (rating tampil untuk guest), tulis/ubah/hapus hanya pemilik; admin boleh menghapus.
alter table public.reviews enable row level security;

drop policy if exists "malik_reviews_read"   on public.reviews;
drop policy if exists "malik_reviews_insert" on public.reviews;
drop policy if exists "malik_reviews_update" on public.reviews;
drop policy if exists "malik_reviews_delete" on public.reviews;
create policy "malik_reviews_read"   on public.reviews for select to anon, authenticated using (true);
create policy "malik_reviews_insert" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "malik_reviews_update" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "malik_reviews_delete" on public.reviews for delete to authenticated using (user_id = auth.uid() or public.malik_is_admin());

grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

-- 5) Rating & jumlah ulasan per produk (dihitung dari data asli).
create or replace view public.review_stats as
  select product_key, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as total
  from public.reviews group by product_key;
grant select on public.review_stats to anon, authenticated;

-- 6) Nama tabel sesuai permintaan. Data ulasan disimpan di SATU tabel public.reviews:
--    - product_reviews = ulasan per produk (product_key), dibaca publik untuk daftar ulasan
--    - order_reviews   = ulasan per order (order_id unik -> 1 order 1 ulasan), sebagai penjaga anti-spam
--    Keduanya view agar tidak ada data ganda. Tabel products yang sudah ada TIDAK diubah.
create or replace view public.product_reviews as
  select id, product_key, user_id, username, rating, comment, variant, created_at, updated_at from public.reviews;
create or replace view public.order_reviews as
  select order_id, user_id, product_key, rating, created_at from public.reviews;
grant select on public.product_reviews to anon, authenticated;
grant select on public.order_reviews   to authenticated;
