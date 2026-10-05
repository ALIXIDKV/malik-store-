import * as React from "react"; import { cn } from "@/lib/utils";
export function Input({className,...p}:React.InputHTMLAttributes<HTMLInputElement>){return <input className={cn("h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100",className)} {...p}/>}
