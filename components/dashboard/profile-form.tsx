"use client";
import { useRef,useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function ProfileForm({id,username,avatar}:{id:string;username:string;avatar:string}){
  const [name,setName]=useState(username),[av,setAv]=useState(avatar),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  const router=useRouter();
  function file(e:React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];
    if(!f)return;
    if(f.size>700_000){setMsg("Avatar terlalu besar.");return}
    const r=new FileReader();
    r.onload=()=>setAv(String(r.result||""));
    r.onerror=()=>setMsg("Gagal membaca file avatar.");
    r.readAsDataURL(f);
  }
  async function save(){
    if(lock.current)return;
    lock.current=true;setBusy(true);setMsg("");
    try{
      const s=createClient();
      const {error}=await s.from("profiles").update({username:name.trim().slice(0,40),avatar_url:av||null}).eq("id",id);
      setMsg(error?error.message:"Profil diperbarui.");
      if(!error)router.refresh();
    }catch(e){console.error("[profile] gagal",e);setMsg("Profil gagal disimpan. Coba lagi.")}
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="stack">{av&&<Image src={av} alt="Avatar" width={80} height={80} unoptimized className="size-20 rounded-full object-cover"/>}<div><label className="label" htmlFor="profile-name">Nama</label><Input id="profile-name" value={name} maxLength={40} autoComplete="nickname" onChange={e=>setName(e.target.value)}/></div><div><label className="label" htmlFor="profile-avatar">Avatar</label><Input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" className="cursor-pointer py-2 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1 file:text-sm file:text-zinc-200" onChange={file}/></div>{msg&&<p role="status" className="text-sm text-zinc-500">{msg}</p>}<Button onClick={save} disabled={busy}>{busy?"Menyimpan…":"Simpan profil"}</Button></div>
}
