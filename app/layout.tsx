import type { Metadata, Viewport } from "next"; import "./globals.css";
const site=process.env.NEXT_PUBLIC_SITE_URL || "https://malik-store.my.id";
export const metadata:Metadata={metadataBase:new URL(site),title:{default:"Malik Store",template:"%s | Malik Store"},description:"Digital storefront Malik Store untuk panel, bot, reseller, dan layanan digital.",alternates:{canonical:"/"},openGraph:{type:"website",url:site,siteName:"Malik Store",title:"Malik Store",description:"Layanan digital Malik Store.",images:["/assets/image/og-image.jpg"]},icons:{icon:"/favicon.ico",apple:"/assets/image/apple-touch-icon.png"},manifest:"/manifest.webmanifest"};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#059669"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
