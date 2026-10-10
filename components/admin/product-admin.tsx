"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CatalogGroup, CatalogVariant } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, rupiah } from "@/lib/utils";
import {
  LIMITS, createProduct, insertVariant, isValidKey, parsePrice, saveGroup, saveVariant, setProductArchived, slugKey,
  validateDescription, validateLabel, validateName, validatePrice, variantLive, type Edit, type GroupEdit,
} from "@/lib/catalog-admin";

type Msg = { kind: "ok" | "err"; text: string } | null;
const msgCls = (m: NonNullable<Msg>) => (m.kind === "ok" ? "text-emerald-400" : "text-red-400");

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className="grid h-11 min-w-11 shrink-0 place-items-center disabled:opacity-50">
      <span className={cn("relative h-6 w-10 rounded-full transition-colors", checked ? "bg-emerald-500" : "bg-zinc-700")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

function PriceInput({ value, onChange, label, onEnter }: { value: string; onChange: (v: string) => void; label: string; onEnter?: () => void }) {
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">Rp</span>
      <Input aria-label={label} className="pl-9" type="text" inputMode="numeric" enterKeyHint="done" value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }} />
    </div>
  );
}

function ProductCard({ group, vars, defaultOpen, onGroup, onVariant, onVariantAdded, onFlash }: {
  group: CatalogGroup; vars: CatalogVariant[]; defaultOpen: boolean;
  onGroup: (g: CatalogGroup) => void; onVariant: (v: CatalogVariant) => void; onVariantAdded: (v: CatalogVariant) => void; onFlash: (m: Msg) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [gEdit, setGEdit] = useState<GroupEdit>({});
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [adding, setAdding] = useState(false), [newLabel, setNewLabel] = useState(""), [newPrice, setNewPrice] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<Msg>(null);
  const lock = useRef(false);

  const name = gEdit.name ?? group.name, description = gEdit.description ?? group.description;
  const dirtyGroup = name !== group.name || description !== group.description;
  const dirtyVars = vars.filter((v) => {
    const e = edits[v.variant_id];
    return !!e && ((e.label !== undefined && e.label !== v.label) || (e.price !== undefined && e.price !== String(v.price)) || (e.active !== undefined && e.active !== variantLive(v)));
  });
  const dirty = dirtyGroup || dirtyVars.length > 0;
  const live = vars.filter(variantLive);
  const minPrice = live.length ? Math.min(...live.map((v) => v.price)) : 0;
  const hidden = group.archived;

  const setEdit = (id: string, p: Edit) => setEdits((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  const clearEdit = (id: string) => setEdits((s) => { const n = { ...s }; delete n[id]; return n; });

  async function run(fn: () => Promise<void>) {
    if (lock.current) return; // lock via ref: tap ganda sebelum re-render tidak mengirim dua kali
    lock.current = true; setBusy(true); setMsg(null);
    try { await fn(); }
    catch (e) { console.error("[admin/products] gagal", e); setMsg({ kind: "err", text: "Gagal menyimpan. Periksa koneksi lalu coba lagi." }); }
    finally { lock.current = false; setBusy(false); }
  }

  const save = () => run(async () => {
    const problems = [validateName(name), validateDescription(description)];
    for (const v of dirtyVars) { const e = edits[v.variant_id]; problems.push(validateLabel(e.label ?? v.label), validatePrice(e.price ?? String(v.price))); }
    const bad = problems.find(Boolean);
    if (bad) { setMsg({ kind: "err", text: bad }); return; }
    const db = createClient(), errors: string[] = [];
    if (dirtyGroup) {
      const r = await saveGroup(db, group.product_key, { name, description });
      if ("error" in r) errors.push(r.error); else { onGroup(r.group); setGEdit({}); }
    }
    // Varian yang diaktifkan disimpan lebih dulu agar aturan "minimal satu paket aktif" di database tidak menolak pertukaran aktif/nonaktif.
    const target = (v: CatalogVariant) => edits[v.variant_id].active ?? variantLive(v);
    for (const v of [...dirtyVars].sort((a, b) => Number(target(b)) - Number(target(a)))) {
      const e = edits[v.variant_id];
      const r = await saveVariant(db, v, { label: e.label ?? v.label, price: parsePrice(e.price ?? String(v.price)) as number, active: target(v) });
      if ("error" in r) errors.push(`${e.label ?? v.label}: ${r.error}`); else { onVariant(r.row); clearEdit(v.variant_id); }
    }
    setMsg(errors.length ? { kind: "err", text: errors.join(" • ") } : { kind: "ok", text: "Perubahan disimpan." });
  });

  const addVariant = () => run(async () => {
    const bad = validateLabel(newLabel) || validatePrice(newPrice);
    if (bad) { setMsg({ kind: "err", text: bad }); return; }
    const r = await insertVariant(createClient(), group.product_key, { label: newLabel, price: parsePrice(newPrice) as number, taken: vars.map((v) => v.variant_id) });
    if ("error" in r) { setMsg({ kind: "err", text: r.error }); return; }
    onVariantAdded(r.row); setNewLabel(""); setNewPrice(""); setAdding(false);
    setMsg({ kind: "ok", text: `Varian "${r.row.label}" ditambahkan.` });
  });

  const toggleProduct = () => {
    if (!hidden && !window.confirm("Nonaktifkan produk ini? Produk disembunyikan dari katalog dan tidak bisa dipesan. Order, chat, dan ulasan lama tetap aman.")) return;
    void run(async () => {
      const r = await setProductArchived(createClient(), group.product_key, !hidden);
      if ("error" in r) { setMsg({ kind: "err", text: r.error }); return; }
      onGroup(r.group);
      setMsg({ kind: "ok", text: hidden ? "Produk diaktifkan." : "Produk dinonaktifkan." });
      onFlash(null);
    });
  };

  return (
    <section className={cn("rounded-2xl border bg-zinc-950/70", hidden ? "border-zinc-800/70" : "border-zinc-800")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("break-words font-bold", hidden && "text-zinc-400")}>{group.name}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", hidden ? "border-zinc-700 text-zinc-500" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400")}>{hidden ? "Nonaktif" : "Aktif"}</span>
            {dirty && <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-400">Belum disimpan</span>}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">
            {vars.length} varian{vars.length > live.length ? ` (${live.length} aktif)` : ""}{minPrice ? ` · mulai ${rupiah(minPrice)}` : ""}
          </span>
        </span>
        <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid gap-4 border-t border-zinc-800 p-4">
          <div className="grid gap-3">
            <div><label className="label" htmlFor={`n-${group.product_key}`}>Nama produk</label>
              <Input id={`n-${group.product_key}`} maxLength={LIMITS.name} value={name} onChange={(e) => setGEdit((s) => ({ ...s, name: e.target.value }))} /></div>
            <div><label className="label" htmlFor={`d-${group.product_key}`}>Deskripsi</label>
              <Textarea id={`d-${group.product_key}`} className="min-h-20" rows={3} maxLength={LIMITS.description} value={description} onChange={(e) => setGEdit((s) => ({ ...s, description: e.target.value }))} /></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-zinc-300">Varian</p><p className="text-xs text-zinc-500">Kode: {group.product_key}</p></div>
            <div className="grid gap-2">
              {vars.map((v) => {
                const e = edits[v.variant_id] ?? {}, on = e.active ?? variantLive(v), label = e.label ?? v.label;
                return (
                  <div key={v.variant_id} className={cn("grid gap-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5 sm:grid-cols-[1fr_9.5rem_auto] sm:items-center sm:gap-2", !on && "opacity-60")}>
                    <Input aria-label={`Nama varian ${v.label}`} maxLength={LIMITS.label} value={label} onChange={(x) => setEdit(v.variant_id, { label: x.target.value })} />
                    <div className="flex items-center gap-2 sm:contents">
                      <PriceInput label={`Harga ${v.label}`} value={e.price ?? String(v.price)} onChange={(x) => setEdit(v.variant_id, { price: x })} />
                      <Switch checked={on} onChange={(x) => setEdit(v.variant_id, { active: x })} label={`${on ? "Nonaktifkan" : "Aktifkan"} varian ${v.label}`} />
                    </div>
                  </div>
                );
              })}
              {!vars.length && <p className="text-sm text-zinc-500">Belum ada varian.</p>}
            </div>

            {adding ? (
              <div className="mt-2 grid gap-2 rounded-xl border border-dashed border-emerald-500/40 p-2.5 sm:grid-cols-[1fr_9.5rem_auto_auto] sm:items-center">
                <Input aria-label="Nama varian baru" placeholder="Nama varian" maxLength={LIMITS.label} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                <div className="flex items-center gap-2 sm:contents">
                  <PriceInput label="Harga varian baru" value={newPrice} onChange={setNewPrice} onEnter={addVariant} />
                  <Button size="sm" disabled={busy} onClick={addVariant}>Tambah</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAdding(false); setNewLabel(""); setNewPrice(""); }}>Batal</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-2 w-full sm:w-auto" onClick={() => { setAdding(true); setMsg(null); }}><Plus className="size-4" aria-hidden />Tambah varian</Button>
            )}
          </div>

          <div className="grid gap-2 sm:flex sm:items-center">
            <Button disabled={busy || !dirty} onClick={save} className="sm:min-w-44">{busy ? "Menyimpan…" : "Simpan perubahan"}</Button>
            <Button variant={hidden ? "secondary" : "outline"} disabled={busy} onClick={toggleProduct} className={hidden ? "" : "text-red-300 hover:text-red-200"}>{hidden ? "Aktifkan produk" : "Nonaktifkan produk"}</Button>
          </div>
          {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={cn("text-sm", msgCls(msg))}>{msg.text}</p>}
        </div>
      )}
    </section>
  );
}

