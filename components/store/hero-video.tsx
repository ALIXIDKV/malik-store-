"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type NetInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Latar hero: poster (dirender server, jadi LCP & fallback) + video yang baru dipasang di klien
 * bila pengguna tidak meminta reduced-motion / hemat data. Video dijeda saat hero keluar layar.
 * Elemen ini absolute di dalam <section> hero, jadi video dan teks satu section.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => {
      const c = (navigator as Navigator & { connection?: NetInfo }).connection;
      const slow = !!c?.saveData || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g";
      setEnabled(!mq.matches && !slow);
    };
    decide();
    mq.addEventListener("change", decide);
    return () => mq.removeEventListener("change", decide);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!enabled || !v) return;
    const play = () => { v.play().catch(() => { /* autoplay ditolak: poster tetap tampil */ }); };
    play();
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) play(); else v.pause(); }, { threshold: 0.05 });
    io.observe(v);
    return () => { io.disconnect(); v.pause(); };
  }, [enabled]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-zinc-950">
      <Image src="/assets/video/hero-poster.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
      {enabled && (
        <video
          ref={ref}
          src="/assets/video/hero-bg.mp4"
          poster="/assets/video/hero-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/70" />
    </div>
  );
}
