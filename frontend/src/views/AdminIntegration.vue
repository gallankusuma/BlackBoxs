<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Integrations</h1>

    <!-- Kegagalan tidak lagi ditelan. Versi lama memakai `.catch(() => {})`,
         sehingga badge berubah seolah berhasil padahal setiap penyimpanan 400. -->
    <div v-if="galat" class="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      {{ galat }}
    </div>
    <div v-if="pesan" class="mb-4 rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {{ pesan }}
    </div>

    <!-- Active Integrations -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div v-for="integ in integrations" :key="integ.key"
        class="bg-white rounded shadow p-5 border-l-4"
        :class="integ.enabled ? 'border-green-500' : 'border-gray-300'">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold">{{ integ.name }}</span>
          <span :class="integ.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'" class="text-xs px-2 py-0.5 rounded-full">
            {{ integ.enabled ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mb-3">{{ integ.description }}</p>
        <button @click="toggleInteg(integ)" class="text-sm px-3 py-1 rounded"
          :class="integ.enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'">
          {{ integ.enabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
    </div>

    <!-- API Configuration -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">API Configuration</h3>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">API Base URL</label>
            <input v-model="apiConfig.baseUrl" class="w-full border rounded px-3 py-2 text-sm" placeholder="https://api.example.com" />
          </div>
          <!-- Kolom API Key dicabut, bukan diperbaiki.
               Tombol Save memang tidak pernah menyimpannya — dan itu justru
               menyelamatkan: `system_settings` dibaca `GET /settings/all` yang
               hanya berpagar authMiddleware, jadi kunci yang tersimpan di sana
               terbaca SELURUH pengguna desktop. Membuatnya "berfungsi" berarti
               membuat kebocoran. -->
          <div>
            <label class="block text-sm font-medium mb-1">API Key</label>
            <div class="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Kunci API tidak disimpan di sini. Pengaturan ini terbaca seluruh
              pengguna, jadi rahasia disetel di <strong>environment server</strong>
              (seperti <code>GEMINI_API_KEY</code>), bukan lewat layar.
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Timeout (ms)</label>
            <input type="number" v-model.number="apiConfig.timeout" class="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Retry Attempts</label>
            <input type="number" v-model.number="apiConfig.retries" class="w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <button @click="saveApiConfig" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Save API Config</button>
      </div>
    </div>

    <!-- Webhook Configuration -->
    <div class="bg-white rounded shadow p-5">
      <h3 class="font-semibold mb-1">Webhooks</h3>
      <p class="text-xs text-amber-700 mb-4">
        Webhook tersimpan di server, tetapi <strong>pengirimannya belum aktif</strong> —
        mengirim data keluar ke alamat pihak ketiga adalah keputusan tersendiri.
      </p>
      <div class="space-y-2 mb-4">
        <!-- Status kirimnya dinyatakan apa adanya. Webhook terdaftar yang tidak
             pernah terkirim lebih berbahaya daripada yang belum didaftarkan:
             orang berhenti memeriksa karena mengira sudah jalan. -->
        <div v-for="wh in webhooks" :key="wh.id" class="flex items-center gap-3 border rounded p-3">
          <div class="flex-1">
            <p class="text-sm font-medium">{{ wh.event }}</p>
            <p class="text-xs text-gray-400 truncate">{{ wh.url }}</p>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
            terdaftar · pengiriman belum aktif
          </span>
          <button @click="hapusWebhook(wh)" class="text-red-400 text-xs hover:text-red-600">Remove</button>
        </div>
        <p v-if="!webhooks.length" class="text-sm text-gray-400 text-center py-2">No webhooks configured</p>
      </div>

      <div class="border-t pt-4">
        <h4 class="text-sm font-medium mb-2">Add Webhook</h4>
        <div class="grid grid-cols-3 gap-3">
          <select v-model="newWebhook.event" class="border rounded px-3 py-2 text-sm">
            <option value="">Select event</option>
            <option value="approval.created">Approval Created</option>
            <option value="approval.completed">Approval Completed</option>
            <option value="po.created">PO Created</option>
            <option value="grn.received">GRN Received</option>
            <option value="wo.completed">WO Completed</option>
            <option value="inventory.low_stock">Low Stock</option>
          </select>
          <input v-model="newWebhook.url" class="border rounded px-3 py-2 text-sm" placeholder="https://hooks.example.com/..." />
          <button @click="addWebhook" :disabled="!newWebhook.event || !newWebhook.url"
            class="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Halaman Integration — sebelumnya control plane semu.
 *
 * Tiga hal yang membuatnya berbohong, dan ketiganya diperbaiki di sini:
 *
 *   1. Status connector dimulai dari array lokal `enabled: false` dan tidak
 *      pernah dihidrasi dari server. Halaman dimuat ulang → semua kembali
 *      "Inactive" apa pun yang tersimpan.
 *   2. Store mengirim `{ value }` sementara backend menuntut `setting_value`,
 *      jadi SETIAP penyimpanan 400 — lalu errornya ditelan `.catch(() => {})`
 *      dan badge tetap berubah seolah berhasil.
 *   3. Webhook hanya `push()` ke array di memori browser: hilang saat reload,
 *      tidak pernah sampai ke server, tetapi berlabel "Active".
 */
import { ref, reactive, onMounted } from 'vue';
import { api } from '@/lib/api';

const galat = ref('');
const pesan = ref('');
const memuat = ref(false);

const integrations = ref([
  { key: 'email', name: 'Email (SMTP)', description: 'Send email notifications and reports via SMTP server', enabled: false },
  { key: 'accounting', name: 'Accounting Software', description: 'Sync financial data with external accounting system', enabled: false },
  { key: 'ecommerce', name: 'E-Commerce', description: 'Import sales orders from online store', enabled: false },
  { key: 'shipping', name: 'Shipping / Logistics', description: 'Integrate with shipping carriers for tracking', enabled: false },
  { key: 'barcode', name: 'Barcode Scanner', description: 'Enable barcode scanning for inventory operations', enabled: false },
  { key: 'bi_tool', name: 'BI / Analytics', description: 'Export data to business intelligence platform', enabled: false },
]);

const apiConfig = reactive({ baseUrl: '', timeout: 30000, retries: 3 });
const webhooks = ref<any[]>([]);
const newWebhook = reactive({ event: '', url: '' });

const uraikan = (e: any) =>
  e?.response?.data?.error || e?.message || 'Permintaan gagal.';

/** Hidrasi dari server — inilah yang dulu tidak pernah terjadi. */
async function muat() {
  memuat.value = true;
  galat.value = '';
  try {
    const [s, w] = await Promise.all([
      api.get('/settings/all'),
      api.get('/settings/webhooks'),
    ]);
    const peta: Record<string, string> = {};
    for (const row of (s.data?.data || [])) peta[row.setting_key] = row.setting_value;

    for (const it of integrations.value) {
      it.enabled = peta[`integration_${it.key}`] === 'true';
    }
    apiConfig.baseUrl = peta['api_base_url'] || '';
    apiConfig.timeout = Number(peta['api_timeout']) || 30000;
    apiConfig.retries = Number(peta['api_retries']) || 3;

    webhooks.value = w.data?.data || [];
  } catch (e: any) {
    galat.value = 'Gagal memuat konfigurasi: ' + uraikan(e);
  } finally {
    memuat.value = false;
  }
}

/**
 * Toggle connector.
 *
 * Badge diubah SESUDAH server menerima, bukan sebelum. Versi lama membaliknya
 * lebih dulu lalu menelan kegagalan — sehingga layar dan database bisa
 * berbeda tanpa ada yang tahu.
 */
async function toggleInteg(integ: any) {
  const target = !integ.enabled;
  galat.value = ''; pesan.value = '';
  try {
    await api.put(`/settings/integration_${integ.key}`, { setting_value: target ? 'true' : 'false' });
    integ.enabled = target;
    pesan.value = `${integ.name} ${target ? 'diaktifkan' : 'dinonaktifkan'}.`;
  } catch (e: any) {
    galat.value = `Gagal mengubah ${integ.name}: ` + uraikan(e);
  }
}

/**
 * Simpan konfigurasi API.
 *
 * Ditunggu sampai selesai sebelum melapor. Versi lama menembakkan tiga
 * permintaan tanpa `await` lalu langsung menampilkan alert sukses — laporan
 * keberhasilan yang tidak pernah memeriksa apa pun.
 */
async function saveApiConfig() {
  galat.value = ''; pesan.value = '';
  try {
    await Promise.all([
      api.put('/settings/api_base_url', { setting_value: apiConfig.baseUrl }),
      api.put('/settings/api_timeout', { setting_value: String(apiConfig.timeout) }),
      api.put('/settings/api_retries', { setting_value: String(apiConfig.retries) }),
    ]);
    pesan.value = 'Konfigurasi API tersimpan.';
  } catch (e: any) {
    galat.value = 'Konfigurasi API gagal disimpan: ' + uraikan(e);
  }
}

async function addWebhook() {
  if (!newWebhook.event || !newWebhook.url) return;
  galat.value = ''; pesan.value = '';
  try {
    await api.post('/settings/webhooks', { event: newWebhook.event, url: newWebhook.url });
    newWebhook.event = ''; newWebhook.url = '';
    await muat();
    pesan.value = 'Webhook terdaftar. Pengirimannya belum aktif.';
  } catch (e: any) {
    galat.value = 'Gagal mendaftarkan webhook: ' + uraikan(e);
  }
}

async function hapusWebhook(wh: any) {
  galat.value = ''; pesan.value = '';
  try {
    await api.delete(`/settings/webhooks/${wh.id}`);
    await muat();
  } catch (e: any) {
    // Gagal di server = tidak terhapus. Barisnya dipertahankan supaya layar
    // tidak berbohong tentang keadaan data.
    galat.value = 'Gagal menghapus webhook: ' + uraikan(e);
  }
}

onMounted(muat);
</script>
