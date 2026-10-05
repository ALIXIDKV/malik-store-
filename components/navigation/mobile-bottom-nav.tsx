"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home,LayoutGrid,ClipboardList,MessageCircle,UserRound,LayoutDashboard,type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavRole="guest"|"user"|"admin";
type Item={href:string;label:string;icon:LucideIcon;active:(p:string)=>boolean};

const home:Item={href:"/",label:"Home",icon:Home,active:p=>p==="/"||p==="/tentang"};
const catalog:Item={href:"/#catalog",label:"Katalog",icon:LayoutGrid,active:p=>p.startsWith("/product")};

function itemsFor(role:NavRole):Item[]{
  if(role==="admin")return [home,catalog,
    {href:"/admin",label:"Admin",icon:LayoutDashboard,active:p=>p.startsWith("/admin")&&!p.startsWith("/admin/chat")},
    {href:"/admin/chat",label:"Chat",icon:MessageCircle,active:p=>p.startsWith("/admin/chat")}];
  if(role==="user")return [home,catalog,
    {href:"/dashboard",label:"Pesanan",icon:ClipboardList,active:p=>p==="/dashboard"||p.startsWith("/dashboard/history")},
    {href:"/dashboard/chat",label:"Chat",icon:MessageCircle,active:p=>p.startsWith("/dashboard/chat")},
    {href:"/dashboard/profile",label:"Akun",icon:UserRound,active:p=>p.startsWith("/dashboard/profile")}];
  return [home,catalog,
    {href:"/account?next=/dashboard/chat",label:"Chat",icon:MessageCircle,active:()=>false},
    {href:"/account",label:"Akun",icon:UserRound,active:p=>p.startsWith("/account")}];
}

// Penanda "sedang membuka" agar tap terasa langsung direspons walau server masih merender.
function Pending(){const {pending}=useLinkStatus();return <span aria-hidden className={cn("absolute top-1.5 size-1.5 rounded-full bg-emerald-400 transition-opacity",pending?"animate-pulse opacity-100":"opacity-0")}/>}

// Input yang memunculkan keyboard virtual (checkbox, file, dsb. tidak termasuk).
const NON_TEXT=new Set(["checkbox","radio","button","submit","reset","file","range","color","image"]);
function opensKeyboard(el:EventTarget|null){return el instanceof HTMLTextAreaElement||(el instanceof HTMLInputElement&&!NON_TEXT.has(el.type))}

export function MobileBottomNav({role}:{role:NavRole}){
  const pathname=usePathname();
  // Saat keyboard terbuka, bottom nav disembunyikan (html[data-kbd]) supaya tidak memakan layar / menimpa form.
  // Pelepasan ditunda 200ms agar perpindahan fokus antar input (atau tap tombol kirim) tidak membuat layout berkedip.
  useEffect(()=>{
    const root=document.documentElement;let t=0;
    const onIn=(e:FocusEvent)=>{if(!opensKeyboard(e.target))return;window.clearTimeout(t);root.dataset.kbd="1"};
    const onOut=()=>{window.clearTimeout(t);t=window.setTimeout(()=>{delete root.dataset.kbd},200)};
    document.addEventListener("focusin",onIn);document.addEventListener("focusout",onOut);
    return()=>{document.removeEventListener("focusin",onIn);document.removeEventListener("focusout",onOut);window.clearTimeout(t);delete root.dataset.kbd};
  },[]);
  // Admin & halaman login punya navigasi sendiri.
  if(pathname.startsWith("/admin")||pathname.startsWith("/account"))return null;
  const items=itemsFor(role);
  return <nav aria-label="Navigasi utama" className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
    <ul className="mx-auto grid max-w-lg" style={{gridTemplateColumns:`repeat(${items.length},minmax(0,1fr))`}}>
      {items.map(({href,label,icon:Icon,active})=>{const on=active(pathname);return <li key={label}>
        <Link href={href} aria-current={on?"page":undefined} className={cn("relative flex h-16 touch-manipulation select-none flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95 active:bg-zinc-900 focus-visible:bg-zinc-900",on?"text-emerald-400":"text-zinc-400")}>
          <Pending/><Icon className="size-5" aria-hidden/><span>{label}</span>
        </Link></li>})}
    </ul></nav>
}
