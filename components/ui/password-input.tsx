"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Input password dengan tombol mata (show/hide). Porting dari legacy/js/password-toggle.js.
// Murni UI: tidak menyentuh Supabase Auth, session, atau logika login. `name`, `id`, `autoComplete`, dll. diteruskan apa adanya.
export function PasswordInput({ className, disabled, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null); // Input lama tidak meneruskan ref bertipe, jadi input dicari lewat wrapper (komponen Input tidak diubah)
  function toggle() {
    const el = wrap.current?.querySelector("input") ?? null;
    const had = !!el && document.activeElement === el;
    const a = el?.selectionStart ?? null, b = el?.selectionEnd ?? null;
    setShow((v) => !v);
    // kembalikan fokus & posisi kursor setelah tipe input berganti (keyboard HP tetap terbuka)
    if (had && el) requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(a, b); } catch {} });
  }
  const label = show ? "Sembunyikan password" : "Tampilkan password";
  return (
    <div ref={wrap} className="relative">
      <Input {...props} type={show ? "text" : "password"} disabled={disabled} className={cn("pr-12", className)} />
      <button
        type="button" // jangan pernah submit form
        onClick={toggle}
        onMouseDown={(e) => e.preventDefault()} // input tidak kehilangan fokus saat ikon ditekan
        disabled={disabled}
        aria-label={label}
        aria-pressed={show}
        title={label}
        className={cn(
          "absolute right-0 top-0 flex size-11 touch-manipulation items-center justify-center rounded-xl text-zinc-500 transition hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-emerald-500/70 disabled:opacity-50",
          show && "text-emerald-400"
        )}
      >
        {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
