// Malik Store - UI logic
// Alur ORDER ada di js/auth.js (startOrder). Tidak ada kode WhatsApp di file ini.

function closeLoginModal(){
    const modal = document.getElementById("login-required-modal");
    if(modal){
        modal.classList.remove("show");
    }
}

// Global App State
        let currentCheckoutPackage = { name: 'RAM 4GB', price: 4000, specs: '4GB Dedicated RAM' };

        // View Switching Logic
        function switchView(viewName) {
            document.querySelectorAll('.view-content').forEach(el => el.classList.add('hidden'));
            const targetView = document.getElementById('view-' + viewName);
            if(targetView) {
                targetView.classList.remove('hidden');
                window.scrollTo(0, 0);
            }
        }

        function scrollToSection(id) {
            const go = () => {
                const el = document.getElementById(id);
                if(!el) return;
                const nav = document.querySelector('nav');
                const offset = (nav ? nav.offsetHeight : 0) + 8;
                const y = el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop) - offset;
                try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
                catch(e) { window.scrollTo(0, Math.max(0, y)); }
            };
            setTimeout(go, 60);
        }

        function toggleMobileNav() {
            const nav = document.getElementById('mobile-nav');
            nav.classList.toggle('hidden');
            nav.classList.toggle('flex');
        }

        // Toast System
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `pointer-events-auto bg-black text-white border-3 border-black p-3.5 shadow-brutal text-xs font-bold font-mono flex items-center gap-2 transition-all duration-300`;
            const accent = type === 'success' ? 'bg-neo-lime' : 'bg-neo-yellow';
            toast.innerHTML = `<span class="w-3 h-3 ${accent} border border-black inline-block"></span> ${message}`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        // RAM Filter in Pricing Grid
        function filterRamPackages() {
            const query = document.getElementById('ram-filter').value.toLowerCase().trim();
            const cards = document.querySelectorAll('.ram-card');
            cards.forEach(card => {
                const ramAttr = card.getAttribute('data-ram').toLowerCase();
                if(!query || ramAttr.includes(query)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        }

        // Interactive Panel Controls
        function switchPanelTab(tabName) {
            ['console', 'files', 'env'].forEach(t => {
                const content = document.getElementById(`panel-tab-${t}`);
                const btn = document.getElementById(`tab-btn-${t}`);
                if(content && btn) {
                    if(t === tabName) {
                        content.classList.remove('hidden');
                        btn.className = "bg-neo-lime text-black px-4 py-2 border-2 border-black shadow-brutal-sm font-bold";
                    } else {
                        content.classList.add('hidden');
                        btn.className = "bg-black text-gray-300 hover:text-white px-4 py-2 border-2 border-gray-800 font-bold";
                    }
                }
            });
        }

        function triggerPanelAction(action) {
            const statusEl = document.getElementById('demo-server-status');
            const term = document.getElementById('demo-terminal-box');
            if(action === 'stop') {
                statusEl.className = "bg-red-500/20 border border-red-500 text-red-500 font-mono font-bold text-xs px-3 py-1 flex items-center gap-2";
                statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> OFFLINE`;
                term.innerHTML += `<div class="text-red-400">[SYSTEM] Server stopped by user.</div>`;
                document.getElementById('demo-cpu-val').innerText = '0%';
                document.getElementById('demo-cpu-bar').style.width = '0%';
                document.getElementById('demo-ram-val').innerText = '0%';
                document.getElementById('demo-ram-bar').style.width = '0%';
                showToast('Server Pterodactyl dihentikan!', 'error');
            } else {
                statusEl.className = "bg-neo-lime/20 border border-neo-lime text-neo-lime font-mono font-bold text-xs px-3 py-1 flex items-center gap-2";
                statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-neo-lime pulse-status"></span> ONLINE`;
                term.innerHTML += `<div class="text-neo-lime">[SYSTEM] Server online and initialized.</div>`;
                document.getElementById('demo-cpu-val').innerText = '18%';
                document.getElementById('demo-cpu-bar').style.width = '18%';
                document.getElementById('demo-ram-val').innerText = '32%';
                document.getElementById('demo-ram-bar').style.width = '32%';
                showToast('Server Pterodactyl online!');
            }
            term.scrollTop = term.scrollHeight;
        }

        function sendConsoleCommand(e) {
            e.preventDefault();
            const input = document.getElementById('console-cmd-input');
            const term = document.getElementById('demo-terminal-box');
            const val = input.value.trim();
            if(!val) return;
            term.innerHTML += `<div class="text-white font-bold">&gt; ${val}</div>`;
            term.innerHTML += `<div class="text-neo-lime">[OK] Perintah diterima: ${val}</div>`;
            input.value = '';
            term.scrollTop = term.scrollHeight;
        }

        // Modal & QRIS Flow

        function openCheckoutModal(pkgName, price, specs) {
            currentCheckoutPackage = { name: pkgName, price: price, specs: specs };
            document.getElementById('modal-pkg-name').innerText = pkgName;
            document.getElementById('modal-pkg-price').innerText = 'Rp' + price.toLocaleString('id-ID');
            document.getElementById('modal-pkg-specs').innerText = specs;
            
            document.getElementById('checkout-step-1').classList.remove('hidden');
            document.getElementById('checkout-step-2').classList.add('hidden');
            document.getElementById('checkout-step-3').classList.add('hidden');

            document.getElementById('modal-checkout').classList.remove('hidden');
        }

        function closeCheckoutModal() {
            document.getElementById('modal-checkout').classList.add('hidden');
        }

        function processOrderPayment() {
            document.getElementById('checkout-step-1').classList.add('hidden');
            document.getElementById('checkout-step-2').classList.remove('hidden');
            document.getElementById('qris-total-pay').innerText = 'Rp' + currentCheckoutPackage.price.toLocaleString('id-ID');
            
            const randInv = 'INV-2026-' + Math.floor(1000 + Math.random() * 9000);
            document.getElementById('inv-id-display').innerText = '#' + randInv;

            const qrCanvas = document.getElementById('qrcode-canvas');
            qrCanvas.innerHTML = '';
            new QRCode(qrCanvas, {
                text: `00020101021226680014ID.LINKAJA.WWW0118936009110022026112520303UMI51440014ID.CO.QRIS.WWW0215ID10200381920135204581253033605802ID5917MALIK BOT RENTAL6007JAKARTA61051011062070703A01`,
                width: 150,
                height: 150,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }

        function simulatePaymentSuccess() {
            showToast('Pembayaran QRIS Diverifikasi Webhook!', 'success');
            const randomId = Math.floor(1000 + Math.random() * 9000);
            const nameInput = document.getElementById('cust-name').value || 'Pelanggan';
            
            document.getElementById('cred-user').innerText = 'user_' + nameInput.toLowerCase().replace(/\s+/g, '') + randomId;
            document.getElementById('cred-pass').innerText = 'MLK-PASS-' + randomId;

            document.getElementById('checkout-step-2').classList.add('hidden');
            document.getElementById('checkout-step-3').classList.remove('hidden');

            // Add row to Admin Table Demo
            const adminTable = document.getElementById('admin-orders-table');
            if(adminTable) {
                const newRow = document.createElement('tr');
                newRow.innerHTML = `
                    <td class="p-3 text-neo-blue">#INV-2026-${randomId}</td>
                    <td class="p-3 font-sans font-bold text-white">${nameInput}</td>
                    <td class="p-3"><span class="bg-neo-lime/20 text-neo-lime px-2 py-0.5">${currentCheckoutPackage.name}</span></td>
                    <td class="p-3 font-bold text-white">Rp${currentCheckoutPackage.price.toLocaleString('id-ID')}</td>
                    <td class="p-3"><span class="bg-neo-lime text-black font-extrabold px-2 py-0.5">SUCCESS</span></td>
                    <td class="p-3"><button class="text-neo-blue hover:underline font-bold">Auto Deploy</button></td>
                `;
                adminTable.prepend(newRow);
            }
        }

document.querySelectorAll('.stat-counter').forEach(el=>{
 let target=parseInt(el.dataset.value||el.innerText);
 let current=0;
 let step=Math.ceil(target/50);
 let timer=setInterval(()=>{
   current+=step;
   if(current>=target){
     current=target;
     clearInterval(timer);
   }
   el.innerText=current.toLocaleString('id-ID');
 },20);
});

function openFaq(title){
    showToast(title);
}
