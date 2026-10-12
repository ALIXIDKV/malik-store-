"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Voucher } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn, rupiah } from "@/lib/utils";
import { buildVoucherPayload, emptyVoucherForm, formFromVoucher, voucherError, voucherStatus, type VoucherForm } from "@/lib/vouchers";
import { withTimeout } from "@/lib/with-timeout";

type Msg = { kind: "ok" | "err"; text: string } | null;
const selectCls = "h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 text-base text-zinc-100 outline-none focus:border-emerald-500/70 md:text-sm";
const badge: Record<string, string> = {
  aktif: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  nonaktif: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
  kedaluwarsa: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  habis: "border-red-500/30 bg-red-500/10 text-red-300",
};
const label = (v: Voucher) => (v.discount_type === "percent" ? `${v.discount_value}%` : rupiah(v.discount_value));

function Switch({ checked, onChange, name, disabled }: { checked: boolean; onChange: (v: boolean) => void; name: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={name} disabled={disabled} onClick={() => onChange(!checked)}
      className="grid h-11 min-w-11 shrink-0 place-items-center disabled:opacity-50">
      <span className={cn("relative h-6 w-10 rounded-full transition-colors", checked ? "bg-emerald-500" : "bg-zinc-700")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-[#fff] transition-all", checked ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

function Fields({ f, set, idp }: { f: VoucherForm; set: (p: Partial<VoucherForm>) => void; idp: string }) {
  const num = (k: "value" | "min" | "limit") => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value.replace(/\D/g, "").slice(0, 10) });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor={`${idp}-code`}>Kode voucher</label>
        <Input id={`${idp}-code`} value={f.code} maxLength={32} autoCapitalize="characters" placeholder="MALIK50"
          onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} /></div>
      <div><label className="label" htmlFor={`${idp}-type`}>Tipe diskon</label>
        <select id={`${idp}-type`} className={selectCls} value={f.type} onChange={(e) => set({ type: e.target.value as "percent" | "fixed" })}>
          <option value="percent">Persen (%)</option><option value="fixed">Nominal (Rp)</option>
        </select></div>
      <div><label className="label" htmlFor={`${idp}-value`}>{f.type === "percent" ? "Nilai diskon (1-99 %)" : "Nilai diskon (Rp)"}</label>
        <Input id={`${idp}-value`} inputMode="numeric" value={f.value} onChange={num("value")} placeholder={f.type === "percent" ? "50" : "10000"} /></div>
      <div><label className="label" htmlFor={`${idp}-min`}>Minimal pembelian (Rp)</label>
        <Input id={`${idp}-min`} inputMode="numeric" value={f.min} onChange={num("min")} placeholder="100000" /></div>
      <div><label className="label" htmlFor={`${idp}-exp`}>Tanggal expired (opsional)</label>
        <Input id={`${idp}-exp`} type="date" value={f.expires} onChange={(e) => set({ expires: e.target.value })} /></div>
      <div><label className="label" htmlFor={`${idp}-limit`}>Batas penggunaan (kosong = tanpa batas)</label>
        <Input id={`${idp}-limit`} inputMode="numeric" value={f.limit} onChange={num("limit")} placeholder="100" /></div>
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 px-3.5 sm:col-span-2">
        <span className="text-sm text-zinc-300">Aktif</span>
        <Switch checked={f.active} onChange={(v) => set({ active: v })} name="Voucher aktif" />
      </div>
    </div>
  );
}

