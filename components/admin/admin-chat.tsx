"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message,Profile } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function AdminChat({profiles,initial}:{profiles:Profile[];initial:Message[]}){
  const [messages,setMessages]=useState(initial),[uid,setUid]=useState(initial.find(x=>x.sender==="user")?.user_id||profiles.find(x=>x.role!=="admin")?.id||""),[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const sb=useRef(createClient()).current;
  const lock=useRef(false),endRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const ch=sb.channel("admin-chat-v2").on("postgres_changes",{event:"*",schema:"public",table:"messages"},p=>{if(p.eventType==="INSERT")setMessages(m=>m.some(x=>x.id===(p.new as Message).id)?m:[...m,p.new as Message]);if(p.eventType==="UPDATE")setMessages(m=>m.map(x=>x.id===(p.new as Message).id?p.new as Message:x));if(p.eventType==="DELETE")setMessages(m=>m.filter(x=>x.id!==p.old.id))}).subscribe();return()=>{void sb.removeChannel(ch)}},[sb]);
  const threads=useMemo(()=>profiles.filter(p=>p.role!=="admin"&&messages.some(m=>m.user_id===p.id)),[profiles,messages]);
  const list=messages.filter(m=>m.user_id===uid&&!m.hidden_for_admin);
  const unread=messages.some(m=>m.user_id===uid&&m.sender==="user"&&!m.is_read);
  // tampilkan pesan terbaru saat thread dibuka / pesan baru masuk
  useEffect(()=>{endRef.current?.scrollIntoView({block:"end"})},[uid,list.length]);
  // tandai pesan user terbaca saat thread dibuka (dulu di versi legacy; tanpa ini counter "Pesan belum dibaca" tidak pernah turun)
  useEffect(()=>{
    if(!uid||!unread)return;
    let live=true;
    (async()=>{
      const {error}=await sb.from("messages").update({is_read:true}).eq("user_id",uid).eq("sender","user").eq("is_read",false);
      if(error){console.error("[admin/chat] gagal menandai terbaca",error.message);return}
      if(live)setMessages(m=>m.map(x=>x.user_id===uid&&x.sender==="user"&&!x.is_read?{...x,is_read:true}:x));
    })();
    return()=>{live=false};
  },[sb,uid,unread]);
  async function run(fn:()=>Promise<void>,fail:string){
    if(lock.current)return;
    lock.current=true;setBusy(true);setErr("");
    try{await fn()}catch(e){console.error("[admin/chat]",e);setErr(fail)}
    finally{lock.current=false;setBusy(false)}
  }
  function send(){
    if(!uid||!text.trim())return;
    void run(async()=>{
      const {data,error}=await sb.from("messages").insert({user_id:uid,sender:"admin",message:text.trim()}).select().single();
      if(error)throw error;
      if(data)setMessages(m=>m.some(x=>x.id===(data as Message).id)?m:[...m,data as Message]);
      setText("");
    },"Pesan gagal terkirim. Coba lagi.");
  }
  function clear(){
    if(!uid||!confirm("Hapus seluruh chat user ini?"))return;
    void run(async()=>{
      const {error}=await sb.from("messages").delete().eq("user_id",uid);
      if(error)throw error;
      setMessages(m=>m.filter(x=>x.user_id!==uid));
    },"Chat gagal dihapus. Coba lagi.");
  }
  return <div className="grid min-h-[70vh] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 md:grid-cols-[240px_1fr]"><aside className="max-h-48 overflow-y-auto border-b border-zinc-800 md:max-h-none md:border-b-0 md:border-r"><div className="p-3 font-semibold">Percakapan</div>{threads.map(p=><button type="button" key={p.id} aria-pressed={uid===p.id} onClick={()=>setUid(p.id)} className={`block min-h-11 w-full touch-manipulation px-3 py-3 text-left text-sm active:bg-zinc-800 ${uid===p.id?"bg-zinc-900 text-white":"text-zinc-500 hover:bg-zinc-900/60"}`}>{p.username||p.email}</button>)}</aside><section className="flex min-w-0 flex-col"><div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-3"><b className="min-w-0 truncate">{profiles.find(p=>p.id===uid)?.username||"Pilih user"}</b>{uid&&<Button size="sm" variant="outline" disabled={busy} onClick={clear}>Hapus chat</Button>}</div><div className="flex-1 space-y-2 overflow-auto p-4">{list.map(m=><div key={m.id} className={`max-w-[80%] rounded-xl p-3 text-sm ${m.sender==="admin"?"ml-auto bg-emerald-500 text-zinc-950":"bg-zinc-900 text-zinc-200"}`}><p className="whitespace-pre-wrap break-words">{m.message}</p></div>)}{uid&&!list.length&&<p className="py-10 text-center text-sm text-zinc-500">Belum ada pesan.</p>}<div ref={endRef} aria-hidden/></div><div className="border-t border-zinc-800 p-3">{err&&<p role="alert" className="mb-2 text-xs text-red-400">{err}</p>}<div className="flex gap-2"><Input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)send()}} aria-label="Pesan"/><Button disabled={busy} onClick={send}>Kirim</Button></div></div></section></div>
}
