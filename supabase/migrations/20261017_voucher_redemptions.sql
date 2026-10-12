-- =====================================================================================
-- MALIK STORE V3 - PATCH 2C: VOUCHER ANTI ABUSE (voucher_redemptions)
-- Jalankan MANUAL di Supabase > SQL Editor SETELAH 20261016_patch2b_signup_security.sql. Idempotent.
-- master_setup.sql TIDAK diubah.
--
-- ISI
--   * Backup data lama (tabel malik_bak_20261017_*), dibuat sekali, tidak pernah ditimpa ulang.
--   * vouchers.per_user_limit  : voucher LAMA = null (tanpa batas, perilaku lama). Voucher BARU default 1.
--   * vouchers.first_order_only: default false.
--   * voucher_redemptions      : active (dipesan) -> confirmed (order Selesai) / released (order dihapus, kuota kembali).
--   * Trigger voucher diganti: cek per-user + first-order dengan lock (voucher + per-user), aman dari request bersamaan.
--   * TIDAK ada DELETE/DROP/UPDATE pada data lama. Redemption tidak pernah dihapus.
--   * Tidak mengubah: status order, flow checkout, OTP, role, chat. Order Selesai yang dihapus TIDAK mengembalikan kuota.
-- =====================================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.vouchers') is null then
    raise exception 'PATCH 2C DIBATALKAN: tabel orders / vouchers tidak ada. Tidak ada yang diubah.';
  end if;
  if to_regprocedure('public.malik_voucher_calc(text,int,boolean)') is null
     or to_regprocedure('public.malik_apply_voucher()') is null
     or to_regprocedure('public.malik_release_voucher_on_order_delete()') is null
     or to_regprocedure('public.malik_is_admin()') is null then
    raise exception 'PATCH 2C DIBATALKAN: jalankan 20261013_vouchers.sql dan 20261014_patch1_order_chat_hardening.sql dulu. Tidak ada yang diubah.';
  end if;
end $$;

-- ---------- 0) Backup (dibuat sekali; bila sudah ada, tidak ditimpa) ----------
create table if not exists public.malik_bak_20261017_vouchers as select * from public.vouchers;
create table if not exists public.malik_bak_20261017_orders_voucher as
  select id, user_id, status, price, voucher_id, voucher_code, discount_amount, created_at
  from public.orders where voucher_id is not null;
alter table public.malik_bak_20261017_vouchers        enable row level security;
alter table public.malik_bak_20261017_orders_voucher  enable row level security;
revoke all on public.malik_bak_20261017_vouchers       from anon, authenticated;
revoke all on public.malik_bak_20261017_orders_voucher from anon, authenticated;

-- ---------- 1) Kolom voucher ----------
-- Tanpa default saat ditambah -> voucher lama otomatis null (tanpa batas per user). Default 1 dipasang sesudahnya, hanya untuk insert baru.
alter table public.vouchers add column if not exists per_user_limit   int;
alter table public.vouchers add column if not exists first_order_only boolean not null default false;
alter table public.vouchers alter column per_user_limit set default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'malik_vouchers_peruser_chk' and conrelid = 'public.vouchers'::regclass) then
    alter table public.vouchers add constraint malik_vouchers_peruser_chk check (per_user_limit is null or per_user_limit > 0);
  end if;
end $$;

grant insert (per_user_limit, first_order_only) on public.vouchers to authenticated;
grant update (per_user_limit, first_order_only) on public.vouchers to authenticated;

-- ---------- 2) Tabel redemption ----------
create table if not exists public.voucher_redemptions (
  id              uuid primary key default gen_random_uuid(),
  voucher_id      uuid not null references public.vouchers(id) on delete restrict,
  user_id         uuid not null,
  order_id        uuid unique references public.orders(id) on delete set null,
  discount_amount int  not null default 0,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint malik_redemptions_status_chk   check (status in ('active', 'released', 'confirmed')),
  constraint malik_redemptions_discount_chk check (discount_amount >= 0)
);
create index if not exists malik_redemptions_voucher_idx on public.voucher_redemptions (voucher_id, created_at desc);
create index if not exists malik_redemptions_user_idx    on public.voucher_redemptions (voucher_id, user_id) where status in ('active', 'confirmed');

alter table public.voucher_redemptions enable row level security;
drop policy if exists "malik_redemptions_admin_select" on public.voucher_redemptions;
create policy "malik_redemptions_admin_select" on public.voucher_redemptions for select to authenticated
  using ((select public.malik_is_admin()));
