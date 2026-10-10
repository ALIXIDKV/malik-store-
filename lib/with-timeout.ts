// Batas waktu untuk operasi jaringan: tanpa ini, request yang menggantung (sinyal HP naik-turun)
// membuat flag "busy" tidak pernah lepas dan tombol terlihat mati sampai halaman di-refresh.
// CATATAN: withTimeout hanya berhenti MENUNGGU; request-nya tetap berjalan dan bisa saja sukses di server.
// Karena itu operasi tulis harus idempoten di sisi database (id dibuat client = primary key / RPC ber-kunci).
export function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// Seperti withTimeout, tetapi juga membatalkan request di sisi browser (AbortController) saat waktu habis,
// agar koneksi tidak menggantung. Pembatalan di browser TIDAK menjamin server belum memproses request,
// jadi pemanggil tetap wajib memakai kunci idempotensi.
export function withAbortTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>, ms: number): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return new Promise<T>((resolve, reject) => {
    ctl.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    Promise.resolve(run(ctl.signal)).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(ctl.signal.aborted ? new Error("timeout") : e); },
    );
  });
}
