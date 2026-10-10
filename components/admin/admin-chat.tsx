"use client";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message,ProfileLite as Profile } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChatAttachment } from "@/components/chat/attachment";
import { isPaymentMessage,PaymentCard } from "@/components/chat/payment-card";
import { useNotifySound } from "@/components/chat/use-notify-sound";
import { mergeMessages,upsertMessage } from "@/components/chat/merge-messages";
import { withTimeout } from "@/lib/with-timeout";
import { insertMessageOnce } from "@/lib/chat-send";
import { newId } from "@/lib/order-flow";
const LIMIT=2000;
let chatSeq=0; // nama channel unik per mount (hindari bentrok dengan channel lama yang masih dilepas)
const PROFILE_COLS="id,email,username,role,created_at";
export function AdminChat({profiles:initialProfiles,initial}:{profiles:Profile[];initial:Message[]}){
  const [profiles,setProfiles]=useState(initialProfiles),[messages,setMessages]=useState(initial),[uid,setUid]=useState(initial.find(x=>x.sender==="user")?.user_id||initialProfiles.find(x=>x.role!=="admin")?.id||""),[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const sb=useRef(createClient()).current;
  const lock=useRef(false);
  // msgsRef = salinan state terbaru (sinkron); gone = id terhapus; pend = kunci idempotensi kirim (lihat dashboard/chat.tsx).
  const msgsRef=useRef(initial),gone=useRef(new Set<string>()),syncSeq=useRef(0),syncApplied=useRef(0),pend=useRef<{key:string;id:string}|null>(null);
  const commit=useCallback((fn:(m:Message[])=>Message[])=>{const next=fn(msgsRef.current);if(next!==msgsRef.current){msgsRef.current=next;setMessages(next)}},[]);
  const playChat=useNotifySound("/assets/notif/chet.mp3");
  const listRef=useRef<HTMLDivElement>(null);
  // Profil user yang daftar setelah halaman dimuat belum ada di daftar; tanpa ini pesan pertamanya tidak punya thread sampai refresh.
  const seen=useRef(new Set(initialProfiles.map(p=>p.id)));
  const ensureProfile=useCallback(async(id:string)=>{
    if(seen.current.has(id))return;
    seen.current.add(id);
    try{
      const {data,error}=await withTimeout(sb.from("profiles").select(PROFILE_COLS).eq("id",id).maybeSingle(),15000);
      if(error)throw error;
      if(data)setProfiles(p=>p.some(x=>x.id===id)?p:[data as Profile,...p]);
    }catch(e){seen.current.delete(id);console.error("[admin/chat] profil user gagal dimuat",e)}
  },[sb]);
  // Sinkron dari server: menutup celah render-server -> subscribe, pulih setelah reconnect / HP tidur / koneksi putus.
  const sync=useCallback(async()=>{
    const seq=++syncSeq.current;
    const before=new Set(msgsRef.current.map(x=>x.id)); // pesan yang sudah ada sebelum fetch dimulai
    try{
      const [m,p]=await withTimeout(Promise.all([sb.from("messages").select("*").order("created_at",{ascending:false}).limit(LIMIT),sb.from("profiles").select(PROFILE_COLS).order("created_at",{ascending:false})]),20000);
      if(m.error)throw m.error;
      if(seq<syncApplied.current)return; // hasil fetch yang lebih baru sudah dipakai
      syncApplied.current=seq;
      const rows=((m.data||[]) as Message[]).slice().reverse();
      commit(cur=>mergeMessages(rows,cur,{before,gone:gone.current,limit:LIMIT}));
      if(!p.error&&p.data){const ps=p.data as Profile[];ps.forEach(x=>seen.current.add(x.id));setProfiles(ps)}
    }catch(e){console.error("[admin/chat] sinkron gagal",e)}
  },[sb,commit]);
  useEffect(()=>{
    const ch=sb.channel(`admin-chat-v2-${++chatSeq}`).on("postgres_changes",{event:"*",schema:"public",table:"messages"},p=>{if(p.eventType==="INSERT"){const n=p.new as Message;if(gone.current.has(n.id))return;if(n.sender==="user"&&!msgsRef.current.some(x=>x.id===n.id))playChat();void ensureProfile(n.user_id);commit(m=>upsertMessage(m,n))}if(p.eventType==="UPDATE"){const n=p.new as Message;if(!gone.current.has(n.id))commit(m=>m.some(x=>x.id===n.id)?upsertMessage(m,n):m)}if(p.eventType==="DELETE"){const id=String(p.old.id||"");if(id){gone.current.add(id);commit(m=>m.filter(x=>x.id!==id))}}}).subscribe(st=>{if(st==="SUBSCRIBED")void sync()}); // SUBSCRIBED juga muncul lagi setelah reconnect
    const wake=()=>{if(document.visibilityState==="visible")void sync()};
    document.addEventListener("visibilitychange",wake);window.addEventListener("online",wake);
    return()=>{document.removeEventListener("visibilitychange",wake);window.removeEventListener("online",wake);void sb.removeChannel(ch)};
  },[sb,playChat,ensureProfile,sync,commit]);
  const threads=useMemo(()=>{const ids=new Set(messages.map(m=>m.user_id));return profiles.filter(p=>p.role!=="admin"&&ids.has(p.id))},[profiles,messages]);
  const list=useMemo(()=>messages.filter(m=>m.user_id===uid&&!m.hidden_for_admin),[messages,uid]);
  // Daftar pesan scroll di dalam panelnya sendiri: selalu ke pesan terbaru saat ganti thread / ada pesan baru.
  useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight},[uid,list.length]);
  // Tandai pesan user di thread yang sedang dibuka sebagai terbaca (counter "Pesan belum dibaca" di dashboard admin).
  useEffect(()=>{
    if(!uid||!messages.some(m=>m.user_id===uid&&m.sender==="user"&&!m.is_read))return;
    commit(all=>all.map(x=>x.user_id===uid&&x.sender==="user"&&!x.is_read?{...x,is_read:true}:x));
    void sb.from("messages").update({is_read:true}).eq("user_id",uid).eq("sender","user").eq("is_read",false).then(({error})=>{if(error)console.error("[admin/chat] tandai dibaca gagal",error.code)});
  },[uid,messages,sb,commit]);
  async function run(fn:()=>Promise<void>,fail:string){
    if(lock.current)return;
    lock.current=true;setBusy(true);setErr("");
    try{await fn()}catch(e){console.error("[admin/chat]",e);setErr(fail)}
    finally{lock.current=false;setBusy(false)}
  }
  function send(){
    if(!uid||!text.trim())return;
    void run(async()=>{
      const sent=text.trim(),key=`${uid}|${sent}`;
      const ticket=pend.current&&pend.current.key===key?pend.current:(pend.current={key,id:newId()}); // retry pesan yang sama memakai id yang sama (idempotensi di database)
      const saved=await insertMessageOnce(sb,{id:ticket.id,user_id:uid,sender:"admin",message:sent});
      pend.current=null;
      commit(m=>upsertMessage(m,saved)); // tampil langsung tanpa menunggu realtime (dedupe by id)
      setText(t=>t.trim()===sent?"":t); // jangan hapus ketikan baru yang dimulai saat pesan masih dikirim
    },"Pesan gagal terkirim. Coba lagi.");
  }
  function clear(){
    if(!uid||!confirm("Hapus seluruh chat user ini?"))return;
    void run(async()=>{
      const target=uid;
      const {error}=await withTimeout(sb.from("messages").delete().eq("user_id",target),25000);
      if(error)throw error;
      msgsRef.current.forEach(x=>{if(x.user_id===target)gone.current.add(x.id)}); // fetch lama yang masih berjalan tidak boleh menghidupkan lagi
      commit(m=>m.filter(x=>x.user_id!==target)); // tampil langsung; tidak bergantung pada event realtime
    },"Chat gagal dihapus. Coba lagi.");
  }
  return <div className="grid h-[calc(100dvh-14rem)] min-h-[26rem] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 md:h-[calc(100dvh-10rem)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1"><aside className="no-scrollbar flex gap-1 overflow-x-auto border-b border-zinc-800 p-2 md:block md:overflow-y-auto md:border-b-0 md:border-r md:p-0"><div className="hidden p-3 font-semibold md:block">Percakapan</div>{!threads.length&&<p className="px-2 py-3 text-sm text-zinc-500">Belum ada percakapan.</p>}{threads.map(p=><button type="button" key={p.id} aria-pressed={uid===p.id} onClick={()=>setUid(p.id)} className={`block min-h-11 max-w-[60vw] shrink-0 touch-manipulation truncate whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm active:bg-zinc-800 md:w-full md:max-w-none md:rounded-none md:py-3 ${uid===p.id?"bg-zinc-900 text-white":"text-zinc-500 hover:bg-zinc-900/60"}`}>{p.username||p.email}</button>)}</aside><section className="flex min-h-0 min-w-0 flex-col"><div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-3"><b className="min-w-0 truncate">{profiles.find(p=>p.id===uid)?.username||"Pilih user"}</b>{uid&&<Button size="sm" variant="outline" disabled={busy} onClick={clear}>Hapus chat</Button>}</div><div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">{list.map(m=><div key={m.id} className={`max-w-[80%] rounded-xl p-3 text-sm ${m.sender==="admin"?"ml-auto bg-emerald-500 text-zinc-950":"bg-zinc-900 text-zinc-200"}`}>{m.message&&(isPaymentMessage(m.message,m.sender)?<PaymentCard text={m.message}/>:<p className="whitespace-pre-wrap break-words">{m.message}</p>)}<ChatAttachment url={m.attachment_url} type={m.attachment_type}/></div>)}</div><div className="border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{err&&<p role="alert" className="mb-2 text-xs text-red-400">{err}</p>}<div className="flex gap-2"><Input value={text} enterKeyHint="send" autoComplete="off" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)send()}} aria-label="Pesan"/><Button className="shrink-0" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={send}>Kirim</Button></div></div></section></div>
}
