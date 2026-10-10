"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard,ShoppingBag,Users,MessageCircle,Package,Store } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
const items=[["/admin",LayoutDashboard,"Dashboard"],["/admin/orders",ShoppingBag,"Order"],["/admin/users",Users,"User"],["/admin/chat",MessageCircle,"Chat"],["/admin/products",Package,"Produk"]] as const;
export function AdminNav(){
  const pathname=usePathname();
  const link="flex h-11 shrink-0 touch-manipulation items-center gap-2.5 rounded-xl px-3 text-sm transition active:bg-zinc-800";
  return <aside className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:h-screen md:w-60 md:shrink-0 md:self-start md:overflow-y-auto md:border-b-0 md:border-r md:pt-0">
    <div className="flex items-center justify-between gap-2 px-4 py-2 md:p-5">
      <span className="text-sm font-black tracking-tight">MALIK<span className="text-emerald-400">ADMIN</span></span>
      <div className="flex items-center gap-1"><ThemeToggle/><LogoutButton className="md:hidden"/></div>
    </div>
    <nav aria-label="Navigasi admin" className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 md:block md:space-y-1 md:overflow-visible">
      {items.map(([href,Icon,label])=>{const on=href==="/admin"?pathname==="/admin":pathname.startsWith(href);return <Link key={href} href={href} aria-current={on?"page":undefined} className={cn(link,on?"bg-zinc-900 text-emerald-400":"text-zinc-400 hover:bg-zinc-900 hover:text-white")}><Icon className="size-4" aria-hidden/>{label}</Link>})}
      <Link href="/" className={cn(link,"text-zinc-400 hover:bg-zinc-900 hover:text-white md:mt-4")}><Store className="size-4" aria-hidden/>Lihat toko</Link>
    </nav>
    <div className="hidden p-4 md:block"><LogoutButton/></div>
  </aside>
}
