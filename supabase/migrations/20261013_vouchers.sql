-- =====================================================================================
-- MALIK STORE V3 - TAHAP 2: SISTEM VOUCHER
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261011_order_price_validation.sql. Idempotent.
--
-- PRINSIP
--   * Trigger harga lama (zy_malik_apply_catalog_price / malik_apply_catalog_price) TIDAK diubah, tidak di-drop, tidak dibuat ulang.
--   * Trigger meta lama (zz_malik_order_meta) dan malik_protect_order TIDAK diubah.
--   * Voucher memakai trigger BARU: zzz_malik_apply_voucher (BEFORE INSERT pada orders), berjalan PALING AKHIR
--     (urutan alfabet: aa_ blokir admin -> zy_ harga katalog -> zz_ meta order -> zzz_ voucher).
--     Dengan begitu unit_price / qty / product_key dari trigger lama tetap memakai harga katalog (sebelum diskon).
--   * Order TANPA voucher_code: trigger baru hanya mengisi voucher_id = null, voucher_code = null, discount_amount = 0
--     lalu selesai. price tidak disentuh -> perilaku sama persis dengan sebelumnya.
--   * Role tetap hanya 'user' dan 'admin'. Semua izin admin memakai public.malik_is_admin() yang sudah ada.
--
-- YANG DITAMBAHKAN
--   Tabel   : public.vouchers (RLS: hanya admin; user tidak bisa membaca daftar kode)
--   Kolom   : orders.voucher_id, orders.voucher_code, orders.discount_amount (aditif, default aman, data lama tidak berubah)
--   Fungsi  : malik_catalog_subtotal, malik_voucher_calc, malik_preview_voucher, malik_apply_voucher, malik_voucher_normalize
--   Trigger : zzz_malik_apply_voucher (orders), malik_voucher_normalize (vouchers)
--
-- ATURAN VOUCHER (ditegakkan di database)
--   * discount_type 'percent' (1-99) atau 'fixed' (rupiah). Diskon dihitung dari subtotal KATALOG (bukan harga dari browser).
--   * min_purchase, expires_at, usage_limit (null = tanpa batas), active.
--   * used_count hanya naik lewat trigger, atomik (baris voucher dikunci FOR UPDATE), jadi dua order bersamaan
--     tidak bisa melewati batas. Jika insert order gagal, kenaikan ikut dibatalkan (satu transaksi).
--   * Retry klien dengan id order yang sudah ada dilewati (primary key menolak seperti biasa), jadi tidak ada penghitungan ganda.
--   * Total order tidak boleh menjadi nol.
-- =====================================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.profiles') is null
     or to_regclass('public.product_catalog') is null or to_regclass('public.product_catalog_groups') is null then
    raise exception 'MIGRASI DIBATALKAN: tabel orders / profiles / product_catalog / product_catalog_groups tidak lengkap. Tidak ada yang diubah.';
  end if;
  if to_regprocedure('public.malik_is_admin()') is null then
    raise exception 'MIGRASI DIBATALKAN: fungsi malik_is_admin() tidak ada. Tidak ada yang diubah.';
  end if;
end $$;

-- ---------- 1) Tabel voucher ----------
create table if not exists public.vouchers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  discount_type  text not null,
  discount_value int  not null,
  min_purchase   int  not null default 0,
  expires_at     timestamptz,
  usage_limit    int,
  used_count     int  not null default 0,
  active         boolean not null default true,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint malik_vouchers_code_chk  check (code ~ '^[A-Z0-9_-]{3,32}$'),
  constraint malik_vouchers_type_chk  check (discount_type in ('percent', 'fixed')),
  constraint malik_vouchers_value_chk check (discount_value > 0 and (discount_type <> 'percent' or discount_value <= 99)),
  constraint malik_vouchers_min_chk   check (min_purchase >= 0),
  constraint malik_vouchers_limit_chk check (usage_limit is null or usage_limit > 0),
  constraint malik_vouchers_used_chk  check (used_count >= 0)
);
create unique index if not exists malik_vouchers_code_uidx on public.vouchers (code);

-- Kode selalu huruf besar tanpa spasi; updated_at otomatis.
create or replace function public.malik_voucher_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.code := upper(btrim(coalesce(new.code, '')));
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists malik_voucher_normalize on public.vouchers;
create trigger malik_voucher_normalize before insert or update on public.vouchers
  for each row execute function public.malik_voucher_normalize();

-- ---------- 2) Kolom baru di orders (aditif) ----------
alter table public.orders add column if not exists voucher_id      uuid references public.vouchers(id) on delete set null;
alter table public.orders add column if not exists voucher_code    text;
alter table public.orders add column if not exists discount_amount int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'malik_orders_discount_chk' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint malik_orders_discount_chk check (discount_amount >= 0);
  end if;
end $$;

-- ---------- 3) Fungsi ----------
-- Subtotal katalog (harga resmi x jumlah) dari nama produk order. null = produk tidak dikenal / nonaktif / diarsipkan.
-- Aturannya sama dengan malik_apply_catalog_price (20261011), tetapi dibuat sebagai fungsi BARU agar trigger lama tidak disentuh.
create or replace function public.malik_catalog_subtotal(p_product text)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  s text := upper(btrim(coalesce(p_product, '')));
  m text[]; q int := 1; c record; total bigint;
