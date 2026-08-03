<template>
  <div class="page-wrap">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">📍 Lokasi Absensi GPS</h1>
        <p class="page-sub">Daftarkan titik-titik lokasi kerja. Karyawan wajib berada dalam radius yang ditentukan saat melakukan absensi sidik jari.</p>
      </div>
      <button @click="openAdd" class="btn-primary">+ Tambah Lokasi</button>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-val">{{ offices.length }}</div>
        <div class="stat-lbl">Total Lokasi</div>
      </div>
      <div class="stat-card">
        <div class="stat-val green">{{ offices.filter(o => o.is_active).length }}</div>
        <div class="stat-lbl">Aktif</div>
      </div>
      <div class="stat-card">
        <div class="stat-val blue">{{ credCount }}</div>
        <div class="stat-lbl">Karyawan Terdaftar</div>
      </div>
    </div>

    <!-- Table -->
    <div class="table-card">
      <div v-if="loading" class="loading-wrap">
        <div class="spinner"></div> Memuat data...
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nama Lokasi</th>
            <th>Koordinat GPS</th>
            <th>Radius</th>
            <th>Proyek Terkait</th>
            <th>Status</th>
            <th>Map</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!offices.length">
            <td colspan="8" class="empty-row">Belum ada lokasi terdaftar. Klik "+ Tambah Lokasi" untuk mulai.</td>
          </tr>
          <tr v-for="(office, i) in offices" :key="office.id" :class="!office.is_active ? 'row-inactive' : ''">
            <td class="td-num">{{ i + 1 }}</td>
            <td>
              <div class="loc-name">{{ office.name }}</div>
            </td>
            <td>
              <div class="coord-badge">
                <span>{{ Number(office.latitude).toFixed(6) }}</span>
                <span class="coord-sep">,</span>
                <span>{{ Number(office.longitude).toFixed(6) }}</span>
              </div>
            </td>
            <td>
              <div class="radius-pill">{{ office.radius_m }}m</div>
            </td>
            <td class="td-project">{{ office.project_name || '—' }}</td>
            <td>
              <span class="status-badge" :class="office.is_active ? 'active' : 'inactive'"
                @click="toggleStatus(office)" style="cursor:pointer">
                {{ office.is_active ? '✓ Aktif' : '✗ Nonaktif' }}
              </span>
            </td>
            <td>
              <a :href="`https://maps.google.com/?q=${office.latitude},${office.longitude}`"
                target="_blank" class="btn-map" title="Buka di Google Maps">🗺️</a>
            </td>
            <td>
              <div class="action-row">
                <button @click="openEdit(office)" class="btn-edit">Edit</button>
                <button @click="deleteOffice(office)" class="btn-del">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Info section -->
    <div class="info-card">
      <div class="info-title">ℹ️ Cara Penggunaan</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-ico">1️⃣</div>
          <div class="info-text">
            <strong>Admin mendaftarkan lokasi di sini</strong> — kantor, gudang, proyek lapangan, dll.
            Gunakan Google Maps untuk mendapatkan koordinat yang tepat.
          </div>
        </div>
        <div class="info-item">
          <div class="info-ico">2️⃣</div>
          <div class="info-text">
            <strong>Karyawan saat setup HP</strong> — memilih lokasi dari daftar ini, lalu scan sidik jari.
            Tidak perlu capture GPS sendiri.
          </div>
        </div>
        <div class="info-item">
          <div class="info-ico">3️⃣</div>
          <div class="info-text">
            <strong>Setiap absen</strong> — sistem cek: sidik jari cocok ✓ DAN berada dalam radius lokasi ✓.
            Jika salah satu gagal → absen ditolak.
          </div>
        </div>
      </div>
      <div class="tip-box">
        💡 <strong>Tips:</strong> Untuk proyek lapangan yang besar, gunakan radius 500m–1km.
        Untuk kantor dalam gedung, gunakan 100–200m.
        Koordinat bisa didapat dari <a href="https://maps.google.com" target="_blank" class="link">Google Maps</a> → klik kanan → "Apa yang ada di sini?"
      </div>
    </div>

    <!-- Modal Add/Edit -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-box">
        <div class="modal-header">
          <h2>{{ editingId ? 'Edit Lokasi' : 'Tambah Lokasi Absensi' }}</h2>
          <button @click="closeModal" class="btn-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>Nama Lokasi <span class="required">*</span></label>
            <input v-model="form.name" type="text" placeholder="Kantor Pusat / Proyek Jembatan X / Workshop" class="form-input" />
          </div>

          <div class="form-row-2">
            <div class="form-row">
              <label>Latitude <span class="required">*</span></label>
              <input v-model="form.latitude" type="number" step="0.0000001" placeholder="-6.2000000" class="form-input" />
            </div>
            <div class="form-row">
              <label>Longitude <span class="required">*</span></label>
              <input v-model="form.longitude" type="number" step="0.0000001" placeholder="106.8000000" class="form-input" />
            </div>
          </div>

          <!-- GPS Helper -->
          <div class="gps-helper">
            <div class="gps-helper-title">📍 Cara mudah mendapatkan koordinat:</div>
            <ol class="gps-steps">
              <li>Buka <a href="https://maps.google.com" target="_blank" class="link">maps.google.com</a></li>
              <li>Cari lokasi kantor/proyek</li>
              <li>Klik kanan → "Apa yang ada di sini?"</li>
              <li>Salin angka desimal yang muncul (misal: -6.234567, 106.789012)</li>
            </ol>
            <button @click="getMyGPS" :disabled="detectingGPS" class="btn-gps">
              {{ detectingGPS ? '⏳ Mendeteksi...' : '📍 Atau gunakan GPS browser saya sekarang' }}
            </button>
          </div>

          <div class="form-row">
            <label>Radius Toleransi (meter) <span class="required">*</span></label>
            <div class="radius-options">
              <label v-for="r in [100, 200, 300, 500, 1000]" :key="r" class="radius-opt" :class="form.radius_m == r ? 'selected' : ''">
                <input type="radio" :value="r" v-model="form.radius_m" style="display:none" />
                <span class="r-val">{{ r }}m</span>
                <span class="r-desc">{{ r <= 100 ? 'Gedung' : r <= 200 ? 'Kantor' : r <= 300 ? 'Komplek' : r <= 500 ? 'Proyek' : 'Lapangan' }}</span>
              </label>
            </div>
          </div>

          <div class="form-row">
            <label>Keterangan / Proyek (opsional)</label>
            <input v-model="form.description" type="text" placeholder="Proyek Jembatan Cisadane 2024" class="form-input" />
          </div>

          <div class="form-row">
            <label class="checkbox-row">
              <input type="checkbox" v-model="form.is_active" />
              <span>Aktifkan lokasi ini</span>
            </label>
          </div>

          <div v-if="formError" class="form-error">⚠️ {{ formError }}</div>
        </div>
        <div class="modal-footer">
          <button @click="closeModal" class="btn-cancel">Batal</button>
          <button @click="saveOffice" :disabled="saving" class="btn-save">
            {{ saving ? 'Menyimpan...' : editingId ? '💾 Simpan Perubahan' : '✅ Tambah Lokasi' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const offices   = ref<any[]>([]);
const loading   = ref(false);
const saving    = ref(false);
const showModal = ref(false);
const editingId = ref<number|null>(null);
const formError = ref('');
const detectingGPS = ref(false);
const credCount = ref(0);

const form = ref({
  name: '', latitude: '', longitude: '', radius_m: 200,
  description: '', is_active: true,
});

async function loadOffices() {
  loading.value = true;
  try {
    const res = await axios.get('/api/webauthn/offices', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    offices.value = res.data.data || [];
  } catch { offices.value = []; }
  finally { loading.value = false; }
}

async function loadCredCount() {
  try {
    // Count total unique employees with credentials
    const res = await axios.get('/api/webauthn/credentials/count', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    credCount.value = res.data.count || 0;
  } catch { credCount.value = 0; }
}

function openAdd() {
  editingId.value = null;
  form.value = { name: '', latitude: '', longitude: '', radius_m: 200, description: '', is_active: true };
  formError.value = '';
  showModal.value = true;
}

function openEdit(office: any) {
  editingId.value = office.id;
  form.value = {
    name: office.name, latitude: office.latitude, longitude: office.longitude,
    radius_m: office.radius_m, description: office.project_name || '', is_active: !!office.is_active,
  };
  formError.value = '';
  showModal.value = true;
}

function closeModal() { showModal.value = false; }

async function getMyGPS() {
  detectingGPS.value = true;
  try {
    const pos: any = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: true })
    );
    form.value.latitude  = String(pos.coords.latitude.toFixed(7));
    form.value.longitude = String(pos.coords.longitude.toFixed(7));
  } catch {
    alert('GPS tidak tersedia di browser ini. Salin koordinat dari Google Maps.');
  } finally { detectingGPS.value = false; }
}

async function saveOffice() {
  formError.value = '';
  if (!form.value.name.trim()) { formError.value = 'Nama lokasi wajib diisi'; return; }
  if (!form.value.latitude || !form.value.longitude) { formError.value = 'Koordinat GPS wajib diisi'; return; }

  saving.value = true;
  const payload = {
    name: form.value.name.trim(),
    latitude: parseFloat(String(form.value.latitude)),
    longitude: parseFloat(String(form.value.longitude)),
    radius_m: Number(form.value.radius_m),
    project_id: null,
    is_active: form.value.is_active ? 1 : 0,
  };
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  try {
    if (editingId.value) {
      await axios.put(`/api/webauthn/offices/${editingId.value}`, payload, { headers });
    } else {
      await axios.post('/api/webauthn/offices', payload, { headers });
    }
    closeModal();
    await loadOffices();
  } catch (e: any) {
    formError.value = e?.response?.data?.error || 'Gagal menyimpan';
  } finally { saving.value = false; }
}

async function toggleStatus(office: any) {
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  await axios.put(`/api/webauthn/offices/${office.id}`, {
    name: office.name, latitude: office.latitude, longitude: office.longitude,
    radius_m: office.radius_m, is_active: office.is_active ? 0 : 1,
  }, { headers });
  await loadOffices();
}

async function deleteOffice(office: any) {
  if (!confirm(`Hapus lokasi "${office.name}"?\n\nKaryawan yang terdaftar di lokasi ini tidak bisa absen. Pastikan mereka sudah dipindahkan ke lokasi lain.`)) return;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  await axios.delete(`/api/webauthn/offices/${office.id}`, { headers });
  await loadOffices();
}

onMounted(async () => {
  await Promise.all([loadOffices(), loadCredCount()]);
});
</script>

<style scoped>
* { box-sizing: border-box; }
.page-wrap { padding: 28px; display: flex; flex-direction: column; gap: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.page-title { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
.page-sub { font-size: 13px; color: #64748b; max-width: 560px; line-height: 1.5; }
.btn-primary { background: linear-gradient(135deg, #1d4ed8, #7c3aed); color: white; border: none; border-radius: 10px; padding: 10px 20px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
.btn-primary:hover { transform: translateY(-1px); }

/* Stats */
.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.stat-card { background: white; border-radius: 14px; padding: 18px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: center; }
.stat-val { font-size: 32px; font-weight: 800; color: #0f172a; }
.stat-val.green { color: #10b981; }
.stat-val.blue { color: #3b82f6; }
.stat-lbl { font-size: 12px; color: #64748b; margin-top: 4px; }

/* Table */
.table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.loading-wrap { padding: 40px; text-align: center; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 10px; }
.spinner { width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { background: #f8fafc; padding: 12px 14px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.data-table td { padding: 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: #fafbff; }
.row-inactive td { opacity: 0.5; }
.empty-row { text-align: center; color: #94a3b8; padding: 40px !important; }
.td-num { color: #94a3b8; font-size: 12px; width: 40px; }
.loc-name { font-weight: 700; color: #0f172a; font-size: 14px; }
.coord-badge { font-family: monospace; font-size: 11px; color: #1d4ed8; background: #eff6ff; padding: 4px 8px; border-radius: 6px; white-space: nowrap; }
.coord-sep { color: #94a3b8; margin: 0 2px; }
.radius-pill { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 700; display: inline-block; }
.td-project { color: #64748b; font-size: 12px; }
.status-badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-block; transition: all .2s; }
.status-badge.active { background: #dcfce7; color: #15803d; }
.status-badge.inactive { background: #f1f5f9; color: #94a3b8; }
.btn-map { font-size: 18px; text-decoration: none; cursor: pointer; }
.action-row { display: flex; gap: 6px; }
.btn-edit { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-del { background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }

/* Info card */
.info-card { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 20px; }
.info-title { font-size: 14px; font-weight: 700; color: #1d4ed8; margin-bottom: 14px; }
.info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 14px; }
.info-item { display: flex; gap: 10px; align-items: flex-start; }
.info-ico { font-size: 22px; flex-shrink: 0; }
.info-text { font-size: 12px; color: #374151; line-height: 1.5; }
.tip-box { background: white; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #374151; line-height: 1.5; }
.link { color: #1d4ed8; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-box { background: white; border-radius: 20px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 48px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
.modal-header h2 { font-size: 18px; font-weight: 800; color: #0f172a; }
.btn-close { background: #f1f5f9; border: none; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 16px; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 13px; font-weight: 600; color: #374151; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 14px; width: 100%; }
.form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.required { color: #ef4444; }
.gps-helper { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
.gps-helper-title { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 8px; }
.gps-steps { font-size: 12px; color: #64748b; padding-left: 16px; margin-bottom: 10px; line-height: 1.8; }
.btn-gps { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; }
.btn-gps:disabled { opacity: 0.5; cursor: not-allowed; }
.radius-options { display: flex; gap: 8px; flex-wrap: wrap; }
.radius-opt { border: 2px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; cursor: pointer; text-align: center; transition: all .2s; min-width: 72px; }
.radius-opt.selected { border-color: #3b82f6; background: #eff6ff; }
.r-val { display: block; font-size: 15px; font-weight: 800; color: #0f172a; }
.r-desc { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
.radius-opt.selected .r-val { color: #1d4ed8; }
.checkbox-row { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
.form-error { background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; color: #b91c1c; font-size: 13px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #f1f5f9; }
.btn-cancel { background: #f1f5f9; border: none; border-radius: 10px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; color: #374151; }
.btn-save { background: linear-gradient(135deg, #1d4ed8, #7c3aed); color: white; border: none; border-radius: 10px; padding: 10px 24px; font-size: 14px; font-weight: 700; cursor: pointer; }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
