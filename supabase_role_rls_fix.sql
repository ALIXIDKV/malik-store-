-- MALIK STORE - fix role admin + RLS messages. Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Penyebab "permission denied for table messages" = role `authenticated` belum punya GRANT DELETE/UPDATE (bukan policy). RLS tetap ON.

create or replace function public.malik_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.malik_is_admin() from public, anon;
grant execute on function public.malik_is_admin() to authenticated;

-- ===== MESSAGES =====
alter table public.messages add column if not exists hidden_for_admin boolean not null default false;
alter table public.messages enable row level security;
revoke all on public.messages from anon;
grant select, insert, update, delete on public.messages to authenticated;

do $$ declare r record; begin   -- bersihkan policy lama yang bentrok, lalu buat ulang set lengkap
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'messages' loop
    execute format('drop policy %I on public.messages', r.policyname);
  end loop;
end $$;

create policy "malik_msg_select" on public.messages for select to authenticated
  using (user_id = auth.uid() or public.malik_is_admin());
-- user biasa: hanya kirim pesan di chat miliknya. Admin DILARANG mengirim sebagai user / chat ke dirinya sendiri.
create policy "malik_msg_insert_user" on public.messages for insert to authenticated
  with check (sender = 'user' and user_id = auth.uid() and not public.malik_is_admin());
create policy "malik_msg_insert_admin" on public.messages for insert to authenticated
  with check (sender = 'admin' and public.malik_is_admin() and user_id <> auth.uid());
-- admin: ubah & hapus semua pesan. user: hanya hapus chat miliknya.
create policy "malik_msg_update_admin" on public.messages for update to authenticated
  using (public.malik_is_admin()) with check (public.malik_is_admin());
create policy "malik_msg_delete_admin" on public.messages for delete to authenticated
  using (public.malik_is_admin());
create policy "malik_msg_delete_own" on public.messages for delete to authenticated
  using (user_id = auth.uid());

-- ===== ORDERS: admin tidak boleh membuat order (RLS + trigger) =====
alter table public.orders enable row level security;
grant select, insert, update, delete on public.orders to authenticated;   -- akses sebenarnya tetap dibatasi policy RLS
drop policy if exists "malik_orders_no_admin_insert" on public.orders;
create policy "malik_orders_no_admin_insert" on public.orders as restrictive for insert to authenticated
  with check (not public.malik_is_admin());

create or replace function public.malik_block_admin_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.malik_is_admin() then
    raise exception 'Akun admin tidak boleh membuat order.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists aa_malik_block_admin_order on public.orders;   -- "aa_" = jalan paling awal
create trigger aa_malik_block_admin_order before insert on public.orders for each row execute function public.malik_block_admin_order();
