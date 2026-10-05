"use client";
import { useEffect } from "react";
/**
 * Malik Store V2 tidak memakai service worker/PWA offline.
 * Situs lama (static) pernah mendaftarkan /sw.js di browser pengunjung; browser terus
 * meminta /sw.js (404) selama registrasi itu masih ada. Komponen ini melepasnya sekali saja.
 */
export function SwCleanup(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    (async()=>{
      try{
        const regs=await navigator.serviceWorker.getRegistrations();
        if(!regs.length)return;
        await Promise.all(regs.map(r=>r.unregister()));
        if("caches" in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}
      }catch(err){console.warn("[sw] gagal membersihkan service worker lama",err)}
    })();
  },[]);
  return null;
}