begin
  m := regexp_match(s, '^(.*)\s+X(\d{1,4})$');
  if m is not null then
    s := btrim(m[1]); q := m[2]::int;
    if q < 1 or q > 99 then return null; end if;
  end if;
  select * into c from public.product_catalog where order_name = s;
  if not found then return null; end if;
  if not c.active or c.archived then return null; end if;
  if not exists (select 1 from public.product_catalog_groups g where g.product_key = c.product_key) then return null; end if;
  if exists (select 1 from public.product_catalog_groups g where g.product_key = c.product_key and g.archived) then return null; end if;
  total := c.price::bigint * q;
  if total < 1 or total > 2147483647 then return null; end if;
  return total::int;
end $$;

-- Inti validasi voucher (dipakai trigger dan preview, jadi hasilnya selalu konsisten).
-- p_lock = true: baris voucher dikunci (FOR UPDATE) supaya batas penggunaan aman terhadap order bersamaan.
create or replace function public.malik_voucher_calc(p_code text, p_subtotal int, p_lock boolean default false)
returns table(out_id uuid, out_code text, out_discount int, out_error text)
language plpgsql security definer set search_path = public as $$
declare
  vcode text := upper(btrim(coalesce(p_code, '')));
  v public.vouchers%rowtype;
  d int;
begin
  if vcode = '' then
    out_error := 'Kode voucher kosong.'; return next; return;
  end if;

  if p_lock then
    select * into v from public.vouchers where code = vcode for update;
  else
    select * into v from public.vouchers where code = vcode;
  end if;

  if not found or not v.active then
    out_error := 'Kode voucher tidak ditemukan atau tidak aktif.'; return next; return;
  end if;
  if v.expires_at is not null and v.expires_at <= now() then
    out_error := 'Voucher sudah kedaluwarsa.'; return next; return;
  end if;
  if v.usage_limit is not null and v.used_count >= v.usage_limit then
    out_error := 'Kuota voucher sudah habis.'; return next; return;
  end if;
  if p_subtotal < v.min_purchase then
    out_error := 'Minimal pembelian Rp' || replace(to_char(v.min_purchase, 'FM999,999,999,999'), ',', '.') || ' untuk voucher ini.';
    return next; return;
  end if;

  if v.discount_type = 'percent' then
    d := floor(p_subtotal::numeric * v.discount_value / 100)::int;
  else
    d := least(v.discount_value, p_subtotal);
  end if;
  if d < 1 then
    out_error := 'Voucher tidak memberi potongan pada total ini.'; return next; return;
  end if;
  if d >= p_subtotal then
    out_error := 'Nilai voucher melebihi total order. Pilih total yang lebih besar atau voucher lain.'; return next; return;
  end if;

  out_id := v.id; out_code := v.code; out_discount := d;
  return next; return;
end $$;

-- Preview untuk checkout (hanya tampilan; angka final tetap dihitung trigger saat order disimpan).
-- Subtotal dihitung server dari katalog; browser hanya mengirim nama produk + kode.
create or replace function public.malik_preview_voucher(p_code text, p_product text)
returns table(valid boolean, message text, subtotal int, discount int, total int)
language plpgsql security definer set search_path = public as $$
declare sub int; r record;
begin
  if auth.uid() is null then raise exception 'Belum login'; end if;
  if public.malik_is_admin() then raise exception 'Akun admin tidak dapat memakai fungsi ini'; end if;

  sub := public.malik_catalog_subtotal(p_product);
  if sub is null then
    valid := false; message := 'Produk tidak tersedia.'; subtotal := null; discount := 0; total := null;
    return next; return;
  end if;

  select * into r from public.malik_voucher_calc(p_code, sub, false);
  subtotal := sub;
  if r.out_error is not null then
    valid := false; message := r.out_error; discount := 0; total := sub;
  else
    valid := true; message := 'Voucher berhasil dipakai.'; discount := r.out_discount; total := sub - r.out_discount;
  end if;
  return next; return;
end $$;

-- Trigger order BARU. Tidak mengubah trigger lama mana pun.
create or replace function public.malik_apply_voucher()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  vcode text := upper(btrim(coalesce(new.voucher_code, '')));
  sub int; r record;
begin
  -- Retry klien dengan id yang sudah ada: biarkan primary key menolak (23505). Voucher tidak dihitung ulang.
  if new.id is not null and exists (select 1 from public.orders o where o.id = new.id) then
    return new;
  end if;

  -- Tanpa voucher: bersihkan kolom voucher (user tidak boleh mengisi diskon sendiri), harga TIDAK disentuh.
  if vcode = '' then
    new.voucher_id := null; new.voucher_code := null; new.discount_amount := 0;
    return new;
  end if;

  -- Dengan voucher: subtotal dihitung ulang dari katalog di database (tidak percaya harga dari browser).
  sub := public.malik_catalog_subtotal(new.product);
  if sub is null then
    raise exception 'Voucher tidak bisa dipakai: produk tidak dikenali atau tidak tersedia.' using errcode = '22023';
  end if;

  select * into r from public.malik_voucher_calc(vcode, sub, true);
  if r.out_error is not null then
    raise exception '%', r.out_error using errcode = '22023';   -- 22023: pesan diteruskan ke UI oleh orderError()
  end if;

  update public.vouchers set used_count = used_count + 1 where id = r.out_id;

  new.voucher_id      := r.out_id;
  new.voucher_code    := r.out_code;
  new.discount_amount := r.out_discount;
  new.price           := sub - r.out_discount;
  return new;
