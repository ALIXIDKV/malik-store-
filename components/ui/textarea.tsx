import * as React from "react"; import { cn } from "@/lib/utils";
export function Textarea({className,...p}:React.TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea className={cn("min-h-24 w-full rounded-lg border border-neutral-200 bg-white p-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100",className)} {...p}/>}
