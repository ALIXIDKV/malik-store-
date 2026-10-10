import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "../types/database";
import { withAbortTimeout, withTimeout } from "./with-timeout";

export type OutgoingMessage = {
  id: string; // dibuat di client = primary key; mengirim ulang id yang sama tidak bisa menghasilkan baris kedua
  user_id: string;
  sender: "user" | "admin";
  message: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
};

// Insert pesan yang aman diulang. Idempotensi ditegakkan DATABASE lewat primary key (bukan pengecekan frontend):
// jika request sebelumnya ternyata sudah masuk (respons hilang / timeout), insert ulang gagal dengan 23505,
// lalu baris yang sudah ada dibaca dan dikembalikan sebagai hasil sukses.
export async function insertMessageOnce(db: SupabaseClient, row: OutgoingMessage, ms = 25_000): Promise<Message> {
  const r = await withAbortTimeout((signal) => db.from("messages").insert(row).select().abortSignal(signal).single(), ms);
  if (!r.error) return r.data as Message;
  if (r.error.code === "23505") {
    const ex = await withTimeout(db.from("messages").select("*").eq("id", row.id).eq("user_id", row.user_id).maybeSingle(), 15_000);
    if (ex.error) throw ex.error;
    if (ex.data) return ex.data as Message;
  }
  throw r.error;
}
