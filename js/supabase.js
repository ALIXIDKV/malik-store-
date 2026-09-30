/*
 * MALIK STORE - KONEKSI SUPABASE
 * Hanya memakai PUBLISHABLE key (aman di frontend, dibatasi RLS di database).
 * JANGAN PERNAH menaruh secret / service_role key di file ini.
 *
 * Wajib dimuat SETELAH library CDN:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/supabase.js"></script>
 * Hasil: window.supabaseClient
 *
 * Panel admin memakai sesi terpisah dari sesi user dengan mengisi
 * window.MALIK_SB_STORAGE_KEY sebelum file ini dimuat.
 */
(function (g) {
  "use strict";
  var SUPABASE_URL = "https://cykthicacntgjhptbfzu.supabase.co";
  var SUPABASE_KEY = "sb_publishable_XOfLKCrIEpTssI-le_Zk3Q_Jxv2F7PZ";

  // Bersihkan sisa data sistem lama (tahap localStorage): akun, order, chat, hash password.
  try {
    ["malik_users", "malik_session", "malik_orders", "malik_chats", "malik_order_status", "malik_presence",
     "malik_notif_state", "malik_announcements", "malik_admin_session", "malik_admin_demo",
     "malik_admin_demo_on", "malik_admin_lock"].forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}

  if (!g.supabase || typeof g.supabase.createClient !== "function") {
    console.error("[Malik] Library Supabase belum dimuat. Pastikan script CDN dipasang sebelum js/supabase.js.");
    g.supabaseClient = null;
    return;
  }
  var auth = { persistSession: true, autoRefreshToken: true };
  if (g.MALIK_SB_STORAGE_KEY) auth.storageKey = g.MALIK_SB_STORAGE_KEY;
  g.supabaseClient = g.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: auth });
})(window);
