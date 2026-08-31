<template>
  <div class="mobile-app">
    <!-- Top bar -->
    <div class="topbar">
      <div>
        <div class="greeting">📦 Material Request</div>
        <div class="subgreeting">{{ emp?.name }} · Lapangan</div>
      </div>
      <router-link to="/mobile/home" class="back-btn">← Kembali</router-link>
    </div>

    <!-- Tab switch -->
    <div class="tab-row">
      <button class="tab-btn" :class="{ active: tab === 'catalog' }" @click="tab='catalog'">🛒 Katalog</button>
      <button class="tab-btn" :class="{ active: tab === 'cart' }" @click="tab='cart'">
        🧾 Keranjang <span v-if="cart.length" class="badge">{{ cart.length }}</span>
      </button>
      <button class="tab-btn" :class="{ active: tab === 'history' }" @click="tab='history';loadHistory()">📋 Riwayat</button>
    </div>

    <!-- CATALOG TAB -->
    <template v-if="tab === 'catalog'">
      <div class="search-bar">
        <input v-model="search" placeholder="🔍 Cari material..." class="search-input" @input="loadCatalog" />
      </div>
      <!-- Category pills -->
      <div class="cat-row">
        <button class="cat-pill" :class="{ active: !selectedCat }" @click="selectedCat=null;loadCatalog()">Semua</button>
        <button v-for="c in categories" :key="c.id" class="cat-pill" :class="{ active: selectedCat===c.id }"
          @click="selectedCat=c.id;loadCatalog()">{{ c.name }} ({{ c.product_count }})</button>
      </div>
      <!-- Product grid (marketplace style) -->
      <div class="product-grid">
        <div v-for="p in products" :key="p.id" class="product-card" @click="openProduct(p)">
          <div class="product-img" :style="p.image_url ? `background-image:url(${p.image_url})` : ''">
            <span v-if="!p.image_url" class="img-placeholder">📦</span>
          </div>
          <div class="product-info">
            <div class="product-name">{{ p.name }}</div>
            <div class="product-spec">{{ p.spec || p.description || '-' }}</div>
            <div class="product-cat">{{ p.category_name || '-' }}</div>
          </div>
          <button class="add-cart-btn" @click.stop="addToCart(p)">+ Tambah</button>
        </div>
        <div v-if="!products.length && !loading" class="empty">Tidak ada produk ditemukan</div>
      </div>
    </template>

    <!-- CART TAB -->
    <template v-if="tab === 'cart'">
      <div v-if="!cart.length" class="empty-cart">
        <div style="font-size:48px">🛒</div>
        <div>Keranjang kosong</div>
        <button class="btn-primary" @click="tab='catalog'">Mulai Belanja</button>
      </div>
      <template v-else>
        <!-- Project selector -->
        <div class="form-section">
          <label class="form-label">Untuk Project:</label>
          <select v-model="selectedProject" class="form-select">
            <option :value="null">-- Pilih Project --</option>
            <option v-for="p in projectList" :key="p.id" :value="p.id">{{ p.project_number }} - {{ p.project_name }}</option>
          </select>
        </div>
        <div class="form-section">
          <label class="form-label">Prioritas:</label>
          <div class="priority-row">
            <button v-for="pr in ['low','normal','high','urgent']" :key="pr" class="priority-btn"
              :class="[pr, { active: priority===pr }]" @click="priority=pr">
              {{ pr === 'low' ? '🟢 Low' : pr === 'normal' ? '🔵 Normal' : pr === 'high' ? '🟠 High' : '🔴 Urgent' }}
            </button>
          </div>
        </div>
        <div class="form-section">
          <label class="form-label">Dibutuhkan Tanggal:</label>
          <input type="date" v-model="neededBy" class="form-input" />
        </div>
        <div class="form-section">
          <label class="form-label">Catatan:</label>
          <textarea v-model="mrNotes" class="form-input" rows="2" placeholder="Catatan tambahan..."></textarea>
        </div>

        <!-- Add custom item button -->
        <div class="form-section">
          <button class="custom-item-btn" @click="showCustomForm=true">📷 + Tambah Item Baru (tidak ada di katalog)</button>
        </div>

        <!-- Cart items -->
        <div class="cart-list">
          <div v-for="(item, i) in cart" :key="i" class="cart-item">
            <div class="cart-img" :style="item.image_url ? `background-image:url(${item.image_url})` : ''">
              <span v-if="!item.image_url">📦</span>
              <span v-if="item.is_custom" class="custom-badge">CUSTOM</span>
            </div>
            <div class="cart-info">
              <div class="cart-name">{{ item.item_name }}</div>
              <div class="cart-spec">{{ item.spec || '-' }}</div>
              <div v-if="item.notes" class="cart-notes">📝 {{ item.notes }}</div>
              <div class="qty-row">
                <button class="qty-btn" @click="item.quantity = Math.max(1, item.quantity-1)">−</button>
                <input type="number" v-model.number="item.quantity" class="qty-input" min="1" />
                <button class="qty-btn" @click="item.quantity++">+</button>
                <input v-model="item.uom" class="uom-input" placeholder="pcs" />
              </div>
            </div>
            <button class="del-btn" @click="cart.splice(i,1)">🗑</button>
          </div>
        </div>

        <button class="submit-btn" @click="submitMR" :disabled="submitting">
          {{ submitting ? '⏳ Mengirim...' : '📤 Kirim Material Request' }}
        </button>
      </template>
    </template>

    <!-- SERING DIMINTA — yang paling sering harus paling dekat dijangkau. -->
    <template v-if="tab === 'catalog' && sering.length">
      <div class="sering-box">
        <div class="sering-judul">⚡ Sering Anda minta</div>
        <div class="sering-baris">
          <button v-for="(x, i) in sering" :key="i" class="sering-chip" @click="tambahDariSering(x)">
            {{ x.item_name }}
            <span class="sering-kali">{{ x.kali }}×</span>
          </button>
        </div>
      </div>
    </template>

    <!-- HISTORY TAB -->
    <template v-if="tab === 'history'">
      <div v-if="belumDibaca" class="mr-kabar">
        {{ belumDibaca }} permintaan sudah diputuskan kantor
      </div>

      <!-- Antrean offline. Permintaan yang tersimpan tapi belum terkirim HARUS
           terlihat — kalau tidak, dari sisi pemakainya ia sama saja hilang. -->
      <div v-if="antrean.length" class="antre-box">
        <div class="antre-head">
          <span>📥 {{ antrean.length }} belum terkirim</span>
          <button class="antre-btn" @click="kirimAntrean(false)" :disabled="mengirimAntrean">
            {{ mengirimAntrean ? 'Mengirim…' : 'Coba kirim' }}
          </button>
        </div>
        <div v-for="q in antrean" :key="q.payload.client_request_id" class="antre-item">
          <div>
            <div class="antre-ringkas">{{ q.ringkas }}</div>
            <div class="antre-meta">
              disimpan {{ formatDate(q.dibuat_at) }}
              <span v-if="q.percobaan > 1"> · {{ q.percobaan }}× dicoba</span>
            </div>
            <!-- Ditolak server: tidak dicoba lagi, tapi alasannya ditampilkan.
                 Membuangnya diam-diam membuat permintaan hilang tanpa jejak. -->
            <div v-if="q.gagal_permanen" class="antre-galat">Ditolak: {{ q.galat }}</div>
          </div>
          <button v-if="q.gagal_permanen" class="antre-buang"
            @click="buangDariAntrean(q.payload.client_request_id)">Hapus</button>
        </div>
      </div>
      <div v-for="mr in history" :key="mr.id" class="history-card"
           :class="{ 'mr-baru': Number(mr.keputusan_baru) === 1 }">
        <div class="history-header">
          <span class="mr-number">
            {{ mr.mr_number }}
            <!-- Keputusan yang belum dilihat ditandai — tanpa ini, satu-satunya
                 cara mengetahui nasib permintaan adalah membuka aplikasi
                 berulang kali dan membandingkan sendiri. -->
            <span v-if="Number(mr.keputusan_baru) === 1" class="mr-dot">baru</span>
          </span>
          <span class="mr-status" :class="mr.status">{{ mr.status }}</span>
        </div>
        <div class="history-meta">{{ mr.project_name || '-' }} · {{ mr.item_count }} item · {{ formatDate(mr.created_at) }}</div>
        <div v-if="mr.priority && mr.priority !== 'normal'" class="mr-priority" :class="mr.priority">{{ mr.priority }}</div>

        <!-- Kebutuhan lapangan sangat berulang. Tanpa ini, permintaan yang sama
             berarti menelusuri katalog dari awal di layar HP sambil berdiri di
             lokasi. -->
        <button class="mr-ulang" @click="mintaLagi(mr)" :disabled="memuatUlang">
          🔁 Minta lagi
        </button>

        <!-- Alasan penolakan. Inilah yang membuat tim lapangan tahu apa yang
             harus diperbaiki, alih-alih mengajukan ulang hal yang sama. -->
        <div v-if="mr.status === 'rejected' && mr.rejection_reason" class="mr-alasan">
          <strong>Ditolak:</strong> {{ mr.rejection_reason }}
        </div>
        <!-- Yang disetujui: nomor PR-nya, supaya bisa ditanyakan ke kantor
             dengan rujukan yang benar. -->
        <div v-else-if="mr.status === 'approved' && mr.linked_pr_number" class="mr-lanjut">
          Diteruskan ke PR <strong>{{ mr.linked_pr_number }}</strong>
        </div>
      </div>
      <div v-if="!history.length" class="empty">Belum ada Material Request</div>
    </template>

    <!-- Product detail modal -->
    <Transition name="modal">
      <div v-if="detailProduct" class="modal-overlay" @click.self="detailProduct=null">
        <div class="modal-card">
          <div class="modal-img" :style="detailProduct.image_url ? `background-image:url(${detailProduct.image_url})` : ''">
            <span v-if="!detailProduct.image_url" style="font-size:64px">📦</span>
          </div>
          <div class="modal-body">
            <h3>{{ detailProduct.name }}</h3>
            <div class="modal-spec">{{ detailProduct.spec || '-' }}</div>
            <div class="modal-desc">{{ detailProduct.description || '-' }}</div>
            <div class="modal-cat">Kategori: {{ detailProduct.category_name }}</div>
            <button class="btn-primary" @click="addToCart(detailProduct);detailProduct=null" style="margin-top:16px;width:100%">
              + Tambah ke Keranjang
            </button>
          </div>
          <button class="modal-close" @click="detailProduct=null">✕</button>
        </div>
      </div>
    </Transition>

    <!-- Custom item form modal -->
    <Transition name="modal">
      <div v-if="showCustomForm" class="modal-overlay" @click.self="showCustomForm=false">
        <div class="modal-card">
          <div class="modal-body">
            <h3 style="margin:0 0 16px">📷 Tambah Item Baru</h3>
            <!-- Photo capture -->
            <div class="photo-section">
              <div v-if="customPhoto" class="photo-preview" :style="`background-image:url(${customPhoto})`">
                <button class="photo-retake" @click="customPhoto='';customPhotoUrl=''">🔄 Foto Ulang</button>
              </div>
              <div v-else class="photo-placeholder" @click="triggerCamera">
                <span style="font-size:40px">📸</span>
                <span style="font-size:13px;color:#64748b">Tap untuk foto material</span>
              </div>
              <input ref="cameraInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onPhotoCapture" />
              <div v-if="uploading" class="upload-progress">⏳ Mengupload foto...</div>
            </div>
            <!-- Item details -->
            <div style="margin-top:12px">
              <label class="form-label">Nama Item *</label>
              <input v-model="customName" class="form-input" placeholder="Contoh: Pipa Besi 3 inch" />
            </div>
            <div style="margin-top:8px">
              <label class="form-label">Spesifikasi</label>
              <input v-model="customSpec" class="form-input" placeholder="Ukuran, merek, tipe..." />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
              <div>
                <label class="form-label">Jumlah</label>
                <input type="number" v-model.number="customQty" class="form-input" min="1" />
              </div>
              <div>
                <label class="form-label">Satuan</label>
                <input v-model="customUom" class="form-input" placeholder="pcs/m/kg" />
              </div>
            </div>
            <div style="margin-top:8px">
              <label class="form-label">Catatan untuk Kantor</label>
              <textarea v-model="customNotes" class="form-input" rows="2" placeholder="Jelaskan kebutuhan detail..."></textarea>
            </div>
            <button class="btn-primary" style="width:100%;margin-top:16px" @click="addCustomItem" :disabled="!customName.trim()">
              ✅ Tambah ke Keranjang
            </button>
            <button class="btn-cancel-full" @click="showCustomForm=false">Batal</button>
          </div>
          <button class="modal-close" @click="showCustomForm=false">✕</button>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast" class="toast" :class="toastType">{{ toast }}</div>
    </Transition>

    <!-- Bottom nav -->
    <nav class="bottom-nav">
      <router-link to="/mobile/home" class="nav-item"><span class="nav-ico">🏠</span><span class="nav-txt">Beranda</span></router-link>
      <router-link to="/mobile/attend" class="nav-item"><span class="nav-ico">📋</span><span class="nav-txt">Absensi</span></router-link>
      <router-link to="/mobile/material-request" class="nav-item active"><span class="nav-ico">📦</span><span class="nav-txt">Material</span></router-link>
      <router-link to="/mobile/settings" class="nav-item"><span class="nav-ico">⚙️</span><span class="nav-txt">Pengaturan</span></router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { mobileApi, getMobileToken } from '../../lib/mobileApi';

