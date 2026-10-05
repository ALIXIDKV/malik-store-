"use client";
import { useCallback, useEffect, useRef } from "react";
// Bunyi singkat yang dipicu event (pesan masuk / order dibuat). Tidak ada autoplay:
// jika browser memblokir (belum ada interaksi user), play() gagal diam-diam.
export function useNotifySound(src: string) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const a = new Audio(src);
    a.preload = "none";
    a.volume = 0.8;
    ref.current = a;
    return () => { a.pause(); ref.current = null; };
  }, [src]);
  return useCallback(() => {
    const a = ref.current;
    if (!a) return;
    try { a.currentTime = 0; void a.play().catch(() => {}); } catch { /* diabaikan */ }
  }, []);
}
