import "server-only";
/** Membaca body JSON dengan aman. Mengembalikan null jika body kosong/rusak/bukan object (-> 400, bukan 500). */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