const router = useRouter();
const emp = ref<any>(null);
const tab = ref('catalog');
const loading = ref(false);
const search = ref('');
const selectedCat = ref<number|null>(null);
const products = ref<any[]>([]);
const categories = ref<any[]>([]);
const cart = ref<any[]>([]);
const history = ref<any[]>([]);
const belumDibaca = ref(0);
const detailProduct = ref<any>(null);
const submitting = ref(false);
const toast = ref('');
const toastType = ref('success');
const selectedProject = ref<number|null>(null);
const projectList = ref<any[]>([]);
const priority = ref('normal');
const neededBy = ref('');
const mrNotes = ref('');
const showCustomForm = ref(false);
const customName = ref('');
const customSpec = ref('');
const customQty = ref(1);
const customUom = ref('pcs');
const customNotes = ref('');
const customPhoto = ref('');
const customPhotoUrl = ref('');
// Salinan foto yang belum sempat terunggah — dipegang sampai sinyal kembali.
const customPhotoData = ref('');
const uploading = ref(false);
const cameraInput = ref<HTMLInputElement|null>(null);
let toastTimer: any = null;

function showToast(msg: string, type = 'success') {
  toast.value = msg; toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 3000);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadCatalog() {
  loading.value = true;
  try {
    const params: any = {};
    if (search.value) params.search = search.value;
    if (selectedCat.value) params.category_id = selectedCat.value;
    const res = await mobileApi.get('/api/material-requests/catalog', { params });
    products.value = res.data.products || [];
    categories.value = res.data.categories || [];
  } catch { showToast('Gagal load katalog', 'error'); }
  finally { loading.value = false; }
}

