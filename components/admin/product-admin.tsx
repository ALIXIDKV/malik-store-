"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CatalogGroup,CatalogVariant } from "@/types/database";
import { Card,CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function ProductAdmin({groups,variants}:{groups:CatalogGroup[];variants:CatalogVariant[]}){
  const [rows,setRows]=useState(variants),[msg,setMsg]=useState(""),[pending,setPending]=useState<Record<string,boolean>>({});
  async function save(v:CatalogVariant){
    const id=`${v.product_key}:${v.variant_id}`;
    if(pending[id])return;
    setPending(p=>({...p,[id]:true}));setMsg("");
    try{
      const s=createClient();
      const {error}=await s.from("product_catalog").update({label:v.label,price:v.price,active:v.active}).eq("product_key",v.product_key).eq("variant_id",v.variant_id).select();
      setMsg(error?error.message:"Produk diperbarui.");
    }catch(e){console.error("[admin/products] simpan gagal",e);setMsg("Produk gagal disimpan. Coba lagi.")}
    finally{setPending(p=>{const n={...p};delete n[id];return n})}
  }
  return <div className="grid gap-4">{groups.map(g=><Card key={g.product_key}><CardContent className="pt-5"><h2 className="font-bold">{g.name}</h2><p className="mb-4 text-sm text-zinc-500">{g.description}</p><div className="grid gap-3">{rows.filter(v=>v.product_key===g.product_key).map(v=>{const busy=!!pending[`${v.product_key}:${v.variant_id}`];return <div className="grid gap-2 rounded-xl border border-zinc-800 p-3 sm:grid-cols-[1fr_150px_auto_auto]" key={v.variant_id}><Input aria-label={`Label ${v.label}`} value={v.label} onChange={e=>setRows(r=>r.map(x=>x===v?{...x,label:e.target.value}:x))}/><Input aria-label={`Harga ${v.label}`} type="number" inputMode="numeric" value={v.price} onChange={e=>setRows(r=>r.map(x=>x===v?{...x,price:Number(e.target.value)}:x))}/><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input className="size-5" type="checkbox" checked={v.active} onChange={e=>setRows(r=>r.map(x=>x===v?{...x,active:e.target.checked}:x))}/> Aktif</label><Button size="sm" disabled={busy} onClick={()=>save(v)}>{busy?"Menyimpan…":"Simpan"}</Button></div>})}</div></CardContent></Card>)}{msg&&<p role="status" className="text-sm text-zinc-500">{msg}</p>}</div>
}
