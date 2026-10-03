-- =====================================================================================
-- MALIK STORE - SECURITY ADVISOR CLEANUP
-- Jalankan di Supabase > SQL Editor. AMAN dijalankan ulang. TIDAK menghapus/mereset data.
--
-- MASALAH YANG DIPERBAIKI
--   A) "Security Definer View"  -> view review_stats, product_reviews, order_reviews dibuat dengan
--      hak PEMILIK view (postgres), sehingga RLS tabel reviews dilewati. Diubah menjadi
--      security_invoker = on: view memakai hak & RLS si pembaca.
--      DAMPAK: NOL untuk fitur ulasan, karena policy reviews "malik_reviews_read" = using (true)
--      untuk anon & authenticated -> hasil view tetap sama persis.
--   B) "RLS Initialization Plan" (auth_rls_initplan) -> policy yang memanggil auth.uid() langsung
--      dievaluasi ULANG untuk setiap baris. Diubah menjadi (select auth.uid()) supaya dievaluasi
--      SEKALI per query. MAKNA policy TIDAK berubah, hanya cara Postgres menghitungnya.
--
-- KEAMANAN PERUBAHAN
--   * Sebelum policy diubah, definisi ASLI disimpan ke malik_ops.policy_backup (schema khusus,
--     tidak terbuka di API Supabase). Rollback ada di bagian paling bawah.
--   * Hanya ALTER POLICY (bukan drop/create) -> nama, role, dan perintah policy tidak berubah.
--   * Hanya schema public. Hanya memodifikasi policy yang memang memanggil auth.*() tanpa pembungkus.
--
-- ---- CEK DULU (opsional, hanya membaca) -------------------------------------------------
--   -- view di schema public & apakah sudah security_invoker:
--   select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'v' order by 1;
--   -- policy yang akan diubah:
--   select tablename, policyname, qual, with_check from pg_policies
--    where schemaname = 'public'
--      and (coalesce(qual, '') ~ '(?<!SELECT )auth\.' or coalesce(with_check, '') ~ '(?<!SELECT )auth\.')
--    order by 1, 2;
-- =====================================================================================

-- ======================== A) SECURITY DEFINER VIEW ========================
do $$
declare v text;
begin
  foreach v in array array['review_stats', 'product_reviews', 'order_reviews'] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
      raise notice 'View public.% -> security_invoker = on', v;
    end if;
  end loop;
end $$;

-- Pastikan anon/authenticated tetap boleh membaca bahan view-nya (sudah ada; ditulis ulang agar aman).
grant select on public.reviews to anon, authenticated;

-- ======================== B) RLS INITIALIZATION PLAN ========================
-- Backup definisi policy lama (di luar schema public, jadi tidak muncul di API & tidak memicu warning baru).
create schema if not exists malik_ops;
revoke all on schema malik_ops from public, anon, authenticated;
create table if not exists malik_ops.policy_backup (
  id          bigserial primary key,
  taken_at    timestamptz not null default now(),
  schemaname  name, tablename name, policyname name,
  cmd         text, roles name[], qual text, with_check text
);

do $$
declare
  r record; nq text; nw text; n int := 0;
  pat constant text := '(?<!SELECT )auth\.(uid|role|jwt|email)\(\)';   -- hanya yang BELUM dibungkus select
begin
  for r in select * from pg_policies where schemaname = 'public' loop
    nq := case when r.qual       is null then null else regexp_replace(r.qual,       pat, '(select auth.\1())', 'g') end;
    nw := case when r.with_check is null then null else regexp_replace(r.with_check, pat, '(select auth.\1())', 'g') end;
    if nq is distinct from r.qual or nw is distinct from r.with_check then
      insert into malik_ops.policy_backup (schemaname, tablename, policyname, cmd, roles, qual, with_check)
      values (r.schemaname, r.tablename, r.policyname, r.cmd, r.roles, r.qual, r.with_check);

      if nq is not null and nw is not null then
        execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, nq, nw);
      elsif nq is not null then
        execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, nq);
      else
        execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, nw);
      end if;
      n := n + 1;
      raise notice 'Policy %.% dioptimalkan', r.tablename, r.policyname;
    end if;
  end loop;
  raise notice 'Selesai: % policy diperbarui.', n;
end $$;

-- ======================== CEK HASIL (opsional) ========================
-- 1) Harus KOSONG (tidak ada lagi auth.*() yang belum dibungkus):
--    select tablename, policyname from pg_policies where schemaname = 'public'
--     and (coalesce(qual, '') ~ '(?<!SELECT )auth\.' or coalesce(with_check, '') ~ '(?<!SELECT )auth\.');
-- 2) Semua view ulasan harus punya security_invoker=on:
--    select relname, reloptions from pg_class where relname in ('review_stats', 'product_reviews', 'order_reviews');
-- 3) Lalu buka Supabase > Advisors > Security/Performance > Refresh.

-- ======================== ROLLBACK (hanya jika perlu; jalankan manual) ========================
-- Mengembalikan policy ke definisi asli dari backup, dan view ke mode lama:
--
-- do $$ declare r record; begin
--   for r in select distinct on (schemaname, tablename, policyname) * from malik_ops.policy_backup
--            order by schemaname, tablename, policyname, id asc loop
--     if r.qual is not null and r.with_check is not null then
--       execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, r.qual, r.with_check);
--     elsif r.qual is not null then
--       execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, r.qual);
--     else
--       execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, r.with_check);
--     end if;
--   end loop;
-- end $$;
-- alter view public.review_stats set (security_invoker = off);
-- alter view public.product_reviews set (security_invoker = off);
-- alter view public.order_reviews set (security_invoker = off);
