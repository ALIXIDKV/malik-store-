import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "../types/database";
import { rupiah } from "./utils";
import { withAbortTimeout, withTimeout } from "./with-timeout";

const MS = 20_000;
// Order Pending yang lebih baru dari ini dicek ulang saat halaman dibuka (pemulihan setelah refresh / app dibuka lagi).
export const RECOVER_WINDOW_MS = 6 * 60 * 60 * 1000;
const PAYMENT_HEAD = "🛒 Pesanan Baru Berhasil Dibuat";

export const orderCode = (id: string) => "ORD-" + String(id).replaceAll("-", "").slice(0, 8).toUpperCase();

// Kunci idempotensi: id order dibuat di client, jadi mengulang insert yang sama tidak membuat order baru.
export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Teks pesan order dibangun SELALU dari baris order di database, jadi pemulihan setelah refresh menghasilkan teks yang sama persis.
export function buildOrderText(o: Pick<Order, "id" | "product" | "price" | "note">): string {
  const note = o.note ? `\nCatatan: ${o.note.slice(0, 200)}` : "";
  return `🛒 Pesanan Baru\n\nProduk:\n${o.product}\n\nHarga:\n${rupiah(o.price)}\n\nStatus:\nMenunggu proses\n\nOrder ID: ${orderCode(o.id)}${note}`;
}

export function orderError(e: { code?: string; message?: string } | null | undefined) {
  const msg = String(e?.message || ""), code = String(e?.code || "");
  if (code === "22023" || /Akun admin/i.test(msg)) return msg; // pesan dari trigger database (sudah berbahasa Indonesia)
  if (/fetch|network|timeout|failed to load/i.test(msg)) return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  return "Order gagal dibuat. Coba lagi.";
}

// ---- Id percobaan order yang bertahan saat refresh (sessionStorage; hanya UUID acak + hash, TANPA isi order/catatan) ----
// Menutup celah: insert order timeout padahal masih berjalan di server, lalu halaman di-refresh dan user menekan tombol lagi.
const ATTEMPT_KEY = "ms:order-attempt";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
export function recallAttempt(userId: string, sig: string): string | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(ATTEMPT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as { h?: string; id?: string; t?: number };
    if (a.h === hash(`${userId}|${sig}`) && typeof a.id === "string" && typeof a.t === "number" && Date.now() - a.t < ATTEMPT_TTL_MS) return a.id;
  } catch { /* storage tidak tersedia / rusak: abaikan */ }
  return null;
}
export function rememberAttempt(userId: string, sig: string, id: string) {
  try { globalThis.sessionStorage?.setItem(ATTEMPT_KEY, JSON.stringify({ h: hash(`${userId}|${sig}`), id, t: Date.now() })); } catch { /* abaikan */ }
}
export function forgetAttempt() {
  try { globalThis.sessionStorage?.removeItem(ATTEMPT_KEY); } catch { /* abaikan */ }
}

export async function createOrder(
  db: SupabaseClient,
  i: { id: string; userId: string; product: string; price: number; note: string },
): Promise<{ order: Order } | { error: string }> {
  try {
    const r = await withAbortTimeout(
      (signal) => db.from("orders").insert({ id: i.id, user_id: i.userId, product: i.product, price: i.price, note: i.note.slice(0, 500) }).select().single().abortSignal(signal),
      MS,
    );
    if (!r.error) return { order: r.data as Order };
    if (r.error.code === "23505") { // id sudah ada = percobaan sebelumnya sebenarnya berhasil (respons hilang)
      const ex = await withTimeout(db.from("orders").select("*").eq("id", i.id).eq("user_id", i.userId).maybeSingle(), MS);
      if (ex.data) return { order: ex.data as Order };
    }
    console.error("[order] insert gagal", r.error.code, r.error.message);
    return { error: orderError(r.error) };
  } catch (e) {
    console.error("[order] insert error", e);
    return { error: orderError(e as Error) };
  }
}

