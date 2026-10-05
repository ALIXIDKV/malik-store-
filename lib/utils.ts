import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
// Hanya path internal; mencegah open-redirect (//host, /\\host, atau scheme).
export function safeInternalPath(v: string | null | undefined, fallback = "/dashboard") { return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && !v.startsWith("/account") ? v : fallback; }
export function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }
