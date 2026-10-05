"use client";
import { useRef,useState } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
const NET_ERR="Koneksi bermasalah. Coba lagi.";
// hanya path internal; cegah open-redirect (//host atau /\host)
function safeNext(v:string|null){return v&&v.startsWith("/")&&!v.startsWith("//")&&!v.startsWith("/\\")&&!v.startsWith("/account")?v:"/dashboard"}
async function readJson(res:Response):Promise<{ok?:boolean;message?:string}>{try{return await res.json()}catch{return {ok:false,message:NET_ERR}}}
export function AuthForm(){
  const [mode,setMode]=useState<"login"|"register">("login"),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
  const router=useRouter(),search=useSearchParams();
  const lock=useRef(false); // anti double-submit: ref berubah seketika, state baru terbaca setelah re-render
  function switchMode(m:"login"|"register"){if(lock.current)return;setMode(m);setMsg("")}
  async function login(email:string,password:string){
    const s=createClient();
    const {error}=await s.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
    if(error){setMsg(error.message);return false}
    const {data:{user}}=await s.auth.getUser();
    let target=safeNext(search.get("next"));
    if(user){const {data:p}=await s.from("profiles").select("role").eq("id",user.id).maybeSingle();if(p?.role==="admin")target="/admin"}
    router.replace(target);router.refresh();
    return true;
  }
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(lock.current)return;
    const fd=new FormData(e.currentTarget);
    const email=String(fd.get("email")||""),password=String(fd.get("password")||"");
    lock.current=true;setBusy(true);setMsg("");
    let done=false;
    try{
      if(mode==="register"){
        const res=await fetch("/api/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password,username:String(fd.get("username")||""),code:String(fd.get("code")||"")})});
        const j=await readJson(res);
        if(!j.ok){setMsg(j.message||"Pendaftaran gagal.");return}
      }
      done=await login(email,password);
    }catch(err){console.error("[auth] gagal",err);setMsg(NET_ERR)}
    finally{
      if(!done){lock.current=false;setBusy(false)}
      // jika berhasil, tombol tetap "Memproses…" sampai halaman berpindah; pengaman bila navigasi tidak terjadi
      else window.setTimeout(()=>{lock.current=false;setBusy(false)},10000);
    }
  }
  async function sendCode(){
    if(lock.current)return;
    const email=document.querySelector<HTMLInputElement>("#auth-email")?.value||"";
    if(!email){setMsg("Isi email terlebih dahulu.");return}
    lock.current=true;setBusy(true);setMsg("");
    try{
      const res=await fetch("/api/send-code",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
      const j=await readJson(res);
      setMsg(j.message||"");
    }catch(err){console.error("[auth] kirim kode gagal",err);setMsg(NET_ERR)}
    finally{lock.current=false;setBusy(false)}
  }
  const tab="min-h-11 flex-1 touch-manipulation rounded-md p-2 text-sm font-medium transition active:bg-zinc-700";
  return <div>
    <div role="group" aria-label="Pilih mode" className="mb-5 flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
      <button type="button" aria-pressed={mode==="login"} onClick={()=>switchMode("login")} className={cn(tab,mode==="login"?"bg-zinc-800 text-white shadow-sm":"text-zinc-500")}>Masuk</button>
      <button type="button" aria-pressed={mode==="register"} onClick={()=>switchMode("register")} className={cn(tab,mode==="register"?"bg-zinc-800 text-white shadow-sm":"text-zinc-500")}>Daftar</button>
    </div>
    <form onSubmit={submit} className="stack">
      {mode==="register"&&<div><label className="label" htmlFor="auth-username">Username</label><Input id="auth-username" name="username" autoComplete="username" minLength={2} maxLength={40} required/></div>}
      <div><label className="label" htmlFor="auth-email">Email</label><Input id="auth-email" name="email" type="email" autoComplete="email" required/></div>
      <div><label className="label" htmlFor="auth-password">Password</label><Input id="auth-password" name="password" type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={6} required/></div>
      {mode==="register"&&<div><label className="label" htmlFor="auth-code">Kode verifikasi</label><div className="flex gap-2"><Input id="auth-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/><Button type="button" variant="outline" onClick={sendCode} disabled={busy} className="shrink-0">Kirim kode</Button></div></div>}
      {msg&&<p role="status" className="text-sm text-zinc-400">{msg}</p>}
      <Button disabled={busy} type="submit">{busy?"Memproses…":mode==="login"?"Masuk":"Buat akun"}</Button>
    </form>
  </div>
}
