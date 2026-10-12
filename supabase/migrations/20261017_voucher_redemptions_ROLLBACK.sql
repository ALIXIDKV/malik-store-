-- ROLLBACK PATCH 2C. Mengembalikan fungsi/trigger ke versi 20261013 + 20261014. Idempotent.
-- TIDAK menghapus data: voucher_redemptions, kolom baru, dan tabel malik_bak_20261017_* dibiarkan (aman, tidak dipakai).
-- Perhatian: sesudah rollback, trigger lama TIDAK mengubah redemption; tabel itu menjadi usang.

drop trigger if exists zzz_malik_redeem_voucher on public.orders;
drop trigger if exists malik_sync_redemption_on_status on public.orders;
drop trigger if exists malik_release_voucher_on_order_delete on public.orders;
drop function if exists public.malik_redeem_voucher_after_order();
drop function if exists public.malik_sync_redemption_on_status();

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

create or replace function public.malik_release_voucher_on_order_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.voucher_id is not null and old.status is distinct from 'Selesai' then
    update public.vouchers set used_count = greatest(used_count - 1, 0) where id = old.voucher_id;
  end if;
  return old;
end $$;

create trigger malik_release_voucher_on_order_delete after delete on public.orders
  for each row execute function public.malik_release_voucher_on_order_delete();

drop function if exists public.malik_voucher_user_check(uuid, uuid);

revoke all on function public.malik_apply_voucher()                   from public, anon, authenticated;
revoke all on function public.malik_release_voucher_on_order_delete() from public, anon, authenticated;
revoke all on function public.malik_preview_voucher(text, text)       from public, anon;
grant execute on function public.malik_preview_voucher(text, text) to authenticated;

-- OPSIONAL (hanya bila ingin benar-benar membuang; backup tetap ada di malik_bak_20261017_*):
--   alter table public.vouchers drop constraint if exists malik_vouchers_peruser_chk;
--   alter table public.vouchers drop column if exists per_user_limit, drop column if exists first_order_only;
--   drop table if exists public.voucher_redemptions;
