"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/database";
import { Button } from "@/components/ui/button";
import { rupiah } from "@/lib/utils";
export function OrderTable({initial}:{initial:Order[]}){
  const [rows,setRows]=useState(initial),[pending,setPending]=useState<Record<string,boolean>>({}),[msg,setMsg]=useState("");
  // Pending per-baris: satu request tidak mengunci baris/tombol lain.
  async function withRow(id:string,fn:()=>Promise<void>,fail:string){
    if(pending[id])return;
    setPending(p=>({...p,[id]:true}));setMsg("");
    try{await fn()}catch(e){console.error("[admin/orders]",e);setMsg(fail)}
    finally{setPending(p=>{const n={...p};delete n[id];return n})}
  }
  function status(id:string,status:string){
    void withRow(id,async()=>{
      const s=createClient();
      const {error}=await s.from("orders").update({status}).eq("id",id);
      if(error)throw error;
      setRows(r=>r.map(x=>x.id===id?{...x,status:status as Order["status"]}:x));
    },"Status order gagal diperbarui.");
  }
  function del(id:string){
    if(!confirm("Hapus order ini?"))return;
    void withRow(id,async()=>{
      const s=createClient();
      const {error}=await s.from("orders").delete().eq("id",id);
      if(error)throw error;
      setRows(r=>r.filter(x=>x.id!==id));
    },"Order gagal dihapus.");
  }
  return <>{msg&&<p role="alert" className="mb-3 text-sm text-red-400">{msg}</p>}<div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950"><table className="w-full min-w-[34rem] text-left text-sm [&_td]:p-3 [&_th]:p-3"><thead><tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400"><th className="p-3">Produk</th><th>Harga</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map(x=><tr key={x.id} className="border-b border-zinc-900"><td className="p-3">{x.product}</td><td>{rupiah(x.price)}</td><td><select aria-label={`Status order ${x.product}`} disabled={!!pending[x.id]} className="h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-base text-zinc-200 md:h-10 md:text-sm" value={x.status} onChange={e=>status(x.id,e.target.value)}>{["Pending","Diproses","Selesai"].map(s=><option key={s}>{s}</option>)}</select></td><td><Button size="sm" variant="destructive" disabled={!!pending[x.id]} onClick={()=>del(x.id)}>Hapus</Button></td></tr>)}</tbody></table></div></>
}
