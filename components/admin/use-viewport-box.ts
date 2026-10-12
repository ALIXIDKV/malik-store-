"use client";
import { useEffect,useState,type RefObject } from "react";

export type ViewportBox={top:number;height:number}|null;
export type ViewportBoxOptions={topEdge?:()=>HTMLElement|null};

// Ukuran area chat di HP = dari bawah navigasi admin sampai bagian bawah VISUAL viewport.
// 100dvh saja tidak berubah saat keyboard Android (Chrome) terbuka, sehingga input tertutup keyboard;
// visualViewport menyusut mengikuti keyboard, jadi kotak chat + input ikut naik. Dipakai hanya di bawah breakpoint md (lihat admin-chat).
// Hook ini generik (dipakai chat admin & chat customer), tidak bergantung pada selector tertentu:
//  - anchor  = elemen nol-tinggi tepat di tempat panel dimulai (dipakai bila tidak ada topEdge).
//  - topEdge = (opsional) fungsi yang mengembalikan elemen sticky/fixed di ATAS panel (navigasi admin, header customer);
//    batas atas panel = bagian bawah elemen itu. Berikan fungsi yang STABIL (didefinisikan di luar komponen).
//
// Panel chat memakai position:fixed, jadi SEMUA nilai di sini harus dalam koordinat viewport (bukan koordinat dokumen):
//  - batas atas  = bawah navigasi admin yang sticky (getBoundingClientRect().bottom -> viewport; tidak bergantung scroll halaman)
//  - batas bawah = offsetTop + height dari visualViewport (visualViewport.offsetTop juga koordinat viewport)
// Sebelumnya rect.top (viewport) dicampur window.scrollY (dokumen) sehingga posisi panel bisa meleset saat halaman ter-scroll.
const MIN_H=240; // tinggi minimum panel agar daftar pesan + input tetap layak dipakai
const KEYBOARD_GAP=120; // visualViewport yang lebih pendek dari layar sebanyak ini dianggap keyboard terbuka
// Bar atas yang sticky: navigasi admin; di halaman customer (tidak ada nav admin) = <header> toko.
function topBar():HTMLElement|null{
  return document.querySelector<HTMLElement>('nav[aria-label="Navigasi admin"]')?.closest("aside")??document.querySelector<HTMLElement>("body > header, header");
}
function navBottom(anchor:HTMLElement):number{
  const nav=topBar();
  if(nav)return Math.max(0,nav.getBoundingClientRect().bottom);
  return Math.max(0,anchor.getBoundingClientRect().top); // fallback: anchor ada tepat di bawah nav (sticky), nilai viewport
}
export function useViewportBox(anchor:RefObject<HTMLElement|null>):ViewportBox{
  const [box,setBox]=useState<ViewportBox>(null);
  useEffect(()=>{
    const el=anchor.current;
    if(!el)return;
    const vv=window.visualViewport;
    let raf=0;const timers:number[]=[];
    const calc=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const offTop=vv?.offsetTop??0,vh=vv?.height??window.innerHeight;
        const bottom=offTop+vh; // batas bawah area terlihat (di atas keyboard)
        const keyboard=!!vv&&window.innerHeight-vh>KEYBOARD_GAP;
        let top=Math.max(edgeBottom(el,topEdge?.()??null),offTop);
        // Keyboard terbuka di layar pendek (mis. landscape): ruang di bawah nav < MIN_H. Panel dinaikkan menutupi nav
        // (tinggi tetap = ruang terlihat) agar input TIDAK PERNAH tertutup keyboard.
        if(keyboard&&bottom-top<MIN_H)top=offTop;
        const height=Math.max(0,bottom-top);
        const t=Math.round(top),h=Math.round(keyboard||height>=MIN_H?height:MIN_H); // tanpa keyboard: tidak pernah lebih kecil dari MIN_H
        setBox(b=>b&&b.top===t&&b.height===h?b:{top:t,height:h});
      });
    };
    // Orientasi berubah: ukuran viewport baru sering dilaporkan terlambat -> hitung ulang beberapa kali setelahnya.
    const rotated=()=>{calc();[120,350].forEach(ms=>timers.push(window.setTimeout(calc,ms)))};
    calc();
    vv?.addEventListener("resize",calc);vv?.addEventListener("scroll",calc);
    window.addEventListener("resize",calc);window.addEventListener("scroll",calc,{passive:true});window.addEventListener("orientationchange",rotated);
    const nav=topBar();
    const ro=typeof ResizeObserver!=="undefined"&&nav?new ResizeObserver(calc):null;if(nav)ro?.observe(nav); // tinggi nav berubah (font/safe-area) -> posisi atas ikut
    return()=>{cancelAnimationFrame(raf);timers.forEach(clearTimeout);ro?.disconnect();vv?.removeEventListener("resize",calc);vv?.removeEventListener("scroll",calc);window.removeEventListener("resize",calc);window.removeEventListener("scroll",calc);window.removeEventListener("orientationchange",rotated)};
  },[anchor,topEdge]);
  return box;
}
