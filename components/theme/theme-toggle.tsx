"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, readTheme, THEME_COLOR } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ANIM_MS = 1900; // harus sama dengan durasi .mt-stage di globals.css

function Walker() {
  return (
    <svg viewBox="0 0 120 34" width="120" height="34" aria-hidden focusable="false" className="block overflow-visible">
      <line x1="2" y1="31.5" x2="118" y2="31.5" stroke="currentColor" strokeOpacity=".18" strokeWidth="1" strokeLinecap="round" />
      {/* pintu kecil */}
      <g className="mt-door">
        <rect x="3" y="6" width="17" height="25.5" rx="2" fill="#0b0b0d" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.2" />
        <g className="mt-leaf">
          <rect x="3" y="6" width="17" height="25.5" rx="2" fill="#a16207" stroke="#78350f" strokeWidth="1" />
          <circle cx="17" cy="19" r="1.2" fill="#fde68a" />
        </g>
      </g>
      {/* karakter: kepala, badan, lengan, kaki */}
      <g className="mt-walker">
        <g className="mt-man">
          <circle cx="11.5" cy="12" r="3.2" fill="#fcd9b6" stroke="#92400e" strokeWidth=".7" />
          <path d="M8.4 11 q3.1 -4.2 6.2 0 z" fill="#292524" />
          <rect x="8.7" y="15.2" width="5.6" height="8" rx="2" fill="#10b981" />
          <g className="mt-arm"><line x1="13.6" y1="16.6" x2="16.6" y2="20" stroke="#fcd9b6" strokeWidth="1.8" strokeLinecap="round" /></g>
          <g className="mt-leg-a"><line x1="10.4" y1="23" x2="10.4" y2="30.6" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" /></g>
          <g className="mt-leg-b"><line x1="12.8" y1="23" x2="12.8" y2="30.6" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" /></g>
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
          className="mt-stage pointer-events-none absolute right-0 top-full z-50 text-zinc-500"
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) finish(); }}
        >
          <Walker />
        </span>
      )}
    </span>
  );
}
