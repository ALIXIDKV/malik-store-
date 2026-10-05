import { DashboardNav } from "@/components/dashboard/nav"; import { requireUser } from "@/lib/auth";
export default async function Layout({children}:{children:React.ReactNode}){await requireUser();return <>{children}<DashboardNav/></>}
