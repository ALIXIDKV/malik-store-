-- =====================================================================================
-- MALIK STORE - MASTER SETUP (schema FINAL)
--
-- HANYA untuk Supabase project BARU / KOSONG (Supabase > SQL Editor > run satu kali).
-- JANGAN dijalankan ke database production yang sudah berjalan. Production tidak butuh file ini.
-- Perubahan berikutnya: buat file migration baru (lihat supabase/README.md).
--
-- Isi = kondisi akhir seluruh migration lama (supabase/migrations-archive/), bukan gabungan mentah:
-- definisi yang sudah digantikan versi lebih baru tidak ikut dibawa. Urutan:
--   0 guard (batal jika DB tidak kosong) | 1 extensions | 2 tables | 3 constraints | 4 indexes | 5 functions | 6 triggers | 7 views
--   8 enable RLS | 9 grants | 10 policies | 11 realtime | 12 seed katalog
--
-- Penanda [DISIMPULKAN]: bagian yang TIDAK ada di migration manapun (tabel dasar dibuat dulu lewat
-- dashboard). Dirumuskan dari pemakaian di kode (js/, admin/, api/). Cocokkan dengan production
-- (mis. `supabase db dump --schema public`, hanya membaca) sebelum dianggap identik.
--
-- Sengaja TIDAK dibawa: schema malik_ops.policy_backup (artefak sekali-jalan dari security_cleanup),
-- trigger malik_catalog_sync_legacy + tabel lama public.products (digantikan product_catalog).
-- =====================================================================================


-- ======================== 0) GUARD: HANYA DATABASE KOSONG ========================
do $$ begin
  if to_regclass('public.profiles') is not null or to_regclass('public.orders') is not null
     or to_regclass('public.messages') is not null then
    raise exception 'master_setup.sql hanya untuk Supabase project BARU. Tabel Malik Store sudah ada di database ini - dibatalkan, tidak ada yang diubah.';
  end if;
end $$;


-- ======================== 1) EXTENSIONS ========================
-- Tidak ada yang perlu diaktifkan: gen_random_uuid() bawaan Postgres 13+.


-- ======================== 2) TABLES ========================
-- [DISIMPULKAN] profiles: 1 baris per akun auth. username = nama tampilan (sumber tunggal nama).
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  username   text,
  avatar_url text,                               -- data URL kecil (profile migration)
  role       text not null default 'user',       -- 'user' | 'admin'
  created_at timestamptz not null default now()
);

-- [DISIMPULKAN] orders. Kolom product_key/variant/qty/unit_price diisi trigger (bukan dari client).
create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  product     text not null,                     -- mis. "OPEN PANEL RAM 2GB x3"
  price       int  not null default 0,           -- total final (ditegakkan trigger katalog)
  note        text,
  status      text not null default 'Pending',   -- Pending | Diproses | Selesai
  product_key text,
  variant     text,
  qty         int,
  unit_price  int,
  created_at  timestamptz not null default now()
);

-- [DISIMPULKAN] messages (chat user <-> admin) + hidden_for_admin + attachment Cloudinary.
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,                -- pemilik chat
  sender           text not null check (sender in ('user', 'admin')),
  message          text not null default '',
  is_read          boolean not null default false,
  hidden_for_admin boolean not null default false,
  attachment_url   text,
  attachment_type  text,                         -- 'image' | 'video'
  created_at       timestamptz not null default now()
);

-- [DISIMPULKAN] announcements (dibaca notify.js: judul + isi).
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- reviews: 1 order = 1 ulasan.
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

-- Katalog produk (admin mengubah harga/nama/aktif/arsip). order_name terkunci.
create table if not exists public.product_catalog_groups (
  product_key text primary key,
  name        text not null,
  description text not null,
  archived    boolean     not null default false,
  archived_at timestamptz,
  updated_at  timestamptz not null default now()
);

create table if not exists public.product_catalog (
  product_key text        not null,
  variant_id  text        not null,
  order_name  text        not null unique,       -- nama produk di orders.product (JANGAN diubah)
  label       text        not null,
  price       int         not null,
  active      boolean     not null default true,
  sort        int         not null default 0,
  archived    boolean     not null default false,
  archived_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (product_key, variant_id)
);

-- OTP registrasi email. Hanya server (service_role) yang boleh akses.
create table if not exists public.email_otps (
  email        text primary key,
  code_hash    text        not null,             -- HMAC-SHA256; '' = sudah dipakai
  expires_at   timestamptz not null,
  attempts     int         not null default 0,
  last_sent_at timestamptz not null default now(),
  send_count   int         not null default 1,
  window_start timestamptz not null default now(),
  created_at   timestamptz not null default now()
);


