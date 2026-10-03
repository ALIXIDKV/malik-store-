-- MALIK STORE - Migration profil user (aman dijalankan berulang; TIDAK menghapus data lama)
-- Jalankan di Supabase > SQL Editor.
-- Catatan: nama user disimpan di kolom yang SUDAH ADA: profiles.username (dipakai admin, ulasan, order). Tidak dibuat kolom "name" baru agar tidak ada dua sumber nama.

-- 1) Kolom foto profil (opsional). Disimpan sebagai gambar kecil (data URL, 256x256) -> tanpa Storage bucket.
alter table public.profiles add column if not exists avatar_url text;

-- 2) User boleh mengubah profilnya SENDIRI (baris miliknya saja). Role tetap dilindungi trigger malik_protect_profile.
drop policy if exists "malik_profile_update_own" on public.profiles;
create policy "malik_profile_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 3) Validasi sisi database (nama 2-40 karakter, foto kecil & berupa gambar, email tidak bisa diubah user).
create or replace function public.malik_profile_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.malik_is_admin() then return new; end if;   -- service role / admin: bebas
  new.username := btrim(regexp_replace(coalesce(new.username, ''), '\s+', ' ', 'g'));
  if char_length(new.username) < 2 or char_length(new.username) > 40 then
    raise exception 'Nama harus 2-40 karakter.' using errcode = '22023';
  end if;
  if new.avatar_url is not null then
    if new.avatar_url !~ '^data:image/(jpeg|png|webp);base64,' or char_length(new.avatar_url) > 60000 then
      raise exception 'Foto profil tidak valid atau terlalu besar.' using errcode = '22023';
    end if;
  end if;
  new.email := old.email;
  return new;
end $$;
drop trigger if exists malik_profile_guard on public.profiles;
create trigger malik_profile_guard before update on public.profiles for each row execute function public.malik_profile_guard();

-- 4) Isi nama kosong dari email (hanya yang kosong; nama yang sudah ada tidak disentuh).
update public.profiles set username = split_part(email, '@', 1) where coalesce(btrim(username), '') = '' and email is not null;
