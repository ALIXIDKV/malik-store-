import type { Message } from "@/types/database";

// Kunci urut: milidetik + mikrodetik dari created_at. Membandingkan string mentah tidak aman karena Postgres
// membuang nol di belakang pecahan detik (".5+00:00" vs ".49+00:00"), jadi diurai dulu.
function stamp(iso: string): number {
  const ms = Date.parse(iso);
  const frac = /\.(\d+)/.exec(iso)?.[1] ?? "";
  const micro = Number(frac.padEnd(6, "0").slice(3, 6)) || 0;
  return (Number.isNaN(ms) ? 0 : ms) * 1000 + micro;
}
export function compareMessages(a: Message, b: Message): number {
  const d = stamp(a.created_at) - stamp(b.created_at);
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Masukkan / perbarui satu pesan (event Realtime atau respons insert): dedupe by id, urutan tetap benar walau event datang terbalik.
export function upsertMessage(list: Message[], msg: Message): Message[] {
  const i = list.findIndex((x) => x.id === msg.id);
  if (i >= 0) {
    if (list[i] === msg) return list;
    const next = list.slice();
    next[i] = msg;
    return next;
  }
  return [...list, msg].sort(compareMessages);
}

export type MergeOpts = {
  before: ReadonlySet<string>; // id pesan yang SUDAH ada di state saat fetch dimulai
  gone: ReadonlySet<string>; // id yang diketahui terhapus (event DELETE / hapus lokal) — tidak boleh dihidupkan lagi oleh fetch lama
  limit?: number; // batas baris fetch; jika hasil penuh, pesan lokal yang lebih lama dari baris tertua berada di luar jendela fetch
};

// Hasil fetch server = sumber kebenaran. Pesan lokal yang TIDAK ada di hasil fetch:
//  - sudah ada sebelum fetch dimulai  -> dihapus di server (admin hapus chat) -> dibuang;
//  - baru masuk SETELAH fetch dimulai (Realtime / hasil kirim sendiri) -> fetch belum tentu memuatnya -> dipertahankan;
//  - lebih lama dari jendela fetch yang penuh -> tidak bisa dinilai -> dipertahankan.
// Hasil fetch KOSONG diperlakukan sama (tidak lagi otomatis mengosongkan state).
export function mergeMessages(server: Message[], local: Message[], opts: MergeOpts): Message[] {
  const rows = server.filter((m) => !opts.gone.has(m.id));
  const ids = new Set(rows.map((m) => m.id));
  const oldest = server.length ? server[0] : null; // server berurutan naik: [0] = baris tertua dalam jendela fetch
  const windowFull = !!opts.limit && server.length >= opts.limit && !!oldest;
  const keep = local.filter((m) => {
    if (ids.has(m.id) || opts.gone.has(m.id)) return false;
    if (!opts.before.has(m.id)) return true;
    return windowFull && compareMessages(m, oldest as Message) < 0;
  });
  return [...rows, ...keep].sort(compareMessages);
}
