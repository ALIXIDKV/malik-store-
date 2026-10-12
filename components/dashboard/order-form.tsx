"use client";
import { useEffect,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import type { CatalogGroup,CatalogVariant,Order } from "@/types/database";
import { rupiah } from "@/lib/utils";
import { cleanVoucherCode,previewVoucher,type VoucherQuote } from "@/lib/vouchers";
import { useNotifySound } from "@/components/chat/use-notify-sound";
import { OrderSuccess,type OrderSuccessInfo } from "@/components/dashboard/order-success";
import { buildOrderText,createOrder,findIncompleteOrder,forgetAttempt,newId,orderCode,recallAttempt,rememberAttempt,syncOrderMessages,type Sent } from "@/lib/order-flow";
const selectCls="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 text-base text-zinc-100 outline-none focus:border-emerald-500/70 md:text-sm";
const pending=(o:Order)=>`Order ${orderCode(o.id)} sudah tersimpan, tetapi pesan ke chat admin belum terkirim. Tekan "Kirim ulang pesan" (order tidak dibuat dobel).`;
type Props={groups:CatalogGroup[];variants:CatalogVariant[];userId:string;initialKey?:string;initialVariant?:string};
export function OrderForm({groups,variants,userId,initialKey,initialVariant}:Props){
  // Preselect dari link "Order" di halaman produk; nilai tak dikenal (produk/varian sudah nonaktif) diabaikan.
  const startKey=groups.find(g=>g.product_key===initialKey)?.product_key||groups[0]?.product_key||"";
  const startVariant=variants.find(v=>v.product_key===startKey&&v.variant_id===initialVariant)?.variant_id||"";
  const [key,setKey]=useState(startKey),[vid,setVid]=useState(startVariant),[qtyText,setQtyText]=useState("1"),[note,setNote]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false),[success,setSuccess]=useState<OrderSuccessInfo|null>(null),[retry,setRetry]=useState(false),[checking,setChecking]=useState(true),[voucher,setVoucher]=useState(""),[quote,setQuote]=useState<{key:string;q:VoucherQuote}|null>(null),[vbusy,setVbusy]=useState(false);
  const lock=useRef(false);
  // Jumlah disimpan sebagai teks agar kolom bisa dikosongkan lalu diketik ulang (di HP angka "1" tidak bisa dihapus bila langsung dipaksa ke 1).
  const qty=Math.max(1,Math.min(99,parseInt(qtyText,10)||1));
  const attempt=useRef<{sig:string;id:string}|null>(null); // kunci idempotensi order: retry memakai id yang sama
  const saved=useRef<({order:Order;text:string;meta?:{product:string;variant:string;qty:number}}&Sent)|null>(null); // cache memori: order sudah tersimpan, pesan chat/pembayaran belum lengkap
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
  function startNew(){setSuccess(null);setNote("");setVoucher("");setQuote(null);setQtyText("1");setMsg("");setRetry(false)} // order lama sudah final (saved/attempt sudah dibersihkan): order berikutnya memakai id baru
  const choices=variants.filter(v=>v.product_key===key);
  const picked=choices.find(v=>v.variant_id===vid)||choices[0];
  // Voucher: preview hanya tampilan (dihitung database dari katalog). Angka final ditentukan database saat order disimpan.
  const vcode=cleanVoucherCode(voucher.trim());
  const productName=picked?picked.order_name+(qty>1?` x${qty}`:""):"";
  const aq=quote&&quote.key===`${productName}|${vcode}`?quote.q:null;
  async function applyVoucher(){
    if(!picked||vbusy||busy)return;
    if(!vcode){setQuote(null);return}
    setVbusy(true);
    try{const q=await previewVoucher(createClient(),vcode,productName);setQuote({key:`${productName}|${vcode}`,q})}
    finally{setVbusy(false)}
  }
  async function submit(){
    if(!picked||checking||lock.current)return; // lock via ref: tap ganda sebelum re-render tidak membuat order dobel
    lock.current=true;setBusy(true);
    try{
      const s=createClient();
      let st=saved.current;
      if(!st){
        setMsg("Menyimpan order…");
        const product=picked.order_name+(qty>1?` x${qty}`:"");
        const sig=`${product}|${note}|${vcode}`;
        const ticket=attempt.current&&attempt.current.sig===sig?attempt.current:(attempt.current={sig,id:recallAttempt(userId,sig)||newId()});
        rememberAttempt(userId,sig,ticket.id); // id percobaan bertahan saat refresh (tanpa isi order) agar request yang masih berjalan tidak jadi order kedua
        const r=await createOrder(s,{id:ticket.id,userId,product,price:picked.price*qty,note,voucher:vcode||undefined});
        if("error" in r){setMsg(r.error);return}
        const text=buildOrderText(r.order);
        st=saved.current={order:r.order,text,chat:false,payment:false,meta:{product:groups.find(g=>g.product_key===key)?.name||picked.order_name,variant:picked.label,qty}};
      }
      setMsg("Mengirim pesan order…");
      const sent=await syncOrderMessages(s,st.order,userId,st.text,st);
      st.chat=sent.chat;st.payment=sent.payment;
      if(!(st.chat&&st.payment)){setRetry(true);setMsg(pending(st.order));return}
      saved.current=null;attempt.current=null;forgetAttempt();setRetry(false);
      // Konfirmasi hanya tampil di sini: order tersimpan DAN pesan chat + instruksi pembayaran sudah terkirim.
      const m=st.meta;setSuccess({order:st.order,product:m?m.product+(m.qty>1?` ×${m.qty}`:""):st.order.product,variant:m?m.variant:st.order.variant});
      setMsg("");setNote("");playOrder();
    }catch(e){
      console.error("[order] gagal",e);
      if(saved.current){setRetry(true);setMsg(pending(saved.current.order))}
      else setMsg("Order gagal dibuat. Periksa koneksi lalu coba lagi.");
    }
    finally{lock.current=false;setBusy(false)}
  }
  // Judul kartu mengikuti status: form -> "Buat order baru"; setelah sukses judul form dihapus (judul konfirmasi ada di OrderSuccess).
  if(success)return <CardContent className="pt-6 sm:pt-8"><OrderSuccess info={success} onNew={startNew}/></CardContent>;
  return <>
  <CardHeader><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Order</p><CardTitle className="text-xl">Buat order baru</CardTitle></CardHeader>
  <CardContent><div className="stack">
    <div><label className="label" htmlFor="order-product">Produk</label><select id="order-product" className={selectCls} value={key} onChange={e=>{setKey(e.target.value);setVid("")}}>{groups.map(g=><option key={g.product_key} value={g.product_key}>{g.name}</option>)}</select></div>
    <div><label className="label" htmlFor="order-variant">Varian</label><select id="order-variant" className={selectCls} value={picked?.variant_id||""} onChange={e=>{setVid(e.target.value)}}>{choices.map(v=><option key={v.variant_id} value={v.variant_id}>{v.label} — {rupiah(v.price)}</option>)}</select></div>
    <div><label className="label" htmlFor="order-qty">Jumlah</label><Input id="order-qty" type="number" inputMode="numeric" min={1} max={99} enterKeyHint="done" value={qtyText} onChange={e=>{setQtyText(e.target.value.replace(/\D/g,"").slice(0,2))}} onBlur={()=>setQtyText(String(qty))}/></div>
    <div><label className="label" htmlFor="order-note">Catatan</label><Textarea id="order-note" value={note} maxLength={500} onChange={e=>{setNote(e.target.value)}}/></div>
    <div><label className="label" htmlFor="order-voucher">Kode voucher (opsional)</label><div className="flex gap-2"><Input id="order-voucher" value={voucher} maxLength={32} autoCapitalize="characters" autoComplete="off" enterKeyHint="done" placeholder="MALIK50" disabled={busy||checking} onChange={e=>setVoucher(cleanVoucherCode(e.target.value))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void applyVoucher()}}}/><Button type="button" variant="secondary" onClick={()=>void applyVoucher()} disabled={!picked||!vcode||vbusy||busy||checking}>{vbusy?"Mengecek…":"Pakai"}</Button></div>{aq&&<p role={aq.valid?"status":"alert"} className={`mt-1.5 text-sm ${aq.valid?"text-emerald-400":"text-red-400"}`}>{aq.message}</p>}</div>
    {picked&&(aq?.valid&&aq.subtotal!=null&&aq.total!=null?<div className="space-y-0.5 text-sm"><p className="text-zinc-400">Subtotal: {rupiah(aq.subtotal)}</p><p className="text-emerald-400">Diskon voucher: −{rupiah(aq.discount)}</p><p className="text-base font-semibold">Total: {rupiah(aq.total)}</p></div>:<p className="font-semibold">Total: {rupiah(picked.price*qty)}</p>)}
    {!picked&&!msg&&<p role="status" className="text-sm text-zinc-400">Produk belum tersedia. Muat ulang halaman.</p>}
    {msg&&<p role="status" className="text-sm text-zinc-400">{msg}</p>}
    <Button onClick={submit} disabled={!picked||busy||checking||vbusy}>{busy?"Menyimpan…":retry?"Kirim ulang pesan":"Buat order"}</Button>
  </div></CardContent>
  </>
}
