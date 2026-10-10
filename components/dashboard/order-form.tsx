"use client";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogGroup,CatalogVariant,Order } from "@/types/database";
import { rupiah } from "@/lib/utils";
import { useNotifySound } from "@/components/chat/use-notify-sound";
import { buildOrderText,createOrder,findIncompleteOrder,forgetAttempt,newId,orderCode,recallAttempt,rememberAttempt,syncOrderMessages,type Sent } from "@/lib/order-flow";
const selectCls="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 text-base text-zinc-100 outline-none focus:border-emerald-500/70 md:text-sm";
const pending=(o:Order)=>`Order ${orderCode(o.id)} sudah tersimpan, tetapi pesan ke chat admin belum terkirim. Tekan "Kirim ulang pesan" (order tidak dibuat dobel).`;
type Props={groups:CatalogGroup[];variants:CatalogVariant[];userId:string;initialKey?:string;initialVariant?:string};
export function OrderForm({groups,variants,userId,initialKey,initialVariant}:Props){
  // Preselect dari link "Order" di halaman produk; nilai tak dikenal (produk/varian sudah nonaktif) diabaikan.
  const startKey=groups.find(g=>g.product_key===initialKey)?.product_key||groups[0]?.product_key||"";
  const startVariant=variants.find(v=>v.product_key===startKey&&v.variant_id===initialVariant)?.variant_id||"";
  const [key,setKey]=useState(startKey),[vid,setVid]=useState(startVariant),[qtyText,setQtyText]=useState("1"),[note,setNote]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[retry,setRetry]=useState(false),[checking,setChecking]=useState(true);
  const lock=useRef(false);
  // Jumlah disimpan sebagai teks agar kolom bisa dikosongkan lalu diketik ulang (di HP angka "1" tidak bisa dihapus bila langsung dipaksa ke 1).
  const qty=Math.max(1,Math.min(99,parseInt(qtyText,10)||1));
  const attempt=useRef<{sig:string;id:string}|null>(null); // kunci idempotensi order: retry memakai id yang sama
  const saved=useRef<({order:Order;text:string}&Sent)|null>(null); // cache memori: order sudah tersimpan, pesan chat/pembayaran belum lengkap
  // Pemulihan berbasis database: setelah refresh / app dibuka lagi, order Pending yang pesannya belum lengkap ditemukan dari tabel orders+messages
  // (bukan dari memori halaman), lalu "Kirim ulang pesan" hanya melengkapi pesan untuk order yang sama. Tombol dikunci selama pengecekan agar tidak ada order dobel.
  useEffect(()=>{
    let off=false;
    (async()=>{
      try{
        const r=await findIncompleteOrder(createClient(),userId);
        if(off||!r||saved.current)return;
        saved.current={order:r.order,text:buildOrderText(r.order),...r.sent};
        setRetry(true);setMsg(pending(r.order));
      }catch(e){console.error("[order] pemulihan gagal",e)}
      finally{if(!off)setChecking(false)}
    })();
    return()=>{off=true};
  },[userId]);
  const playOrder=useNotifySound("/assets/notif/notif.mp3");
  const choices=variants.filter(v=>v.product_key===key);
  const picked=choices.find(v=>v.variant_id===vid)||choices[0];
  async function submit(){
    if(!picked||checking||lock.current)return; // lock via ref: tap ganda sebelum re-render tidak membuat order dobel
    lock.current=true;setBusy(true);setDone(false);
    try{
      const s=createClient();
      let st=saved.current;
      if(!st){
        setMsg("Menyimpan order…");
        const product=picked.order_name+(qty>1?` x${qty}`:"");
        const sig=`${product}|${note}`;
        const ticket=attempt.current&&attempt.current.sig===sig?attempt.current:(attempt.current={sig,id:recallAttempt(userId,sig)||newId()});
        rememberAttempt(userId,sig,ticket.id); // id percobaan bertahan saat refresh (tanpa isi order) agar request yang masih berjalan tidak jadi order kedua
        const r=await createOrder(s,{id:ticket.id,userId,product,price:picked.price*qty,note});
        if("error" in r){setMsg(r.error);return}
        const text=buildOrderText(r.order);
        st=saved.current={order:r.order,text,chat:false,payment:false};
      }
      setMsg("Mengirim pesan order…");
      const sent=await syncOrderMessages(s,st.order,userId,st.text,st);
      st.chat=sent.chat;st.payment=sent.payment;
      if(!(st.chat&&st.payment)){setRetry(true);setMsg(pending(st.order));return}
      saved.current=null;attempt.current=null;forgetAttempt();setRetry(false);
      setMsg("Order berhasil dibuat.");setNote("");setDone(true);playOrder();
    }catch(e){
      console.error("[order] gagal",e);
      if(saved.current){setRetry(true);setMsg(pending(saved.current.order))}
      else setMsg("Order gagal dibuat. Periksa koneksi lalu coba lagi.");
    }
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="stack">
    <div><label className="label" htmlFor="order-product">Produk</label><select id="order-product" className={selectCls} value={key} onChange={e=>{setKey(e.target.value);setVid("");setDone(false)}}>{groups.map(g=><option key={g.product_key} value={g.product_key}>{g.name}</option>)}</select></div>
    <div><label className="label" htmlFor="order-variant">Varian</label><select id="order-variant" className={selectCls} value={picked?.variant_id||""} onChange={e=>{setVid(e.target.value);setDone(false)}}>{choices.map(v=><option key={v.variant_id} value={v.variant_id}>{v.label} — {rupiah(v.price)}</option>)}</select></div>
    <div><label className="label" htmlFor="order-qty">Jumlah</label><Input id="order-qty" type="number" inputMode="numeric" min={1} max={99} enterKeyHint="done" value={qtyText} onChange={e=>{setQtyText(e.target.value.replace(/\D/g,"").slice(0,2));setDone(false)}} onBlur={()=>setQtyText(String(qty))}/></div>
    <div><label className="label" htmlFor="order-note">Catatan</label><Textarea id="order-note" value={note} maxLength={500} onChange={e=>{setNote(e.target.value);setDone(false)}}/></div>
    {picked&&<p className="font-semibold">Total: {rupiah(picked.price*qty)}</p>}
    {!picked&&!msg&&<p role="status" className="text-sm text-zinc-400">Produk belum tersedia. Muat ulang halaman.</p>}
    {msg&&<p role="status" className="text-sm text-zinc-400">{msg}</p>}
    <Button onClick={submit} disabled={!picked||busy||done||checking}>{busy?"Menyimpan…":retry?"Kirim ulang pesan":done?"Order terkirim":"Buat order"}</Button>
    {done&&<div className="grid gap-2 sm:grid-cols-2"><Button asChild variant="outline"><Link href="/dashboard/history">Lihat riwayat</Link></Button><Button asChild variant="outline"><Link href="/dashboard/chat">Chat admin</Link></Button></div>}
  </div>
}
