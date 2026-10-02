/* POST /api/upload-chat   (body = file mentah, Content-Type: application/octet-stream)
 * Header: Authorization: Bearer <access_token Supabase>, X-File-Type: <mime asli file>
 * Alur: validasi sesi + file -> upload ke Cloudinary (signed, API Secret hanya di server) -> balas { ok, url, type }.
 * Database TIDAK disentuh di sini; frontend yang menyimpan URL ke tabel messages (RLS Supabase tetap berlaku).
 *
 * Env Vercel: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY yang sudah ada).
 * Batas 4 MB = batas body Vercel Function (4,5 MB). Foto dikompres di browser sebelum dikirim; video tidak bisa dikompres di browser.
 */
"use strict";
const crypto = require("crypto");
const L = require("./_lib");

const MAX_BYTES = 4 * 1024 * 1024;
const FOLDER = "malik-store/chat";
const KINDS = { "image/jpeg": "image", "image/png": "image", "image/webp": "image", "video/mp4": "video", "video/webm": "video", "video/quicktime": "video" };
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const NEED = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

// Batas kasar per user (per instance serverless; cukup untuk menahan spam sederhana).
const RATE = { max: 10, windowMs: 60000 }, hits = new Map();
function limited(uid) {
  const now = Date.now(), list = (hits.get(uid) || []).filter(function (t) { return now - t < RATE.windowMs; });
  if (list.length >= RATE.max) { hits.set(uid, list); return true; }
  list.push(now); hits.set(uid, list);
  if (hits.size > 500) hits.forEach(function (v, k) { if (!v.length || now - v[v.length - 1] > RATE.windowMs) hits.delete(k); });
  return false;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch (e) { return false; }
}

// Cek isi file (bukan hanya header dari klien) supaya file yang menyamar tidak lolos.
function sniff(b, mime) {
  if (b.length < 12) return false;
  switch (mime) {
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png": return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    case "image/webp": return b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
    case "video/mp4": case "video/quicktime": return b.toString("ascii", 4, 8) === "ftyp";
    case "video/webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    default: return false;
  }
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.readableEnded || req.complete === true && req.readable === false) {   // stream sudah dibaca runtime -> pakai body hasil parse
      const b = req.body;
      return Buffer.isBuffer(b) ? resolve(b) : reject(new Error("body_unreadable"));
    }
    const chunks = []; let n = 0;
    req.on("data", function (c) {
      n += c.length;
      if (n > MAX_BYTES) { const e = new Error("too_large"); e.code = "TOO_LARGE"; reject(e); try { req.destroy(); } catch (x) {} return; }
      chunks.push(c);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

function signature(params, secret) {
  const s = Object.keys(params).sort().map(function (k) { return k + "=" + params[k]; }).join("&");
  return crypto.createHash("sha1").update(s + secret).digest("hex");
}

module.exports = async function (req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return L.send(res, 405, { ok: false, message: "Method tidak diizinkan." }); }
  if (!sameOrigin(req)) return L.send(res, 403, { ok: false, message: "Permintaan ditolak." });
  const miss = NEED.filter(function (k) { return !process.env[k]; });
  if (miss.length) { console.error("[upload-chat] Environment variable belum diisi:", miss.join(", ")); return L.send(res, 500, { ok: false, message: "Upload belum dikonfigurasi. Hubungi admin." }); }
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(cloud)) { console.error("[upload-chat] CLOUDINARY_CLOUD_NAME tidak valid."); return L.send(res, 500, { ok: false, message: "Upload belum dikonfigurasi. Hubungi admin." }); }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return L.send(res, 401, { ok: false, message: "Sesi tidak ditemukan. Silakan login ulang." });
  const mime = String(req.headers["x-file-type"] || "").trim().toLowerCase();
  const kind = KINDS[mime];
  if (!kind) return L.send(res, 415, { ok: false, message: "Format tidak didukung. Gunakan JPG, PNG, WebP, MP4, WebM, atau MOV." });
  const declared = Number(req.headers["content-length"]);
  if (declared > MAX_BYTES) return L.send(res, 413, { ok: false, message: "File terlalu besar (maks 4 MB)." });

  try {
    // 1) hanya user yang login (customer atau admin)
    const who = await L.supabaseAdmin().auth.getUser(token);
    if (who.error || !who.data || !who.data.user) return L.send(res, 401, { ok: false, message: "Sesi tidak valid. Silakan login ulang." });
    if (limited(who.data.user.id)) return L.send(res, 429, { ok: false, message: "Terlalu banyak upload. Tunggu sebentar lalu coba lagi." });

    // 2) baca & validasi file
    let buf;
    try { buf = await readBody(req); }
    catch (e) {
      if (e && e.code === "TOO_LARGE") return L.send(res, 413, { ok: false, message: "File terlalu besar (maks 4 MB)." });
      return L.send(res, 400, { ok: false, message: "File tidak terbaca. Coba lagi." });
    }
    if (!buf.length) return L.send(res, 400, { ok: false, message: "File kosong." });
    if (buf.length > MAX_BYTES) return L.send(res, 413, { ok: false, message: "File terlalu besar (maks 4 MB)." });
    if (!sniff(buf, mime)) return L.send(res, 415, { ok: false, message: "Isi file tidak sesuai dengan formatnya." });

    // 3) upload ke Cloudinary (signed). API Secret hanya dibaca dari process.env di sini.
    const params = { folder: FOLDER, timestamp: String(Math.floor(Date.now() / 1000)) };
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mime }), "chat." + EXT[mime]);
    form.append("api_key", process.env.CLOUDINARY_API_KEY);
    form.append("folder", params.folder);
    form.append("timestamp", params.timestamp);
    form.append("signature", signature(params, process.env.CLOUDINARY_API_SECRET));

    let r, j = null;
    try {
      r = await fetch("https://api.cloudinary.com/v1_1/" + cloud + "/" + kind + "/upload", { method: "POST", body: form, signal: AbortSignal.timeout(12000) });
      try { j = await r.json(); } catch (e) {}
    } catch (e) {
      console.error("[upload-chat] Cloudinary tidak terjangkau:", e && (e.name || e.message));
      return L.send(res, 504, { ok: false, message: "Server upload tidak merespons. Coba lagi." });
    }
    if (!r.ok || !j || !j.secure_url) {
      console.error("[upload-chat] Cloudinary menolak:", r.status, j && j.error && j.error.message);
      return L.send(res, 502, { ok: false, message: "Upload ke penyimpanan gagal. Coba lagi." });
    }
    if (!/^https:\/\/res\.cloudinary\.com\//.test(j.secure_url)) {
      console.error("[upload-chat] URL tidak terduga dari Cloudinary.");
      return L.send(res, 502, { ok: false, message: "Upload ke penyimpanan gagal. Coba lagi." });
    }
    return L.send(res, 200, { ok: true, url: j.secure_url, type: kind });
  } catch (e) {
    console.error("[upload-chat]", e && (e.message || e));
    return L.send(res, 500, { ok: false, message: "Terjadi kesalahan server. Coba lagi." });
  }
};
