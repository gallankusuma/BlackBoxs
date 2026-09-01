<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Vendor Price List</h2>
          <p class="text-sm text-gray-500 mt-1">
            Harga baru dan revisi harus disetujui dulu sebelum dipakai PR, PO, dan pencarian harga.
          </p>
        </div>
        <button @click="showForm = true" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">+ Add Price</button>
      </div>

      <!-- Ringkasan antrean -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-md shadow-sm p-4">
          <p class="text-xs text-gray-500 uppercase">Menunggu Supervisor</p>
          <p class="text-2xl font-bold text-yellow-600">{{ jumlah.pending }}</p>
        </div>
        <div class="bg-white rounded-md shadow-sm p-4">
          <p class="text-xs text-gray-500 uppercase">Menunggu Manager</p>
          <p class="text-2xl font-bold text-blue-600">{{ jumlah.partial }}</p>
        </div>
        <div class="bg-white rounded-md shadow-sm p-4">
          <p class="text-xs text-gray-500 uppercase">Berlaku</p>
          <p class="text-2xl font-bold text-green-600">{{ jumlah.berlaku }}</p>
        </div>
        <div class="bg-white rounded-md shadow-sm p-4">
          <p class="text-xs text-gray-500 uppercase">Ditolak</p>
          <p class="text-2xl font-bold text-red-600">{{ jumlah.ditolak }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow-sm rounded-md p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 tilt-card">
        <div>
          <label class="block text-sm font-medium text-gray-700">Vendor</label>
          <select v-model.number="filters.vendorId" class="mt-1 block w-full border-gray-300 rounded-md">
            <option :value="0">All Vendors</option>
            <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Product</label>
          <select v-model.number="filters.productId" class="mt-1 block w-full border-gray-300 rounded-md">
            <option :value="0">All Products</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Status</label>
          <select v-model="filters.status" class="mt-1 block w-full border-gray-300 rounded-md">
            <option value="">Semua status</option>
            <option value="menunggu">Menunggu persetujuan</option>
            <option value="pending">Menunggu Supervisor (0/2)</option>
            <option value="partial">Menunggu Manager (1/2)</option>
            <option value="approved">Berlaku (2/2)</option>
            <option value="rejected">Ditolak</option>
            <option value="superseded">Digantikan revisi</option>
          </select>
        </div>
        <div class="flex items-end">
          <button @click="load" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Filter</button>
        </div>
      </div>

      <!-- Price List Table -->
      <div class="bg-white shadow overflow-x-auto sm:rounded-md tilt-card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Persetujuan</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">MOQ</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Lead Time</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="prices.length === 0">
              <td colspan="11" class="px-4 py-6 text-center text-gray-500">No price data</td>
            </tr>
            <tr v-for="price in prices" :key="price.id" :class="price.superseded_at ? 'opacity-60' : ''">
              <td class="px-4 py-2 text-sm text-gray-900">{{ price.vendor_name }}</td>
              <td class="px-4 py-2 text-sm text-gray-700">{{ price.product_name }}</td>
              <td class="px-4 py-2 text-sm text-right">
                {{ formatPrice(price.price) }}
                <div v-if="price.revision_of" class="text-xs text-gray-400">
                  revisi dari {{ formatPrice(price.harga_sebelumnya) }}
                </div>
              </td>
              <td class="px-4 py-2 text-sm">{{ price.currency }}</td>
              <td class="px-4 py-2 text-sm">
                <span class="px-2 py-1 rounded text-xs font-medium" :class="kelasStatus(price)">
                  {{ teksStatus(price) }}
                </span>
                <div v-if="price.rejected_at && price.rejection_reason" class="text-xs text-red-600 mt-1 max-w-[16rem]">
                  {{ price.rejection_reason }}
                </div>
              </td>
              <td class="px-4 py-2 text-xs text-gray-600">
                <div v-if="price.approved_by_supervisor_name">
                  1/2 {{ price.approved_by_supervisor_name }}
                  <span class="text-gray-400">{{ formatDate(price.approved_at_supervisor) }}</span>
                </div>
                <div v-if="price.approved_by_manager_name">
                  2/2 {{ price.approved_by_manager_name }}
                  <span class="text-gray-400">{{ formatDate(price.approved_at_manager) }}</span>
                </div>
                <div v-if="dataWarisan(price)" class="text-gray-400 italic">
                  data warisan — tidak melewati persetujuan
                </div>
                <span v-else-if="!price.approved_by_supervisor_name && !price.approved_by_manager_name" class="text-gray-400">&mdash;</span>
              </td>
              <td class="px-4 py-2 text-sm">{{ formatDate(price.effective_date) }}</td>
              <td class="px-4 py-2 text-sm">{{ price.valid_until ? formatDate(price.valid_until) : '-' }}</td>
              <td class="px-4 py-2 text-sm text-right">{{ price.min_order_qty || '-' }}</td>
              <td class="px-4 py-2 text-sm text-right">{{ price.lead_time_days ? price.lead_time_days + ' days' : '-' }}</td>
              <td class="px-4 py-2 text-sm text-right whitespace-nowrap">
                <button v-if="bisaSetujui(price)" @click="setujui(price)"
                  class="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 mr-1">
                  Approve
                </button>
                <button v-if="bisaTolak(price)" @click="bukaTolak(price)"
                  class="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 mr-2">
                  Reject
                </button>
                <button v-if="!price.superseded_at" @click="editPrice(price)" class="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                <button v-if="!price.superseded_at" @click="deletePrice(price)" class="text-red-600 hover:text-red-800">Delete</button>
                <span v-if="price.superseded_at" class="text-gray-400 text-xs">terkunci</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add/Edit Price Modal -->
      <div v-if="showForm" class="fixed inset-0 bg-black/40 flex items-start justify-center z-50">
        <div class="bg-white rounded-md shadow-lg w-full max-w-2xl mt-10 p-6 tilt-card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">{{ editMode ? 'Edit' : 'Add' }} Vendor Price</h3>
            <button @click="closeForm" class="text-gray-500 hover:text-gray-700">&times;</button>
          </div>

          <div v-if="editMode && editSudahBerlaku" class="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            Harga ini sudah berlaku. Menyimpan perubahan <strong>tidak mengubah harga yang sekarang</strong> —
            perubahannya menjadi revisi baru yang menunggu persetujuan, dan harga lama tetap dipakai PR/PO
            sampai revisi itu disetujui.
          </div>
          <div v-else-if="editMode" class="mb-4 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
            Menyimpan perubahan akan <strong>mengulang persetujuan dari awal</strong> (0/2).
          </div>

          <form @submit.prevent="submit">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Vendor *</label>
                <select v-model.number="form.vendor_id" required class="mt-1 block w-full border-gray-300 rounded-md" :disabled="editMode">
                  <option :value="0">Select vendor</option>
                  <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Product *</label>
                <select v-model.number="form.product_id" required class="mt-1 block w-full border-gray-300 rounded-md" :disabled="editMode">
                  <option :value="0">Select product</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Price *</label>
                <input type="number" step="0.01" min="0" v-model.number="form.price" required class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Currency</label>
                <select v-model="form.currency" class="mt-1 block w-full border-gray-300 rounded-md">
                  <option value="IDR">IDR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Effective Date *</label>
                <input type="date" v-model="form.effective_date" required class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Valid Until</label>
                <input type="date" v-model="form.valid_until" class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Min Order Qty</label>
                <input type="number" step="0.01" min="0" v-model.number="form.min_order_qty" class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Lead Time (days)</label>
                <input type="number" min="0" v-model.number="form.lead_time_days" class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700">Notes</label>
                <textarea v-model="form.notes" rows="2" class="mt-1 block w-full border-gray-300 rounded-md"></textarea>
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <button type="button" @click="closeForm" class="px-4 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</button>
              <button type="submit" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
                {{ editMode ? (editSudahBerlaku ? 'Ajukan Revisi' : 'Update') : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Dialog penolakan -->
      <div v-if="tolakTarget" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div class="bg-white rounded-md shadow-lg w-full max-w-md p-6">
          <h3 class="font-bold text-lg mb-1">Tolak harga</h3>
          <p class="text-sm text-gray-600 mb-3">
            {{ tolakTarget.vendor_name }} &mdash; {{ tolakTarget.product_name }}
            ({{ formatPrice(tolakTarget.price) }})
          </p>
          <label class="block text-sm font-medium text-gray-700 mb-1">Alasan penolakan *</label>
          <textarea v-model="tolakAlasan" rows="3" class="w-full border rounded px-3 py-2 text-sm"
            placeholder="Contoh: harga di atas penawaran terakhir vendor, minta konfirmasi ulang"></textarea>
          <div class="flex justify-end gap-2 mt-4">
            <button @click="tolakTarget = null" class="px-4 py-2 border rounded text-sm">Batal</button>
            <button @click="tolak" :disabled="!tolakAlasan.trim()"
              class="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Tolak
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/lib/api';
import { useToast } from 'vue-toastification';
import { useApprovalWorkflow } from '@/composables/useApprovalWorkflow';
import { useAuthStore } from '@/stores/auth';

const toast = useToast();
const authStore = useAuthStore();

// canApprove dipakai apa adanya karena aturannya PERSIS sama dengan backend
// (lv2: 0→1, lv3: 1→2, lv≥4 langsung tuntas). Kalau keduanya menyimpang,
// tombolnya muncul lalu servernya menolak — dan pengguna tidak tahu kenapa.
const { canApprove } = useApprovalWorkflow();

const prices = ref<any[]>([]);
const vendors = ref<any[]>([]);
const products = ref<any[]>([]);
const showForm = ref(false);
const editMode = ref(false);
const editSudahBerlaku = ref(false);
const tolakTarget = ref<any>(null);
const tolakAlasan = ref('');

const filters = reactive({
  vendorId: 0,
  productId: 0,
  status: '',
});

const form = reactive({
  id: 0,
  vendor_id: 0,
  product_id: 0,
  price: 0,
  currency: 'IDR',
  effective_date: '',
  valid_until: '',
  min_order_qty: 0,
  lead_time_days: 0,
  notes: '',
});

const aktif = (p: any) => !p.superseded_at && !p.rejected_at;

const jumlah = computed(() => ({
  pending: prices.value.filter(p => aktif(p) && Number(p.approval_status) === 0).length,
  partial: prices.value.filter(p => aktif(p) && Number(p.approval_status) === 1).length,
  berlaku: prices.value.filter(p => !p.superseded_at && Number(p.approval_status) === 2).length,
  ditolak: prices.value.filter(p => !!p.rejected_at).length,
}));

/**
 * Baris yang disetujui tapi tanpa satu pun approver adalah harga yang sudah ada
 * sebelum fitur ini dipasang. Ditandai apa adanya, bukan disamarkan sebagai
 * persetujuan biasa — tidak ada seorang pun yang pernah menyetujuinya.
 */
const dataWarisan = (p: any) =>
  Number(p.approval_status) === 2 && !p.approved_by_supervisor_id && !p.approved_by_manager_id;

const teksStatus = (p: any) => {
  if (p.superseded_at) return 'Digantikan revisi';
  if (p.rejected_at) return 'Ditolak';
  const s = Number(p.approval_status);
  if (s === 0) return 'Menunggu Supervisor (0/2)';
  if (s === 1) return 'Menunggu Manager (1/2)';
  return dataWarisan(p) ? 'Berlaku (warisan)' : 'Berlaku (2/2)';
};

const kelasStatus = (p: any) => {
  if (p.superseded_at) return 'bg-gray-100 text-gray-600';
  if (p.rejected_at) return 'bg-red-100 text-red-700';
  const s = Number(p.approval_status);
  if (s === 0) return 'bg-yellow-100 text-yellow-700';
  if (s === 1) return 'bg-blue-100 text-blue-700';
  return 'bg-green-100 text-green-700';
};

const bisaSetujui = (p: any) => aktif(p) && canApprove(Number(p.approval_status));

/**
 * Sengaja TIDAK memakai canReject dari composable: aturan di sana melarang
 * reject pada status 0 (untuk PR, pilihannya delete). Untuk harga vendor,
 * menolak harga yang masih menunggu justru tindakan yang paling sering
 * dibutuhkan — angkanya salah dan pengaju perlu tahu alasannya, bukan
 * barisnya dihapus diam-diam.
 *
 * Harga yang sudah berlaku tidak bisa ditolak; koreksinya lewat revisi.
 */
const bisaTolak = (p: any) => {
  const level = authStore.user?.user_level || 0;
  return aktif(p) && level >= 2 && Number(p.approval_status) < 2;
};

onMounted(async () => {
  await Promise.all([
    loadVendors(),
    loadProducts(),
    load(),
  ]);
});

const loadVendors = async () => {
  try {
    const res = await api.get('/procurement/vendors');
    vendors.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load vendors:', error);
    vendors.value = [];
  }
};

const loadProducts = async () => {
  try {
    const res = await api.get('/products');
    products.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load products:', error);
    products.value = [];
  }
};

const load = async () => {
  try {
    const params = new URLSearchParams();
    if (filters.vendorId) params.append('vendor_id', String(filters.vendorId));
    if (filters.productId) params.append('product_id', String(filters.productId));
    if (filters.status) params.append('status', filters.status);

    const res = await api.get(`/procurement/vendor-prices?${params}`);
    prices.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load vendor prices:', error);
    prices.value = [];
  }
};

const closeForm = () => {
  showForm.value = false;
  editMode.value = false;
  editSudahBerlaku.value = false;
  form.id = 0;
  form.vendor_id = 0;
  form.product_id = 0;
  form.price = 0;
  form.currency = 'IDR';
  form.effective_date = '';
  form.valid_until = '';
  form.min_order_qty = 0;
  form.lead_time_days = 0;
  form.notes = '';
};

const pesanGagal = (error: any, fallback: string) =>
  error?.response?.data?.error || fallback;

const submit = async () => {
  try {
    const res = editMode.value
      ? await api.put(`/procurement/vendor-prices/${form.id}`, form)
      : await api.post('/procurement/vendor-prices', form);
    toast.success(res.data?.message || 'Tersimpan');
    await load();
    closeForm();
  } catch (error: any) {
    toast.error(pesanGagal(error, 'Gagal menyimpan harga vendor'));
  }
};

const editPrice = (price: any) => {
  form.id = price.id;
  form.vendor_id = price.vendor_id;
  form.product_id = price.product_id;
  form.price = price.price;
  form.currency = price.currency;
  form.effective_date = price.effective_date ? String(price.effective_date).slice(0, 10) : '';
  form.valid_until = price.valid_until ? String(price.valid_until).slice(0, 10) : '';
  form.min_order_qty = price.min_order_qty || 0;
  form.lead_time_days = price.lead_time_days || 0;
  form.notes = price.notes || '';
  editMode.value = true;
  editSudahBerlaku.value = Number(price.approval_status) === 2;
  showForm.value = true;
};

const deletePrice = async (price: any) => {
  const peringatan = Number(price.approval_status) === 2 && !price.superseded_at
    ? 'Harga ini SEDANG BERLAKU dan dipakai PR/PO. Hapus?'
    : 'Hapus data harga ini?';
  if (!confirm(peringatan)) return;
  try {
    await api.delete(`/procurement/vendor-prices/${price.id}`);
    toast.success('Harga vendor dihapus');
    await load();
  } catch (error: any) {
    toast.error(pesanGagal(error, 'Gagal menghapus harga vendor'));
  }
};

const setujui = async (price: any) => {
  try {
    const res = await api.post(`/procurement/vendor-prices/${price.id}/approve`, {});
    toast.success(res.data?.message || 'Harga disetujui');
    await load();
  } catch (error: any) {
    toast.error(pesanGagal(error, 'Gagal menyetujui harga'));
  }
};

const bukaTolak = (price: any) => {
  tolakTarget.value = price;
  tolakAlasan.value = '';
};

const tolak = async () => {
  const alasan = tolakAlasan.value.trim();
  if (!alasan) return;
  try {
    await api.post(`/procurement/vendor-prices/${tolakTarget.value.id}/reject`, { reason: alasan });
    toast.success('Harga ditolak');
    tolakTarget.value = null;
    await load();
  } catch (error: any) {
    toast.error(pesanGagal(error, 'Gagal menolak harga'));
  }
};

const formatPrice = (val: any) => {
  const n = Number(val);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '-';
};
const formatDate = (val: string) => val ? new Date(val).toLocaleDateString() : '-';
</script>

<style scoped>
</style>
