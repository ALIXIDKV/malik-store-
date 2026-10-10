"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send,Paperclip } from "lucide-react";
import { ChatAttachment } from "@/components/chat/attachment";
import { isPaymentMessage,PaymentCard } from "@/components/chat/payment-card";
import { useNotifySound } from "@/components/chat/use-notify-sound";
import { mergeMessages,upsertMessage } from "@/components/chat/merge-messages";
import { withTimeout } from "@/lib/with-timeout";
import { insertMessageOnce } from "@/lib/chat-send";
import { newId } from "@/lib/order-flow";
const LIMIT=300;
let chatSeq=0; // nama channel unik per mount: channel lama yang masih dilepas tidak bentrok dengan yang baru
export function UserChat({userId,initial}:{userId:string;initial:Message[]}){
  const [messages,setMessages]=useState(initial),[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const sb=useRef(createClient()).current;
  const lock=useRef(false);
  // msgsRef = salinan state yang selalu terbaru secara sinkron (dasar snapshot sebelum fetch); gone = id yang sudah terhapus; pend/uploaded = kunci idempotensi kirim.
  const msgsRef=useRef(initial),gone=useRef(new Set<string>()),syncSeq=useRef(0),syncApplied=useRef(0);
  const pend=useRef<{key:string;id:string}|null>(null),uploaded=useRef<{sig:string;url:string;type:string}|null>(null);
  const commit=useCallback((fn:(m:Message[])=>Message[])=>{const next=fn(msgsRef.current);if(next!==msgsRef.current){msgsRef.current=next;setMessages(next)}},[]);
  const playChat=useNotifySound("/assets/notif/chet.mp3");
  // Selalu tampilkan pesan terbaru (saat dibuka dan tiap ada pesan baru): gulir ke dasar halaman,
  // tempat composer berada tepat di atas bottom nav.
  useEffect(()=>{window.scrollTo({top:document.documentElement.scrollHeight})},[messages.length]);
  // Sinkron dari server: menutup celah antara render server & subscribe, pulih setelah reconnect / HP tidur / koneksi putus,
  // dan membuang pesan yang dihapus admin (Realtime tidak mengirim DELETE untuk channel ber-filter).
  const sync=useCallback(async()=>{
    const seq=++syncSeq.current;
    const before=new Set(msgsRef.current.map(m=>m.id)); // pesan yang sudah ada sebelum fetch dimulai; yang datang SETELAH ini tidak boleh hilang walau fetch belum memuatnya
    try{
      const {data,error}=await withTimeout(sb.from("messages").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(LIMIT),20000);
      if(error)throw error;
      if(seq<syncApplied.current)return; // hasil fetch yang lebih baru sudah dipakai; jangan timpa dengan data lama
      syncApplied.current=seq;
      const rows=((data||[]) as Message[]).slice().reverse();
      commit(cur=>mergeMessages(rows,cur,{before,gone:gone.current,limit:LIMIT}));
    }catch(e){console.error("[chat] sinkron gagal",e)}
  },[sb,userId,commit]);
  useEffect(()=>{
    const ch=sb.channel(`chat-${userId}-${++chatSeq}`).on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`user_id=eq.${userId}`},p=>{if(p.eventType==="INSERT"){const n=p.new as Message;if(gone.current.has(n.id))return;if(n.sender==="admin"&&!msgsRef.current.some(x=>x.id===n.id))playChat();commit(m=>upsertMessage(m,n))}if(p.eventType==="DELETE"){const id=String(p.old.id||"");if(id){gone.current.add(id);commit(m=>m.filter(x=>x.id!==id))}}}).subscribe(st=>{if(st==="SUBSCRIBED")void sync()}); // SUBSCRIBED juga muncul lagi setelah reconnect
    const wake=()=>{if(document.visibilityState==="visible")void sync()};
    document.addEventListener("visibilitychange",wake);window.addEventListener("online",wake);
    return()=>{document.removeEventListener("visibilitychange",wake);window.removeEventListener("online",wake);void sb.removeChannel(ch)};
  },[sb,userId,playChat,sync,commit]);
  async function insertMessage(att?:{url:string,type:string}){
    const sent=text.trim(),key=`${sent}|${att?.url||""}`;
    const ticket=pend.current&&pend.current.key===key?pend.current:(pend.current={key,id:newId()}); // retry pesan yang sama memakai id yang sama (idempotensi di database)
    const saved=await insertMessageOnce(sb,{id:ticket.id,user_id:userId,sender:"user",message:sent,attachment_url:att?.url||null,attachment_type:att?.type||null});
    pend.current=null;uploaded.current=null;
    commit(m=>upsertMessage(m,saved));
    setText(t=>t.trim()===sent?"":t); // jangan hapus ketikan baru yang dimulai saat pesan masih dikirim
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
    if(f.size>4*1024*1024){setErr("Ukuran lampiran maksimal 4 MB.");return} // sama dengan batas server (/api/upload-chat)
    void run(async()=>{
      const sig=`${f.name}|${f.size}|${f.lastModified}|${f.type}`;
      if(uploaded.current&&uploaded.current.sig===sig){await insertMessage({url:uploaded.current.url,type:uploaded.current.type});return} // file sama sudah terunggah: jangan unggah & kirim ulang jadi pesan kedua
      const {data:{session}}=await withTimeout(sb.auth.getSession(),10000);
      const ctl=new AbortController(),timer=window.setTimeout(()=>ctl.abort(),60000);
      let j:{ok?:boolean;url:string;type:string;message?:string};
      try{
        const r=await fetch("/api/upload-chat",{method:"POST",signal:ctl.signal,headers:{authorization:`Bearer ${session?.access_token||""}`,"x-file-type":f.type,"content-type":"application/octet-stream"},body:f});
        j=await r.json();
      }finally{window.clearTimeout(timer)}
      if(!j.ok)throw new Error(j.message||"upload gagal");
      uploaded.current={sig,url:j.url,type:j.type};
      await insertMessage({url:j.url,type:j.type});
    },"Lampiran gagal diunggah. Coba lagi.");
  }
  return <div className="flex min-h-[calc(100dvh_-_10rem_-_var(--nav-h)_-_env(safe-area-inset-top,0px))] flex-col">
    <div className="flex-1 space-y-3 py-5">{messages.map(m=><div key={m.id} className={`max-w-[82%] rounded-2xl p-3 text-sm ${m.sender==="user"?"ml-auto bg-emerald-500 text-zinc-950":"border border-zinc-800 bg-zinc-900 text-zinc-200"}`}>{m.message&&(isPaymentMessage(m.message,m.sender)?<PaymentCard text={m.message}/>:<p className="whitespace-pre-wrap break-words">{m.message}</p>)}<p className={`mt-1.5 text-[10px] ${m.sender==="user"?"text-emerald-950/60":"text-zinc-600"}`}>{new Date(m.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"})}</p><ChatAttachment url={m.attachment_url} type={m.attachment_type}/></div>)}</div>
    {/* offset sticky = --nav-h (tinggi bottom nav + safe-area; 0 di desktop & saat keyboard terbuka); z lebih rendah dari nav */}
    <div className="sticky bottom-[var(--nav-h)] z-30 border-t border-zinc-900 bg-zinc-950/95 py-3 backdrop-blur-xl">
      {err&&<p role="alert" className="mb-2 text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <label className={`relative flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition focus-within:ring-2 focus-within:ring-emerald-400 active:bg-zinc-800 md:size-10 ${busy?"pointer-events-none opacity-50":"cursor-pointer"}`}><Paperclip className="size-4" aria-hidden/><span className="sr-only">Lampirkan gambar atau video</span><input className="sr-only" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={upload}/></label>
        <Input value={text} enterKeyHint="send" autoComplete="off" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)send()}} placeholder="Tulis pesan…" aria-label="Pesan"/>
        <Button size="icon" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={send} aria-label="Kirim pesan" className="shrink-0"><Send className="size-4" aria-hidden/></Button>
      </div>
    </div>
  </div>
}
