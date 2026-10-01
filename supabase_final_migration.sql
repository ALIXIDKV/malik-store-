-- MALIK STORE - FINAL MIGRATION: perbaikan "permission denied for table messages" + izin admin/user.
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang. TIDAK menghapus data. RLS tetap AKTIF.
-- Penyebab error: role `authenticated` belum punya GRANT DELETE/UPDATE di public.messages (itu error GRANT, bukan policy).

-- 1) Fungsi cek admin (profiles.role = 'admin')
create or replace function public.malik_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.malik_is_admin() from public, anon;
grant execute on function public.malik_is_admin() to authenticated;

-- 2) MESSAGES: kolom bantu, RLS aktif, izin tabel
alter table public.messages add column if not exists hidden_for_admin boolean not null default false;
alter table public.messages enable row level security;
revoke all on public.messages from anon;
grant select, insert, update, delete on public.messages to authenticated;
do $$ begin   -- jika id memakai sequence (serial), authenticated perlu izin pakainya
  perform 1 from pg_class where relkind = 'S' and relname = 'messages_id_seq';
  if found then execute 'grant usage, select on sequence public.messages_id_seq to authenticated'; end if;
end $$;

-- 3) Policy messages (hanya policy milik tabel messages yang dibuat ulang; baris data tidak disentuh)
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'messages' loop
    execute format('drop policy %I on public.messages', r.policyname);
  end loop;
end $$;

-- baca: user hanya chat miliknya, admin semua
create policy "malik_msg_select" on public.messages for select to authenticated
  using (user_id = auth.uid() or public.malik_is_admin());
-- kirim: user hanya ke chat miliknya; admin DILARANG mengirim sebagai user; admin membalas ke user lain saja
create policy "malik_msg_insert_user" on public.messages for insert to authenticated
  with check (sender = 'user' and user_id = auth.uid() and not public.malik_is_admin());
create policy "malik_msg_insert_admin" on public.messages for insert to authenticated
  with check (sender = 'admin' and public.malik_is_admin() and user_id <> auth.uid());
-- ubah: admin semua pesan; user hanya pesan di chat miliknya (mis. tanda baca)
create policy "malik_msg_update_admin" on public.messages for update to authenticated
  using (public.malik_is_admin()) with check (public.malik_is_admin());
create policy "malik_msg_update_own" on public.messages for update to authenticated
  using (user_id = auth.uid() and not public.malik_is_admin()) with check (user_id = auth.uid() and not public.malik_is_admin());
-- hapus: admin semua pesan; user hanya chat miliknya
create policy "malik_msg_delete_admin" on public.messages for delete to authenticated
  using (public.malik_is_admin());
create policy "malik_msg_delete_own" on public.messages for delete to authenticated
  using (user_id = auth.uid());

-- 4) ORDERS: admin tidak boleh membuat order (policy restrictive + trigger). Hapus order hanya admin.
alter table public.orders enable row level security;
grant select, insert, update, delete on public.orders to authenticated;   -- akses sebenarnya tetap dibatasi policy RLS
drop policy if exists "malik_orders_no_admin_insert" on public.orders;
create policy "malik_orders_no_admin_insert" on public.orders as restrictive for insert to authenticated
  with check (not public.malik_is_admin());
drop policy if exists "malik_admin_delete_orders" on public.orders;
create policy "malik_admin_delete_orders" on public.orders for delete to authenticated using (public.malik_is_admin());
create or replace function public.malik_block_admin_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.malik_is_admin() then
    raise exception 'Akun admin tidak boleh membuat order.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists aa_malik_block_admin_order on public.orders;
create trigger aa_malik_block_admin_order before insert on public.orders for each row execute function public.malik_block_admin_order();

-- 5) Cek hasil (opsional): harus ada 7 policy messages & rowsecurity = true
-- select policyname, cmd from pg_policies where schemaname='public' and tablename='messages' order by 1;
-- select relrowsecurity from pg_class where oid = 'public.messages'::regclass;
