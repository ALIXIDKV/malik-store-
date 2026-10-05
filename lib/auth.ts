import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileLite } from "@/types/database";
// cache(): header + layout + page memanggil ini pada request yang sama; cukup 1x ke Supabase.
export const getAuthContext = cache(async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user:null, profile:null };
  const { data } = await supabase.from("profiles").select("id,email,username,role,created_at").eq("id", user.id).maybeSingle();
  return { supabase, user, profile:(data as ProfileLite | null) };
});
export async function requireUser() { const ctx=await getAuthContext(); if(!ctx.user) redirect("/account"); if(ctx.profile?.role==="admin") redirect("/admin"); return ctx; }
export async function requireAdmin() { const ctx=await getAuthContext(); if(!ctx.user) redirect("/account?next=/admin"); if(ctx.profile?.role!=="admin") redirect("/dashboard"); return ctx; }
