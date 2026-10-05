"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message,ProfileLite as Profile } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChatAttachment } from "@/components/chat/attachment";
export function AdminChat({profiles,initial}:{profiles:Profile[];initial:Message[]}){
  const [messages,setMessages]=useState(initial),[uid,setUid]=useState(initial.find(x=>x.sender==="user")?.user_id||profiles.find(x=>x.role!=="admin")?.id||""),[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const sb=useRef(createClient()).current;
  const lock=useRef(false);
  const listRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const ch=sb.channel("admin-chat-v2").on("postgres_changes",{event:"*",schema:"public",table:"messages"},p=>{if(p.eventType==="INSERT")setMessages(m=>m.some(x=>x.id===(p.new as Message).id)?m:[...m,p.new as Message]);if(p.eventType==="UPDATE")setMessages(m=>m.map(x=>x.id===(p.new as Message).id?p.new as Message:x));if(p.eventType==="DELETE")setMessages(m=>m.filter(x=>x.id!==p.old.id))}).subscribe();return()=>{void sb.removeChannel(ch)}},[sb]);
  const threads=useMemo(()=>{const ids=new Set(messages.map(m=>m.user_id));return profiles.filter(p=>p.role!=="admin"&&ids.has(p.id))},[profiles,messages]);
  const list=useMemo(()=>messages.filter(m=>m.user_id===uid&&!m.hidden_for_admin),[messages,uid]);
  // Daftar pesan scroll di dalam panelnya sendiri: selalu ke pesan terbaru saat ganti thread / ada pesan baru.
  useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight},[uid,list.length]);
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
      // tampil langsung tanpa menunggu realtime (dedupe by id sudah ada di handler realtime)
      if(data)setMessages(m=>m.some(x=>x.id===(data as Message).id)?m:[...m,data as Message]);
      setText("");
    },"Pesan gagal terkirim. Coba lagi.");
  }
  function clear(){
    if(!uid||!confirm("Hapus seluruh chat user ini?"))return;
    void run(async()=>{
      const {error}=await sb.from("messages").delete().eq("user_id",uid);
      if(error)throw error;
    },"Chat gagal dihapus. Coba lagi.");
  }
  return <div className="grid h-[calc(100dvh-14rem)] min-h-[26rem] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 md:h-[calc(100dvh-10rem)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1"><aside className="no-scrollbar flex gap-1 overflow-x-auto border-b border-zinc-800 p-2 md:block md:overflow-y-auto md:border-b-0 md:border-r md:p-0"><div className="hidden p-3 font-semibold md:block">Percakapan</div>{!threads.length&&<p className="px-2 py-3 text-sm text-zinc-500">Belum ada percakapan.</p>}{threads.map(p=><button type="button" key={p.id} aria-pressed={uid===p.id} onClick={()=>setUid(p.id)} className={`block min-h-11 max-w-[60vw] shrink-0 touch-manipulation truncate whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm active:bg-zinc-800 md:w-full md:max-w-none md:rounded-none md:py-3 ${uid===p.id?"bg-zinc-900 text-white":"text-zinc-500 hover:bg-zinc-900/60"}`}>{p.username||p.email}</button>)}</aside><section className="flex min-h-0 min-w-0 flex-col"><div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-3"><b className="min-w-0 truncate">{profiles.find(p=>p.id===uid)?.username||"Pilih user"}</b>{uid&&<Button size="sm" variant="outline" disabled={busy} onClick={clear}>Hapus chat</Button>}</div><div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">{list.map(m=><div key={m.id} className={`max-w-[80%] rounded-xl p-3 text-sm ${m.sender==="admin"?"ml-auto bg-emerald-500 text-zinc-950":"bg-zinc-900 text-zinc-200"}`}>{m.message&&<p className="whitespace-pre-wrap break-words">{m.message}</p>}<ChatAttachment url={m.attachment_url} type={m.attachment_type}/></div>)}</div><div className="border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{err&&<p role="alert" className="mb-2 text-xs text-red-400">{err}</p>}<div className="flex gap-2"><Input value={text} enterKeyHint="send" autoComplete="off" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)send()}} aria-label="Pesan"/><Button className="shrink-0" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={send}>Kirim</Button></div></div></section></div>
}
