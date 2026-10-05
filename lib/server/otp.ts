import "server-only"; import crypto from "crypto"; import nodemailer from "nodemailer";
export const OTP_TTL_SECONDS=600,COOLDOWN_SECONDS=60,MAX_SENDS_PER_HOUR=5;
export const normEmail=(v:unknown)=>String(v??"").trim().toLowerCase(); export const isEmail=(v:string)=>v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); export const generateCode=()=>String(crypto.randomInt(0,1_000_000)).padStart(6,"0");
export function hashCode(email:string,code:string){const secret=process.env.OTP_SECRET;if(!secret)throw new Error("OTP_SECRET missing");return crypto.createHmac("sha256",secret).update(`${email}:${code}`).digest("hex")}
export function mailer(){const user=process.env.GMAIL_USER,pass=process.env.GMAIL_APP_PASSWORD;if(!user||!pass)throw new Error("Gmail environment missing");return nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user,pass:pass.replace(/\s+/g,"")}})}