function openProduct(p: any) { detailProduct.value = { ...p }; }

function addToCart(p: any) {
  const existing = cart.value.find(c => c.product_id === p.id && !c.is_custom);
  if (existing) { existing.quantity++; showToast(`${p.name} +1`); return; }
  cart.value.push({
    product_id: p.id, item_name: p.name, spec: p.spec, image_url: p.image_url,
    quantity: 1, uom: 'pcs', notes: '', is_custom: false,
  });
  showToast(`${p.name} ditambahkan`);
}

function triggerCamera() {
  cameraInput.value?.click();
}

/**
 * Kecilkan foto sebelum apa pun dilakukan padanya.
 *
 * Dua alasan, dan keduanya soal lapangan: foto kamera HP 3–5 MB sering GAGAL
 * terkirim lewat sinyal proyek yang lemah — jadi mengecilkannya memperbaiki
 * jalur online juga, bukan cuma offline. Dan foto sebesar itu tidak muat
 * disimpan sebagai antrean (localStorage ±5 MB), sehingga tanpa ini antrean
 * berfoto tidak mungkin ada.
 *
 * 1280px sisi terpanjang cukup untuk memperlihatkan part yang rusak atau merek
 * barang — yang memang jadi gunanya foto di sini.
 */
async function kecilkanFoto(file: File, maks = 1280, mutu = 0.72): Promise<string> {
  const bitmap = await new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
  const skala = Math.min(1, maks / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * skala), h = Math.round(bitmap.height * skala);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  URL.revokeObjectURL(bitmap.src);
  return c.toDataURL('image/jpeg', mutu);
}

