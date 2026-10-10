"use client";
import { useEffect,useRef,useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera,Check,Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";

// Trigger database (malik_profile_guard) menolak avatar > 60.000 karakter. Foto dari HP bisa beberapa MB,
// jadi dipotong persegi + diperkecil + dikompres di browser sampai muat (tanpa dependency, tanpa ubah database).
const DB_LIMIT=60000,TARGET=55000,MAX_INPUT=10*1024*1024;
async function compressAvatar(file:File):Promise<string>{
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise<HTMLImageElement>((ok,no)=>{const i=new window.Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error("decode"));i.src=url});
    const side=Math.min(img.naturalWidth,img.naturalHeight);
    if(!side)throw new Error("kosong");
    const sx=(img.naturalWidth-side)/2,sy=(img.naturalHeight-side)/2;
    for(const size of [256,200,160,128,96]){
      const c=document.createElement("canvas");c.width=c.height=size;
      const ctx=c.getContext("2d");if(!ctx)throw new Error("canvas");
      ctx.fillStyle="#18181b";ctx.fillRect(0,0,size,size); // latar untuk PNG transparan (JPEG tidak punya alpha)
      ctx.drawImage(img,sx,sy,side,side,0,0,size,size);
      for(const q of [0.85,0.72,0.6,0.5,0.4]){
        const out=c.toDataURL("image/jpeg",q);
        if(out.startsWith("data:image/jpeg;base64,")&&out.length<=TARGET)return out;
      }
    }
    throw new Error("terlalu besar");
  }finally{URL.revokeObjectURL(url)}
}

function Avatar({src,name,className}:{src:string;name:string;className:string}){
  if(src)return <Image src={src} alt={`Foto profil ${name}`} width={128} height={128} unoptimized className={`${className} object-cover`}/>;
  const initial=(name.trim()[0]||"U").toUpperCase();
  return <div role="img" aria-label={`Avatar default ${name}`} className={`${className} grid place-items-center bg-gradient-to-br from-emerald-400 to-emerald-700 font-black text-zinc-950`}><span className="text-4xl sm:text-5xl">{initial}</span></div>;
}

export function ProfileForm({id,email,username,avatar}:{id:string;email:string;username:string;avatar:string}){
  const [saved,setSaved]=useState({name:username,avatar}); // yang sudah tersimpan di database
  const [name,setName]=useState(username),[av,setAv]=useState(avatar); // draf yang sedang diedit (av = preview)
  const [msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState(false),[reading,setReading]=useState(false);
  const lock=useRef(false),pick=useRef<HTMLInputElement>(null);
  const router=useRouter();
  const dirty=name.trim()!==saved.name||av!==saved.avatar;
  // Setelah router.refresh() server mengirim data terbaru: samakan jika bukan hasil edit yang belum disimpan.
  useEffect(()=>{setSaved(s=>s.name===username&&s.avatar===avatar?s:{name:username,avatar})},[username,avatar]);
  async function file(e:React.ChangeEvent<HTMLInputElement>){
    const input=e.currentTarget,f=input.files?.[0];
    input.value=""; // pilih file yang sama lagi tetap memicu onChange
    if(!f)return;
    if(!/^image\/(jpeg|png|webp)$/.test(f.type)){setMsg({ok:false,text:"Format foto harus JPG, PNG, atau WebP."});return}
    if(f.size>MAX_INPUT){setMsg({ok:false,text:"Foto terlalu besar (maksimal 10 MB)."});return}
    setReading(true);setMsg(null);
    try{setAv(await compressAvatar(f))}
    catch(err){console.error("[profile] kompres avatar gagal",err);setMsg({ok:false,text:"Foto tidak bisa diproses. Coba foto lain."})}
    finally{setReading(false)}
  }
  async function save(){
    if(lock.current||!dirty)return;
    const n=name.trim().replace(/\s+/g," ");
    if(n.length<2||n.length>40){setMsg({ok:false,text:"Nama harus 2–40 karakter."});return} // sama dengan aturan trigger database
    if(av&&av.length>DB_LIMIT){setMsg({ok:false,text:"Foto terlalu besar. Pilih foto lain."});return}
    lock.current=true;setBusy(true);setMsg(null);
    try{
      const {error}=await withTimeout(createClient().from("profiles").update({username:n,avatar_url:av||null}).eq("id",id),20000);
      if(error){console.error("[profile] update gagal",error.code);setMsg({ok:false,text:error.code==="22023"?error.message:"Profil gagal disimpan. Coba lagi."});return}
      setSaved({name:n,avatar:av});setName(n);setMsg({ok:true,text:"Profil berhasil disimpan."});
      router.refresh(); // sinkronkan header/server component; tampilan di sini sudah langsung diperbarui
    }catch(e){console.error("[profile] gagal",e);setMsg({ok:false,text:"Profil gagal disimpan. Periksa koneksi lalu coba lagi."})}
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="grid gap-4">
    <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/70">
      <div aria-hidden className="h-24 bg-[radial-gradient(120%_140%_at_50%_-20%,rgba(16,185,129,.35),transparent_70%)] sm:h-28"/>
      <div className="-mt-14 flex flex-col items-center px-5 pb-7 text-center sm:-mt-16">
        <div className="relative">
          <Avatar src={av} name={saved.name||"User"} className="size-28 rounded-full border-4 border-zinc-950 shadow-[0_0_0_2px_rgba(16,185,129,.5),0_12px_40px_rgba(16,185,129,.18)] sm:size-32"/>
          <button type="button" onClick={()=>pick.current?.click()} disabled={reading||busy} aria-label="Ganti foto profil" className="absolute bottom-0 right-0 grid size-10 touch-manipulation place-items-center rounded-full border-2 border-zinc-950 bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-50"><Camera className="size-4" aria-hidden/></button>
          <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={file}/>
        </div>
        <h1 className="mt-4 max-w-full break-words text-2xl font-bold tracking-tight text-zinc-50">{saved.name||"User"}</h1>
        <p className="mt-1 max-w-full break-all text-sm text-zinc-400">{email}</p>
        {av!==saved.avatar&&<p className="mt-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">Pratinjau foto — belum disimpan</p>}
      </div>
    </section>

    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Edit profil</p>
      <div className="stack mt-4">
        <div><label className="label" htmlFor="profile-name">Nama</label><Input id="profile-name" value={name} maxLength={40} autoComplete="nickname" onChange={e=>{setName(e.target.value);setMsg(null)}}/></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={()=>pick.current?.click()} disabled={reading||busy}><Camera className="size-4" aria-hidden/>{reading?"Memproses foto…":av?"Ganti foto":"Pilih foto"}</Button>
          {av&&<Button variant="ghost" size="sm" onClick={()=>{setAv("");setMsg(null)}} disabled={reading||busy}><Trash2 className="size-4" aria-hidden/>Hapus foto</Button>}
        </div>
        {msg&&<p role={msg.ok?"status":"alert"} className={`flex items-center gap-1.5 text-sm ${msg.ok?"text-emerald-400":"text-red-400"}`}>{msg.ok&&<Check className="size-4" aria-hidden/>}{msg.text}</p>}
        <Button onClick={save} disabled={busy||reading||!dirty}>{busy?"Menyimpan…":"Simpan profil"}</Button>
      </div>
    </section>

    <LogoutButton className="[&>button]:w-full"/>
  </div>
}
