import Link from "next/link";
import Image from "next/image";
import { MessageCircle, UserRound } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
const iconLink="grid size-11 touch-manipulation place-items-center rounded-xl text-zinc-400 transition hover:bg-zinc-900 hover:text-white active:bg-zinc-800";
const textLink="inline-flex h-11 touch-manipulation items-center rounded-xl px-3 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-white active:bg-zinc-800";
export async function Header(){
  let profile=null;
  try{profile=(await getAuthContext()).profile}catch(err){console.error("[header] gagal memuat sesi",err)}
  const role=profile?.role;
  const accountHref=role==="admin"?"/admin":profile?"/dashboard/profile":"/account";
  const chatHref=role==="admin"?"/admin/chat":profile?"/dashboard/chat":"/account?next=/dashboard/chat";
  const accountLabel=profile?.username||"Akun";
  return <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
    <div className="shell flex h-16 items-center justify-between gap-2">
      <Link href="/" aria-label="Malik Store - beranda" className="flex min-h-11 touch-manipulation items-center gap-2.5 font-black tracking-tight"><Image src="/assets/image/profile.jpg" alt="" width={32} height={32} sizes="32px" className="size-8 rounded-xl object-cover"/><span>MALIK<span className="text-emerald-400">STORE</span></span></Link>
      <nav aria-label="Navigasi header" className="flex items-center gap-1">
        <div className="mr-2 hidden items-center gap-1 md:flex">
          <Link className={textLink} href="/#catalog">Katalog</Link>
          {role==="admin"?<Link className={textLink} href="/admin">Admin</Link>:profile&&<><Link className={textLink} href="/dashboard">Pesanan</Link><Link className={textLink} href="/dashboard/history">Riwayat</Link></>}
          <Link className={textLink} href="/tentang">Tentang</Link>
        </div>
        <ThemeToggle/>
        <Link className={iconLink} href={chatHref} aria-label="Chat"><MessageCircle className="size-5" aria-hidden/></Link>
        <Link className={`${iconLink} sm:w-auto sm:gap-2 sm:px-3 sm:text-sm sm:font-medium sm:text-zinc-300`} href={accountHref} aria-label={profile?`Akun ${accountLabel}`:"Masuk atau daftar"}><UserRound className="size-5" aria-hidden/><span className="hidden max-w-32 truncate sm:inline">{profile?accountLabel:"Masuk"}</span></Link>
      </nav>
    </div></header>
}
