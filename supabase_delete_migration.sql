-- MALIK STORE - migration fitur hapus (admin chat / orders). Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Hapus USER tidak butuh SQL: dikerjakan server (/api/delete-user) dengan Service Role.

-- 1) "Hapus untuk saya" di chat admin: pesan disembunyikan dari admin saja, user tetap melihatnya.
alter table public.messages add column if not exists hidden_for_admin boolean not null default false;

-- 2) Pengecekan admin (membaca profiles.role = 'admin')
create or replace function public.malik_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.malik_is_admin() from public, anon;
grant execute on function public.malik_is_admin() to authenticated;

-- 3) Izin admin: hapus & ubah pesan, hapus order (RLS)
drop policy if exists "malik_admin_delete_messages" on public.messages;
create policy "malik_admin_delete_messages" on public.messages for delete to authenticated using (public.malik_is_admin());

drop policy if exists "malik_admin_update_messages" on public.messages;
create policy "malik_admin_update_messages" on public.messages for update to authenticated using (public.malik_is_admin()) with check (public.malik_is_admin());

drop policy if exists "malik_admin_delete_orders" on public.orders;
create policy "malik_admin_delete_orders" on public.orders for delete to authenticated using (public.malik_is_admin());
