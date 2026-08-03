<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-base font-bold text-gray-800">Project Expenses</h3>
        <p class="text-xs text-gray-500 mt-0.5">Biaya langsung di luar PR/PO</p>
      </div>
      <button @click="openModal()" class="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
        + Add Expense
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div v-for="cat in categorySummary" :key="cat.label" class="bg-white border rounded-xl px-4 py-3">
        <div class="text-xs text-gray-400">{{ cat.label }}</div>
        <div class="font-bold text-gray-800 text-sm mt-0.5">{{ fmt(cat.total) }}</div>
      </div>
    </div>

    <!-- Filter -->
    <div class="flex items-center gap-2 flex-wrap">
      <select v-model="filterCat" class="border rounded-lg px-3 py-1.5 text-sm text-gray-600">
        <option value="">Semua Kategori</option>
        <option v-for="c in CATEGORIES" :key="c.v" :value="c.v">{{ c.l }}</option>
      </select>
      <select v-model="filterStatus" class="border rounded-lg px-3 py-1.5 text-sm text-gray-600">
        <option value="">Semua Status</option>
        <option v-for="s in STATUSES" :key="s.v" :value="s.v">{{ s.l }}</option>
      </select>
      <span class="text-xs text-gray-400 ml-auto">{{ filtered.length }} record · Total: <b class="text-gray-700">{{ fmt(grandTotal) }}</b></span>
    </div>

    <!-- Table -->
    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div v-if="loading" class="text-center py-10 text-gray-400 text-sm">Memuat data...</div>
      <div v-else-if="filtered.length === 0" class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-2">📋</div>
        <div class="text-sm">Belum ada expense untuk project ini</div>
        <button @click="openModal()" class="mt-3 text-blue-600 text-sm hover:underline">+ Tambah expense pertama</button>
      </div>
      <table v-else class="min-w-full divide-y divide-gray-100">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">No. Exp</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tanggal</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Deskripsi</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kategori</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
            <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-for="exp in filtered" :key="exp.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 text-xs font-mono text-gray-400">{{ exp.expense_number }}</td>
            <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{{ fmtDate(exp.expense_date) }}</td>
            <td class="px-4 py-3">
              <div class="text-sm font-medium text-gray-800">{{ exp.description }}</div>
              <div v-if="exp.receipt_number" class="text-xs text-gray-400">{{ exp.receipt_number }}</div>
              <div v-if="exp.notes" class="text-xs text-gray-400 italic">{{ exp.notes }}</div>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="catColor(exp.category)">{{ catLabel(exp.category) }}</span>
            </td>
            <td class="px-4 py-3 text-right font-semibold text-gray-800 text-sm whitespace-nowrap">{{ fmt(exp.amount) }}</td>
            <td class="px-4 py-3 text-center">
              <span class="text-xs px-2 py-0.5 rounded-full font-semibold capitalize" :class="statusColor(exp.status)">{{ exp.status }}</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2 flex-wrap">
                <!-- Approve / Reject: only for canApprove users, expense not yet approved/rejected -->
                <template v-if="canApprove && exp.status !== 'approved' && exp.status !== 'rejected'">
                  <button @click="approveExpense(exp)" class="text-xs bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100 px-2 py-0.5 rounded font-medium transition">✓ Approve</button>
                  <button @click="rejectExpense(exp)" class="text-xs bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100 px-2 py-0.5 rounded font-medium transition">✕ Reject</button>
                </template>
                <button @click="openModal(exp)" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                <button @click="confirmDelete(exp)" class="text-xs text-red-500 hover:text-red-700 font-medium">Hapus</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showModal=false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div class="flex items-center justify-between px-6 py-4 border-b">
            <h4 class="font-bold text-gray-800">{{ editingId ? 'Edit Expense' : 'Tambah Expense' }}</h4>
            <button @click="showModal=false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
          <div class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-xs font-semibold text-gray-600 mb-1">Deskripsi <span class="text-red-500">*</span></label>
                <input v-model="form.description" type="text" placeholder="Nama pengeluaran..." class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Tanggal <span class="text-red-500">*</span></label>
                <input v-model="form.expense_date" type="date" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Amount (Rp) <span class="text-red-500">*</span></label>
                <input v-model.number="form.amount" type="number" min="0" placeholder="0" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Kategori</label>
                <select v-model="form.category" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
                  <option v-for="c in CATEGORIES" :key="c.v" :value="c.v">{{ c.l }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select v-model="form.status" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
                  <option v-for="s in STATUSES" :key="s.v" :value="s.v">{{ s.l }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">No. Kwitansi</label>
                <input v-model="form.receipt_number" type="text" placeholder="INV/001/..." class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Vendor (opsional)</label>
                <select v-model="form.vendor_id" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
                  <option :value="null">- Tanpa Vendor -</option>
                  <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
                </select>
              </div>
              <div class="col-span-2">
                <label class="block text-xs font-semibold text-gray-600 mb-1">Catatan</label>
                <textarea v-model="form.notes" rows="2" placeholder="Catatan tambahan..." class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none resize-none"></textarea>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
            <button @click="showModal=false" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Batal</button>
            <button @click="saveExpense" :disabled="saving" class="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {{ saving ? 'Menyimpan...' : (editingId ? 'Update' : 'Simpan') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Delete Confirm -->
      <div v-if="deleteTarget" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
          <div class="text-4xl mb-3">🗑️</div>
          <h4 class="font-bold text-gray-800 mb-1">Hapus Expense?</h4>
          <p class="text-sm text-gray-500 mb-5">{{ deleteTarget.description }} — {{ fmt(deleteTarget.amount) }}</p>
          <div class="flex gap-3">
            <button @click="deleteTarget=null" class="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            <button @click="doDelete" :disabled="saving" class="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">Hapus</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canApprove = computed(() => {
  const level = (auth.user as any)?.user_level || 0;
  return level >= 4;
});

