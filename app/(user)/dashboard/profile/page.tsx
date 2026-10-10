import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/dashboard/profile-form";
export default async function Profile(){
  const {supabase,user,profile}=await requireUser();
  const {data:av}=await supabase.from("profiles").select("avatar_url").eq("id",user.id).maybeSingle();
  return <main className="page"><div className="shell max-w-xl"><ProfileForm id={user.id} email={user.email||profile?.email||""} username={profile?.username||""} avatar={av?.avatar_url||""}/></div></main>
}
