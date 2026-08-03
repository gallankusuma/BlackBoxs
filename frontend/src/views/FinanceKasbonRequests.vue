<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Pengajuan Kasbon</h1>
        <p class="text-sm text-gray-500 mt-1">Batch pengajuan kasbon karyawan ke Payment Schedule</p>
      </div>
      <button @click="openCreate" class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        + Pengajuan Baru
      </button>
    </div>

    <!-- Status Filter -->
    <div class="flex gap-2 mb-4">
      <button v-for="s in ['all','draft','submitted','approved','rejected']" :key="s"
        @click="filterStatus = s"
        :class="filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-300'"
        class="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition">
        {{ s === 'all' ? 'Semua' : s }}
      </button>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">No. Pengajuan</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tujuan</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Jml Karyawan</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Due Date</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="!filtered.length"><td colspan="7" class="text-center py-10 text-gray-400">Belum ada pengajuan kasbon</td></tr>
          <tr v-for="r in filtered" :key="r.id" class="hover:bg-gray-50 transition">
            <td class="px-4 py-3">
              <span class="font-mono text-xs font-semibold text-indigo-700">{{ r.request_number }}</span>
              <div class="text-xs text-gray-400 mt-0.5">{{ formatDate(r.request_date) }}</div>
            </td>
            <td class="px-4 py-3 text-gray-700 max-w-xs truncate">{{ r.purpose }}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">
                {{ r.item_count }} orang
              </span>
            </td>
            <td class="px-4 py-3 text-gray-600 text-xs">{{ formatDate(r.due_date) }}</td>
            <td class="px-4 py-3 text-right font-mono font-semibold text-gray-900">{{ fmt(r.total_amount) }}</td>
            <td class="px-4 py-3">
              <span :class="statusClass(r.status)" class="px-2 py-0.5 rounded-full text-xs font-medium capitalize">{{ r.status }}</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex items-center gap-1 flex-wrap justify-end">
                <button v-if="r.status === 'draft'" @click="submitKasbon(r.id)"
                  class="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 transition">Submit</button>
                <button v-if="r.status === 'submitted' && canApprove" @click="approveKasbon(r.id)"
                  class="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition">Approve</button>
                <button v-if="r.status === 'submitted' && canApprove" @click="rejectTarget = r; rejectReason = ''"
                  class="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 transition">Reject</button>
                <button @click="openDetail(r.id)"
                  class="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 transition">Detail</button>
                <button v-if="['draft','rejected'].includes(r.status)" @click="deleteKasbon(r)"
                  class="px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 transition">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreate" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b flex justify-between items-center">
          <h2 class="text-lg font-bold text-gray-900">Buat Pengajuan Kasbon</h2>
          <button @click="showCreate = false" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tujuan Pengajuan</label>
              <input v-model="form.purpose" type="text" placeholder="e.g. Kasbon operasional Juni 2026"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
              <input v-model="form.notes" type="text" placeholder="Opsional"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <!-- Pending Advances Table -->
          <div>
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-sm font-semibold text-gray-700">Pilih Kasbon Karyawan (Pending)</h3>
              <span class="text-xs text-gray-500">{{ selectedIds.size }} dipilih · {{ fmt(selectedTotal) }}</span>
            </div>
            <div class="border rounded-lg overflow-hidden">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-50 border-b">
                  <tr>
                    <th class="w-8 px-3 py-2"><input type="checkbox" @change="toggleAll" :checked="selectedIds.size === pendingAdvances.length && pendingAdvances.length > 0" class="rounded" /></th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Karyawan</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Keterangan</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Tanggal</th>
                    <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Jumlah</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-if="loadingAdvances"><td colspan="5" class="text-center py-6 text-gray-400">Loading...</td></tr>
                  <tr v-else-if="!pendingAdvances.length"><td colspan="5" class="text-center py-6 text-gray-400">Tidak ada kasbon pending</td></tr>
                  <tr v-for="adv in pendingAdvances" :key="adv.id" @click="toggleSelect(adv.id)" :class="selectedIds.has(adv.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'" class="cursor-pointer transition">
                    <td class="px-3 py-2"><input type="checkbox" :checked="selectedIds.has(adv.id)" @click.stop="toggleSelect(adv.id)" class="rounded" /></td>
                    <td class="px-3 py-2 font-medium text-gray-900">{{ adv.employee_name || '-' }}</td>
                    <td class="px-3 py-2 text-gray-600 max-w-xs truncate">{{ adv.description || '-' }}</td>
                    <td class="px-3 py-2 text-gray-500 text-xs">{{ formatDate(adv.advance_date) }}</td>
                    <td class="px-3 py-2 text-right font-mono font-semibold text-gray-900">{{ fmt(adv.amount) }}</td>
                  </tr>
                </tbody>
                <tfoot v-if="selectedIds.size > 0" class="bg-indigo-50 border-t">
                  <tr><td colspan="4" class="px-3 py-2 text-right text-xs font-semibold text-indigo-700">Total Terpilih</td>
                    <td class="px-3 py-2 text-right font-mono font-bold text-indigo-700">{{ fmt(selectedTotal) }}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        <div class="p-6 border-t flex justify-end gap-3">
          <button @click="showCreate = false" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Batal</button>
          <button @click="createKasbon" :disabled="selectedIds.size === 0 || saving"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
            {{ saving ? 'Menyimpan...' : `Buat Pengajuan (${selectedIds.size} org)` }}
          </button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="detailData" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b flex justify-between items-center">
          <div>
            <h2 class="text-lg font-bold text-gray-900">{{ detailData.request_number }}</h2>
            <p class="text-sm text-gray-500">{{ detailData.purpose }}</p>
          </div>
          <button @click="detailData = null" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div class="p-6">
          <div class="flex gap-4 mb-4 text-sm">
            <div><span class="text-gray-500">Status:</span> <span :class="statusClass(detailData.status)" class="ml-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize">{{ detailData.status }}</span></div>
            <div><span class="text-gray-500">Due Date:</span> <span class="ml-1 font-medium">{{ formatDate(detailData.due_date) }}</span></div>
            <div><span class="text-gray-500">Total:</span> <span class="ml-1 font-mono font-bold text-indigo-700">{{ fmt(detailData.total_amount) }}</span></div>
          </div>
          <table class="min-w-full text-sm border rounded-lg overflow-hidden">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Karyawan</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Keterangan</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Tanggal</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Jumlah</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="item in detailData.items" :key="item.id" class="hover:bg-gray-50">
                <td class="px-3 py-2 font-medium text-gray-900">{{ item.employee_name || '-' }}</td>
                <td class="px-3 py-2 text-gray-600">{{ item.description || '-' }}</td>
                <td class="px-3 py-2 text-gray-500 text-xs">{{ formatDate(item.advance_date) }}</td>
                <td class="px-3 py-2 text-right font-mono font-semibold">{{ fmt(item.amount) }}</td>
              </tr>
            </tbody>
            <tfoot class="bg-gray-50 border-t">
              <tr><td colspan="3" class="px-3 py-2 text-right text-xs font-semibold text-gray-700">TOTAL</td>
                <td class="px-3 py-2 text-right font-mono font-bold text-indigo-700">{{ fmt(detailData.total_amount) }}</td></tr>
            </tfoot>
          </table>
          <p v-if="detailData.status === 'approved'" class="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            ✅ Pengajuan ini sudah approved dan masuk ke Payment Schedule. Setelah Fund Request dibayar, kasbon karyawan akan otomatis berubah status <strong>paid</strong> (siap deduct gaji).
          </p>
          <!-- Approve / Reject from Detail -->
          <div v-if="detailData.status === 'submitted' && canApprove" class="mt-4 flex gap-3">
            <button @click="approveFromDetail" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm">✅ Approve Pengajuan</button>
            <button @click="rejectTarget = detailData; rejectReason = ''" class="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm">❌ Reject Pengajuan</button>
          </div>
          <div v-if="detailData.status === 'draft'" class="mt-4">
            <button @click="submitFromDetail" class="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition shadow-sm">📤 Submit untuk Approval</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Reject Modal -->
    <div v-if="rejectTarget" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 class="font-bold text-gray-900 mb-2">Reject Pengajuan</h3>
        <p class="text-sm text-gray-500 mb-3">{{ rejectTarget.request_number }}</p>
        <textarea v-model="rejectReason" rows="3" placeholder="Alasan penolakan..." class="w-full px-3 py-2 border rounded-lg text-sm mb-4 focus:ring-2 focus:ring-rose-400"></textarea>
        <div class="flex gap-2 justify-end">
          <button @click="rejectTarget = null" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Batal</button>
          <button @click="confirmReject" class="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const canApprove = computed(() => (authStore.user?.user_level || 1) >= 2);

