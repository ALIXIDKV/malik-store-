"use client";
import { useRef,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogGroup,CatalogVariant } from "@/types/database";
import { rupiah } from "@/lib/utils";
const selectCls="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 text-base text-zinc-100 outline-none focus:border-emerald-500/70 md:text-sm";
export function OrderForm({groups,variants,userId,initialKey,initialVariant}:{groups:CatalogGroup[];variants:CatalogVariant[];userId:string;initialKey?:string;initialVariant?:string}){
  // Preselect dari /product/[key] (?order=&variant=) hanya jika produk & varian benar-benar ada di katalog aktif.
  const startKey=groups.find(g=>g.product_key===initialKey)?.product_key||groups[0]?.product_key||"";
  const startVid=variants.find(v=>v.product_key===startKey&&v.variant_id===initialVariant)?.variant_id||"";
  const router=useRouter();
  const [cool,setCool]=useState(false),[ok,setOk]=useState(false);
  const [key,setKey]=useState(startKey),[vid,setVid]=useState(startVid),[qty,setQty]=useState(1),[note,setNote]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  const choices=variants.filter(v=>v.product_key===key);
  const picked=choices.find(v=>v.variant_id===vid)||choices[0];
  async function submit(){
    if(!picked||lock.current)return; // lock via ref: tap ganda sebelum re-render tidak membuat order dobel
    lock.current=true;setBusy(true);
    try{
      const s=createClient();setMsg("Menyimpan order…");
      const product=picked.order_name+(qty>1?` x${qty}`:"");
      const {data,error}=await s.from("orders").insert({user_id:userId,product,price:picked.price*qty,note:note.slice(0,500)}).select().single();
      if(error){setOk(false);setMsg(error.message);return}
      const code="ORD-"+String(data.id).replaceAll("-","").slice(0,8).toUpperCase();
      const text=`🛒 Pesanan Baru\n\nProduk:\n${product}\n\nHarga:\n${rupiah(data.price)}\n\nStatus:\nMenunggu proses\n\nOrder ID: ${code}${note?`\nCatatan: ${note.slice(0,200)}`:""}`;
      const m=await s.from("messages").insert({user_id:userId,sender:"user",message:text});
      if(m.error)console.error("[order] pesan order gagal tersimpan",m.error.message);
      const r=await s.rpc("malik_send_payment_message",{p_order_id:data.id});
      if(r.error)console.error("[order] pesan instruksi pembayaran gagal",r.error.message);
      setOk(true);setMsg("Order berhasil dibuat. Instruksi pembayaran dikirim ke chat.");setNote("");router.refresh();
      // jeda singkat setelah sukses: tap ganda yang terlambat tidak membuat order dobel
      setCool(true);setTimeout(()=>setCool(false),2500);
    }catch(e){console.error("[order] gagal",e);setOk(false);setMsg("Order gagal dibuat. Periksa koneksi lalu coba lagi.")}
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="stack">
    <div><label className="label" htmlFor="order-product">Produk</label><select id="order-product" className={selectCls} value={key} onChange={e=>{setKey(e.target.value);setVid("")}}>{groups.map(g=><option key={g.product_key} value={g.product_key}>{g.name}</option>)}</select></div>
    <div><label className="label" htmlFor="order-variant">Varian</label><select id="order-variant" className={selectCls} value={picked?.variant_id||""} onChange={e=>setVid(e.target.value)}>{choices.map(v=><option key={v.variant_id} value={v.variant_id}>{v.label} — {rupiah(v.price)}</option>)}</select></div>
    <div><label className="label" htmlFor="order-qty">Jumlah</label><Input id="order-qty" type="number" inputMode="numeric" min={1} max={99} value={qty} onChange={e=>setQty(Math.max(1,Math.min(99,Number(e.target.value)||1)))}/></div>
    <div><label className="label" htmlFor="order-note">Catatan</label><Textarea id="order-note" value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></div>
    {picked&&<p className="font-semibold">Total: {rupiah(picked.price*qty)}</p>}
    {!picked&&<p className="text-sm text-zinc-500">Belum ada varian aktif untuk produk ini.</p>}
    {msg&&<p role="status" className="text-sm text-zinc-400">{msg}{ok&&<> <Link href="/dashboard/chat" className="font-semibold text-emerald-400 underline">Buka chat</Link></>}</p>}
    <Button onClick={submit} disabled={!picked||busy||cool}>{busy?"Menyimpan…":cool?"Order dibuat":"Buat order"}</Button>
  </div>
}