function dataUrlKeBlob(dataUrl: string): Blob {
  const [kepala, isi] = dataUrl.split(',');
  const mime = kepala.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(isi);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

async function unggahFoto(dataUrl: string): Promise<string> {
  const fd = new FormData();
  fd.append('photo', dataUrlKeBlob(dataUrl), 'foto.jpg');
  const res = await mobileApi.post('/api/material-requests/upload-photo', fd);
  return res.data.url;
}

async function onPhotoCapture(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    // Dikecilkan dulu — hasilnya dipakai sebagai preview SEKALIGUS sebagai
    // salinan yang disimpan kalau ternyata tidak ada sinyal.
    const kecil = await kecilkanFoto(file);
    customPhoto.value = kecil;
    customPhotoData.value = kecil;
    try {
      customPhotoUrl.value = await unggahFoto(kecil);
      customPhotoData.value = '';   // sudah aman di server
      showToast('📸 Foto berhasil diupload');
    } catch (err: any) {
      if (layakDiantre(err)) {
        // Fotonya TIDAK dibuang. Sering justru foto itulah inti permintaannya
        // — "part yang rusak ini" — dan membuangnya membuat permintaannya
        // kehilangan artinya.
        customPhotoUrl.value = '';
        showToast('📥 Tidak ada sinyal — foto disimpan, diunggah otomatis nanti');
      } else {
        customPhoto.value = ''; customPhotoData.value = '';
        showToast(err?.response?.data?.error || 'Foto ditolak server', 'error');
      }
    }
  } catch {
    customPhoto.value = ''; customPhotoData.value = '';
    showToast('Gagal membaca foto', 'error');
  } finally { uploading.value = false; }
}

function addCustomItem() {
  if (!customName.value.trim()) return;
  cart.value.push({
    product_id: null,
    item_name: customName.value.trim(),
    spec: customSpec.value.trim() || null,
    image_url: customPhotoUrl.value || null,
    // Salinan lokal kalau fotonya belum sempat terunggah. Dihapus begitu
    // unggahannya berhasil, jadi tidak ikut tersimpan permanen.
    image_data: customPhotoUrl.value ? null : (customPhotoData.value || null),
    quantity: customQty.value || 1,
    uom: customUom.value || 'pcs',
    notes: customNotes.value.trim() || null,
    is_custom: true,
  });
  showToast(`📷 ${customName.value} ditambahkan`);
  // Reset form
  customName.value = '';
  customSpec.value = '';
  customQty.value = 1;
  customUom.value = 'pcs';
  customNotes.value = '';
  customPhotoData.value = '';
  customPhoto.value = '';
  customPhotoUrl.value = '';
  showCustomForm.value = false;
}

async function loadHistory() {
  try {
    const res = await mobileApi.get('/api/material-requests/my');
    history.value = res.data.data || [];
    // Dihitung server, bukan di layar: badge yang dihitung browser akan berbeda
    // antar perangkat milik orang yang sama.
    belumDibaca.value = Number(res.data.belum_dibaca) || 0;
    // Ditandai dibaca SESUDAH ditampilkan, bukan sebelum — kalau gagal muat,
    // kabarnya tidak boleh hilang tanpa pernah terlihat.
    if (belumDibaca.value) {
      try { await mobileApi.put('/api/material-requests/my/tandai-dibaca'); } catch {}
    }
  } catch {}
}

