"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

// Path tujuan tanpa hash/query: dipakai untuk menggerakkan bubble lebih awal (optimistis) hanya bila tab benar-benar pindah halaman.
const pathOf=(href:string)=>href.split("#")[0].split("?")[0]||"/";

export function MobileBottomNav({role}:{role:NavRole}){
  const pathname=usePathname();
  // Tab yang baru diketuk: bubble langsung bergerak walau server masih merender; dibersihkan saat path berubah / setelah 2,5 dtk.
  const [tapped,setTapped]=useState<string|null>(null);
  useEffect(()=>{setTapped(null)},[pathname]);
  useEffect(()=>{if(!tapped)return;const t=window.setTimeout(()=>setTapped(null),2500);return()=>window.clearTimeout(t)},[tapped]);
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
  const n=items.length;
  const current=items.findIndex(i=>i.active(pathname));
  const tappedIdx=tapped?items.findIndex(i=>i.label===tapped):-1;
  const shown=tappedIdx>=0?tappedIdx:current; // indeks tab yang ditampilkan di bubble (-1 = tidak ada tab aktif)
  return <nav aria-label="Navigasi utama" className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
    <div className="relative mx-auto max-w-lg">
      {/* Bubble: satu elemen yang bergeser horizontal (transform) antar tab; lebar = 1/n sehingga tidak bergantung jumlah menu */}
      <span aria-hidden className="bn-bubble pointer-events-none absolute left-0 top-0 h-0" style={{width:`${100/n}%`,transform:`translateX(${Math.max(shown,0)*100}%)`,opacity:shown>=0?1:0}}>
        <span className="bn-bubble-dot absolute left-1/2 -top-6 size-[52px] -translate-x-1/2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/25 ring-4 ring-zinc-950"/>
      </span>
      <ul className="grid" style={{gridTemplateColumns:`repeat(${n},minmax(0,1fr))`}}>
        {items.map(({href,label,icon:Icon,active},i)=>{const on=i===shown;return <li key={label}>
          <Link href={href} aria-current={active(pathname)?"page":undefined} onClick={()=>{if(pathOf(href)!==pathname)setTapped(label)}} className={cn("bn-item group relative flex h-16 touch-manipulation select-none flex-col items-center justify-end gap-0.5 pb-2 text-[11px] font-medium focus-visible:outline-none",on?"text-emerald-400":"text-zinc-400")}>
            <Pending/>
            <span className={cn("bn-icon grid size-8 place-items-center rounded-full group-active:scale-90 group-focus-visible:ring-2 group-focus-visible:ring-emerald-400",on&&"bn-icon-on -translate-y-5 text-zinc-950")}><Icon className="size-5" aria-hidden/></span>
            <span>{label}</span>
          </Link></li>})}
      </ul>
    </div>
  </nav>
}
