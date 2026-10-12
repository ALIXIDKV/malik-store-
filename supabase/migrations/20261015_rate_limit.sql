-- =====================================================================================
-- MALIK STORE V3 - PATCH 2A: FONDASI RATE LIMIT (Postgres, tanpa layanan baru)
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261014_patch1_order_chat_hardening.sql. Idempotent.
-- TIDAK mengubah: tabel/kolom/policy/trigger yang sudah ada, role, flow checkout, atau data lama.
-- Hanya MENAMBAH: tabel public.malik_rate_limits + fungsi public.malik_rate_hit().
--
-- CARA KERJA (fixed window)
--   malik_rate_hit(bucket, key, window_detik, maks) mencatat 1 percobaan pada jendela waktu saat ini.
--   Hasil: 0  = masih boleh;  >0 = ditolak, nilai = detik sampai jendela baru.
--   Atomik lewat INSERT ... ON CONFLICT DO UPDATE, jadi request bersamaan tidak bisa lolos bersamaan.
--   Catatan: percobaan yang DITOLAK tetap dihitung (supaya spam terus-menerus tidak membuka jendela).
--
-- AKSES
--   Tabel: RLS aktif, tanpa policy, semua hak dicabut -> tidak bisa dibaca/ditulis dari browser.
--   Fungsi: hanya service_role (API route Next.js) dan fungsi SECURITY DEFINER lain di database (dipakai tahap 2C).
-- =====================================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.profiles') is null then
    raise exception 'PATCH 2A DIBATALKAN: tabel orders / profiles tidak ada. Tidak ada yang diubah.';
  end if;
  if to_regprocedure('public.malik_force_order_defaults()') is null then
    raise exception 'PATCH 2A DIBATALKAN: jalankan 20261014_patch1_order_chat_hardening.sql dulu. Tidak ada yang diubah.';
  end if;
end $$;

-- ---------- 1) Tabel ----------
create table if not exists public.malik_rate_limits (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket, key, window_start),
  constraint malik_rate_limits_bucket_chk check (char_length(bucket) between 1 and 64),
  constraint malik_rate_limits_key_chk    check (char_length(key) between 1 and 200)
);
create index if not exists malik_rate_limits_window_idx on public.malik_rate_limits (window_start);

alter table public.malik_rate_limits enable row level security;
revoke all on public.malik_rate_limits from anon, authenticated;

-- ---------- 2) Fungsi ----------
create or replace function public.malik_rate_hit(p_bucket text, p_key text, p_window int, p_max int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  w_start timestamptz;
  w_end   timestamptz;
  n       int;
begin
  if coalesce(p_bucket, '') = '' or coalesce(p_key, '') = '' then
    raise exception 'malik_rate_hit: bucket/key kosong' using errcode = '22023';
  end if;
  if p_window is null or p_window < 1 or p_window > 86400 or p_max is null or p_max < 1 then
    raise exception 'malik_rate_hit: parameter tidak valid' using errcode = '22023';
  end if;

  w_start := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  w_end   := w_start + make_interval(secs => p_window);

  insert into public.malik_rate_limits as r (bucket, key, window_start, hits)
  values (left(p_bucket, 64), left(p_key, 200), w_start, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1
  returning hits into n;

  -- Pembersihan oportunistik (~1% panggilan): buang jendela yang sudah lewat > 1 hari. Tanpa cron.
  if random() < 0.01 then
    delete from public.malik_rate_limits where window_start < now() - interval '1 day';
  end if;

  if n > p_max then
    return greatest(ceil(extract(epoch from (w_end - now())))::int, 1);
  end if;
  return 0;
end $$;

revoke all on function public.malik_rate_hit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.malik_rate_hit(text, text, int, int) to service_role;

-- ---------- CEK (opsional, hanya membaca) ----------
--   select to_regclass('public.malik_rate_limits'), to_regprocedure('public.malik_rate_hit(text,text,int,int)');
--   select has_function_privilege('anon',          'public.malik_rate_hit(text,text,int,int)', 'execute');  -- harus false
--   select has_function_privilege('authenticated', 'public.malik_rate_hit(text,text,int,int)', 'execute');  -- harus false
--   select has_function_privilege('service_role',  'public.malik_rate_hit(text,text,int,int)', 'execute');  -- harus true
--
-- ---------- UJI DI STAGING (SQL Editor berjalan sebagai postgres, jadi fungsi bisa dipanggil langsung) ----------
--   select public.malik_rate_hit('uji', 'k1', 60, 3);   -- 0
--   select public.malik_rate_hit('uji', 'k1', 60, 3);   -- 0
--   select public.malik_rate_hit('uji', 'k1', 60, 3);   -- 0
--   select public.malik_rate_hit('uji', 'k1', 60, 3);   -- > 0 (ditolak, detik tunggu 1..60)
--   select public.malik_rate_hit('uji', 'k2', 60, 3);   -- 0 (key lain tidak terpengaruh)
--   delete from public.malik_rate_limits where bucket = 'uji';
--
-- ---------- ROLLBACK (tidak ada data aplikasi yang hilang) ----------
--   drop function if exists public.malik_rate_hit(text, text, int, int);
--   drop table if exists public.malik_rate_limits;
-- =====================================================================================
