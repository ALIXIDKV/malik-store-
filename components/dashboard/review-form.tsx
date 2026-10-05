"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function ReviewForm({orderId}:{orderId:string}){
  const [open,setOpen]=useState(false),[rating,setRating]=useState(5),[comment,setComment]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const lock=useRef(false);
  const router=useRouter();
  async function save(){
    if(lock.current)return;
    lock.current=true;setBusy(true);setMsg("");
    try{
      const s=createClient();
      const {error}=await s.from("reviews").insert({order_id:orderId,rating,comment:comment.trim()||null}).select("id");
      if(error){setMsg(error.message);return}
      setDone(true);setOpen(false);router.refresh();
    }catch(e){console.error("[review] gagal",e);setMsg("Ulasan gagal disimpan. Coba lagi.")}
    finally{lock.current=false;setBusy(false)}
  }
  if(done)return <p className="mt-2 text-sm text-emerald-400" role="status">Ulasan tersimpan.</p>;
  if(!open)return <Button size="sm" variant="outline" onClick={()=>setOpen(true)}>Beri ulasan</Button>;
  return <div className="mt-3 stack"><select aria-label="Rating" className="h-11 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-base text-zinc-100 md:h-10 md:text-sm" value={rating} onChange={e=>setRating(Number(e.target.value))}>{[5,4,3,2,1].map(x=><option key={x} value={x}>{x} bintang</option>)}</select><Textarea value={comment} maxLength={500} onChange={e=>setComment(e.target.value)} placeholder="Bagikan pengalamanmu" aria-label="Komentar ulasan"/><Button size="sm" onClick={save} disabled={busy}>{busy?"Menyimpan…":"Simpan ulasan"}</Button>{msg&&<p role="alert" className="text-xs text-red-400">{msg}</p>}</div>
}
