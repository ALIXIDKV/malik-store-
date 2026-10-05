import { Header } from "@/components/store/header";
import { MobileBottomNav, type NavRole } from "@/components/navigation/mobile-bottom-nav";
import { getAuthContext } from "@/lib/auth";
export default async function PublicLayout({children}:{children:React.ReactNode}){
  let role:NavRole="guest";
  try{const {profile}=await getAuthContext();if(profile)role=profile.role==="admin"?"admin":"user"}catch(err){console.error("[layout] gagal memuat sesi",err)}
  return <><Header/><div className="pb-nav">{children}</div><MobileBottomNav role={role}/></>
}
