import type { MetadataRoute } from "next";
import { ASSETS } from "@/lib/assets";
export default function manifest():MetadataRoute.Manifest{return {name:"Malik Store",short_name:"Malik Store",description:"Digital storefront Malik Store",start_url:"/",display:"standalone",background_color:"#09090b",theme_color:"#09090b",icons:[{src:ASSETS.favicon.ico,sizes:"any",type:"image/x-icon"},{src:ASSETS.favicon.png192,sizes:"192x192",type:"image/png"},{src:ASSETS.favicon.png512,sizes:"512x512",type:"image/png"}]}}
