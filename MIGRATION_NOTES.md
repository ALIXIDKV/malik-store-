# Migration notes

- Existing Supabase project, schema, data, RLS, Realtime and auth remain authoritative.
- `supabase/master_setup.sql` is reference-only. Never run it on the existing production project.
- Legacy implementation is retained in `legacy/` for regression comparison and contains the old public publishable key/domain. It is not imported by the Next.js app.
- Admin customer restrictions remain enforced by route guards and existing Supabase RLS.
- Registration retains the OTP -> RPC verification -> `auth.admin.createUser` flow.
- Chat attachments retain server-side Cloudinary signing and file-content validation.
- Production canonical is `https://malik-store.my.id` via `NEXT_PUBLIC_SITE_URL`.
- Old-domain redirects/Search Console migration remain deferred until V2 preview testing is complete.