export type Sent = { chat: boolean; payment: boolean };

const rpcMissing = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message || "");

// Pesan order milik user. Jalur utama: RPC malik_send_order_message (migrasi 20261010) — dikunci per order di database,
// jadi retry / klik ganda / dua tab / request lama yang ternyata berhasil tidak pernah menghasilkan pesan dobel.
// Jalur cadangan (RPC belum dimigrasi): cek-lalu-insert dari client; tidak atomik, hanya dipakai sampai migrasi dijalankan.
async function sendOrderMessage(db: SupabaseClient, order: Order, userId: string, text: string): Promise<void> {
  const r = await withAbortTimeout((signal) => db.rpc("malik_send_order_message", { p_order_id: order.id, p_text: text }).abortSignal(signal), MS);
  if (!r.error) return; // true = baru dikirim, false = sudah ada; keduanya berarti pesan ada
  if (!rpcMissing(r.error)) throw r.error;
  const ex = await withTimeout(
    db.from("messages").select("id").eq("user_id", userId).eq("sender", "user").like("message", `%Order ID: ${orderCode(order.id)}%`).limit(1),
    MS,
  );
  if (ex.error) throw ex.error;
  if (ex.data && ex.data.length) return;
  const ins = await withAbortTimeout((signal) => db.from("messages").insert({ user_id: userId, sender: "user", message: text }).abortSignal(signal), MS);
  if (ins.error) throw ins.error;
}

// Kirim pesan order ke chat + instruksi pembayaran. Tiap langkah idempoten dan dilacak terpisah,
// jadi dipanggil ulang hanya mengirim yang belum terkirim (tanpa pesan dobel, tanpa order baru).
export async function syncOrderMessages(db: SupabaseClient, order: Order, userId: string, text: string, sent: Sent): Promise<Sent> {
  const out = { ...sent };
  if (!out.chat) {
    try { await sendOrderMessage(db, order, userId, text); out.chat = true; }
    catch (e) { console.error("[order] pesan order ke chat gagal", e); }
  }
  if (!out.payment) {
    try {
      const r = await withAbortTimeout((signal) => db.rpc("malik_send_payment_message", { p_order_id: order.id }).abortSignal(signal), MS); // RPC idempoten (false = sudah pernah dikirim)
      if (r.error) throw r.error;
      out.payment = true;
    } catch (e) { console.error("[order] instruksi pembayaran gagal", e); }
  }
  return out;
}

// Pemulihan berbasis database: order Pending terbaru yang pesan chat / instruksi pembayarannya belum lengkap.
// Dipakai saat halaman dibuka lagi, sehingga retry tidak bergantung pada memori halaman dan tidak membuat order baru.
export async function findIncompleteOrder(db: SupabaseClient, userId: string): Promise<{ order: Order; sent: Sent } | null> {
  const since = new Date(Date.now() - RECOVER_WINDOW_MS).toISOString();
  const o = await withTimeout(db.from("orders").select("*").eq("user_id", userId).eq("status", "Pending").gte("created_at", since).order("created_at", { ascending: false }).limit(5), 10_000);
  if (o.error) throw o.error;
  const orders = (o.data || []) as Order[];
  if (!orders.length) return null;
  const m = await withTimeout(db.from("messages").select("sender,message").eq("user_id", userId).gte("created_at", since).ilike("message", "%Order ID: ORD-%").order("created_at", { ascending: false }).limit(100), 10_000);
  if (m.error) throw m.error;
  const msgs = (m.data || []) as { sender: "user" | "admin"; message: string }[];
  for (const order of orders) {
    const tag = `Order ID: ${orderCode(order.id)}`;
    const chat = msgs.some((x) => x.sender === "user" && x.message.includes(tag));
    const payment = msgs.some((x) => x.sender === "admin" && x.message.startsWith(PAYMENT_HEAD) && x.message.includes(tag));
    if (!(chat && payment)) return { order, sent: { chat, payment } };
  }
  return null;
}