async function loadProjects() {
  try {
    const res = await mobileApi.get('/api/material-requests/projects/list');
    projectList.value = res.data.data || [];
  } catch {}
}

// ══ Antrean offline ════════════════════════════════════════════════════════
//
// Di lokasi proyek sinyal sering hilang. Sebelum ini, pengiriman yang gagal
// membuat permintaannya lenyap — keranjang hanya di memori, jadi menutup
// aplikasi berarti mengetik ulang semuanya. Orang lalu berhenti mencoba.
//
// Yang TIDAK boleh terjadi karena antrean ini: MR kembar. Kirim ulang setelah
// RESPONS hilang (padahal server sudah menerima) akan membuat barang dipesan
// dua kali. Karena itu tiap permintaan membawa `client_request_id` yang dibuat
// SEKALI dan dipakai ulang di setiap percobaan; server mengenalinya.
const KUNCI_ANTREAN = 'mr_antrean_v1';
const antrean = ref<any[]>([]);
const mengirimAntrean = ref(false);

function bacaAntrean(): any[] {
  try { return JSON.parse(localStorage.getItem(KUNCI_ANTREAN) || '[]'); } catch { return []; }
}
/**
 * Menulis antrean, dan MENGATAKAN kalau tidak muat.
 *
 * localStorage sekitar 5 MB. Foto yang sudah dikecilkan ±300 KB, jadi belasan
 * permintaan berfoto masih muat — tapi bukan tak terbatas. Gagal menyimpan
 * diam-diam berarti permintaan hilang justru pada saat pemakainya paling
 * yakin sudah tersimpan.
 */
