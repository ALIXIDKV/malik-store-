"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
export function LogoutButton({className}:{className?:string}){
  const [busy,setBusy]=useState(false),[err,setErr]=useState("");
  async function out(){
    if(busy)return;
    setBusy(true);setErr("");
    try{
      const {error}=await createClient().auth.signOut();
      if(error)throw error;
      window.location.assign("/"); // reload penuh agar state sesi server ikut bersih
    }catch(e){console.error("[logout] gagal keluar",e);setErr("Gagal keluar. Coba lagi.");setBusy(false)}
  }
  return <div className={className}><Button variant="outline" onClick={out} disabled={busy}>{busy?"Keluar…":"Keluar"}</Button>{err&&<p role="alert" className="mt-2 text-xs text-red-400">{err}</p>}</div>
}
