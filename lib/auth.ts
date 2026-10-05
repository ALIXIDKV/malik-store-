import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
export async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user:null, profile:null };
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile:(data as Profile | null) };
}
export async function requireUser() { const ctx=await getAuthContext(); if(!ctx.user) redirect("/account"); if(ctx.profile?.role==="admin") redirect("/admin"); return ctx; }
export async function requireAdmin() { const ctx=await getAuthContext(); if(!ctx.user) redirect("/account?next=/admin"); if(ctx.profile?.role!=="admin") redirect("/dashboard"); return ctx; }