function VoucherCard({ v, onSaved, onFlash }: { v: Voucher; onSaved: (v: Voucher) => void; onFlash: (m: Msg) => void }) {
  const [edit, setEdit] = useState(false), [f, setF] = useState<VoucherForm>(() => formFromVoucher(v));
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const lock = useRef(false);
  const st = voucherStatus(v);

  async function run(payload: Record<string, unknown>, after?: () => void) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr("");
    try {
      const r = await withTimeout(createClient().from("vouchers").update(payload).eq("id", v.id).select().single(), 20_000);
      if (r.error) { console.error("[admin/vouchers] update gagal", r.error.code, r.error.message); const m = voucherError(r.error); if (edit) setErr(m); else onFlash({ kind: "err", text: m }); return; }
      onSaved(r.data as Voucher); after?.();
    } catch (e) { console.error("[admin/vouchers] update error", e); const m = voucherError(e as Error); if (edit) setErr(m); else onFlash({ kind: "err", text: m }); }
    finally { lock.current = false; setBusy(false); }
  }
  function save() {
    const b = buildVoucherPayload(f);
    if ("error" in b) { setErr(b.error); return; }
    void run(b.payload, () => { setEdit(false); onFlash({ kind: "ok", text: `Voucher ${b.payload.code} disimpan.` }); });
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all font-mono text-lg font-bold tracking-wide">{v.code}</p>
            <p className="mt-0.5 text-sm text-zinc-400">Diskon {label(v)}{v.min_purchase > 0 ? ` · min ${rupiah(v.min_purchase)}` : ""}</p>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", badge[st])}>{st}</span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Dipakai {v.used_count}{v.usage_limit != null ? ` / ${v.usage_limit}` : " (tanpa batas)"} · Expired {v.expires_at ? new Date(v.expires_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "tidak ada"}
        </p>
        {edit ? (
          <div className="mt-4 space-y-3">
            <Fields f={f} set={(p) => setF((o) => ({ ...o, ...p }))} idp={`e-${v.id}`} />
            {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy} className="flex-1">{busy ? "Menyimpan…" : "Simpan"}</Button>
              <Button variant="outline" disabled={busy} onClick={() => { setEdit(false); setErr(""); setF(formFromVoucher(v)); }}>Batal</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2">
            <div className="flex items-center gap-1 text-sm text-zinc-300">
              <Switch checked={v.active} disabled={busy} name={`${v.active ? "Nonaktifkan" : "Aktifkan"} voucher ${v.code}`} onChange={(a) => void run({ active: a })} />
              {v.active ? "Aktif" : "Nonaktif"}
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setF(formFromVoucher(v)); setEdit(true); }}>Edit</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VoucherAdmin({ initial }: { initial: Voucher[] }) {
  const [rows, setRows] = useState(initial), [flash, setFlash] = useState<Msg>(null);
  const [open, setOpen] = useState(false), [f, setF] = useState<VoucherForm>(emptyVoucherForm);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const lock = useRef(false);

  async function create() {
    if (lock.current) return;
    const b = buildVoucherPayload(f);
    if ("error" in b) { setErr(b.error); return; }
    lock.current = true; setBusy(true); setErr("");
    try {
      const r = await withTimeout(createClient().from("vouchers").insert(b.payload).select().single(), 20_000);
      if (r.error) { console.error("[admin/vouchers] insert gagal", r.error.code, r.error.message); setErr(voucherError(r.error)); return; }
      setRows((o) => [r.data as Voucher, ...o]); setF(emptyVoucherForm); setOpen(false);
      setFlash({ kind: "ok", text: `Voucher ${b.payload.code} dibuat.` });
    } catch (e) { console.error("[admin/vouchers] insert error", e); setErr(voucherError(e as Error)); }
    finally { lock.current = false; setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {flash && <p role={flash.kind === "err" ? "alert" : "status"} className={cn("text-sm", flash.kind === "ok" ? "text-emerald-400" : "text-red-400")}>{flash.text}</p>}
      {open ? (
        <Card><CardContent className="space-y-3 pt-5">
          <p className="font-semibold">Voucher baru</p>
          <Fields f={f} set={(p) => setF((o) => ({ ...o, ...p }))} idp="new" />
          {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy} className="flex-1">{busy ? "Menyimpan…" : "Buat voucher"}</Button>
            <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); setErr(""); }}>Batal</Button>
          </div>
        </CardContent></Card>
      ) : (
        <Button onClick={() => { setOpen(true); setFlash(null); }} className="w-full sm:w-auto">+ Voucher baru</Button>
      )}
      {rows.length === 0 && !open && <p className="rounded-2xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">Belum ada voucher.</p>}
      <div className="grid gap-3">
        {rows.map((v) => <VoucherCard key={v.id} v={v} onFlash={setFlash} onSaved={(nv) => setRows((o) => o.map((x) => (x.id === nv.id ? nv : x)))} />)}
      </div>
    </div>
  );
}