-- ======================== 3) CONSTRAINTS ========================
-- Lampiran chat hanya boleh URL Cloudinary yang cocok dengan tipenya.
alter table public.messages drop constraint if exists malik_msg_attachment_chk;
alter table public.messages add constraint malik_msg_attachment_chk check (
  (attachment_url is null and attachment_type is null)
  or (
    attachment_type in ('image', 'video')
    and char_length(attachment_url) <= 600
    and attachment_url ~ ('^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/' || attachment_type || '/upload/')
  )
);


-- ======================== 4) INDEXES ========================
create index if not exists orders_user_product_idx on public.orders (user_id, product_key);
create index if not exists reviews_product_idx     on public.reviews (product_key, created_at desc);
create index if not exists reviews_user_idx        on public.reviews (user_id);


-- ======================== 5) FUNCTIONS ========================
-- Cek admin (dipakai hampir semua policy & trigger).
create or replace function public.malik_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- OTP (hanya service_role).
create or replace function public.malik_email_registered(p_email text)
returns boolean language sql security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where lower(email) = lower(trim(p_email)));
$$;

create or replace function public.malik_issue_otp(p_email text, p_hash text, p_ttl int default 600, p_cooldown int default 60, p_max_per_hour int default 5)
returns int language plpgsql security definer set search_path = public as $$
declare r public.email_otps%rowtype; v_wait int; v_in_window boolean;
begin
  p_email := lower(trim(p_email));
  select * into r from public.email_otps where email = p_email for update;
  if found then
    v_in_window := r.window_start > now() - interval '1 hour';
    if v_in_window and r.send_count >= p_max_per_hour then
      return greatest(1, ceil(extract(epoch from (r.window_start + interval '1 hour' - now())))::int);
    end if;
    v_wait := ceil(extract(epoch from (r.last_sent_at + make_interval(secs => p_cooldown) - now())))::int;
    if v_wait > 0 then return v_wait; end if;
    update public.email_otps set
      code_hash = p_hash, expires_at = now() + make_interval(secs => p_ttl), attempts = 0, last_sent_at = now(),
      send_count = case when v_in_window then send_count + 1 else 1 end,
      window_start = case when v_in_window then window_start else now() end
    where email = p_email;
  else
    insert into public.email_otps (email, code_hash, expires_at) values (p_email, p_hash, now() + make_interval(secs => p_ttl))
    on conflict (email) do nothing;
    if not found then return p_cooldown; end if;
  end if;
  return 0;
end $$;

create or replace function public.malik_verify_otp(p_email text, p_hash text, p_max_attempts int default 5)
returns text language plpgsql security definer set search_path = public as $$
declare r public.email_otps%rowtype;
begin
  p_email := lower(trim(p_email));
  select * into r from public.email_otps where email = p_email for update;
  if not found or r.code_hash = '' then return 'none'; end if;
  if r.expires_at < now() then return 'expired'; end if;
  if r.attempts >= p_max_attempts then return 'locked'; end if;
  if r.code_hash = p_hash then
    update public.email_otps set code_hash = '', expires_at = now() where email = p_email;  -- sekali pakai
    return 'ok';
  end if;
  update public.email_otps set attempts = attempts + 1 where email = p_email;
  if r.attempts + 1 >= p_max_attempts then return 'locked'; end if;
  return 'invalid';
end $$;

-- [DISIMPULKAN] Buat baris profiles otomatis saat akun auth dibuat (api/register.js lalu meng-upsert username).
create or replace function public.malik_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id, new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Order: admin dilarang membuat order.
create or replace function public.malik_block_admin_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.malik_is_admin() then
    raise exception 'Akun admin tidak boleh membuat order.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Order: nama produk -> product_key/varian/qty; isi otomatis; user tidak boleh ubah status/harga.
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

-- Katalog: harga order ditegakkan database (tolak produk nonaktif/diarsipkan).
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

-- Profil: user tidak boleh naikkan role; validasi nama & foto.
create or replace function public.malik_protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'Role tidak boleh diubah.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.malik_profile_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;   -- service role / admin: bebas
  new.username := btrim(regexp_replace(coalesce(new.username, ''), '\s+', ' ', 'g'));
  if char_length(new.username) < 2 or char_length(new.username) > 40 then
    raise exception 'Nama harus 2-40 karakter.' using errcode = '22023';
  end if;
  if new.avatar_url is not null then
    if new.avatar_url !~ '^data:image/(jpeg|png|webp);base64,' or char_length(new.avatar_url) > 60000 then
      raise exception 'Foto profil tidak valid atau terlalu besar.' using errcode = '22023';
    end if;
  end if;
  new.email := old.email;
  return new;
