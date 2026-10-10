-- =====================================================================================
-- MALIK STORE - TAHAP 2B (REVISI): TAMBAH PRODUK + VARIAN SECARA ATOMIK
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261010_product_management.sql. Idempotent (create or replace).
--
-- MASALAH SEBELUMNYA
--   Browser membuat produk lewat banyak request berurutan (produk -> varian satu per satu -> aktifkan). Bila koneksi putus
--   di tengah, tertinggal produk setengah jadi; mengulang "Tambah Produk" ditolak karena kode produk sudah terpakai.
--
-- YANG DILAKUKAN
--   malik_admin_create_product(kode, nama, deskripsi, varian jsonb) membuat produk + SEMUA varian dalam SATU transaksi
--   database: semuanya tersimpan atau tidak ada yang tersimpan, jadi produk setengah jadi tidak bisa muncul di katalog.
--   - SECURITY INVOKER: tetap memakai RLS/grant admin dan trigger validasi Tahap 2B (order_name & sort dibuat database).
--   - Hanya admin (dicek ulang di fungsi).
--   - Retry aman: kunci advisory per kode produk; bila produk dengan kode yang sama dan isi IDENTIK sudah ada
--     (mis. respons sebelumnya hilang), fungsi mengembalikan produk itu (existing = true) tanpa membuat baris baru.
--     Isi berbeda -> ditolak "Kode produk sudah dipakai".
--
-- YANG TIDAK DILAKUKAN: tidak mengubah tabel/kolom/policy/data, tidak menghapus apa pun.
-- ---- CEK (opsional, hanya membaca): select proname, prosecdef from pg_proc where proname = 'malik_admin_create_product';  -- prosecdef = false
-- =====================================================================================

do $$
begin
  if to_regclass('public.product_catalog') is null or to_regclass('public.product_catalog_groups') is null then
    raise exception 'MIGRASI DIBATALKAN: tabel katalog tidak ditemukan. Tidak ada yang diubah.';
  end if;
  if to_regprocedure('public.malik_is_admin()') is null then
    raise exception 'MIGRASI DIBATALKAN: fungsi malik_is_admin() tidak ditemukan. Tidak ada yang diubah.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.product_catalog'::regclass and tgname = 'malik_catalog_insert_guard')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.product_catalog_groups'::regclass and tgname = 'malik_catalog_group_insert_guard') then
    raise exception 'MIGRASI DIBATALKAN: jalankan 20261010_product_management.sql terlebih dahulu (trigger validasi produk belum ada). Tidak ada yang diubah.';
  end if;
end $$;

create or replace function public.malik_admin_create_product(p_key text, p_name text, p_description text, p_variants jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  k text := btrim(coalesce(p_key, ''));
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  ds text := btrim(coalesce(p_description, ''));
  e jsonb; g public.product_catalog_groups; same boolean; n int; vid text; lbl text;
  seen_ids text[] := '{}'; seen_lbls text[] := '{}'; existed boolean := false;
begin
  if auth.uid() is null or not public.malik_is_admin() then
    raise exception 'Hanya admin yang boleh menambah produk.' using errcode = '42501';
  end if;
  if k !~ '^[a-z0-9][a-z0-9_]{1,39}$' then
    raise exception 'Kode produk harus 2-40 karakter: huruf kecil, angka, atau underscore.' using errcode = '22023';
  end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Daftar varian tidak valid.' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_variants);
  if n < 1 or n > 12 then raise exception 'Produk harus punya 1-12 varian.' using errcode = '22023'; end if;

  -- Validasi bentuk + duplikat di payload sebelum menulis apa pun.
  for e in select * from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'price') <> 'number' or (e ->> 'price') !~ '^\d{1,9}$'
       or jsonb_typeof(e -> 'variant_id') <> 'string' or jsonb_typeof(e -> 'label') <> 'string' then
      raise exception 'Data varian tidak valid.' using errcode = '22023';
    end if;
    vid := btrim(e ->> 'variant_id');
    lbl := lower(regexp_replace(btrim(e ->> 'label'), '\s+', ' ', 'g'));
    if vid = any (seen_ids) or lbl = any (seen_lbls) then
      raise exception 'Nama varian tidak boleh kembar.' using errcode = '22023';
    end if;
    seen_ids := seen_ids || vid; seen_lbls := seen_lbls || lbl;
  end loop;

  -- Serialkan pemanggilan untuk kode produk yang sama (klik ganda / dua tab / retry bersamaan).
  perform pg_advisory_xact_lock(hashtextextended('malik_create_product:' || k, 0));

  select * into g from public.product_catalog_groups where product_key = k;
  if found then
    existed := true;
    -- Sudah ada. Isi identik (nama, deskripsi, himpunan varian id+label+harga) = percobaan sebelumnya sebenarnya berhasil.
    same := g.name = nm and g.description = ds
      and (select count(*) from public.product_catalog c where c.product_key = k) = n
      and not exists (
        select 1 from jsonb_array_elements(p_variants) x
        where not exists (
          select 1 from public.product_catalog c
          where c.product_key = k and c.variant_id = btrim(x ->> 'variant_id')
            and c.label = regexp_replace(btrim(x ->> 'label'), '\s+', ' ', 'g')
            and c.price = (x ->> 'price')::int));
    if not same then
      raise exception 'Kode produk sudah dipakai. Ganti kode produk.' using errcode = '22023';
    end if;
  else
    -- Satu transaksi: kegagalan di langkah mana pun membatalkan SEMUA (produk + varian). Trigger Tahap 2B memvalidasi tiap baris.
    insert into public.product_catalog_groups (product_key, name, description) values (k, nm, ds) returning * into g;
    for e in select * from jsonb_array_elements(p_variants) loop
      insert into public.product_catalog (product_key, variant_id, label, price, active)
      values (k, btrim(e ->> 'variant_id'), e ->> 'label', (e ->> 'price')::int, true);
    end loop;
  end if;

  return jsonb_build_object(
    'existing', existed,
    'group', to_jsonb(g),
    'variants', (select coalesce(jsonb_agg(to_jsonb(c) order by c.sort), '[]'::jsonb) from public.product_catalog c where c.product_key = k)
  );
end $$;

revoke all on function public.malik_admin_create_product(text, text, text, jsonb) from public, anon;
grant execute on function public.malik_admin_create_product(text, text, text, jsonb) to authenticated;

-- Rollback (opsional): drop function if exists public.malik_admin_create_product(text, text, text, jsonb);
--   (aplikasi lalu menampilkan pesan agar migrasi dijalankan; produk yang sudah dibuat tidak terpengaruh)