const kasbonList = ref<any[]>([]);
const filterStatus = ref('all');
const showCreate = ref(false);
const saving = ref(false);
const detailData = ref<any>(null);
const rejectTarget = ref<any>(null);
const rejectReason = ref('');
const pendingAdvances = ref<any[]>([]);
const loadingAdvances = ref(false);
const selectedIds = ref(new Set<number>());
const form = ref({ purpose: '', notes: '' });

const filtered = computed(() =>
  filterStatus.value === 'all' ? kasbonList.value : kasbonList.value.filter(r => r.status === filterStatus.value)
);

const selectedTotal = computed(() =>
  pendingAdvances.value.filter(a => selectedIds.value.has(a.id)).reduce((s, a) => s + Number(a.amount), 0)
);

const fmt = (n: number | string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(n) || 0);

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const statusClass = (s: string) => ({
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
}[s] || 'bg-gray-100 text-gray-700');

async function fetchList() {
  const res = await api.get('/finance/kasbon-requests');
  kasbonList.value = res.data.data || [];
}

async function fetchPendingAdvances() {
  loadingAdvances.value = true;
  try {
    const res = await api.get('/hr/advances', { params: { status: 'pending' } });
    // Filter out already linked ones
    pendingAdvances.value = (res.data.data || []).filter((a: any) => !a.kasbon_request_id);
  } finally {
    loadingAdvances.value = false;
  }
}

