-- MALIK STORE - OTP registrasi via email. Jalankan SEKALI di Supabase > SQL Editor.
-- Tabel hanya bisa diakses server (Service Role). RLS aktif tanpa policy = anon/authenticated tidak bisa baca/tulis.

create table if not exists public.email_otps (
  email        text primary key,
  code_hash    text        not null,               -- HMAC-SHA256, bukan plaintext; '' = sudah dipakai
  expires_at   timestamptz not null,
  attempts     int         not null default 0,
  last_sent_at timestamptz not null default now(),
  send_count   int         not null default 1,
  window_start timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
alter table public.email_otps enable row level security;
revoke all on public.email_otps from anon, authenticated;

-- Email sudah terdaftar di auth.users?
create or replace function public.malik_email_registered(p_email text)
returns boolean language sql security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where lower(email) = lower(trim(p_email)));
$$;

-- Simpan OTP baru. Return 0 = berhasil; >0 = sisa detik (cooldown 60 dtk / batas kirim per jam).
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

-- Cek OTP atomik. Return: ok | invalid | expired | locked | none
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

-- Hanya server (service_role) yang boleh memanggil fungsi ini.
revoke all on function public.malik_email_registered(text) from public, anon, authenticated;
revoke all on function public.malik_issue_otp(text, text, int, int, int) from public, anon, authenticated;
revoke all on function public.malik_verify_otp(text, text, int) from public, anon, authenticated;
grant execute on function public.malik_email_registered(text) to service_role;
grant execute on function public.malik_issue_otp(text, text, int, int, int) to service_role;
grant execute on function public.malik_verify_otp(text, text, int) to service_role;

-- (Opsional) bersihkan OTP lama: delete from public.email_otps where created_at < now() - interval '7 days';
