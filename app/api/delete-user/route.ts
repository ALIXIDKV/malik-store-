import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readJsonBody } from "@/lib/server/json";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (message: string, status: number) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("Sesi admin tidak ditemukan.", 401);

    const body = await readJsonBody(req);
    const rawUserId = body?.userId;
    if (typeof rawUserId !== "string" || !UUID.test(rawUserId)) return fail("ID user tidak valid.", 400);
    const userId = rawUserId; // sudah tervalidasi: string UUID

    const sb = createAdminClient();
    const who = await sb.auth.getUser(token);
    if (who.error || !who.data.user) return fail("Sesi admin tidak valid.", 401);
    if (who.data.user.id === userId) return fail("Akun admin sendiri tidak bisa dihapus.", 400);

    const [me, target] = await Promise.all([
      sb.from("profiles").select("role").eq("id", who.data.user.id).maybeSingle(),
      sb.from("profiles").select("email,role").eq("id", userId).maybeSingle(),
    ]);
    if (me.data?.role !== "admin") return fail("Hanya admin yang boleh menghapus user.", 403);
    if (target.data?.role === "admin") return fail("Akun admin tidak boleh dihapus.", 403);

    for (const table of ["messages", "reviews"]) {
      const r = await sb.from(table).delete().eq("user_id", userId);
      if (r.error && r.error.code !== "42P01") throw r.error;
    }

    let p = await sb.from("profiles").delete().eq("id", userId);
    if (p.error) {
      const o = await sb.from("orders").delete().eq("user_id", userId);
      if (o.error) throw o.error;
      p = await sb.from("profiles").delete().eq("id", userId);
      if (p.error) throw p.error;
    }

    const d = await sb.auth.admin.deleteUser(userId);
    if (d.error && !/not found/i.test(d.error.message)) throw d.error;

    if (target.data?.email) await sb.from("email_otps").delete().eq("email", target.data.email.toLowerCase());
    return NextResponse.json({ ok: true, message: "User berhasil dihapus." });
  } catch (e) {
    console.error("[delete-user]", e);
    return fail("Gagal menghapus user.", 500);
  }
}
