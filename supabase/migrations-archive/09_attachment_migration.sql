-- MALIK STORE - ATTACHMENT CHAT (Cloudinary)
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- Hanya MENAMBAH 2 kolom nullable di public.messages. TIDAK menghapus/mengubah data, TIDAK mengubah policy RLS / GRANT.
-- File foto/video disimpan di Cloudinary; database hanya menyimpan URL-nya.

alter table public.messages add column if not exists attachment_url  text;
alter table public.messages add column if not exists attachment_type text;   -- 'image' | 'video'

-- Pengaman: kolom ini hanya boleh berisi URL Cloudinary yang cocok dengan tipenya (user tidak bisa menyisipkan URL sembarang lewat API Supabase).
alter table public.messages drop constraint if exists malik_msg_attachment_chk;
alter table public.messages add constraint malik_msg_attachment_chk check (
  (attachment_url is null and attachment_type is null)
  or (
    attachment_type in ('image', 'video')
    and char_length(attachment_url) <= 600
    and attachment_url ~ ('^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/' || attachment_type || '/upload/')
  )
);

-- Cek (opsional): select id, message, attachment_type, attachment_url from public.messages where attachment_url is not null order by created_at desc limit 5;
