import { requireAdmin } from "@/lib/auth";
import { VoucherAdmin } from "@/components/admin/voucher-admin";
import { voucherError } from "@/lib/vouchers";
import type { Voucher } from "@/types/database";

export default async function Vouchers() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("vouchers").select("*").order("created_at", { ascending: false });
  if (error) console.error("[admin/vouchers] gagal memuat", error.code, error.message);
  return (
    <main className="page">
      <div className="shell max-w-3xl">
        <h1 className="mb-1 text-2xl font-bold">Voucher</h1>
        <p className="mb-5 text-sm text-zinc-500">Buat, ubah, dan aktifkan atau nonaktifkan kode voucher. Validasi dilakukan di database saat customer checkout.</p>
        {error
          ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-red-400">{voucherError(error)}</p>
          : <VoucherAdmin initial={(data || []) as Voucher[]} />}
      </div>
    </main>
  );
}
