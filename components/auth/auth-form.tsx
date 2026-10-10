"use client";
import { useEffect,useRef,useState } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/with-timeout";
const NET_ERR="Koneksi bermasalah. Coba lagi.";
// hanya path internal; cegah open-redirect (//host atau /\host)
function safeNext(v:string|null){return v&&v.startsWith("/")&&!v.startsWith("//")&&!v.startsWith("/\\")&&!v.startsWith("/account")?v:"/dashboard"}
type Reply={ok?:boolean;message?:string};
async function readJson(res:Response):Promise<Reply>{try{return await res.json()}catch{return {ok:false,message:NET_ERR}}}
// POST JSON dengan batas waktu (AbortController membatalkan request & pembacaan body). TIDAK PERNAH melempar: timeout / jaringan putus
// dikembalikan sebagai {ok:false,message}, sehingga pemanggil selalu sampai ke finally dan loading selalu selesai.
async function postJson(url:string,body:unknown,ms:number,timeoutMsg:string):Promise<Reply>{
  const ctl=new AbortController(),t=window.setTimeout(()=>ctl.abort(),ms);
  try{
    const res=await fetch(url,{method:"POST",signal:ctl.signal,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    return await readJson(res);
  }catch(err){
    console.error("[auth] request gagal",url,ctl.signal.aborted?"timeout":err);
    return {ok:false,message:ctl.signal.aborted?timeoutMsg:NET_ERR};
  }finally{window.clearTimeout(t)}
}
export function AuthForm(){
  const [mode,setMode]=useState<"login"|"register">("login"),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
  const router=useRouter(),search=useSearchParams();
  const lock=useRef(false),timer=useRef(0);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]); // anti double-submit: ref berubah seketika, state baru terbaca setelah re-render
  function switchMode(m:"login"|"register"){if(lock.current)return;setMode(m);setMsg("")}
  async function login(email:string,password:string){
    const s=createClient();
    const {data:signed,error}=await withTimeout(s.auth.signInWithPassword({email:email.trim().toLowerCase(),password}),20000); // timeout: tombol tidak macet di "Memproses…" saat sinyal buruk
    if(error){setMsg(/invalid login|invalid credentials/i.test(error.message)?"Email atau password salah.":"Gagal masuk. Coba lagi.");return false}
    const user=signed.user; // sudah ada dari respons login; tidak perlu getUser() kedua
    let target=safeNext(search.get("next"));
    if(user){try{const {data:p}=await withTimeout(s.from("profiles").select("role").eq("id",user.id).maybeSingle(),15000);if(p?.role==="admin")target="/admin"}catch(e){console.warn("[auth] role gagal dibaca; /dashboard akan mengalihkan admin",e)}}
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
        // timeout registrasi: server mungkin sudah membuat akun, jadi arahkan user mencoba Masuk (bukan mendaftar ulang)
        const j=await postJson("/api/register",{email,password,username:String(fd.get("username")||""),code:String(fd.get("code")||"")},30000,"Pendaftaran terlalu lama. Jika akun sudah terbuat, coba Masuk; jika belum, kirim kode baru lalu coba lagi.");
        if(!j.ok){setMsg(j.message||"Pendaftaran gagal.");return}
      }
      done=await login(email,password);
    }catch(err){console.error("[auth] gagal",err);setMsg(NET_ERR)}
    finally{
      if(!done){lock.current=false;setBusy(false)}
      // jika berhasil, tombol tetap "Memproses…" sampai halaman berpindah; pengaman bila navigasi tidak terjadi
      else timer.current=window.setTimeout(()=>{lock.current=false;setBusy(false)},10000);
    }
  }
  async function sendCode(){
    if(lock.current)return;
    const email=document.querySelector<HTMLInputElement>("#auth-email")?.value||"";
    if(!email){setMsg("Isi email terlebih dahulu.");return}
    lock.current=true;setBusy(true);setMsg("");
    try{
      const j=await postJson("/api/send-code",{email},30000,"Pengiriman kode terlalu lama. Cek email kamu; jika belum masuk, coba kirim lagi sebentar lagi.");
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