end $$;

drop trigger if exists zzz_malik_apply_voucher on public.orders;
create trigger zzz_malik_apply_voucher before insert on public.orders
  for each row execute function public.malik_apply_voucher();

-- ---------- 4) RLS + grants (admin saja; role tetap user/admin) ----------
alter table public.vouchers enable row level security;

drop policy if exists "malik_vouchers_admin_select" on public.vouchers;
create policy "malik_vouchers_admin_select" on public.vouchers for select to authenticated
  using ((select public.malik_is_admin()));
drop policy if exists "malik_vouchers_admin_insert" on public.vouchers;
create policy "malik_vouchers_admin_insert" on public.vouchers for insert to authenticated
  with check ((select public.malik_is_admin()) and (created_by is null or created_by = (select auth.uid())));
drop policy if exists "malik_vouchers_admin_update" on public.vouchers;
create policy "malik_vouchers_admin_update" on public.vouchers for update to authenticated
  using ((select public.malik_is_admin())) with check ((select public.malik_is_admin()));
-- Tidak ada policy DELETE: voucher dinonaktifkan, bukan dihapus (riwayat order tetap utuh).

revoke all on public.vouchers from anon, authenticated;
grant select on public.vouchers to authenticated;
-- used_count & created_by sengaja tidak bisa ditulis dari client: used_count hanya naik lewat trigger order.
grant insert (code, discount_type, discount_value, min_purchase, expires_at, usage_limit, active) on public.vouchers to authenticated;
grant update (code, discount_type, discount_value, min_purchase, expires_at, usage_limit, active) on public.vouchers to authenticated;

revoke all on function public.malik_catalog_subtotal(text)                  from public, anon, authenticated;
revoke all on function public.malik_voucher_calc(text, int, boolean)        from public, anon, authenticated;
revoke all on function public.malik_apply_voucher()                         from public, anon, authenticated;
revoke all on function public.malik_voucher_normalize()                     from public, anon, authenticated;
revoke all on function public.malik_preview_voucher(text, text)             from public, anon;
grant execute on function public.malik_preview_voucher(text, text) to authenticated;

-- ---------- CEK (opsional, hanya membaca) ----------
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--   -- urutan harus: aa_malik_block_admin_order, malik_protect_order, zy_malik_apply_catalog_price, zz_malik_order_meta, zzz_malik_apply_voucher
--   select column_name from information_schema.columns where table_name = 'orders' and column_name in ('voucher_id','voucher_code','discount_amount');
--
-- ---------- UJI DI STAGING (jangan di production dengan data asli) ----------
--   -- siapkan (sebagai admin / SQL Editor):
--   insert into public.vouchers (code, discount_type, discount_value, min_purchase, usage_limit) values ('MALIK50','percent',50,100000,2);
--   -- sebagai user biasa:
--   select * from public.malik_preview_voucher('MALIK50', 'SC OURIN DELUXE - RESELLER');          -- valid, diskon 45000
--   select * from public.malik_preview_voucher('SALAH',   'SC OURIN DELUXE - RESELLER');          -- tidak ditemukan
--   insert into public.orders (user_id, product, price, voucher_code) values (auth.uid(), 'SC OURIN DELUXE - RESELLER', 1, 'MALIK50');  -- price 45000, discount_amount 45000
--   insert into public.orders (user_id, product, price) values (auth.uid(), 'SC OURIN DELUXE - RESELLER', 1);   -- price 90000, tanpa voucher
--   insert into public.orders (user_id, product, price, discount_amount) values (auth.uid(), 'SC OURIN DELUXE - RESELLER', 1, 99999); -- discount_amount dipaksa 0
--   -- order ke-3 dengan MALIK50 -> ditolak 'Kuota voucher sudah habis.'; voucher expired -> 'Voucher sudah kedaluwarsa.'
--
-- ---------- ROLLBACK (hanya jika perlu; menghapus data voucher) ----------
--   drop trigger if exists zzz_malik_apply_voucher on public.orders;
--   drop function if exists public.malik_apply_voucher();
--   drop function if exists public.malik_preview_voucher(text, text);
--   drop function if exists public.malik_voucher_calc(text, int, boolean);
--   drop function if exists public.malik_catalog_subtotal(text);
--   alter table public.orders drop column if exists voucher_id, drop column if exists voucher_code, drop column if exists discount_amount;
--   drop table if exists public.vouchers cascade;   -- baru setelah kolom orders di atas dihapus; fungsi malik_voucher_normalize ikut dibersihkan:
--   drop function if exists public.malik_voucher_normalize();
-- =====================================================================================
