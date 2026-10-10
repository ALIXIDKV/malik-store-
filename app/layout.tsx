import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwCleanup } from "@/components/system/sw-cleanup";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ASSETS } from "@/lib/assets";
const site=process.env.NEXT_PUBLIC_SITE_URL || "https://malik-store.my.id";
export const metadata:Metadata={metadataBase:new URL(site),title:{default:"Malik Store",template:"%s | Malik Store"},description:"Digital storefront Malik Store untuk panel, bot, reseller, dan layanan digital.",alternates:{canonical:"/"},openGraph:{type:"website",url:site,siteName:"Malik Store",title:"Malik Store",description:"Layanan digital Malik Store.",images:[ASSETS.ogImage]},icons:{icon:[{url:ASSETS.favicon.ico},{url:ASSETS.favicon.png32,sizes:"32x32",type:"image/png"},{url:ASSETS.favicon.png192,sizes:"192x192",type:"image/png"}],apple:ASSETS.favicon.appleTouch},manifest:"/manifest.webmanifest"};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#09090b"};
export default function RootLayout({children}:{children:React.ReactNode}){const structuredData={"@context":"https://schema.org","@type":"WebSite",name:"Malik Store",url:site};return <html lang="id" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:THEME_INIT_SCRIPT}}/></head><body>{children}<SwCleanup/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData)}}/></body></html>}
