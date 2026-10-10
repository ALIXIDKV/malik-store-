"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Home,LayoutGrid,ClipboardList,MessageCircle,UserRound,LayoutDashboard,type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavRole="guest"|"user"|"admin";
type Item={href:string;label:string;icon:LucideIcon;active:(p:string,h:string)=>boolean};

// usePathname() tidak melihat hash, jadi Katalog (/#catalog) dibedakan dari Home (/) lewat hash URL (state `hash` di komponen).
const CATALOG_HASH="#catalog";
const home:Item={href:"/",label:"Home",icon:Home,active:(p,h)=>(p==="/"&&h!==CATALOG_HASH)||p==="/tentang"};
const catalog:Item={href:"/#catalog",label:"Katalog",icon:LayoutGrid,active:(p,h)=>p.startsWith("/product")||(p==="/"&&h===CATALOG_HASH)};

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

// Penanda "sedang membuka" + melapor ke induk selama navigasi berlangsung (tanpa timeout: status mengikuti useLinkStatus,
// dan dilepas otomatis saat navigasi selesai atau komponen dilepas).
function Pending({label,onPending}:{label:string;onPending:(label:string,pending:boolean)=>void}){
  const {pending}=useLinkStatus();
  useEffect(()=>{if(!pending)return;onPending(label,true);return()=>onPending(label,false)},[label,pending,onPending]);
  return <span aria-hidden className={cn("absolute top-1.5 size-1.5 rounded-full bg-emerald-400 transition-opacity",pending?"animate-pulse opacity-100":"opacity-0")}/>
}

// Input yang memunculkan keyboard virtual (checkbox, file, dsb. tidak termasuk).
const NON_TEXT=new Set(["checkbox","radio","button","submit","reset","file","range","color","image"]);
function opensKeyboard(el:EventTarget|null){return el instanceof HTMLTextAreaElement||(el instanceof HTMLInputElement&&!NON_TEXT.has(el.type))}

export function MobileBottomNav({role}:{role:NavRole}){
  const pathname=usePathname();
  // Hash awal "" = sama dengan server (server tidak tahu hash) -> tidak ada hydration mismatch; disinkronkan setelah mount.
  const [hash,setHash]=useState("");
  // `settled` false sampai hash awal tersinkron & tergambar: refresh di /#catalog langsung menampilkan Katalog tanpa bubble "meluncur".
  const [settled,setSettled]=useState(false);
  // Tab tujuan yang sedang dibuka (navigasi ke halaman lain): bubble langsung bergerak walau server masih merender.
  const [opening,setOpening]=useState<string|null>(null);
  const onPending=useCallback((label:string,pending:boolean)=>setOpening(c=>pending?label:(c===label?null:c)),[]);

  // Sinkron hash dengan URL: mount (refresh), Back/Forward (popstate), hashchange, dan klik link ke halaman yang sama
  // (router Next memakai pushState sehingga TIDAK memicu hashchange/popstate; URL tujuan dibaca langsung dari link).
  useEffect(()=>{
    const sync=()=>setHash(window.location.hash);
    sync();
    let r2=0;const r1=window.requestAnimationFrame(()=>{r2=window.requestAnimationFrame(()=>setSettled(true))});
    const onClick=(e:MouseEvent)=>{
      if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const a=(e.target instanceof Element)?e.target.closest("a[href]"):null;
      if(!(a instanceof HTMLAnchorElement)||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return;
      const u=new URL(a.href,window.location.href);
      if(u.origin===window.location.origin&&u.pathname===window.location.pathname)setHash(u.hash);
    };
    window.addEventListener("hashchange",sync);window.addEventListener("popstate",sync);document.addEventListener("click",onClick);
    return()=>{window.cancelAnimationFrame(r1);window.cancelAnimationFrame(r2);window.removeEventListener("hashchange",sync);window.removeEventListener("popstate",sync);document.removeEventListener("click",onClick)};
  },[]);
  // Pindah halaman: baca hash dari URL final (mis. dari /product/x ke /#catalog, atau ke halaman tanpa hash).
  useEffect(()=>{setHash(window.location.hash)},[pathname]);

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
  const current=items.findIndex(i=>i.active(pathname,hash));
  const openingIdx=opening?items.findIndex(i=>i.label===opening):-1;
  const shown=openingIdx>=0?openingIdx:current; // indeks tab yang ditampilkan di bubble (-1 = tidak ada tab aktif)
  const still=settled?undefined:{transition:"none"}; // matikan transisi hanya untuk gambar pertama
  return <nav aria-label="Navigasi utama" className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
    <div className="relative mx-auto max-w-lg">
      {/* Bubble: satu elemen yang bergeser horizontal (transform) antar tab; lebar = 1/n sehingga tidak bergantung jumlah menu */}
      <span aria-hidden className="bn-bubble pointer-events-none absolute left-0 top-0 h-0" style={{width:`${100/n}%`,transform:`translateX(${Math.max(shown,0)*100}%)`,opacity:shown>=0?1:0,...still}}>
        <span className="bn-bubble-dot absolute left-1/2 -top-6 size-[52px] -translate-x-1/2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/25 ring-4 ring-zinc-950"/>
      </span>
      <ul className="grid" style={{gridTemplateColumns:`repeat(${n},minmax(0,1fr))`}}>
        {items.map(({href,label,icon:Icon,active},i)=>{const on=i===shown;return <li key={label}>
          <Link href={href} aria-current={active(pathname,hash)?"page":undefined} className={cn("bn-item group relative flex h-16 touch-manipulation select-none flex-col items-center justify-end gap-0.5 pb-2 text-[11px] font-medium focus-visible:outline-none",on?"text-emerald-400":"text-zinc-400")}>
            <Pending label={label} onPending={onPending}/>
            <span style={still} className={cn("bn-icon grid size-8 place-items-center rounded-full group-active:scale-90 group-focus-visible:ring-2 group-focus-visible:ring-emerald-400",on&&"bn-icon-on -translate-y-5 text-zinc-950")}><Icon className="size-5" aria-hidden/></span>
            <span>{label}</span>
          </Link></li>})}
      </ul>
    </div>
  </nav>
}
