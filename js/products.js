/*
 * MALIK STORE - DATA PRODUK (satu sumber untuk homepage, order, dashboard)
 * 3 produk: panel, sewa_bot, reseller_admin. Harga & benefit = data lama project (tidak ada harga baru).
 * `name` tiap varian = nama produk lama di tabel products Supabase. JANGAN diubah, karena database
 * menghitung ulang harga order dari nama tersebut (format order: "<name> x<qty>").
 */
(function (g) {
  "use strict";

  var LIST = [
    {
      key: "panel", name: "OPEN PANEL", icon: "fa-box-open", accent: "lime",
      desc: "Panel Pterodactyl praktis untuk menjalankan bot, aplikasi, dan kebutuhan server kamu. Pilih kapasitas RAM sesuai kebutuhan dan mulai tanpa setup yang ribet.",
      variantLabel: "Pilih RAM", qtyLabel: "Jumlah", unit: "/bulan",
      variants: [
        { id: "1gb",  label: "1GB",  tag: "STARTER",    name: "OPEN PANEL RAM 1GB",  price: 1000,  perks: ["1GB Dedicated RAM", "CPU Core Shared 50%", "Panel Pterodactyl Full Access", "Server Active 24 Jam"] },
        { id: "2gb",  label: "2GB",  tag: "STANDARD",   name: "OPEN PANEL RAM 2GB",  price: 2000,  perks: ["2GB Dedicated RAM", "CPU Core Shared 100%", "Realtime Console & File Manager", "Support Node.js / Python"] },
        { id: "3gb",  label: "3GB",  tag: "MEDIUM",     name: "OPEN PANEL RAM 3GB",  price: 3000,  perks: ["3GB Dedicated RAM", "High Performance Node", "Full Panel Management", "Auto Backup Harian"] },
        { id: "4gb",  label: "4GB",  tag: "PRO",        name: "OPEN PANEL RAM 4GB",  price: 4000,  perks: ["4GB Dedicated RAM", "Multi Bot Instance Support", "Unlimited Bandwidth", "Priority Support"] },
        { id: "5gb",  label: "5GB",  tag: "ADVANCED",   name: "OPEN PANEL RAM 5GB",  price: 5000,  perks: ["5GB Dedicated RAM", "Dedicated CPU Priority", "Fast SFTP File Access", "Uptime SLA 99.9%"] },
        { id: "6gb",  label: "6GB",  tag: "BUSINESS",   name: "OPEN PANEL RAM 6GB",  price: 6000,  perks: ["6GB Dedicated RAM", "Heavy Traffic Ready", "Full Legal Panel Features", "Free Setup Consultation"] },
        { id: "7gb",  label: "7GB",  tag: "ULTRA",      name: "OPEN PANEL RAM 7GB",  price: 7000,  perks: ["7GB Dedicated RAM", "Multi-core CPU Access", "High Disk Storage Space", "Fast WhatsApp Gateway"] },
        { id: "8gb",  label: "8GB",  tag: "ENTERPRISE", name: "OPEN PANEL RAM 8GB",  price: 8000,  perks: ["8GB Dedicated RAM", "High Speed NVMe Storage", "Priority VIP Routing", "24/7 Dedicated Manager"] },
        { id: "9gb",  label: "9GB",  tag: "EXTREME",    name: "OPEN PANEL RAM 9GB",  price: 9000,  perks: ["9GB Dedicated RAM", "Max Processing Speed", "Full Control Environment", "Instant Ticket Support"] },
        { id: "10gb", label: "10GB", tag: "MONSTER",    name: "OPEN PANEL RAM 10GB", price: 10000, perks: ["10GB Dedicated RAM", "Dedicated Node Isolation", "Extreme Low Latency", "Full Pterodactyl Legal API"] },
        { id: "unlimited", label: "Unlimited", tag: "MAX POWER", name: "OPEN PANEL RAM UNLIMITED", price: 12000, perks: ["UNLIMITED RAM Resource", "Unlimited Bot Automation Slots", "Max Priority Server Hardware", "VIP Priority CS Response"] }
      ]
    },
    {
      key: "sewa_bot", name: "SEWA BOT", icon: "fa-robot", accent: "blue",
      desc: "Cocok untuk kamu yang ingin menjalankan bot tanpa repot mengurus server sendiri. Pilih kapasitas sesuai kebutuhan dan biarkan layanan berjalan stabil.",
      variantLabel: "Pilih Paket", qtyLabel: "Jumlah", unit: "/sekali bayar",
      variants: [
        { id: "1g", label: "1 Group", tag: "PERMANEN", name: "SEWA BOT - 1 GROUP PERMANEN", price: 15000, perks: ["Bot aktif permanen", "Berlaku untuk 1 Group", "Support update fitur", "Anti-delay response"] },
        { id: "2g", label: "2 Group", tag: "PERMANEN", name: "SEWA BOT - 2 GROUP PERMANEN", price: 20000, perks: ["Bot aktif permanen", "Berlaku untuk 2 Group", "Support update fitur", "Fitur Downloader & AI"] },
        { id: "3g", label: "3 Group", tag: "PERMANEN", name: "SEWA BOT - 3 GROUP PERMANEN", price: 25000, perks: ["Bot aktif permanen", "Berlaku untuk 3 Group", "Support update fitur", "Prioritas server speed"] }
      ]
    },
    {
      key: "reseller_admin", name: "RESELLER & ADMIN", icon: "fa-user-shield", accent: "yellow",
      desc: "Pilihan untuk kamu yang ingin mulai menjual layanan digital atau membutuhkan akses pengelolaan yang lebih luas.",
      variantLabel: "Pilih Akses", qtyLabel: "Jumlah", unit: "/bulan",
      variants: [
        { id: "rpanel", label: "Reseller Panel", tag: "RESELLER LEVEL", name: "RESELLER PANEL PTERODACTYL", price: 15000, unit: "/bulan",
          perks: ["Bisa membuat & mengelola panel user", "Sangat cocok untuk dijual kembali (Re-sell)", "Management server & allocation resource", "Support bantuan teknis dari Malik Bot"] },
        { id: "apanel", label: "Admin Panel", tag: "ROOT ADMIN LEVEL", name: "ADMIN PANEL PTERODACTYL", price: 20000, unit: "/bulan",
          perks: ["Full akses admin panel Pterodactyl", "Manage seluruh user & reseller secara bebas", "Manage server instance, node & cluster", "Full control panel & API integration key"] },
        { id: "rbot", label: "Reseller Bot", tag: "RESELLER BOT", name: "RESELLER BOT PERMANEN", price: 30000, unit: "/akses",
          perks: ["Bisa menjual kembali sewa bot", "Mendapat akses reseller resmi", "Support pendaftaran group", "Margin keuntungan 100%"] }
      ]
    }
  ];

  var MAX_QTY = 99;

  function product(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  function variant(key, vid) {
    var p = product(key); if (!p) return null;
    for (var i = 0; i < p.variants.length; i++) if (p.variants[i].id === vid) return p.variants[i];
    return null;
  }
  function unit(p, v) { return (v && v.unit) || (p && p.unit) || ""; }
  function clampQty(q) { q = parseInt(q, 10); return isNaN(q) ? 1 : Math.min(MAX_QTY, Math.max(1, q)); }
  function rp(n) { return "Rp" + (Number(n) || 0).toLocaleString("id-ID"); }
  // Nama order yang dikirim ke database: "<nama produk lama> x<qty>".
  function orderName(key, vid, qty) { var v = variant(key, vid); return v ? v.name + " x" + clampQty(qty) : ""; }
  // Nama produk lama (mis. dari link /order/?product=...) -> { key, vid }. Harga TIDAK diambil dari link.
  function fromName(name) {
    var n = String(name || "").trim().toUpperCase().replace(/\s+X\d+$/, "");
    for (var i = 0; i < LIST.length; i++) for (var j = 0; j < LIST[i].variants.length; j++)
      if (LIST[i].variants[j].name === n) return { key: LIST[i].key, vid: LIST[i].variants[j].id };
    return null;
  }
  // Link order: /order/?p=panel&v=2gb&q=3
  function orderQuery(key, vid, qty) { return "?p=" + encodeURIComponent(key) + "&v=" + encodeURIComponent(vid) + "&q=" + clampQty(qty); }
  function valid(key, vid) { return !!variant(key, vid); }

  g.MalikProducts = { list: LIST, MAX_QTY: MAX_QTY, product: product, variant: variant, unit: unit, clampQty: clampQty, rp: rp,
    orderName: orderName, fromName: fromName, orderQuery: orderQuery, valid: valid };
})(window);
