import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants=cva("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",{variants:{variant:{default:"bg-emerald-500 text-zinc-950 hover:bg-emerald-400",secondary:"bg-zinc-800 text-zinc-100 hover:bg-zinc-700",outline:"border border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900",ghost:"text-zinc-300 hover:bg-zinc-900 hover:text-white",destructive:"bg-red-600 text-white hover:bg-red-500"},size:{default:"h-10 px-4",sm:"h-9 px-3",lg:"h-12 px-5",icon:"size-10"}},defaultVariants:{variant:"default",size:"default"}});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof variants>{asChild?:boolean}
export function Button({className,variant,size,asChild=false,...props}:ButtonProps){const Comp=asChild?Slot:"button";return <Comp className={cn(variants({variant,size}),className)} {...props}/>}
