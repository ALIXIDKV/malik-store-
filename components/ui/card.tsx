import * as React from "react"; import { cn } from "@/lib/utils";
export function Card({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("rounded-2xl border border-neutral-200 bg-white shadow-sm",className)} {...p}/>}
export function CardHeader({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("p-5 pb-2",className)} {...p}/>}
export function CardTitle({className,...p}:React.HTMLAttributes<HTMLHeadingElement>){return <h3 className={cn("font-semibold tracking-tight",className)} {...p}/>}
export function CardContent({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn("p-5 pt-3",className)} {...p}/>}
