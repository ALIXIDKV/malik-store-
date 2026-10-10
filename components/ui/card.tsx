import * as React from "react";
import { cn } from "@/lib/utils";
export function Card({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 [box-shadow:0_16px_48px_var(--card-shadow)]",className)} {...p}/>}
export function CardHeader({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("p-5 pb-2 sm:p-6 sm:pb-2",className)} {...p}/>}
export function CardTitle({className,...p}:React.HTMLAttributes<HTMLHeadingElement>){return <h3 className={cn("font-semibold tracking-tight text-zinc-50",className)} {...p}/>}
export function CardContent({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("p-5 pt-3 sm:p-6 sm:pt-3",className)} {...p}/>}