end $$;

-- Ulasan.
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

-- Katalog: guard paket & produk (validasi, kunci kolom, arsip).
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

-- Pesan order milik user, tepat satu per order (atomik via advisory lock; migrasi 20261010).
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

-- Pesan instruksi pembayaran otomatis (template tetap).
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


-- ======================== 6) TRIGGERS ========================
-- Nama trigger menentukan urutan (alfabet): aa_ (blokir admin) -> zy_ (harga katalog) -> zz_ (meta order).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.malik_handle_new_user();

drop trigger if exists aa_malik_block_admin_order on public.orders;
create trigger aa_malik_block_admin_order before insert on public.orders
  for each row execute function public.malik_block_admin_order();

drop trigger if exists zy_malik_apply_catalog_price on public.orders;
create trigger zy_malik_apply_catalog_price before insert on public.orders
  for each row execute function public.malik_apply_catalog_price();

drop trigger if exists zz_malik_order_meta on public.orders;
create trigger zz_malik_order_meta before insert on public.orders
  for each row execute function public.malik_order_meta();

drop trigger if exists malik_protect_order on public.orders;
create trigger malik_protect_order before update on public.orders
  for each row execute function public.malik_protect_order();

drop trigger if exists malik_protect_profile on public.profiles;
create trigger malik_protect_profile before update on public.profiles
  for each row execute function public.malik_protect_profile();

drop trigger if exists malik_profile_guard on public.profiles;
create trigger malik_profile_guard before update on public.profiles
  for each row execute function public.malik_profile_guard();

drop trigger if exists malik_review_guard on public.reviews;
create trigger malik_review_guard before insert or update on public.reviews
  for each row execute function public.malik_review_guard();

drop trigger if exists malik_catalog_guard on public.product_catalog;
create trigger malik_catalog_guard before update on public.product_catalog
  for each row execute function public.malik_catalog_guard();

drop trigger if exists malik_catalog_group_guard on public.product_catalog_groups;
create trigger malik_catalog_group_guard before update on public.product_catalog_groups
  for each row execute function public.malik_catalog_group_guard();


-- ======================== 7) VIEWS ========================
-- security_invoker = on: view memakai hak & RLS si pembaca (hasil security_cleanup).
create or replace view public.review_stats with (security_invoker = on) as
  select product_key, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as total
  from public.reviews group by product_key;

create or replace view public.product_reviews with (security_invoker = on) as
  select id, product_key, user_id, username, rating, comment, variant, created_at, updated_at from public.reviews;

create or replace view public.order_reviews with (security_invoker = on) as
  select order_id, user_id, product_key, rating, created_at from public.reviews;


-- ======================== 8) ENABLE RLS ========================
alter table public.profiles               enable row level security;
alter table public.orders                 enable row level security;
alter table public.messages               enable row level security;
alter table public.announcements          enable row level security;
alter table public.reviews                enable row level security;
alter table public.product_catalog        enable row level security;
alter table public.product_catalog_groups enable row level security;
alter table public.email_otps             enable row level security;   -- tanpa policy = hanya service_role


-- ======================== 9) GRANTS ========================
-- Dimulai dari nol (revoke) lalu beri izin minimal; akses sebenarnya tetap dibatasi RLS.
revoke all on public.profiles, public.orders, public.messages, public.announcements, public.reviews,
              public.product_catalog, public.product_catalog_groups, public.email_otps
  from anon, authenticated;
revoke all on public.review_stats, public.product_reviews, public.order_reviews from anon, authenticated;

grant select, update                 on public.profiles      to authenticated;   -- insert/delete lewat server (service_role)
grant select, insert, update, delete on public.orders        to authenticated;
grant select, insert, update, delete on public.messages      to authenticated;
grant select, insert                 on public.announcements to authenticated;
grant select                         on public.reviews       to anon, authenticated;
grant insert, update, delete         on public.reviews       to authenticated;

grant select on public.product_catalog, public.product_catalog_groups to anon, authenticated;
grant update (label, price, active, archived)  on public.product_catalog        to authenticated;   -- dibatasi RLS: admin saja
grant update (name, description, archived)     on public.product_catalog_groups to authenticated;

grant select on public.review_stats, public.product_reviews to anon, authenticated;
grant select on public.order_reviews to authenticated;

