"use client";
import Image from "next/image";
import { useState } from "react";

// Pesan instruksi pembayaran dibuat oleh fungsi DB malik_send_payment_message (sender = admin).
const HEAD = "🛒 Pesanan Baru Berhasil Dibuat";
const grab = (t: string, label: string) => t.match(new RegExp(`(?:^|\\n)${label}:\\s*\\n([^\\n]+)`))?.[1]?.trim() ?? "";

export function isPaymentMessage(text: string | null | undefined, sender: "user" | "admin") {
  return sender === "admin" && !!text && text.startsWith(HEAD) && !!grab(text, "DANA") && !!grab(text, "GoPay");
}

function Wallet({ name, number }: { name: string; number: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(number); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard tidak tersedia */ }
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="min-w-0"><p className="text-[11px] text-zinc-500">{name}</p><p className="break-all font-semibold text-zinc-100">{number}</p></div>
      <button type="button" onClick={copy} aria-label={`Salin nomor ${name}`} className="inline-flex h-9 shrink-0 touch-manipulation items-center rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 active:bg-zinc-800">{copied ? "Tersalin" : "Salin"}</button>
    </div>
  );
}

export function PaymentCard({ text }: { text: string }) {
  const dana = grab(text, "DANA"), gopay = grab(text, "GoPay");
  const orderId = text.match(/Order ID:\s*(\S+)/)?.[1] ?? "";
  return (
    <div className="grid gap-3 rounded-xl bg-zinc-950 p-3 text-zinc-200">
      <div><p className="font-semibold text-zinc-50">Pesanan Baru Berhasil Dibuat</p>{orderId && <p className="text-xs text-zinc-500">{orderId}</p>}</div>
      <p className="text-zinc-400">Terima kasih sudah order di Malik Store. Silakan lakukan pembayaran:</p>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">QRIS</p>
        <Image src="/assets/payment/qris.jpg" alt="QRIS Malik Store" width={1136} height={1600} sizes="220px" className="h-auto w-full max-w-[220px] rounded-lg bg-[#fff]" />
      </div>
      <div className="grid gap-2"><p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">E-Wallet</p><Wallet name="DANA" number={dana} /><Wallet name="GoPay" number={gopay} /></div>
      <p className="text-xs text-zinc-500">Setelah transfer, kirim bukti pembayaran melalui chat ini.</p>
    </div>
  );
}
