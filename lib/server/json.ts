/**
 * Membaca body JSON request dengan aman.
 * Mengembalikan object biasa (nilai tiap field bertipe `unknown`, wajib di-narrow oleh pemanggil)
 * atau `null` jika body kosong / bukan JSON / bukan object.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
