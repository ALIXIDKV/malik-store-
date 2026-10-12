-- =====================================================================================
-- MALIK STORE V3 - PATCH 2B: KEAMANAN SIGNUP (email kanonik)
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261015_rate_limit.sql. Idempotent.
-- TIDAK mengubah: akun lama, kolom email, auth.users, role, flow OTP (email_otps / malik_*_otp), checkout.
-- Hanya MENAMBAH: kolom profiles.email_canonical, 3 fungsi, 1 trigger, 1 index.
--
-- email_canonical = email "disederhanakan" agar alias tidak lolos jadi akun baru:
--   Gmail/Googlemail : titik & +tag dibuang   (a.b+x@gmail.com -> ab@gmail.com)
--   Outlook/Hotmail/Live/iCloud/Me/Proton/PM : +tag dibuang
--   lainnya          : hanya lowercase + trim
-- Kolom ini diisi trigger dari kolom email (tidak bisa dipalsukan user lewat update profil).
-- =====================================================================================

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'PATCH 2B DIBATALKAN: tabel profiles tidak ada. Tidak ada yang diubah.';
  end if;
end $$;

-- ---------- 1) Kolom tambahan ----------
alter table public.profiles add column if not exists email_canonical text;

-- ---------- 2) Fungsi kanonik (murni, cermin canonicalEmail di lib/server/email-guard.ts) ----------
create or replace function public.malik_canonical_email(p_email text)
returns text language plpgsql immutable set search_path = public as $$
declare e text; l text; d text;
begin
  e := lower(btrim(coalesce(p_email, '')));
  if e = '' or position('@' in e) < 2 or length(e) - length(replace(e, '@', '')) <> 1 then
    return nullif(e, '');
  end if;
  l := split_part(e, '@', 1);
  d := split_part(e, '@', 2);
  if d in ('gmail.com', 'googlemail.com') then
    l := replace(split_part(l, '+', 1), '.', '');
    d := 'gmail.com';
  elsif d in ('outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'pm.me') then
    l := split_part(l, '+', 1);
  end if;
  if l = '' then return e; end if;
  return l || '@' || d;
end $$;
revoke all on function public.malik_canonical_email(text) from public, anon, authenticated;
grant execute on function public.malik_canonical_email(text) to service_role;

-- ---------- 3) Trigger: isi email_canonical (dijalankan terakhir; selalu menimpa nilai dari client) ----------
create or replace function public.malik_set_email_canonical()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email_canonical := public.malik_canonical_email(new.email);
  return new;
end $$;
revoke all on function public.malik_set_email_canonical() from public, anon, authenticated;

drop trigger if exists zzz_malik_set_email_canonical on public.profiles;
create trigger zzz_malik_set_email_canonical before insert or update on public.profiles
  for each row execute function public.malik_set_email_canonical();

-- ---------- 4) Backfill (hanya mengisi kolom baru; kolom lain tidak berubah) ----------
update public.profiles
   set email_canonical = public.malik_canonical_email(email)
 where email_canonical is distinct from public.malik_canonical_email(email);

-- ---------- 5) Index: UNIK hanya jika data lama tidak punya duplikat kanonik ----------
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname in ('malik_profiles_email_canonical_uidx', 'malik_profiles_email_canonical_idx')) then
    return;
  end if;
  if exists (select 1 from public.profiles where email_canonical is not null group by email_canonical having count(*) > 1) then
    create index malik_profiles_email_canonical_idx on public.profiles (email_canonical);
    raise notice 'PATCH 2B: ada akun lama dengan email kanonik kembar -> index NON-unik dibuat (akun lama tidak disentuh). Pendaftaran baru tetap dicek lewat API.';
  else
    create unique index malik_profiles_email_canonical_uidx on public.profiles (email_canonical) where email_canonical is not null;
  end if;
end $$;

-- ---------- 6) Cek "sudah terdaftar" (kanonik + cek lama persis di auth.users), hanya server ----------
create or replace function public.malik_canonical_registered(p_email text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.profiles where email_canonical = public.malik_canonical_email(p_email))
      or exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;
revoke all on function public.malik_canonical_registered(text) from public, anon, authenticated;
grant execute on function public.malik_canonical_registered(text) to service_role;

-- ---------- CEK (hanya membaca) ----------
--   select public.malik_canonical_email('A.B+promo@Gmail.com');        -- ab@gmail.com
--   select public.malik_canonical_email('a.b+x@outlook.com');          -- a.b@outlook.com
--   select public.malik_canonical_email('Budi@kampus.ac.id');          -- budi@kampus.ac.id
--   select count(*) from public.profiles where email_canonical is null and email is not null;   -- 0
--   -- duplikat kanonik pada akun lama (informasi saja, tidak diubah):
--   select email_canonical, count(*), array_agg(email) from public.profiles
--    where email_canonical is not null group by 1 having count(*) > 1;
--   select has_function_privilege('anon','public.malik_canonical_registered(text)','execute');          -- false
--   select has_function_privilege('authenticated','public.malik_canonical_registered(text)','execute'); -- false
--   select has_function_privilege('service_role','public.malik_canonical_registered(text)','execute');  -- true
--
-- ---------- ROLLBACK (tidak ada data akun yang hilang; kolom email_canonical hanya tambahan) ----------
--   drop trigger if exists zzz_malik_set_email_canonical on public.profiles;
--   drop function if exists public.malik_set_email_canonical();
--   drop function if exists public.malik_canonical_registered(text);
--   drop index if exists public.malik_profiles_email_canonical_uidx;
--   drop index if exists public.malik_profiles_email_canonical_idx;
--   drop function if exists public.malik_canonical_email(text);
--   alter table public.profiles drop column if exists email_canonical;
-- =====================================================================================