-- Fungsi.
revoke all on function public.malik_is_admin() from public, anon;
grant execute on function public.malik_is_admin() to authenticated;

revoke all on function public.malik_send_payment_message(uuid) from public, anon;
grant execute on function public.malik_send_payment_message(uuid) to authenticated;

revoke all on function public.malik_send_order_message(uuid, text) from public, anon;
grant execute on function public.malik_send_order_message(uuid, text) to authenticated;

revoke all on function public.malik_email_registered(text) from public, anon, authenticated;
revoke all on function public.malik_issue_otp(text, text, int, int, int) from public, anon, authenticated;
revoke all on function public.malik_verify_otp(text, text, int) from public, anon, authenticated;
grant execute on function public.malik_email_registered(text) to service_role;
grant execute on function public.malik_issue_otp(text, text, int, int, int) to service_role;
grant execute on function public.malik_verify_otp(text, text, int) to service_role;


-- ======================== 10) POLICIES ========================
-- auth.uid() dibungkus (select ...) agar dievaluasi sekali per query (hasil security_cleanup).

-- profiles [DISIMPULKAN: select]
create policy "malik_profile_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.malik_is_admin());
create policy "malik_profile_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- orders [DISIMPULKAN: select/insert/update admin]
create policy "malik_orders_select" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.malik_is_admin());
create policy "malik_orders_insert" on public.orders for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "malik_orders_no_admin_insert" on public.orders as restrictive for insert to authenticated
  with check (not public.malik_is_admin());
create policy "malik_admin_update_orders" on public.orders for update to authenticated
  using (public.malik_is_admin()) with check (public.malik_is_admin());
create policy "malik_admin_delete_orders" on public.orders for delete to authenticated
  using (public.malik_is_admin());

-- messages: user hanya chat miliknya; admin semua; admin dilarang mengirim sebagai user.
create policy "malik_msg_select" on public.messages for select to authenticated
  using (user_id = (select auth.uid()) or public.malik_is_admin());
create policy "malik_msg_insert_user" on public.messages for insert to authenticated
  with check (sender = 'user' and user_id = (select auth.uid()) and not public.malik_is_admin());
create policy "malik_msg_insert_admin" on public.messages for insert to authenticated
  with check (sender = 'admin' and public.malik_is_admin() and user_id <> (select auth.uid()));
create policy "malik_msg_update_admin" on public.messages for update to authenticated
  using (public.malik_is_admin()) with check (public.malik_is_admin());
create policy "malik_msg_update_own" on public.messages for update to authenticated
  using (user_id = (select auth.uid()) and not public.malik_is_admin())
  with check (user_id = (select auth.uid()) and not public.malik_is_admin());
create policy "malik_msg_delete_admin" on public.messages for delete to authenticated
  using (public.malik_is_admin());
create policy "malik_msg_delete_own" on public.messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- announcements [DISIMPULKAN]: semua user login membaca, hanya admin menerbitkan.
create policy "malik_ann_read" on public.announcements for select to authenticated using (true);
create policy "malik_ann_insert_admin" on public.announcements for insert to authenticated
  with check (public.malik_is_admin());

-- reviews: publik membaca; pemilik menulis/ubah; pemilik atau admin menghapus.
create policy "malik_reviews_read" on public.reviews for select to anon, authenticated using (true);
create policy "malik_reviews_insert" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "malik_reviews_update" on public.reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "malik_reviews_delete" on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or public.malik_is_admin());

-- katalog: publik membaca; hanya admin mengubah.
create policy "malik_catalog_read" on public.product_catalog for select to anon, authenticated using (true);
create policy "malik_catalog_update" on public.product_catalog for update to authenticated
  using ((select public.malik_is_admin())) with check ((select public.malik_is_admin()));
create policy "malik_cgroups_read" on public.product_catalog_groups for select to anon, authenticated using (true);
create policy "malik_cgroups_update" on public.product_catalog_groups for update to authenticated
  using ((select public.malik_is_admin())) with check ((select public.malik_is_admin()));


-- ======================== 11) REALTIME ========================
-- [DISIMPULKAN] notify.js memakai Supabase Realtime (postgres_changes) pada tabel berikut.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'orders', 'profiles', 'announcements'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;


-- ======================== 12) SEED KATALOG (harga awal dari js/products.js) ========================
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


-- ======================== SETELAH INSTALASI ========================
-- Jadikan akun admin (daftar dulu lewat website, lalu jalankan di SQL Editor):
--   update public.profiles set role = 'admin' where email = 'EMAIL_ADMIN_ANDA';
