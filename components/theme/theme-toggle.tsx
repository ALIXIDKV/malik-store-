"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, readTheme, THEME_COLOR } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ANIM_MS = 1900; // harus sama dengan durasi .mt-stage di globals.css
// Stage dipasang RELATIF terhadap container tombol (right-full = tepi kiri tombol), bukan koordinat layar.

function Walker() {
  // Kanvas 44x28px = lebar/tinggi stage. Tepi kanan stage menempel di tepi kiri tombol; pintu berhenti ~11px sebelum tombol.
  return (
    <svg viewBox="0 0 44 28" width="44" height="28" aria-hidden focusable="false" className="block overflow-visible">
      {/* pintu kecil (x 22-33, ~11px di kiri tombol) */}
      <g className="mt-door">
        <rect x="22" y="2" width="11" height="24" rx="1.6" fill="#0b0b0d" stroke="currentColor" strokeOpacity=".55" strokeWidth="1" />
        <g className="mt-leaf">
          <rect x="22" y="2" width="11" height="24" rx="1.6" fill="#a16207" stroke="#78350f" strokeWidth=".8" />
          <circle cx="30.6" cy="14.5" r=".9" fill="#fde68a" />
        </g>
      </g>
      {/* karakter: kepala, badan, lengan, kaki (berpusat di x=27.5 = tengah pintu) */}
      <g className="mt-walker">
        <g className="mt-man">
          <circle cx="27.5" cy="8" r="2.7" fill="#fcd9b6" stroke="#92400e" strokeWidth=".6" />
          <path d="M24.9 7.2 q2.6 -3.6 5.2 0 z" fill="#292524" />
          <rect x="24.8" y="11" width="5.4" height="7.6" rx="1.8" fill="#10b981" />
          <g className="mt-arm"><line x1="29.6" y1="12.4" x2="32.8" y2="15.4" stroke="#fcd9b6" strokeWidth="1.6" strokeLinecap="round" /></g>
          <g className="mt-leg-a"><line x1="26.5" y1="18.4" x2="26.5" y2="25.4" stroke="#1d4ed8" strokeWidth="1.8" strokeLinecap="round" /></g>
          <g className="mt-leg-b"><line x1="28.7" y1="18.4" x2="28.7" y2="25.4" stroke="#1e3a8a" strokeWidth="1.8" strokeLinecap="round" /></g>
        </g>
      </g>
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [running, setRunning] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timers = useRef<number[]>([]);
  const runningRef = useRef(false);

  const clearTimers = useCallback(() => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[readTheme()]); }, []);

  const finish = useCallback(() => { clearTimers(); runningRef.current = false; setRunning(false); setPressing(false); }, [clearTimers]);

  function onClick() {
    // 1) Tema berubah SEKARANG, terpisah dari animasi.
    applyTheme(readTheme() === "light" ? "dark" : "light");
    // 2) Animasi hanya dekorasi: gagal/dilewati tidak boleh memengaruhi tombol.
    try {
      if (runningRef.current) return; // klik berulang: tema tetap berganti, animasi yang berjalan tidak diulang
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      runningRef.current = true;
      setRunning(true);
      clearTimers();
      timers.current.push(window.setTimeout(() => setPressing(true), 1040));
      timers.current.push(window.setTimeout(() => setPressing(false), 1290));
      timers.current.push(window.setTimeout(finish, ANIM_MS + 350)); // jaring pengaman bila animationend tidak terpicu
    } catch { finish(); }
  }

  return (
    <span className={cn("relative inline-grid", className)}>
      <button
        type="button"
        onClick={onClick}
        aria-label="Ganti tema terang atau gelap"
        title="Ganti tema"
        className={cn("grid size-11 touch-manipulation place-items-center rounded-xl text-zinc-400 transition hover:bg-zinc-900 hover:text-white active:bg-zinc-800", pressing && "mt-btn-press")}
      >
        <Sun className="theme-icon-sun size-5" aria-hidden />
        <Moon className="theme-icon-moon size-5" aria-hidden />
      </button>
      {running && (
        <span
          aria-hidden
          className="mt-stage pointer-events-none absolute right-full z-50 text-zinc-500"
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) finish(); }}
        >
          <Walker />
        </span>
      )}
    </span>
  );
}
