"use client";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message,ProfileLite as Profile } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChatAttachment } from "@/components/chat/attachment";
import { isPaymentMessage,PaymentCard } from "@/components/chat/payment-card";
import { useNotifySound } from "@/components/chat/use-notify-sound";
import { compareMessages,mergeMessages,upsertMessage } from "@/components/chat/merge-messages";
import { useViewportBox } from "@/components/admin/use-viewport-box";
import { ChevronDown,Users } from "lucide-react";
import { withTimeout } from "@/lib/with-timeout";
import { insertMessageOnce } from "@/lib/chat-send";
import { newId } from "@/lib/order-flow";
const LIMIT=2000;
let chatSeq=0; // nama channel unik per mount (hindari bentrok dengan channel lama yang masih dilepas)
const PROFILE_COLS="id,email,username,role,created_at";
export function AdminChat({profiles:initialProfiles,initial}:{profiles:Profile[];initial:Message[]}){
  const [profiles,setProfiles]=useState(initialProfiles),[messages,setMessages]=useState(initial),[uid,setUid]=useState(()=>{const admins=new Set(initialProfiles.filter(p=>p.role==="admin").map(p=>p.id));for(let i=initial.length-1;i>=0;i--){const m=initial[i];if(!m.hidden_for_admin&&!admins.has(m.user_id))return m.user_id}return ""}),[listOpen,setListOpen]=useState(false),[text,setText]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const sb=useRef(createClient()).current;
  const lock=useRef(false);
  // msgsRef = salinan state terbaru (sinkron); gone = id terhapus; pend = kunci idempotensi kirim (lihat dashboard/chat.tsx).
  const msgsRef=useRef(initial),gone=useRef(new Set<string>()),syncSeq=useRef(0),syncApplied=useRef(0),pend=useRef<{key:string;id:string}|null>(null);
  const commit=useCallback((fn:(m:Message[])=>Message[])=>{const next=fn(msgsRef.current);if(next!==msgsRef.current){msgsRef.current=next;setMessages(next)}},[]);
  const playChat=useNotifySound("/assets/notif/chet.mp3");
  const listRef=useRef<HTMLDivElement>(null),anchor=useRef<HTMLDivElement>(null);
  const box=useViewportBox(anchor); // tinggi area chat di HP mengikuti keyboard (lihat use-viewport-box.ts)
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
  // Daftar percakapan DIBANGUN DARI PESAN (bukan dari irisan pesan x profil). Sebelumnya thread hilang -> "Belum ada percakapan"
  // padahal pesan ada, bila daftar profil kosong/gagal dimuat/belum memuat user baru. Profil hanya dipakai untuk nama.
  const adminIds=useMemo(()=>new Set(profiles.filter(p=>p.role==="admin").map(p=>p.id)),[profiles]);
  const threads=useMemo(()=>{
    const info=new Map<string,{last:Message;unread:number}>();
    for(const m of messages){
      if(m.hidden_for_admin||adminIds.has(m.user_id))continue;
      const cur=info.get(m.user_id);
      info.set(m.user_id,{last:!cur||compareMessages(m,cur.last)>=0?m:cur.last,unread:(cur?.unread||0)+(m.sender==="user"&&!m.is_read?1:0)});
    }
    const byId=new Map(profiles.map(p=>[p.id,p]));
    return Array.from(info,([id,v])=>{const p=byId.get(id);return {id,name:p?.username||p?.email||`Pelanggan ${id.slice(0,6)}`,last:v.last,unread:v.unread}}).sort((a,b)=>compareMessages(b.last,a.last));
  },[messages,profiles,adminIds]);
  // Thread tanpa profil di daftar (user baru / fetch profil sebelumnya gagal): muat sekali agar nama tampil.
  useEffect(()=>{const known=new Set(profiles.map(p=>p.id));threads.forEach(t=>{if(!known.has(t.id))void ensureProfile(t.id)})},[threads,profiles,ensureProfile]);
  // Thread terpilih harus selalu thread yang ada; kosong/terhapus -> pilih percakapan terbaru.
  useEffect(()=>{if(uid&&threads.some(t=>t.id===uid))return;const next=threads[0]?.id||"";if(next!==uid)setUid(next)},[threads,uid]);
  const current=threads.find(t=>t.id===uid);
  const othersUnread=threads.reduce((n,t)=>n+(t.id===uid?0:t.unread),0);
  const list=useMemo(()=>messages.filter(m=>m.user_id===uid&&!m.hidden_for_admin),[messages,uid]);
  // Daftar pesan scroll di dalam panelnya sendiri: selalu ke pesan terbaru saat ganti thread / ada pesan baru.
  useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight},[uid,list.length,listOpen,box?.height]); // box.height: keyboard HP membuka/menutup -> tetap di pesan terbaru
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
  const time=(iso:string)=>new Date(iso).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
  const preview=(m:Message)=>m.message?(isPaymentMessage(m.message,m.sender)?"Instruksi pembayaran":m.message):"📎 Lampiran";
  // HP: panel fixed tepat di bawah nav admin, tinggi = visual viewport (keyboard menyusutkannya) -> hanya daftar pesan yang scroll, input selalu terlihat.
  // Desktop (md+): grid statis seperti sebelumnya. Panel opak (bukan overlay transparan) dan berada di bawah nav, jadi tidak menutupi tombol navigasi.
  const mobileVars=box?({"--chat-top":`${box.top}px`,"--chat-h":`${box.height}px`} as React.CSSProperties):undefined;
  return <>
    <div ref={anchor} aria-hidden className="h-0 md:hidden"/>
    <div style={mobileVars} className="z-30 flex flex-col overflow-hidden border-zinc-800 bg-zinc-950 max-md:fixed max-md:inset-x-0 max-md:top-[var(--chat-top,7.5rem)] max-md:h-[var(--chat-h,calc(100dvh_-_7.5rem))] max-md:border-t md:grid md:h-[calc(100dvh-10rem)] md:min-h-[26rem] md:grid-cols-[260px_minmax(0,1fr)] md:rounded-2xl md:border">
      <aside aria-label="Daftar percakapan" className={`min-h-0 flex-1 flex-col border-zinc-800 md:flex md:flex-none md:border-r ${listOpen?"flex":"hidden"}`}>
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-3"><b>Percakapan</b><Button size="sm" variant="ghost" className="md:hidden" onClick={()=>setListOpen(false)}>Tutup</Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!threads.length&&<p className="px-4 py-6 text-sm text-zinc-500">Belum ada percakapan.</p>}
          {threads.map(t=><button type="button" key={t.id} aria-pressed={uid===t.id} onClick={()=>{setUid(t.id);setListOpen(false)}} className={`flex min-h-16 w-full touch-manipulation items-center gap-3 border-b border-zinc-900 px-4 py-3 text-left active:bg-zinc-800 ${uid===t.id?"bg-zinc-900":"hover:bg-zinc-900/60"}`}>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">{(t.name.trim()[0]||"?").toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-2"><span className={`truncate text-sm ${uid===t.id?"font-semibold text-white":"font-medium text-zinc-200"}`}>{t.name}</span><span className="shrink-0 text-[10px] text-zinc-600">{time(t.last.created_at)}</span></span><span className="mt-0.5 block truncate text-xs text-zinc-500">{t.last.sender==="admin"?"Kamu: ":""}{preview(t.last)}</span></span>
            {t.unread>0&&<span aria-label={`${t.unread} pesan belum dibaca`} className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-zinc-950">{t.unread>99?"99+":t.unread}</span>}
          </button>)}
        </div>
      </aside>
      <section className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${listOpen?"hidden":"flex"}`}>
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-3">
          <button type="button" onClick={()=>setListOpen(true)} aria-label="Buka daftar pelanggan" className="relative -m-1 flex min-h-11 min-w-0 touch-manipulation items-center gap-2 rounded-lg p-1 text-left active:bg-zinc-900 md:pointer-events-none md:m-0 md:p-0">
            <Users className="size-4 shrink-0 text-emerald-400 md:hidden" aria-hidden/>
            <span className="min-w-0"><b className="block truncate">{current?.name||"Pilih pelanggan"}</b><span className="block text-[11px] text-zinc-500 md:hidden">Ketuk untuk ganti pelanggan</span></span>
            <ChevronDown className="size-4 shrink-0 text-zinc-500 md:hidden" aria-hidden/>
            {othersUnread>0&&<span aria-label={`${othersUnread} pesan belum dibaca di percakapan lain`} className="absolute right-0 top-0 size-2.5 rounded-full bg-emerald-400 md:hidden"/>}
          </button>
          {uid&&<Button size="sm" variant="outline" disabled={busy} onClick={clear}>Hapus chat</Button>}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {!current&&<div className="grid h-full place-items-center text-center"><p className="text-sm text-zinc-500">{threads.length?"Pilih pelanggan untuk melihat percakapan.":"Belum ada percakapan."}</p></div>}
          {list.map(m=><div key={m.id} className={`max-w-[85%] rounded-xl p-3 text-sm sm:max-w-[80%] ${m.sender==="admin"?"ml-auto bg-emerald-500 text-zinc-950":"bg-zinc-900 text-zinc-200"}`}>{m.message&&(isPaymentMessage(m.message,m.sender)?<PaymentCard text={m.message}/>:<p className="whitespace-pre-wrap break-words">{m.message}</p>)}<ChatAttachment url={m.attachment_url} type={m.attachment_type}/><p className={`mt-1.5 text-[10px] ${m.sender==="admin"?"text-emerald-950/60":"text-zinc-600"}`}>{time(m.created_at)}</p></div>)}
        </div>
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{err&&<p role="alert" className="mb-2 text-xs text-red-400">{err}</p>}<div className="flex gap-2"><Input value={text} enterKeyHint="send" autoComplete="off" disabled={!uid} placeholder={uid?"Tulis pesan…":"Pilih pelanggan dulu"} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing)send()}} aria-label="Pesan"/><Button className="shrink-0" disabled={busy||!uid} onMouseDown={e=>e.preventDefault()} onClick={send}>Kirim</Button></div></div>
      </section>
    </div>
  </>
}