revoke all on public.voucher_redemptions from anon, authenticated;
grant select on public.voucher_redemptions to authenticated;   -- tulis hanya lewat trigger (security definer)

-- Backfill: order lama yang sudah memakai voucher. Aman diulang (on conflict do nothing); tidak menghapus/mengubah baris yang sudah ada.
insert into public.voucher_redemptions (voucher_id, user_id, order_id, discount_amount, status, created_at)
select o.voucher_id, o.user_id, o.id, coalesce(o.discount_amount, 0),
       case when o.status = 'Selesai' then 'confirmed' else 'active' end, o.created_at
from public.orders o
where o.voucher_id is not null
on conflict (order_id) do nothing;

-- ---------- 3) Fungsi ----------
-- Cek per-user + first-order. Mengembalikan teks error atau null (boleh).
create or replace function public.malik_voucher_user_check(p_voucher_id uuid, p_user_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v public.vouchers%rowtype; n int;
begin
  select * into v from public.vouchers where id = p_voucher_id;
  if not found then return null; end if;
  if v.per_user_limit is not null then
    select count(*) into n from public.voucher_redemptions r
      where r.voucher_id = v.id and r.user_id = p_user_id and r.status in ('active', 'confirmed');
    if n >= v.per_user_limit then
      return 'Batas pemakaian voucher ini untuk akunmu sudah tercapai.';
    end if;
  end if;
  if v.first_order_only and exists (select 1 from public.orders o where o.user_id = p_user_id) then
    return 'Voucher ini hanya berlaku untuk order pertama.';
  end if;
  return null;
end $$;

-- Trigger order (BEFORE INSERT): sama seperti versi 20261013 + cek per-user/first-order. Urutan lock selalu: per-user -> voucher.
create or replace function public.malik_apply_voucher()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  vcode text := upper(btrim(coalesce(new.voucher_code, '')));
  sub int; r record; uerr text;
begin
  if new.id is not null and exists (select 1 from public.orders o where o.id = new.id) then
    return new;
  end if;

  if vcode = '' then
    new.voucher_id := null; new.voucher_code := null; new.discount_amount := 0;
    return new;
  end if;

  sub := public.malik_catalog_subtotal(new.product);
  if sub is null then
    raise exception 'Voucher tidak bisa dipakai: produk tidak dikenali atau tidak tersedia.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('malik_voucher_user:' || new.user_id::text, 0));

  select * into r from public.malik_voucher_calc(vcode, sub, true);
  if r.out_error is not null then
    raise exception '%', r.out_error using errcode = '22023';
  end if;

  uerr := public.malik_voucher_user_check(r.out_id, new.user_id);
  if uerr is not null then
    raise exception '%', uerr using errcode = '22023';
  end if;

  update public.vouchers set used_count = used_count + 1 where id = r.out_id;

  new.voucher_id      := r.out_id;
  new.voucher_code    := r.out_code;
  new.discount_amount := r.out_discount;
  new.price           := sub - r.out_discount;
  return new;
end $$;

-- Trigger order (AFTER INSERT): catat redemption 'active' (sesudah order benar-benar ada, jadi FK aman).
create or replace function public.malik_redeem_voucher_after_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.voucher_id is not null then
    insert into public.voucher_redemptions (voucher_id, user_id, order_id, discount_amount, status)
    values (new.voucher_id, new.user_id, new.id, coalesce(new.discount_amount, 0), 'active')
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

-- Status order: Selesai -> confirmed; Selesai dibatalkan admin (balik Pending/Diproses) -> active lagi. 'released' tidak disentuh.
create or replace function public.malik_sync_redemption_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.voucher_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status = 'Selesai' then
    update public.voucher_redemptions set status = 'confirmed', updated_at = now() where order_id = new.id and status = 'active';
  elsif old.status = 'Selesai' then
    update public.voucher_redemptions set status = 'active', updated_at = now() where order_id = new.id and status = 'confirmed';
  end if;
  return new;
end $$;

-- Hapus order (= pembatalan). BEFORE DELETE supaya redemption masih terhubung ke order saat dicari.
-- Belum Selesai: redemption -> released + kuota kembali. Selesai: tetap confirmed (kuota tetap terpakai), sama seperti Patch 1.
create or replace function public.malik_release_voucher_on_order_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.voucher_id is not null and old.status is distinct from 'Selesai' then
    update public.vouchers set used_count = greatest(used_count - 1, 0) where id = old.voucher_id;
    update public.voucher_redemptions set status = 'released', updated_at = now() where order_id = old.id and status = 'active';
  end if;
  return old;
end $$;

-- Preview checkout: sekarang juga memberi tahu bila batas per-user / first-order terlewati (tampilan saja; keputusan final di trigger).
create or replace function public.malik_preview_voucher(p_code text, p_product text)
returns table(valid boolean, message text, subtotal int, discount int, total int)
language plpgsql security definer set search_path = public as $$
declare sub int; r record; uerr text;
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
    uerr := public.malik_voucher_user_check(r.out_id, auth.uid());
    if uerr is not null then
      valid := false; message := uerr; discount := 0; total := sub;
    else
      valid := true; message := 'Voucher berhasil dipakai.'; discount := r.out_discount; total := sub - r.out_discount;
    end if;
  end if;
  return next; return;
end $$;

revoke all on function public.malik_voucher_user_check(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.malik_apply_voucher()                       from public, anon, authenticated;
revoke all on function public.malik_redeem_voucher_after_order()          from public, anon, authenticated;
revoke all on function public.malik_sync_redemption_on_status()           from public, anon, authenticated;
revoke all on function public.malik_release_voucher_on_order_delete()     from public, anon, authenticated;
revoke all on function public.malik_preview_voucher(text, text)           from public, anon;
grant execute on function public.malik_preview_voucher(text, text) to authenticated;

-- ---------- 4) Trigger ----------
-- zzz_malik_apply_voucher (BEFORE INSERT) sudah terpasang; fungsinya diganti di atas.
drop trigger if exists zzz_malik_redeem_voucher on public.orders;
create trigger zzz_malik_redeem_voucher after insert on public.orders
  for each row execute function public.malik_redeem_voucher_after_order();

drop trigger if exists malik_sync_redemption_on_status on public.orders;
create trigger malik_sync_redemption_on_status after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public.malik_sync_redemption_on_status();

drop trigger if exists malik_release_voucher_on_order_delete on public.orders;
create trigger malik_release_voucher_on_order_delete before delete on public.orders
  for each row execute function public.malik_release_voucher_on_order_delete();

-- ---------- CEK (opsional, hanya membaca) ----------
--   select tgname from pg_trigger where tgrelid='public.orders'::regclass and not tgisinternal order by tgname;
--     -- harus ada: aa_malik_block_admin_order, aa_malik_force_order_defaults, malik_protect_order,
--     --   malik_release_voucher_on_order_delete, malik_sync_redemption_on_status, zy_malik_apply_catalog_price,
--     --   zz_malik_order_meta, zzz_malik_apply_voucher, zzz_malik_redeem_voucher
--   select code, per_user_limit, first_order_only, used_count from public.vouchers;       -- voucher lama: per_user_limit null
--   select status, count(*) from public.voucher_redemptions group by 1;
--   select v.code, v.used_count, count(r.*) filter (where r.status in ('active','confirmed')) as redemptions
--     from public.vouchers v left join public.voucher_redemptions r on r.voucher_id = v.id group by 1,2;   -- idealnya sama
--
-- ---------- UJI DI STAGING (user biasa A dan B; admin lewat SQL Editor) ----------
--   insert into public.vouchers (code, discount_type, discount_value, usage_limit) values ('UJI1','percent',50,10);   -- per_user_limit otomatis 1
--   insert into public.vouchers (code, discount_type, discount_value, first_order_only) values ('NEWBIE','percent',50,true);
--   -- A: order voucher UJI1 -> OK; order kedua UJI1 -> 'Batas pemakaian voucher ini untuk akunmu sudah tercapai.'
--   -- B: UJI1 -> OK (user lain tidak terpengaruh)
--   -- admin hapus order A (Pending) -> redemption 'released', used_count turun; A boleh pakai UJI1 lagi
--   -- admin ubah order ke Selesai -> 'confirmed'; hapus order Selesai -> kuota TIDAK kembali
--   -- A yang sudah punya order: NEWBIE -> 'Voucher ini hanya berlaku untuk order pertama.'
--   -- voucher lama (per_user_limit null): bisa dipakai berkali-kali seperti dulu
--
-- ROLLBACK: jalankan 20261017_voucher_redemptions_ROLLBACK.sql (data & backup tidak dihapus).
-- =====================================================================================
