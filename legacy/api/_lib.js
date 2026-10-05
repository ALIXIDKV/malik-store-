/*
 * MALIK STORE - helper server-side (Vercel Serverless Functions).
 * File berawalan "_" TIDAK menjadi endpoint publik.
 * Secret (Gmail App Password, Service Role, OTP_SECRET) hanya dibaca dari process.env di sini.
 */
"use strict";
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const OTP_TTL_SECONDS = 600;     // kode berlaku 10 menit
const COOLDOWN_SECONDS = 60;     // jeda kirim ulang
const MAX_SENDS_PER_HOUR = 5;    // batas kirim kode per email per jam
const REQUIRED_ENV = ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OTP_SECRET"];

let _sb = null, _tx = null;

function missingEnv() { return REQUIRED_ENV.filter(function (k) { return !process.env[k]; }); }

function supabaseAdmin() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

function mailer() {
  if (!_tx) _tx = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, "") }
  });
  return _tx;
}

function normEmail(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
function isEmail(v) { return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

// 6 digit, CSPRNG (crypto.randomInt) - bukan Math.random()
function generateCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, "0"); }

// OTP tidak pernah disimpan plaintext: HMAC-SHA256 dengan OTP_SECRET, terikat ke email.
function hashCode(email, code) {
  return crypto.createHmac("sha256", process.env.OTP_SECRET).update(email + ":" + code).digest("hex");
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch (e) { return false; }
}

// Validasi umum endpoint: POST saja, origin sama, env lengkap. Mengembalikan body JSON atau null (respons sudah dikirim).
function guard(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); send(res, 405, { ok: false, message: "Method tidak diizinkan." }); return null; }
  if (!sameOrigin(req)) { send(res, 403, { ok: false, message: "Permintaan ditolak." }); return null; }
  const miss = missingEnv();
  if (miss.length) { console.error("[api] Environment variable belum diisi:", miss.join(", ")); send(res, 500, { ok: false, message: "Server belum dikonfigurasi. Hubungi admin." }); return null; }
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object") { send(res, 400, { ok: false, message: "Data tidak valid." }); return null; }
  return b;
}

module.exports = { OTP_TTL_SECONDS, COOLDOWN_SECONDS, MAX_SENDS_PER_HOUR, supabaseAdmin, mailer, normEmail, isEmail, generateCode, hashCode, send, guard };
