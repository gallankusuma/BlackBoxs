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

    <!-- HISTORY TAB -->
    <template v-if="tab === 'history'">
      <div v-for="mr in history" :key="mr.id" class="history-card">
        <div class="history-header">
          <span class="mr-number">{{ mr.mr_number }}</span>
          <span class="mr-status" :class="mr.status">{{ mr.status }}</span>
        </div>
        <div class="history-meta">{{ mr.project_name || '-' }} · {{ mr.item_count }} item · {{ formatDate(mr.created_at) }}</div>
        <div v-if="mr.priority && mr.priority !== 'normal'" class="mr-priority" :class="mr.priority">{{ mr.priority }}</div>
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
import axios from 'axios';

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
    const res = await axios.get('/api/material-requests/catalog', { params });
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

async function onPhotoCapture(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  // Preview
  customPhoto.value = URL.createObjectURL(file);
  // Upload to server
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await axios.post('/api/material-requests/upload-photo', fd);
    customPhotoUrl.value = res.data.url;
    showToast('📸 Foto berhasil diupload');
  } catch {
    showToast('Gagal upload foto', 'error');
    customPhoto.value = '';
  } finally { uploading.value = false; }
}

function addCustomItem() {
  if (!customName.value.trim()) return;
  cart.value.push({
    product_id: null,
    item_name: customName.value.trim(),
    spec: customSpec.value.trim() || null,
    image_url: customPhotoUrl.value || null,
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
  customPhoto.value = '';
  customPhotoUrl.value = '';
  showCustomForm.value = false;
}

async function loadHistory() {
  try {
    const res = await axios.get('/api/material-requests/my', { params: { employee_id: emp.value?.id } });
    history.value = res.data.data || [];
  } catch {}
}

async function loadProjects() {
  try {
    const res = await axios.get('/api/material-requests/projects/list');
    projectList.value = res.data.data || [];
  } catch {}
}

async function submitMR() {
  if (!cart.value.length) return;
  submitting.value = true;
  try {
    const proj = projectList.value.find(p => p.id === selectedProject.value);
    await axios.post('/api/material-requests/', {
      employee_id: emp.value?.id,
      employee_name: emp.value?.name,
      project_id: selectedProject.value,
      project_name: proj?.project_name || null,
      priority: priority.value,
      needed_by: neededBy.value || null,
      notes: mrNotes.value || null,
      items: cart.value,
    });
    showToast('✅ Material Request terkirim!');
    cart.value = [];
    tab.value = 'history';
    await loadHistory();
  } catch (e: any) {
    showToast(e?.response?.data?.error || 'Gagal mengirim', 'error');
  } finally { submitting.value = false; }
}

onMounted(() => {
  const stored = localStorage.getItem('mobile_employee');
  if (!stored) { router.push('/mobile'); return; }
  emp.value = JSON.parse(stored);
  loadCatalog();
  loadProjects();
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
</style>