type Row = { id: number; label: string; price: string };

function AddProductDialog({ existingKeys, onClose, onCreated }: {
  existingKeys: string[]; onClose: () => void; onCreated: (g: CatalogGroup, v: CatalogVariant[], warn?: string) => void;
}) {
  const [name, setName] = useState(""), [key, setKey] = useState(""), [keyTouched, setKeyTouched] = useState(false), [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: 1, label: "", price: "" }]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const next = useRef(2), lock = useRef(false), panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // halaman di belakang tidak ikut ter-scroll
    panel.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !lock.current) onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const setRow = (id: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const k = key || slugKey(name);
    const labels = rows.map((r) => r.label.trim().toLowerCase());
    const bad = validateName(name) || validateDescription(description)
      || (!isValidKey(k) ? "Kode produk harus 2-40 karakter: huruf kecil, angka, atau underscore." : existingKeys.includes(k) ? "Kode produk sudah dipakai. Ganti kode produk." : null)
      || rows.map((r) => validateLabel(r.label) || validatePrice(r.price)).find(Boolean)
      || (new Set(labels).size !== labels.length ? "Nama varian tidak boleh kembar." : null);
    if (bad) { setErr(bad); return; }
    lock.current = true; setBusy(true); setErr("");
    try {
      const r = await createProduct(createClient(), { key: k, name, description, variants: rows.map((x) => ({ label: x.label, price: parsePrice(x.price) as number })) });
      if ("fatal" in r) { setErr(r.fatal); return; }
      // Produk yang sudah ada (retry) tetapi masih nonaktif: jangan mengaku sudah tampil di katalog.
      onCreated(r.group, r.variants, r.group.archived ? "Produk sudah ada tetapi masih nonaktif (sisa percobaan lama). Periksa varian, lalu aktifkan dari kartu produk." : undefined);
    } catch (x) {
      console.error("[admin/products] tambah produk gagal", x);
      setErr("Gagal menyimpan. Tekan Simpan produk lagi: aman, tidak akan membuat duplikat.");
    } finally { lock.current = false; setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !lock.current) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="add-product-title"
        className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-zinc-800 bg-zinc-950 outline-none sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2">
          <h2 id="add-product-title" className="font-bold">Tambah produk</h2>
          <Button variant="ghost" size="icon" aria-label="Tutup" disabled={busy} onClick={onClose}><X className="size-5" aria-hidden /></Button>
        </div>
        <form onSubmit={submit} className="grid gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div><label className="label" htmlFor="ap-name">Nama produk</label>
            <Input id="ap-name" maxLength={LIMITS.name} value={name} placeholder="Contoh: SC OURIN DELUXE"
              onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(slugKey(e.target.value)); }} /></div>
          <div><label className="label" htmlFor="ap-key">Kode produk</label>
            <Input id="ap-key" maxLength={40} value={key} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); }} />
            <p className="mt-1 text-xs text-zinc-500">Dipakai di link produk dan tidak bisa diubah setelah dibuat.</p></div>
          <div><label className="label" htmlFor="ap-desc">Deskripsi</label>
            <Textarea id="ap-desc" className="min-h-20" rows={3} maxLength={LIMITS.description} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <p className="label">Varian</p>
            <div className="grid gap-2">
              {rows.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Input aria-label={`Nama varian ${i + 1}`} placeholder="Nama varian" maxLength={LIMITS.label} value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} />
                  <div className="w-32 shrink-0"><PriceInput label={`Harga varian ${i + 1}`} value={r.price} onChange={(v) => setRow(r.id, { price: v })} /></div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Hapus varian ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}><X className="size-4" aria-hidden /></Button>
                </div>
              ))}
            </div>
            {rows.length < 12 && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setRows((r) => [...r, { id: next.current++, label: "", price: "" }])}><Plus className="size-4" aria-hidden />Tambah varian</Button>}
          </div>
          {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan produk"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProductAdmin({ groups, variants }: { groups: CatalogGroup[]; variants: CatalogVariant[] }) {
  const [gs, setGs] = useState(groups), [vs, setVs] = useState(variants), [dialog, setDialog] = useState(false);
  const [flash, setFlash] = useState<Msg>(null), [fresh, setFresh] = useState("");
  const close = useCallback(() => setDialog(false), []); // stabil: efek dialog (fokus, kunci scroll) tidak diulang tiap render
  const sameV = (a: CatalogVariant, b: CatalogVariant) => a.product_key === b.product_key && a.variant_id === b.variant_id;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{gs.length} produk</p>
        <Button onClick={() => { setFlash(null); setDialog(true); }}><Plus className="size-4" aria-hidden />Tambah Produk</Button>
      </div>
      {flash && <p role={flash.kind === "err" ? "alert" : "status"} className={cn("text-sm", msgCls(flash))}>{flash.text}</p>}
      {gs.map((g) => (
        <ProductCard key={g.product_key} group={g} defaultOpen={g.product_key === fresh}
          vars={vs.filter((v) => v.product_key === g.product_key).sort((a, b) => a.sort - b.sort)}
          onGroup={(n) => setGs((p) => p.map((x) => (x.product_key === n.product_key ? n : x)))}
          onVariant={(n) => setVs((p) => p.map((x) => (sameV(x, n) ? n : x)))}
          onVariantAdded={(n) => setVs((p) => [...p, n])}
          onFlash={setFlash} />
      ))}
      {!gs.length && <p className="rounded-2xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">Belum ada produk. Tekan Tambah Produk untuk membuat yang pertama.</p>}
      {dialog && (
        <AddProductDialog existingKeys={gs.map((g) => g.product_key)} onClose={close}
          onCreated={(g, v, warn) => {
            setGs((p) => [...p, g]); setVs((p) => [...p, ...v]); setFresh(g.product_key); close();
            setFlash(warn ? { kind: "err", text: warn } : { kind: "ok", text: `Produk "${g.name}" ditambahkan dan sudah tampil di katalog.` });
          }} />
      )}
    </div>
  );
}
