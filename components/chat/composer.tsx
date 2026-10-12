"use client";
import { useLayoutEffect,useRef,type ReactNode } from "react";
import { Loader2,Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_H=128; // ~5 baris; lebih dari ini textarea scroll sendiri

// Baris input chat (hanya UI): textarea auto-resize + tombol kirim dengan status "Mengirim...".
// Tidak menyentuh logic kirim: state teks, busy, error, dan fungsi kirim tetap dimiliki komponen chat.
// Border/padding/pesan error disediakan pembungkus di komponen chat. Enter = baris baru; kirim lewat tombol.
export function ChatComposer({value,onChange,onSend,busy,leading,placeholder="Tulis pesan…"}:{value:string;onChange:(v:string)=>void;onSend:()=>void;busy:boolean;leading?:ReactNode;placeholder?:string}){
  const ta=useRef<HTMLTextAreaElement>(null);
  // Auto-resize: reset ke auto lalu ikuti scrollHeight (dibatasi MAX_H). Teks kosong -> kembali 1 baris.
  useLayoutEffect(()=>{const el=ta.current;if(!el)return;el.style.height="auto";el.style.height=`${Math.min(el.scrollHeight,MAX_H)}px`},[value]);
  return <div className="flex items-end gap-2">
    {leading}
    <textarea ref={ta} rows={1} value={value} onChange={e=>onChange(e.target.value)} enterKeyHint="enter" autoComplete="off" placeholder={placeholder} aria-label="Pesan"
      className="max-h-32 min-h-11 w-full min-w-0 resize-none rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-base leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/10 md:text-sm"/>
    {/* onMouseDown preventDefault: tap tombol tidak mencuri fokus sehingga keyboard HP tetap terbuka */}
    <Button disabled={busy||!value.trim()} aria-busy={busy} onMouseDown={e=>e.preventDefault()} onClick={onSend} aria-label={busy?"Mengirim pesan":"Kirim pesan"} className="shrink-0 px-3.5">
      {busy?<Loader2 className="size-4 animate-spin" aria-hidden/>:<Send className="size-4" aria-hidden/>}
      <span>{busy?"Mengirim...":"Kirim"}</span>
    </Button>
  </div>
}