const props = defineProps<{ projectId: string }>();

const expenses    = ref<any[]>([]);
const vendors     = ref<any[]>([]);
const loading     = ref(true);
const saving      = ref(false);
const showModal   = ref(false);
const editingId   = ref<number | null>(null);
const deleteTarget = ref<any>(null);
const filterCat    = ref('');
const filterStatus = ref('');

const CATEGORIES = [
  { v: 'material',      l: 'Material' },
  { v: 'labor',         l: 'Tenaga Kerja' },
  { v: 'equipment',     l: 'Peralatan' },
  { v: 'subcontractor', l: 'Subkontraktor' },
  { v: 'overhead',      l: 'Overhead' },
  { v: 'transport',     l: 'Transportasi' },
  { v: 'other',         l: 'Lainnya' },
];
const STATUSES = [
  { v: 'draft',     l: 'Draft' },
  { v: 'submitted', l: 'Submitted' },
  { v: 'approved',  l: 'Approved' },
  { v: 'paid',      l: 'Paid' },
  { v: 'rejected',  l: 'Rejected' },
];

const defaultForm = () => ({
  description: '', expense_date: new Date().toISOString().slice(0, 10),
  amount: 0, category: 'other', status: 'draft',
  receipt_number: '', vendor_id: null as number | null, notes: '',
});
const form = ref(defaultForm());

const filtered = computed(() =>
  expenses.value.filter(e =>
    (!filterCat.value    || e.category === filterCat.value) &&
    (!filterStatus.value || e.status   === filterStatus.value)
  )
);
const grandTotal = computed(() => filtered.value.reduce((s, e) => s + parseFloat(e.amount || 0), 0));
const categorySummary = computed(() =>
  ['material', 'labor', 'equipment', 'transport'].map(c => ({
    label: CATEGORIES.find(x => x.v === c)?.l || c,
    total: expenses.value.filter(e => e.category === c).reduce((s, e) => s + parseFloat(e.amount || 0), 0),
  }))
);

const fmt = (v: any) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const catLabel = (v: string) => CATEGORIES.find(c => c.v === v)?.l || v;
const catColor = (v: string): string => ({
  material: 'bg-blue-100 text-blue-700', labor: 'bg-purple-100 text-purple-700',
  equipment: 'bg-orange-100 text-orange-700', subcontractor: 'bg-pink-100 text-pink-700',
  overhead: 'bg-gray-100 text-gray-700', transport: 'bg-yellow-100 text-yellow-700',
  other: 'bg-slate-100 text-slate-600',
}[v] || 'bg-gray-100 text-gray-600');
const statusColor = (v: string): string => ({
  draft: 'bg-gray-100 text-gray-600', submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700', paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}[v] || 'bg-gray-100 text-gray-600');

async function fetchExpenses() {
  loading.value = true;
  try {
    const res = await api.get(`/projects/${props.projectId}/expenses`);
    expenses.value = res.data?.data || res.data || [];
  } catch { expenses.value = []; }
  finally { loading.value = false; }
}

async function fetchVendors() {
  try {
    const res = await api.get('/procurement/vendors?limit=300');
    vendors.value = res.data?.data || res.data || [];
  } catch { vendors.value = []; }
}

function openModal(exp?: any) {
  if (exp) {
    editingId.value = exp.id;
    form.value = {
      description:    exp.description || '',
      expense_date:   exp.expense_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      amount:         parseFloat(exp.amount || 0),
      category:       exp.category || 'other',
      status:         exp.status || 'draft',
      receipt_number: exp.receipt_number || '',
      vendor_id:      exp.vendor_id || null,
      notes:          exp.notes || '',
    };
  } else {
    editingId.value = null;
    form.value = defaultForm();
  }
  showModal.value = true;
}

async function saveExpense() {
  if (!form.value.description || !form.value.amount || !form.value.expense_date) {
    alert('Deskripsi, tanggal, dan amount wajib diisi'); return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await api.put(`/projects/${props.projectId}/expenses/${editingId.value}`, form.value);
    } else {
      await api.post(`/projects/${props.projectId}/expenses`, form.value);
    }
    showModal.value = false;
    await fetchExpenses();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan expense');
  }
  saving.value = false;
}

function confirmDelete(exp: any) { deleteTarget.value = exp; }

async function doDelete() {
  if (!deleteTarget.value) return;
  saving.value = true;
  try {
    await api.delete(`/projects/${props.projectId}/expenses/${deleteTarget.value.id}`);
    deleteTarget.value = null;
    await fetchExpenses();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menghapus');
  }
  saving.value = false;
}

async function approveExpense(exp: any) {
  if (!confirm(`Approve expense "${exp.description}"?`)) return;
  try {
    await api.patch(`/projects/${props.projectId}/expenses/${exp.id}/approve`, {});
    await fetchExpenses();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal approve expense');
  }
}

async function rejectExpense(exp: any) {
  if (!confirm(`Reject expense "${exp.description}"?`)) return;
  try {
    await api.patch(`/projects/${props.projectId}/expenses/${exp.id}/reject`, {});
    await fetchExpenses();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal reject expense');
  }
}

onMounted(() => { fetchExpenses(); fetchVendors(); });
</script>