function tulisAntrean(v: any[]): boolean {
  try {
    localStorage.setItem(KUNCI_ANTREAN, JSON.stringify(v));
    antrean.value = v;
    return true;
  } catch {
    showToast('Penyimpanan HP penuh — kirim dulu antrean yang ada', 'error');
    return false;
  }
}
function idPermintaan(): string {
  // crypto.randomUUID tidak ada di sebagian WebView lama.
  return (globalThis.crypto as any)?.randomUUID?.()
    || `mr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Kegagalan JARINGAN dibedakan dari PENOLAKAN server.
 *
 * Hanya yang pertama layak diantre. Mengantrekan penolakan 400 berarti
 * mencoba selamanya untuk permintaan yang memang tidak akan pernah diterima —
 * dan pemakainya tidak pernah tahu kenapa.
 */
function layakDiantre(e: any): boolean {
  if (e?.response) return false;           // server menjawab → keputusan, bukan sinyal
  return true;                              // tidak ada respons → jaringan
}

async function kirimAntrean(diam = true) {
  if (mengirimAntrean.value) return;
  const isi = bacaAntrean();
  if (!isi.length) return;
  mengirimAntrean.value = true;
  let terkirim = 0;
  const sisa: any[] = [];
  for (const p of isi) {
    try {
      // Foto yang belum terunggah dikirim LEBIH DULU, lalu URL-nya menggantikan
      // salinan lokalnya. MR-nya sendiri tidak dibuat sampai fotonya aman —
      // MR tanpa foto yang seharusnya berfoto sudah kehilangan artinya, dan
      // tidak ada cara menambahkannya belakangan.
      for (const it of p.payload.items || []) {
        if (it.image_data && !it.image_url) {
          it.image_url = await unggahFoto(it.image_data);
          delete it.image_data;
        }
      }
      await mobileApi.post('/api/material-requests/', p.payload);
      terkirim++;
    } catch (e: any) {
      if (layakDiantre(e)) {
        // Masih offline — dipertahankan, percobaannya dihitung.
        sisa.push({ ...p, percobaan: (p.percobaan || 0) + 1 });
      } else {
        // Ditolak server. Dikeluarkan dari antrean supaya tidak mencoba
        // selamanya, TAPI alasannya disimpan dan ditampilkan — kalau hanya
        // dibuang, permintaannya hilang tanpa ada yang tahu.
        sisa.push({ ...p, gagal_permanen: true,
          galat: e?.response?.data?.error || 'Ditolak server' });
      }
    }
  }
  tulisAntrean(sisa.filter(x => !x.terkirim));
  mengirimAntrean.value = false;
  if (terkirim) {
    showToast(`✅ ${terkirim} permintaan tertunda berhasil terkirim`);
    await loadHistory();
  } else if (!diam && sisa.length) {
    showToast('Masih belum ada sinyal — permintaan tetap tersimpan', 'error');
  }
}

function buangDariAntrean(id: string) {
  tulisAntrean(bacaAntrean().filter((x: any) => x.payload?.client_request_id !== id));
}

const sering = ref<any[]>([]);
const memuatUlang = ref(false);

async function loadSering() {
  try {
    const res = await mobileApi.get('/api/material-requests/my/sering');
    sering.value = res.data.data || [];
  } catch { sering.value = []; }
}

function tambahDariSering(x: any) {
  cart.value.push({
    product_id: x.product_id || null,
    item_name: x.item_name,
    spec: x.spec || null,
    image_url: null,
    quantity: Number(x.qty_terakhir) || 1,
    uom: x.uom || 'pcs',
    notes: null,
    is_custom: !x.product_id,
  });
  showToast(`${x.item_name} ditambahkan`);
}

/**
 * Salin isi permintaan lama ke keranjang.
 *
 * Produk yang sudah tidak aktif TETAP dibawa dan ditandai, bukan dibuang
 * diam-diam: membuangnya membuat "minta lagi" menghasilkan permintaan yang
 * lebih sedikit dari aslinya tanpa ada yang sadar, dan barang yang hilang itu
 * justru yang paling mungkin dibutuhkan.
 */
async function mintaLagi(mr: any) {
  if (memuatUlang.value) return;
  memuatUlang.value = true;
  try {
    const res = await mobileApi.get(`/api/material-requests/my/${mr.id}`);
    const items = res.data?.data?.items || [];
    if (!items.length) { showToast('Permintaan itu tidak punya item', 'error'); return; }

    let takAktif = 0;
    for (const it of items) {
      const masihAda = it.product_id ? Number(it.produk_masih_ada) === 1 : true;
      if (!masihAda) takAktif++;
      cart.value.push({
        product_id: masihAda ? it.product_id : null,
        item_name: it.item_name,
        spec: it.spec || null,
        image_url: it.image_url || null,
        quantity: Number(it.quantity) || 1,
        uom: it.uom || 'pcs',
        notes: it.notes || null,
        // Produk yang sudah tidak ada di katalog diteruskan sebagai item bebas
        // — tetap bisa diminta, tinggal kantor yang memutuskan.
        is_custom: !masihAda || !it.product_id,
        tidak_aktif: !masihAda,
      });
    }
    tab.value = 'cart';
    showToast(takAktif
      ? `${items.length} item disalin — ${takAktif} sudah tidak ada di katalog, periksa dulu`
      : `${items.length} item disalin dari ${mr.mr_number}`);
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Gagal menyalin permintaan', 'error');
  } finally { memuatUlang.value = false; }
}

async function submitMR() {
  if (!cart.value.length) return;
  submitting.value = true;
  const proj = projectList.value.find(p => p.id === selectedProject.value);
  const payload = {
    // Dibuat SEKALI di sini dan ikut ke setiap percobaan berikutnya.
    client_request_id: idPermintaan(),
    project_id: selectedProject.value,
    project_name: proj?.project_name || null,
    priority: priority.value,
    needed_by: neededBy.value || null,
    notes: mrNotes.value || null,
    items: cart.value,
  };
  try {
    await mobileApi.post('/api/material-requests/', payload);
    showToast('✅ Material Request terkirim!');
    cart.value = [];
    tab.value = 'history';
    await loadHistory();
  } catch (e: any) {
    if (layakDiantre(e)) {
      const tersimpan = tulisAntrean([...bacaAntrean(), {
        payload, dibuat_at: new Date().toISOString(), percobaan: 1,
        ringkas: `${payload.items.length} item · ${payload.priority}`,
      }]);
      if (!tersimpan) {
        // Gagal disimpan: keranjang DIPERTAHANKAN. Mengosongkannya di sini
        // membuang permintaan yang tidak tersimpan di mana pun.
        showToast('Permintaan belum tersimpan — jangan tutup halaman ini', 'error');
        return;
      }
      // Keranjang dikosongkan karena permintaannya SUDAH tersimpan di antrean —
      // membiarkannya membuat orang mengirim ulang dan menghasilkan dua entri.
      cart.value = [];
      tab.value = 'history';
      showToast('📥 Tidak ada sinyal — permintaan disimpan dan akan dikirim otomatis');
    } else {
      showToast(e?.response?.data?.error || 'Gagal mengirim', 'error');
    }
  } finally { submitting.value = false; }
}

onMounted(() => {
  antrean.value = bacaAntrean();
  // Dicoba saat aplikasi dibuka dan setiap kali sinyal kembali — tanpa perlu
  // pemakainya ingat menekan apa pun.
  window.addEventListener('online', () => kirimAntrean(true));
  const stored = localStorage.getItem('mobile_employee');
  // Sesi lama (sebelum token mobile diterapkan) tidak punya token — login ulang.
  if (!stored || !getMobileToken()) { router.push('/mobile'); return; }
  emp.value = JSON.parse(stored);
  loadCatalog();
  loadProjects();
  loadSering();
  kirimAntrean(true);
});
</script>

<style scoped>
* { box-sizing: border-box; }
.mobile-app { min-height: 100dvh; background: #f1f5f9; display: flex; flex-direction: column; gap: 0; padding: 0 0 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.topbar { background: linear-gradient(135deg, #0f172a, #1e3a8a); padding: 52px 20px 16px; display: flex; justify-content: space-between; align-items: flex-start; }
.greeting { color: white; font-size: 18px; font-weight: 700; }
.subgreeting { color: #93c5fd; font-size: 12px; margin-top: 2px; }
.back-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; padding: 6px 12px; font-size: 12px; text-decoration: none; }

.tab-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; background: white; border-bottom: 2px solid #e2e8f0; position: sticky; top: 0; z-index: 10; }
.tab-btn { border: none; background: none; padding: 12px 8px; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; position: relative; }
.tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; background: #eff6ff; }
.badge { background: #ef4444; color: white; border-radius: 99px; padding: 1px 7px; font-size: 11px; margin-left: 4px; }

.search-bar { padding: 12px 16px 4px; }
.search-input { width: 100%; border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; font-size: 15px; background: white; outline: none; }
.search-input:focus { border-color: #3b82f6; }

.cat-row { display: flex; gap: 8px; padding: 8px 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.cat-pill { white-space: nowrap; border: 1.5px solid #e2e8f0; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 600; background: white; color: #475569; cursor: pointer; flex-shrink: 0; }
.cat-pill.active { background: #2563eb; color: white; border-color: #2563eb; }

.product-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 12px 16px; }
.product-card { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; flex-direction: column; cursor: pointer; transition: transform .15s; }
.product-card:active { transform: scale(0.97); }
.product-img { height: 120px; background: #f1f5f9 center/cover no-repeat; display: flex; align-items: center; justify-content: center; }
.img-placeholder { font-size: 40px; }
.product-info { padding: 10px 12px 4px; flex: 1; }
.product-name { font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.3; }
.product-spec { font-size: 11px; color: #64748b; margin-top: 2px; }
.product-cat { font-size: 10px; color: #3b82f6; margin-top: 4px; font-weight: 600; }
.add-cart-btn { border: none; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; margin: 8px 10px 10px; border-radius: 10px; }

.empty-cart { text-align: center; padding: 60px 20px; color: #94a3b8; }
.btn-primary { background: #2563eb; color: white; border: none; border-radius: 12px; padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 16px; }

.form-section { padding: 8px 16px; }
.form-label { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 4px; display: block; }
.form-select, .form-input { width: 100%; border: 2px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; font-size: 14px; background: white; }

.priority-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.priority-btn { border: 2px solid #e2e8f0; border-radius: 8px; padding: 8px 4px; font-size: 11px; font-weight: 600; background: white; cursor: pointer; }
.priority-btn.active.low { border-color: #10b981; background: #ecfdf5; }
.priority-btn.active.normal { border-color: #3b82f6; background: #eff6ff; }
.priority-btn.active.high { border-color: #f59e0b; background: #fffbeb; }
.priority-btn.active.urgent { border-color: #ef4444; background: #fef2f2; }

.cart-list { padding: 8px 16px; display: flex; flex-direction: column; gap: 10px; }
.cart-item { background: white; border-radius: 14px; padding: 12px; display: flex; gap: 10px; align-items: flex-start; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.cart-img { width: 56px; height: 56px; border-radius: 10px; background: #f1f5f9 center/cover no-repeat; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 24px; }
.cart-info { flex: 1; min-width: 0; }
.cart-name { font-size: 13px; font-weight: 700; color: #0f172a; }
.cart-spec { font-size: 11px; color: #64748b; }
.qty-row { display: flex; align-items: center; gap: 4px; margin-top: 6px; }
.qty-btn { width: 32px; height: 32px; border-radius: 8px; border: 2px solid #e2e8f0; background: white; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.qty-input { width: 50px; text-align: center; border: 2px solid #e2e8f0; border-radius: 8px; padding: 4px; font-size: 14px; font-weight: 700; }
.uom-input { width: 50px; border: 2px solid #e2e8f0; border-radius: 8px; padding: 4px 6px; font-size: 12px; color: #64748b; }
.del-btn { border: none; background: none; font-size: 20px; cursor: pointer; padding: 4px; }

.submit-btn { margin: 16px; padding: 16px; border: none; border-radius: 16px; background: linear-gradient(135deg, #10b981, #059669); color: white; font-size: 16px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 16px rgba(16,185,129,0.3); }
.submit-btn:disabled { opacity: 0.5; }

.history-card { background: white; margin: 8px 16px; border-radius: 14px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.history-header { display: flex; justify-content: space-between; align-items: center; }
.mr-number { font-size: 13px; font-weight: 700; color: #0f172a; }
.mr-status { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 3px 8px; text-transform: uppercase; }
.mr-status.pending { background: #fef3c7; color: #92400e; }
.mr-status.approved { background: #d1fae5; color: #065f46; }
.mr-status.rejected { background: #fee2e2; color: #991b1b; }
.mr-status.fulfilled { background: #dbeafe; color: #1e40af; }
.history-meta { font-size: 11px; color: #64748b; margin-top: 4px; }
.mr-priority { font-size: 10px; font-weight: 700; margin-top: 4px; text-transform: uppercase; }
.mr-priority.high { color: #f59e0b; }
.mr-priority.urgent { color: #ef4444; }
.empty { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }

.custom-item-btn { width: 100%; border: 2px dashed #3b82f6; border-radius: 12px; padding: 14px; font-size: 14px; font-weight: 700; color: #3b82f6; background: #eff6ff; cursor: pointer; }
.custom-badge { position: absolute; top: 2px; left: 2px; background: #f59e0b; color: white; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 4px; }
.cart-img { position: relative; }
.cart-notes { font-size: 10px; color: #f59e0b; margin-top: 2px; }
.photo-section { margin-bottom: 8px; }
.photo-preview { width: 100%; height: 200px; border-radius: 14px; background: #f1f5f9 center/cover no-repeat; position: relative; }
.photo-retake { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.photo-placeholder { width: 100%; height: 160px; border: 2px dashed #cbd5e1; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; background: #f8fafc; }
.upload-progress { text-align: center; font-size: 13px; color: #3b82f6; margin-top: 8px; }
.btn-cancel-full { width: 100%; border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 600; color: #64748b; background: white; cursor: pointer; margin-top: 8px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: flex-end; }
.modal-card { background: white; border-radius: 24px 24px 0 0; width: 100%; max-height: 85vh; overflow-y: auto; position: relative; }
.modal-img { height: 200px; background: #f1f5f9 center/cover no-repeat; display: flex; align-items: center; justify-content: center; }
.modal-body { padding: 20px; }
.modal-body h3 { margin: 0 0 8px; font-size: 18px; color: #0f172a; }
.modal-spec { font-size: 14px; color: #3b82f6; font-weight: 600; }
.modal-desc { font-size: 13px; color: #64748b; margin-top: 8px; }
.modal-cat { font-size: 12px; color: #94a3b8; margin-top: 8px; }
.modal-close { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 16px; cursor: pointer; }

.modal-enter-active, .modal-leave-active { transition: all .3s; }
.modal-enter-from .modal-card, .modal-leave-to .modal-card { transform: translateY(100%); }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.toast { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 999; box-shadow: 0 8px 24px rgba(0,0,0,0.2); white-space: nowrap; }
.toast.success { background: #10b981; color: white; }
.toast.error { background: #ef4444; color: white; }
.toast-enter-active, .toast-leave-active { transition: all .3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-16px); }

.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(4, 1fr); height: 64px; box-shadow: 0 -4px 16px rgba(0,0,0,0.08); z-index: 100; }
.nav-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; color: #94a3b8; }
.nav-item.active, .nav-item.router-link-active { color: #3b82f6; }
.nav-ico { font-size: 22px; }
.nav-txt { font-size: 10px; font-weight: 600; }

.mr-baru { border-left: 3px solid #2563eb; }
.mr-dot {
  margin-left: 6px; font-size: 9px; font-weight: 800; letter-spacing: .04em;
  background: #2563eb; color: #fff; border-radius: 6px; padding: 2px 6px; text-transform: uppercase;
}
.mr-kabar {
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
  border-radius: 10px; padding: 10px 12px; font-size: 13px; font-weight: 600; margin-bottom: 10px;
}
.mr-alasan {
  margin-top: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 8px; padding: 8px 10px; font-size: 12px; line-height: 1.45;
}
.mr-lanjut {
  margin-top: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46;
  border-radius: 8px; padding: 8px 10px; font-size: 12px;
}

.antre-box {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;
  padding: 10px 12px; margin-bottom: 12px;
}
.antre-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 6px;
}
.antre-btn {
  border: 0; background: #d97706; color: #fff; border-radius: 8px;
  padding: 5px 10px; font-size: 12px; font-weight: 700;
}
.antre-btn:disabled { opacity: .6; }
.antre-item {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  border-top: 1px solid #fde68a; padding-top: 8px; margin-top: 8px;
}
.antre-ringkas { font-size: 13px; font-weight: 600; color: #78350f; }
.antre-meta { font-size: 11px; color: #a16207; margin-top: 2px; }
.antre-galat { font-size: 11px; color: #991b1b; margin-top: 4px; }
.antre-buang {
  border: 1px solid #fca5a5; background: #fff; color: #b91c1c;
  border-radius: 8px; padding: 4px 8px; font-size: 11px; font-weight: 700;
}

.mr-ulang {
  margin-top: 8px; width: 100%; border: 1px solid #bfdbfe; background: #eff6ff;
  color: #1d4ed8; border-radius: 8px; padding: 7px; font-size: 12px; font-weight: 700;
}
.mr-ulang:disabled { opacity: .5; }
.sering-box {
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;
  padding: 10px 12px; margin-bottom: 12px;
}
.sering-judul { font-size: 12px; font-weight: 800; color: #166534; margin-bottom: 8px; }
.sering-baris { display: flex; flex-wrap: wrap; gap: 6px; }
.sering-chip {
  border: 1px solid #86efac; background: #fff; color: #166534;
  border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 600;
}
.sering-kali { color: #16a34a; font-weight: 800; margin-left: 4px; font-size: 10px; }
</style>
