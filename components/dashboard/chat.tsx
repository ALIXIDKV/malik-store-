"use client";
import { useEffect,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send,Paperclip } from "lucide-react";
export function UserChat({userId,initial}:{userId:string;initial:Message[]}){
  const [messages,setMessages]=useState(initial),[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const sb=useRef(createClient()).current;
  const lock=useRef(false),endRef=useRef<HTMLDivElement>(null);
  // selalu tampilkan pesan terbaru
  useEffect(()=>{endRef.current?.scrollIntoView({block:"end"})},[messages.length]);
  useEffect(()=>{const ch=sb.channel(`chat-${userId}`).on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`user_id=eq.${userId}`},p=>{if(p.eventType==="INSERT")setMessages(m=>m.some(x=>x.id===(p.new as Message).id)?m:[...m,p.new as Message]);if(p.eventType==="DELETE")setMessages(m=>m.filter(x=>x.id!==p.old.id))}).subscribe();return()=>{void sb.removeChannel(ch)}},[sb,userId]);
  async function insertMessage(att?:{url:string,type:string}){
    const {data,error}=await sb.from("messages").insert({user_id:userId,sender:"user",message:text.trim(),attachment_url:att?.url||null,attachment_type:att?.type||null}).select().single();
    if(error)throw error;
    // tampilkan langsung (tidak bergantung pada Realtime); dedupe by id bila event Realtime datang juga
    if(data)setMessages(m=>m.some(x=>x.id===(data as Message).id)?m:[...m,data as Message]);
    setText("");
  }
  // Satu pintu untuk operasi async: kunci via ref (anti double-tap), selalu dilepas di finally.
  async function run(fn:()=>Promise<void>,fail:string){
    if(lock.current)return;
    lock.current=true;setBusy(true);setErr("");
    try{await fn()}catch(e){console.error("[chat]",e);setErr(fail)}
    finally{lock.current=false;setBusy(false)}
  }
  function send(){if(!text.trim())return;void run(()=>insertMessage(),"Pesan gagal terkirim. Coba lagi.")}
  function upload(e:React.ChangeEvent<HTMLInputElement>){
    const input=e.currentTarget,f=input.files?.[0];
    input.value=""; // agar file yang sama bisa dipilih lagi
    if(!f)return;
    if(f.size>4*1024*1024){setErr("Ukuran lampiran maksimal 4 MB.");return}
    void run(async()=>{
      const {data:{session}}=await sb.auth.getSession();
      const r=await fetch("/api/upload-chat",{method:"POST",headers:{authorization:`Bearer ${session?.access_token||""}`,"x-file-type":f.type,"content-type":"application/octet-stream"},body:f});
      const j=await r.json().catch(()=>({ok:false,message:"respons upload tidak valid"}));
      if(!j.ok)throw new Error(j.message||"upload gagal");
      await insertMessage({url:j.url,type:j.type});
    },"Lampiran gagal diunggah. Coba lagi.");
  }
  return <div className="flex min-h-[calc(100dvh-14rem)] flex-col md:min-h-[calc(100dvh-10rem)]">
    <div className="flex-1 space-y-3 py-5">{messages.map(m=><div key={m.id} className={`max-w-[82%] rounded-2xl p-3 text-sm ${m.sender==="user"?"ml-auto bg-emerald-500 text-zinc-950":"border border-zinc-800 bg-zinc-900 text-zinc-200"}`}><p className="whitespace-pre-wrap break-words">{m.message}</p><p className={`mt-1.5 text-[10px] ${m.sender==="user"?"text-emerald-950/60":"text-zinc-600"}`}>{new Date(m.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</p>{m.attachment_url&&m.attachment_type==="image"&&<img src={m.attachment_url} alt="Lampiran" className="mt-2 max-h-64 max-w-full rounded-lg"/>}{m.attachment_url&&m.attachment_type==="video"&&<video controls src={m.attachment_url} className="mt-2 max-h-64 max-w-full rounded-lg"/>}</div>)}{!messages.length&&<p className="py-10 text-center text-sm text-zinc-500">Belum ada pesan. Tulis pesan pertamamu ke admin.</p>}<div ref={endRef} aria-hidden/></div>
    {/* offset sticky = tinggi bottom nav (4rem + safe-area) di mobile, 0 di desktop; z lebih rendah dari nav sehingga tidak saling menimpa */}
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-zinc-900 bg-zinc-950/95 py-3 backdrop-blur-xl md:bottom-0">
      {err&&<p role="alert" className="mb-2 text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <label className={`relative flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition focus-within:ring-2 focus-within:ring-emerald-400 active:bg-zinc-800 md:size-10 ${busy?"pointer-events-none opacity-50":"cursor-pointer"}`}><Paperclip className="size-4" aria-hidden/><span className="sr-only">Lampirkan gambar atau video</span><input className="sr-only" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={upload}/></label>
        <Input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)send()}} placeholder="Tulis pesan…" aria-label="Pesan"/>
        <Button size="icon" disabled={busy} onClick={send} aria-label="Kirim pesan" className="shrink-0"><Send className="size-4" aria-hidden/></Button>
      </div>
    </div>
  </div>
}
