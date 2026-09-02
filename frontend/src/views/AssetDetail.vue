<template>
  <div class="p-6 max-w-5xl mx-auto" v-if="asset">
    <button @click="$router.push('/assets')" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
      ← Kembali ke Asset Register
    </button>

    <div class="flex items-start justify-between mb-5">
      <div>
        <div class="text-xs text-gray-400 font-mono">{{ asset.asset_code }}</div>
        <h1 class="text-xl font-bold text-gray-800">{{ asset.name }}</h1>
        <div class="flex items-center gap-2 mt-1">
          <span class="px-2 py-0.5 bg-gray-100 rounded text-xs">{{ asset.category_name }}</span>
          <span v-if="asset.production_line_name" class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{{ asset.production_line_name }}</span>
          <span v-if="asset.pnid_code" class="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{{ asset.pnid_code }}</span>
          <span v-if="asset.pnid_tag" class="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">Tag: {{ asset.pnid_tag }}</span>
          <span :class="statusBadge(asset.status)" class="px-2 py-0.5 rounded text-xs font-medium">{{ statusLabel(asset.status) }}</span>
        </div>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-4 gap-3 mb-5">
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Harga Beli</div>
        <div class="text-lg font-bold text-gray-800">{{ formatCurrency(asset.purchase_price) }}</div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Akumulasi Penyusutan</div>
        <div class="text-lg font-bold text-red-600">{{ formatCurrency(asset.accumulated_depreciation) }}</div>
        <div v-if="asset.depreciation_note" class="text-[10px] text-amber-600 mt-1">{{ asset.depreciation_note }}</div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Nilai Buku Saat Ini</div>
        <div class="text-lg font-bold text-green-700">{{ formatCurrency(asset.book_value) }}</div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">% Terdepresiasi</div>
        <div class="text-lg font-bold text-gray-800">{{ asset.percent_depreciated }}%</div>
        <div class="w-full bg-gray-100 rounded-full h-1.5 mt-1">
          <div class="bg-red-400 h-1.5 rounded-full" :style="`width:${Math.min(asset.percent_depreciated,100)}%`"></div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
      <button v-for="t in tabs" :key="t.id" @click="activeTab = t.id"
        :class="activeTab === t.id ? 'bg-white text-blue-600 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'"
        class="px-4 py-1.5 rounded-lg text-sm transition-all">
        {{ t.label }}
      </button>
    </div>

    <!-- Ringkasan / Spec -->
    <div v-if="activeTab === 'spec'" class="bg-white border rounded-xl p-6 space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Nama Aset</label>
          <input v-model="editForm.name" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select v-model="editForm.status" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="active">Aktif</option>
            <option value="under_maintenance">Perbaikan</option>
            <option value="idle">Idle</option>
            <option value="disposed">Dilepas</option>
          </select></div>
      </div>
      <div class="grid grid-cols-2 gap-3" v-if="asset.production_line_name || asset.pnid_tag">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Line Produksi</label>
          <select v-model.number="editForm.production_line_id" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option :value="null">— Tidak ada —</option>
            <option v-for="p in productionLines" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Tag P&amp;ID</label>
          <input v-model="editForm.pnid_tag" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
      </div>
      <div v-else><label class="block text-xs font-medium text-gray-600 mb-1">Lokasi</label>
        <input v-model="editForm.location" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"></div>

      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Tgl. Beli</label>
          <input v-model="editForm.purchase_date" type="date" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Tgl. Siap Digunakan</label>
          <input v-model="editForm.in_service_date" type="date" class="w-full border rounded-lg px-3 py-2 text-sm">
          <p class="text-[10px] text-gray-400 mt-0.5">Awal depresiasi. Kosong = pakai tgl. beli.</p></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Harga Beli (Rp)</label>
          <input v-model.number="editForm.purchase_price" type="number" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
          <input v-model="editForm.vendor" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Umur Ekonomis (thn)</label>
          <input v-model.number="editForm.useful_life_years" type="number" min="1" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Nilai Residu (Rp)</label>
          <input v-model.number="editForm.salvage_value" type="number" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Metode Depresiasi</label>
          <select v-model="editForm.depreciation_method" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="straight_line">Garis Lurus</option>
            <option value="declining_balance">Saldo Menurun</option>
          </select></div>
      </div>
      <div><label class="block text-xs font-medium text-gray-600 mb-1">Catatan</label>
        <textarea v-model="editForm.notes" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm"></textarea></div>

      <div class="flex justify-end">
        <button @click="saveSpec" :disabled="saving" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {{ saving ? 'Menyimpan...' : '💾 Simpan Perubahan' }}
        </button>
      </div>
    </div>

    <!-- Dokumen -->
    <div v-if="activeTab === 'documents'" class="bg-white border rounded-xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-700">📄 Dokumen Terkait</h3>
        <label class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 cursor-pointer">
          + Upload Dokumen
          <input type="file" class="hidden" @change="uploadDocument">
        </label>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-3 py-2">Judul</th><th class="px-3 py-2">Kategori</th><th class="px-3 py-2">Diupload</th><th class="px-3 py-2"></th>
        </tr></thead>
        <tbody>
          <tr v-if="!documents.length"><td colspan="4" class="text-center py-6 text-gray-400">Belum ada dokumen.</td></tr>
          <tr v-for="d in documents" :key="d.id" class="border-b">
            <td class="px-3 py-2">{{ d.doc_title }}</td>
            <td class="px-3 py-2"><span class="px-2 py-0.5 bg-gray-100 rounded text-xs">{{ d.doc_category }}</span></td>
            <td class="px-3 py-2 text-gray-500">{{ formatDate(d.uploaded_at) }} — {{ d.uploader_name || '-' }}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <button @click="downloadDocument(d)" :disabled="downloadingId === d.id"
                class="text-blue-600 hover:underline text-xs mr-3 disabled:text-gray-400">
                {{ downloadingId === d.id ? 'Mengunduh...' : 'Download' }}
              </button>
              <button @click="deleteDocument(d)" class="text-gray-400 hover:text-red-600">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Riwayat Perbaikan -->
    <div v-if="activeTab === 'maintenance'" class="bg-white border rounded-xl p-6">
      <h3 class="font-semibold text-gray-700 mb-4">🔧 Riwayat Perbaikan / Maintenance</h3>
      <div class="grid grid-cols-6 gap-2 mb-4 items-end bg-gray-50 border rounded-lg p-3">
        <div><label class="block text-[10px] text-gray-500 mb-1">Tipe</label>
          <select v-model="maintForm.maintenance_type" class="w-full border rounded px-2 py-1.5 text-xs">
            <option value="preventive">Preventive</option>
            <option value="corrective">Corrective</option>
            <option value="inspection">Inspection</option>
          </select></div>
        <div class="col-span-2"><label class="block text-[10px] text-gray-500 mb-1">Deskripsi</label>
          <input v-model="maintForm.description" type="text" class="w-full border rounded px-2 py-1.5 text-xs"></div>
        <div><label class="block text-[10px] text-gray-500 mb-1">Biaya (Rp)</label>
          <input v-model.number="maintForm.cost" type="number" class="w-full border rounded px-2 py-1.5 text-xs"></div>
        <div><label class="block text-[10px] text-gray-500 mb-1">Tgl. Perbaikan</label>
          <input v-model="maintForm.performed_at" type="date" class="w-full border rounded px-2 py-1.5 text-xs"></div>
        <button @click="addMaintenance" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">+ Tambah</button>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-3 py-2">Tanggal</th><th class="px-3 py-2">Tipe</th><th class="px-3 py-2">Deskripsi</th>
          <th class="px-3 py-2">Vendor</th><th class="px-3 py-2 text-right">Biaya</th><th class="px-3 py-2"></th>
        </tr></thead>
        <tbody>
          <tr v-if="!maintenanceLogs.length"><td colspan="6" class="text-center py-6 text-gray-400">Belum ada riwayat perbaikan.</td></tr>
          <tr v-for="m in maintenanceLogs" :key="m.id" class="border-b">
            <td class="px-3 py-2">{{ formatDate(m.performed_at) }}</td>
            <td class="px-3 py-2"><span class="px-2 py-0.5 bg-gray-100 rounded text-xs">{{ m.maintenance_type }}</span></td>
            <td class="px-3 py-2">{{ m.description || '-' }}</td>
            <td class="px-3 py-2 text-gray-500">{{ m.vendor || '-' }}</td>
            <td class="px-3 py-2 text-right">{{ formatCurrency(m.cost) }}</td>
            <td class="px-3 py-2 text-right"><button @click="deleteMaintenance(m)" class="text-gray-400 hover:text-red-600">🗑</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Lokasi & Kondisi (AST-CUSTODY-01) -->
    <div v-if="activeTab === 'custody'" class="bg-white border rounded-xl p-6 space-y-6">
      <div class="flex items-start justify-between gap-6">
        <div>
          <div class="text-[11px] text-gray-500 uppercase">Sekarang berada di</div>
          <div class="text-lg font-semibold text-gray-800">{{ lokasiSekarang }}</div>
          <div v-if="asset?.current_since" class="text-xs text-gray-500">sejak {{ formatDate(asset.current_since) }}</div>
        </div>
        <div class="text-right">
          <div class="text-[11px] text-gray-500 uppercase mb-1">Kondisi</div>
          <span class="px-2.5 py-1 rounded text-xs font-semibold" :class="kelasKondisi">{{ labelKondisi }}</span>
          <div class="mt-2 flex items-center gap-1 justify-end">
            <select v-model="kondisiBaru" class="border rounded px-2 py-1 text-xs">
              <option value="baik">Baik</option>
              <option value="perlu_perbaikan">Perlu perbaikan</option>
              <option value="rusak">Rusak</option>
            </select>
            <input v-model="kondisiCatatan" type="text" placeholder="catatan" class="border rounded px-2 py-1 text-xs w-36" />
            <button @click="simpanKondisi" class="px-2.5 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-800">Simpan</button>
          </div>
        </div>
      </div>

      <!-- Alat berkondisi tidak baik memang tidak boleh dikirim ke proyek;
           dikatakan di layar supaya tombolnya tidak sekadar menolak diam-diam. -->
      <p v-if="asset?.condition && asset.condition !== 'baik'"
         class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Alat ini berkondisi <strong>{{ labelKondisi }}</strong>, jadi belum bisa dikirim ke proyek.
        Pemindahan ke workshop atau vendor perbaikan tetap bisa dilakukan.
      </p>

      <div class="bg-gray-50 border rounded-lg p-3">
        <div class="text-[11px] text-gray-500 uppercase mb-2">Catat perpindahan</div>
        <div class="grid grid-cols-6 gap-2 items-end">
          <div><label class="block text-[10px] text-gray-500 mb-1">Tujuan</label>
            <select v-model="pindahForm.to_type" class="w-full border rounded px-2 py-1.5 text-xs">
              <option value="project">Proyek</option>
              <option value="workshop">Workshop</option>
              <option value="vendor">Vendor / bengkel</option>
            </select></div>
          <div class="col-span-2" v-if="pindahForm.to_type === 'project'">
            <label class="block text-[10px] text-gray-500 mb-1">Proyek</label>
            <select v-model.number="pindahForm.to_project_id" class="w-full border rounded px-2 py-1.5 text-xs">
              <option :value="null">— pilih proyek —</option>
              <option v-for="p in daftarProyek" :key="p.id" :value="p.id">{{ p.title || p.project_name }}</option>
            </select></div>
          <div class="col-span-2" v-else>
            <label class="block text-[10px] text-gray-500 mb-1">Nama tempat</label>
            <input v-model="pindahForm.to_label" type="text" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="mis. Workshop Pusat" /></div>
          <div><label class="block text-[10px] text-gray-500 mb-1">Diterima oleh</label>
            <input v-model="pindahForm.received_by" type="text" class="w-full border rounded px-2 py-1.5 text-xs" /></div>
          <div><label class="block text-[10px] text-gray-500 mb-1">Catatan</label>
            <input v-model="pindahForm.notes" type="text" class="w-full border rounded px-2 py-1.5 text-xs" /></div>
          <button @click="catatPerpindahan" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">+ Pindahkan</button>
        </div>
      </div>

      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-3 py-2">Tanggal</th><th class="px-3 py-2">Dari</th><th class="px-3 py-2">Ke</th>
          <th class="px-3 py-2">Kondisi saat pindah</th><th class="px-3 py-2">Diterima</th><th class="px-3 py-2">Oleh</th>
        </tr></thead>
        <tbody>
          <tr v-if="!perpindahan.length"><td colspan="6" class="text-center py-6 text-gray-400">Belum ada perpindahan tercatat.</td></tr>
          <tr v-for="m in perpindahan" :key="m.id" class="border-b">
            <td class="px-3 py-2">{{ formatDate(m.moved_at) }}</td>
            <td class="px-3 py-2 text-gray-500">{{ namaTempat(m.from_type, m.from_project_name, m.from_label) }}</td>
            <td class="px-3 py-2 font-medium">{{ namaTempat(m.to_type, m.to_project_name, m.to_label) }}</td>
            <td class="px-3 py-2"><span class="px-2 py-0.5 bg-gray-100 rounded text-xs">{{ m.condition_at_move || '-' }}</span></td>
            <td class="px-3 py-2 text-gray-500">{{ m.received_by || '-' }}</td>
            <td class="px-3 py-2 text-gray-500">{{ m.moved_by_name || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Riwayat Pembelian -->
    <div v-if="activeTab === 'purchases'" class="bg-white border rounded-xl p-6">
      <h3 class="font-semibold text-gray-700 mb-4">🧾 Riwayat Pembelian / Penambahan Nilai</h3>
      <div class="grid grid-cols-7 gap-2 mb-4 items-end bg-gray-50 border rounded-lg p-3">
        <div><label class="block text-[10px] text-gray-500 mb-1">Jenis</label>
          <select v-model="purchForm.entry_type" class="w-full border rounded px-2 py-1.5 text-xs">
            <option value="expense">Biaya</option>
            <option value="capital_addition">Penambahan Nilai</option>
            <option value="replacement">Penggantian</option>
            <option value="improvement">Perbaikan</option>
          </select>
          <p class="text-[9px] text-gray-400 mt-0.5">Hanya "Penambahan Nilai" menambah basis depresiasi.</p></div>
        <div class="col-span-2"><label class="block text-[10px] text-gray-500 mb-1">Deskripsi</label>
          <input v-model="purchForm.description" type="text" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="mis. Upgrade motor"></div>
        <div><label class="block text-[10px] text-gray-500 mb-1">Jumlah (Rp)</label>
          <input v-model.number="purchForm.amount" type="number" class="w-full border rounded px-2 py-1.5 text-xs"></div>
        <div><label class="block text-[10px] text-gray-500 mb-1">Tgl. Beli</label>
          <input v-model="purchForm.purchase_date" type="date" class="w-full border rounded px-2 py-1.5 text-xs"></div>
        <div><label class="block text-[10px] text-gray-500 mb-1">Vendor</label>
          <input v-model="purchForm.vendor" type="text" class="w-full border rounded px-2 py-1.5 text-xs"></div>
        <button @click="addPurchase" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">+ Tambah</button>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-3 py-2">Tanggal</th><th class="px-3 py-2">Jenis</th><th class="px-3 py-2">Deskripsi</th>
          <th class="px-3 py-2">Vendor</th><th class="px-3 py-2 text-right">Jumlah</th><th class="px-3 py-2"></th>
        </tr></thead>
        <tbody>
          <tr v-if="!purchaseHistory.length"><td colspan="6" class="text-center py-6 text-gray-400">Belum ada riwayat pembelian tambahan.</td></tr>
          <tr v-for="p in purchaseHistory" :key="p.id" class="border-b">
            <td class="px-3 py-2">{{ formatDate(p.purchase_date) }}</td>
            <td class="px-3 py-2">
              <span :class="p.entry_type === 'capital_addition' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'"
                class="px-1.5 py-0.5 rounded text-[10px]">{{ entryTypeLabel(p.entry_type) }}</span>
            </td>
            <td class="px-3 py-2">{{ p.description || '-' }}</td>
            <td class="px-3 py-2 text-gray-500">{{ p.vendor || '-' }}</td>
            <td class="px-3 py-2 text-right">{{ formatCurrency(p.amount) }}</td>
            <td class="px-3 py-2 text-right"><button @click="deletePurchase(p)" class="text-gray-400 hover:text-red-600">🗑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="p-10 text-center text-gray-400">Memuat...</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const assetId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;

const asset = ref<any>(null);
const productionLines = ref<any[]>([]);
const documents = ref<any[]>([]);
const maintenanceLogs = ref<any[]>([]);
const purchaseHistory = ref<any[]>([]);
const activeTab = ref('spec');
const saving = ref(false);

const tabs = [
  { id: 'spec', label: '📋 Ringkasan & Spec' },
  { id: 'custody', label: '📍 Lokasi & Kondisi' },
  { id: 'documents', label: '📄 Dokumen' },
  { id: 'maintenance', label: '🔧 Riwayat Perbaikan' },
  { id: 'purchases', label: '🧾 Riwayat Pembelian' },
];

const editForm = ref<any>({});

const statusLabel = (s: string) => ({ active: 'Aktif', disposed: 'Dilepas', under_maintenance: 'Perbaikan', idle: 'Idle' }[s] || s);
const statusBadge = (s: string) => ({
  active: 'bg-green-100 text-green-700',
  disposed: 'bg-gray-200 text-gray-600',
  under_maintenance: 'bg-amber-100 text-amber-700',
  idle: 'bg-blue-100 text-blue-700',
}[s] || 'bg-gray-100 text-gray-600');

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
// Unduh lewat axios supaya token dikirim di header Authorization (AST-007).
// Sebelumnya ini berupa <a href> polos tanpa token sama sekali, jadi selalu 401.
// Menempelkan ?token= bukan jalan keluar: JWT utama berumur 7 hari akan
// tersimpan di history browser, access log proxy, dan header Referer.
const downloadingId = ref<number | null>(null);

async function downloadDocument(doc: any) {
  downloadingId.value = doc.id;
  try {
    const { data, headers } = await api.get(`/assets/documents/${doc.id}/download`, { responseType: 'blob' });

    // Nama berkas dari Content-Disposition kalau server mengirimnya
    let filename = doc.file_name || doc.doc_title || `dokumen-${doc.id}`;
    const cd = headers?.['content-disposition'] as string | undefined;
    const match = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (match) filename = decodeURIComponent(match[1]);

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (err: any) {
    alert(err?.response?.status === 403
      ? 'Anda tidak punya hak untuk mengunduh dokumen ini'
      : 'Gagal mengunduh dokumen');
  } finally {
    downloadingId.value = null;
  }
}

async function loadAsset() {
  const { data } = await api.get(`/assets/${assetId}`);
  asset.value = data.data;
  editForm.value = {
    name: asset.value.name,
    status: asset.value.status,
    category_id: asset.value.category_id,
    production_line_id: asset.value.production_line_id,
    pnid_tag: asset.value.pnid_tag,
    location: asset.value.location,
    purchase_date: asset.value.purchase_date ? String(asset.value.purchase_date).substring(0, 10) : '',
    in_service_date: asset.value.in_service_date ? String(asset.value.in_service_date).substring(0, 10) : '',
    depreciation_rate: asset.value.depreciation_rate,
    purchase_price: asset.value.purchase_price,
    vendor: asset.value.vendor,
    useful_life_years: asset.value.useful_life_years,
    salvage_value: asset.value.salvage_value,
    depreciation_method: asset.value.depreciation_method,
    disposed_date: asset.value.disposed_date,
    notes: asset.value.notes,
  };
}

async function saveSpec() {
  saving.value = true;
  try {
    await api.put(`/assets/${assetId}`, editForm.value);
    await loadAsset();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan');
  } finally {
    saving.value = false;
  }
}

async function loadDocuments() {
  const { data } = await api.get(`/assets/${assetId}/documents`);
  documents.value = data.data || [];
}

async function uploadDocument(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('doc_title', file.name);
  try {
    await api.post(`/assets/${assetId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    await loadDocuments();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal upload dokumen');
  }
  (e.target as HTMLInputElement).value = '';
}

async function deleteDocument(d: any) {
  if (!confirm(`Hapus dokumen "${d.doc_title}"?`)) return;
  await api.delete(`/assets/documents/${d.id}`);
  await loadDocuments();
}

async function loadMaintenance() {
  const { data } = await api.get(`/assets/${assetId}/maintenance`);
  maintenanceLogs.value = data.data || [];
}

const maintForm = ref({ maintenance_type: 'corrective', description: '', cost: 0, performed_at: '' });
async function addMaintenance() {
  if (!maintForm.value.performed_at) { alert('Tanggal perbaikan wajib diisi'); return; }
  await api.post(`/assets/${assetId}/maintenance`, maintForm.value);
  maintForm.value = { maintenance_type: 'corrective', description: '', cost: 0, performed_at: '' };
  await loadMaintenance();
}
async function deleteMaintenance(m: any) {
  if (!confirm('Hapus riwayat perbaikan ini?')) return;
  await api.delete(`/assets/maintenance/${m.id}`);
  await loadMaintenance();
}

async function loadPurchaseHistory() {
  const { data } = await api.get(`/assets/${assetId}/purchase-history`);
  purchaseHistory.value = data.data || [];
}
const purchForm = ref({ description: '', amount: 0, purchase_date: '', vendor: '', entry_type: 'expense' });

const entryTypeLabel = (t: string) => ({
  capital_addition: 'Penambahan Nilai',
  replacement: 'Penggantian',
  improvement: 'Perbaikan',
}[t] || 'Biaya');
async function addPurchase() {
  if (!purchForm.value.purchase_date) { alert('Tanggal beli wajib diisi'); return; }
  await api.post(`/assets/${assetId}/purchase-history`, purchForm.value);
  purchForm.value = { description: '', amount: 0, purchase_date: '', vendor: '', entry_type: 'expense' };
  await loadPurchaseHistory();
}
async function deletePurchase(p: any) {
  if (!confirm('Hapus riwayat pembelian ini?')) return;
  await api.delete(`/assets/purchase-history/${p.id}`);
  await loadPurchaseHistory();
}

onMounted(async () => {
  await loadAsset();
  const { data } = await api.get('/assets/production-lines');
  productionLines.value = data.data || [];
});

// ── Lokasi & kondisi (AST-CUSTODY-01) ───────────────────────────────────
const perpindahan = ref<any[]>([]);
const daftarProyek = ref<any[]>([]);
const kondisiBaru = ref('baik');
const kondisiCatatan = ref('');
const pindahForm = ref<any>({ to_type: 'project', to_project_id: null, to_label: '', received_by: '', notes: '' });

const namaTempat = (tipe: string | null, namaProyek: string | null, label: string | null) => {
  if (!tipe) return '—';
  if (tipe === 'project') return namaProyek || 'Proyek';
  return label || (tipe === 'workshop' ? 'Workshop' : 'Vendor');
};
const lokasiSekarang = computed(() =>
  namaTempat(asset.value?.current_location_type, asset.value?.current_project_name, asset.value?.current_location_label));
const labelKondisi = computed(() => ({
  baik: 'Baik', perlu_perbaikan: 'Perlu perbaikan', rusak: 'Rusak',
} as Record<string, string>)[asset.value?.condition || 'baik'] || asset.value?.condition);
const kelasKondisi = computed(() => ({
  baik: 'bg-green-100 text-green-700',
  perlu_perbaikan: 'bg-amber-100 text-amber-800',
  rusak: 'bg-red-100 text-red-700',
} as Record<string, string>)[asset.value?.condition || 'baik'] || 'bg-gray-100 text-gray-600');

const loadCustody = async () => {
  try {
    const [mv, pj] = await Promise.all([
      api.get(`/assets/${assetId}/movements`),
      api.get('/projects'),
    ]);
    perpindahan.value = mv.data?.data || [];
    daftarProyek.value = (pj.data?.data || pj.data || []).filter((p: any) => p?.id);
    kondisiBaru.value = asset.value?.condition || 'baik';
  } catch (e) { console.error('Gagal memuat lokasi & kondisi', e); }
};

const catatPerpindahan = async () => {
  try {
    await api.post(`/assets/${assetId}/movements`, pindahForm.value);
    pindahForm.value = { to_type: 'project', to_project_id: null, to_label: '', received_by: '', notes: '' };
    await loadAsset();
    await loadCustody();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal mencatat perpindahan');
  }
};

const simpanKondisi = async () => {
  try {
    await api.patch(`/assets/${assetId}/condition`, { condition: kondisiBaru.value, note: kondisiCatatan.value || null });
    kondisiCatatan.value = '';
    await loadAsset();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal memperbarui kondisi');
  }
};

watch(activeTab, (tab) => {
  if (tab === 'custody' && !perpindahan.value.length) loadCustody();
  if (tab === 'documents' && !documents.value.length) loadDocuments();
  if (tab === 'maintenance' && !maintenanceLogs.value.length) loadMaintenance();
  if (tab === 'purchases' && !purchaseHistory.value.length) loadPurchaseHistory();
}, { immediate: true });
</script>