function toggleSelect(id: number) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id);
  else selectedIds.value.add(id);
  selectedIds.value = new Set(selectedIds.value);
}

function toggleAll() {
  if (selectedIds.value.size === pendingAdvances.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(pendingAdvances.value.map(a => a.id));
  }
}

async function openCreate() {
  form.value = { purpose: '', notes: '' };
  selectedIds.value = new Set();
  showCreate.value = true;
  await fetchPendingAdvances();
}

async function createKasbon() {
  if (selectedIds.value.size === 0) return;
  saving.value = true;
  try {
    await api.post('/finance/kasbon-requests', {
      salary_advance_ids: [...selectedIds.value],
      purpose: form.value.purpose || 'Pengajuan Kasbon Karyawan',
      notes: form.value.notes,
    });
    showCreate.value = false;
    await fetchList();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal membuat pengajuan');
  } finally {
    saving.value = false;
  }
}

async function submitKasbon(id: number) {
  if (!confirm('Submit pengajuan untuk approval?')) return;
  await api.put(`/finance/kasbon-requests/${id}/submit`);
  await fetchList();
}

async function approveKasbon(id: number) {
  if (!confirm('Approve pengajuan kasbon? Akan masuk ke Payment Schedule.')) return;
  await api.put(`/finance/kasbon-requests/${id}/approve`);
  await fetchList();
}

async function approveFromDetail() {
  if (!detailData.value) return;
  if (!confirm('Approve pengajuan kasbon? Akan masuk ke Payment Schedule.')) return;
  await api.put(`/finance/kasbon-requests/${detailData.value.id}/approve`);
  detailData.value = null;
  await fetchList();
}

async function submitFromDetail() {
  if (!detailData.value) return;
  if (!confirm('Submit pengajuan untuk approval?')) return;
  await api.put(`/finance/kasbon-requests/${detailData.value.id}/submit`);
  detailData.value = null;
  await fetchList();
}

async function confirmReject() {
  if (!rejectTarget.value) return;
  await api.put(`/finance/kasbon-requests/${rejectTarget.value.id}/reject`, { reason: rejectReason.value });
  rejectTarget.value = null;
  await fetchList();
}

async function deleteKasbon(r: any) {
  if (!confirm(`Hapus pengajuan ${r.request_number}?`)) return;
  await api.delete(`/finance/kasbon-requests/${r.id}`);
  await fetchList();
}

async function openDetail(id: number) {
  const res = await api.get(`/finance/kasbon-requests/${id}`);
  detailData.value = res.data.data;
}

onMounted(fetchList);
</script>
