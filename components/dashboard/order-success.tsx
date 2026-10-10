"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Clock, History, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orderCode } from "@/lib/order-flow";
import { rupiah } from "@/lib/utils";
import type { Order } from "@/types/database";

// Data konfirmasi diambil dari baris order yang SUDAH tersimpan di database (harga = harga tersimpan, bukan hitungan form).
export type OrderSuccessInfo = { order: Order; product: string; variant: string | null };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-3"><dt className="shrink-0 text-sm text-zinc-500">{label}</dt><dd className="min-w-0 break-words text-right text-sm font-medium text-zinc-100">{children}</dd></div>;
}

export function OrderSuccess({ info, onNew }: { info: OrderSuccessInfo; onNew: () => void }) {
  const { order } = info;
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return (
    <div role="status" aria-live="polite" className="py-2 text-center">
      <div className="ms-pop ms-glow mx-auto grid size-20 place-items-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <svg viewBox="0 0 52 52" className="size-14" fill="none" aria-hidden="true">
          <circle className="ms-ring" cx="26" cy="26" r="25" stroke="#10b981" strokeWidth="2" strokeLinecap="round" transform="rotate(-90 26 26)" />
          <path className="ms-tick" d="M15 27l8 8 14-16" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="ms-rise mt-5 text-xl font-bold tracking-tight text-zinc-50" style={{ animationDelay: ".7s" }}>Pesanan Berhasil Dibuat!</h2>
      <p className="ms-rise mt-1.5 text-sm text-zinc-400" style={{ animationDelay: ".8s" }}>Pesanan kamu sudah tersimpan. Lanjutkan pembayaran lewat chat admin.</p>

      <dl className="ms-rise mt-6 divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 text-left" style={{ animationDelay: ".9s" }}>
        <Row label="Order ID"><span className="font-mono tracking-wide text-emerald-400">{orderCode(order.id)}</span></Row>
        <Row label="Produk">{info.product}</Row>
        {info.variant && <Row label="Varian">{info.variant}</Row>}
        <Row label="Total"><span className="text-base font-bold text-zinc-50">{rupiah(order.price)}</span></Row>
        <Row label="Status"><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300"><Clock className="size-3.5" aria-hidden />Menunggu diproses</span></Row>
      </dl>

      <div className="ms-rise mt-6 grid gap-2.5" style={{ animationDelay: "1s" }}>
        <Button asChild size="lg"><Link href="/dashboard/chat"><MessageCircle className="size-4" aria-hidden />Chat Admin</Link></Button>
        <Button asChild variant="outline"><Link href="/dashboard/history"><History className="size-4" aria-hidden />Lihat Riwayat</Link></Button>
        <Button variant="ghost" onClick={onNew}><Plus className="size-4" aria-hidden />Buat Pesanan Baru</Button>
      </div>
    </div>
  );
}
