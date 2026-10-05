import { Header } from "@/components/store/header";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { requireUser } from "@/lib/auth";
export default async function Layout({children}:{children:React.ReactNode}){await requireUser();return <><Header/><div className="pb-nav">{children}</div><MobileBottomNav role="user"/></>}
