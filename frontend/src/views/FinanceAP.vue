<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">💸 Accounts Payable</h1>
        <p class="text-gray-500 text-sm mt-1">Hutang vendor dari Purchase Order — tracking pembayaran & aging</p>
      </div>
      <div class="flex gap-2">
        <button @click="showCreateModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2">
          + Tambah AP
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-medium">Total Payable</p>
        <p class="text-2xl font-black text-gray-900 mt-1">{{ fmt(totals.total) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <p class="text-xs text-green-600 uppercase font-medium">Sudah Dibayar</p>
        <p class="text-2xl font-black text-green-700 mt-1">{{ fmt(totals.paid) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-amber-200 p-4 shadow-sm bg-amber-50">
        <p class="text-xs text-amber-600 uppercase font-medium">Outstanding</p>
        <p class="text-2xl font-black text-amber-700 mt-1">{{ fmt(totals.outstanding) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-red-200 p-4 shadow-sm bg-red-50">
        <p class="text-xs text-red-600 uppercase font-medium">Overdue</p>
        <p class="text-2xl font-black text-red-700 mt-1">{{ overdue.length }}</p>
        <p class="text-xs text-red-500">tagihan jatuh tempo</p>
      </div>
    </div>

    <!-- Aging Summary -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 class="font-semibold text-gray-700 mb-3">📊 AP Aging</h3>
      <div class="grid grid-cols-5 gap-2 text-center text-sm">
        <div v-for="b in agingBuckets" :key="b.label" class="rounded-lg p-3" :class="b.class">
          <p class="text-xs font-medium opacity-80">{{ b.label }}</p>
          <p class="text-lg font-black mt-1">{{ fmt(b.amount) }}</p>
          <p class="text-xs opacity-70">{{ b.count }} tagihan</p>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 items-center">
      <input v-model="search" type="text" placeholder="Cari vendor / no. invoice..." class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64" />
      <select v-model="filterStatus" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
        <option value="">Semua Status</option>
        <option value="open">Open</option>
        <option value="partial">Partial</option>
        <option value="paid">Paid</option>
      </select>
      <span class="text-sm text-gray-500">{{ filtered.length }} records</span>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-800 text-white">
          <tr>
            <th class="text-left px-4 py-3 font-semibold">Vendor</th>
            <th class="text-left px-4 py-3 font-semibold">No. Invoice</th>
            <th class="text-left px-4 py-3 font-semibold">No. PO</th>
            <th class="text-left px-4 py-3 font-semibold">Jatuh Tempo</th>
            <th class="text-right px-4 py-3 font-semibold">Jumlah</th>
            <th class="text-right px-4 py-3 font-semibold">Terbayar</th>
            <th class="text-right px-4 py-3 font-semibold">Sisa</th>
            <th class="text-center px-4 py-3 font-semibold">Status</th>
            <th class="text-center px-4 py-3 font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="ap in filtered" :key="ap.id" class="hover:bg-blue-50/30 transition-colors" :class="{ 'bg-red-50': isOverdue(ap) }">
            <td class="px-4 py-3 font-medium text-gray-900">{{ ap.vendor_name || '-' }}</td>
            <td class="px-4 py-3 text-gray-600">
              <div>{{ ap.vendor_invoice_number || ap.invoice_number || '-' }}</div>
              <div v-if="ap.invoice_date" class="text-xs text-gray-400">{{ fmtDate(ap.invoice_date) }}</div>
            </td>
            <td class="px-4 py-3 text-gray-600">{{ ap.po_number || '-' }}</td>
            <td class="px-4 py-3" :class="isOverdue(ap) ? 'text-red-600 font-semibold' : 'text-gray-600'">
              {{ ap.due_date ? fmtDate(ap.due_date) : '-' }}
              <span v-if="isOverdue(ap)" class="text-xs ml-1">({{ daysOverdue(ap.due_date) }}h)</span>
            </td>
            <td class="px-4 py-3 text-right font-medium">{{ fmt(ap.amount) }}</td>
            <td class="px-4 py-3 text-right text-green-700">{{ fmt(ap.paid_amount) }}</td>
            <td class="px-4 py-3 text-right font-semibold" :class="Number(ap.amount) - Number(ap.paid_amount) > 0 ? 'text-amber-700' : 'text-gray-400'">
              {{ fmt(Number(ap.amount) - Number(ap.paid_amount)) }}
            </td>
            <td class="px-4 py-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="statusClass(ap.status)">
                {{ statusLabel(ap.status) }}
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex gap-1 justify-center">
                <button @click="openDetail(ap)" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Detail</button>
                <button v-if="ap.status !== 'paid'" @click="openPayment(ap)" class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">Bayar</button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="9" class="px-4 py-10 text-center text-gray-400">Tidak ada data AP</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create AP Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showCreateModal = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div class="px-6 py-4 border-b bg-slate-800 flex items-center justify-between">
          <h2 class="font-bold text-white">+ Tambah AP Manual</h2>
          <button @click="showCreateModal = false" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <form @submit.prevent="createAP" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              <select v-model="createForm.vendor_id" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">Pilih vendor</option>
                <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah *</label>
              <input v-model.number="createForm.amount" type="number" required placeholder="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">No. Invoice Vendor</label>
              <input v-model="createForm.vendor_invoice_number" type="text" placeholder="INV/2025/..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tgl Invoice</label>
              <input v-model="createForm.invoice_date" type="date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jatuh Tempo</label>
            <input v-model="createForm.due_date" type="date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
            <textarea v-model="createForm.description" rows="2" placeholder="Keterangan..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
          </div>
          <div class="flex justify-end gap-3 border-t pt-3">
            <button type="button" @click="showCreateModal = false" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm">Batal</button>
            <button type="submit" :disabled="saving" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
              {{ saving ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Payment Modal -->
    <div v-if="paymentModal.show" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="paymentModal.show = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="px-6 py-4 border-b bg-green-700 flex items-center justify-between">
          <div>
            <h2 class="font-bold text-white">💳 Record Pembayaran</h2>
            <p class="text-green-200 text-xs mt-0.5">{{ paymentModal.ap?.vendor_name }}</p>
          </div>
          <button @click="paymentModal.show = false" class="text-green-200 hover:text-white text-xl">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="bg-green-50 rounded-lg p-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-600">Total Tagihan</span><span class="font-bold">{{ fmt(paymentModal.ap?.amount) }}</span></div>
            <div class="flex justify-between"><span class="text-gray-600">Terbayar</span><span class="font-bold text-green-700">{{ fmt(paymentModal.ap?.paid_amount) }}</span></div>
            <div class="flex justify-between border-t mt-1 pt-1"><span class="font-semibold">Sisa</span><span class="font-black text-amber-700">{{ fmt(Number(paymentModal.ap?.amount) - Number(paymentModal.ap?.paid_amount)) }}</span></div>
          </div>
          <form @submit.prevent="recordPayment" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Bayar *</label>
              <input v-model.number="paymentModal.amount" type="number" required :max="Number(paymentModal.ap?.amount) - Number(paymentModal.ap?.paid_amount)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tgl Bayar</label>
                <input v-model="paymentModal.date" type="date" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Metode</label>
                <select v-model="paymentModal.method" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option>Transfer</option>
                  <option>Tunai</option>
                  <option>Cek</option>
                  <option>Giro</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">No. Referensi</label>
              <input v-model="paymentModal.reference" type="text" placeholder="No. transfer / bukti bayar" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div class="flex justify-end gap-3 border-t pt-3">
              <button type="button" @click="paymentModal.show = false" class="px-4 py-2 border border-gray-300 rounded-lg text-sm">Batal</button>
              <button type="submit" :disabled="saving" class="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50">
                {{ saving ? 'Menyimpan...' : '✓ Bayar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="detailModal.show" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="detailModal.show = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b bg-slate-800 flex items-center justify-between sticky top-0">
          <h2 class="font-bold text-white">📋 Detail AP — {{ detailModal.data?.vendor_name }}</h2>
          <button @click="detailModal.show = false" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <div v-if="detailModal.data" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="bg-gray-50 rounded-lg p-3 space-y-1">
              <p class="text-gray-500 text-xs uppercase">Vendor</p>
              <p class="font-semibold">{{ detailModal.data.vendor_name }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 space-y-1">
              <p class="text-gray-500 text-xs uppercase">PO Number</p>
              <p class="font-semibold">{{ detailModal.data.po_number || '-' }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 space-y-1">
              <p class="text-gray-500 text-xs uppercase">Invoice Vendor</p>
              <p class="font-semibold">{{ detailModal.data.vendor_invoice_number || '-' }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 space-y-1">
              <p class="text-gray-500 text-xs uppercase">Jatuh Tempo</p>
              <p class="font-semibold" :class="isOverdue(detailModal.data) ? 'text-red-600' : ''">{{ detailModal.data.due_date ? fmtDate(detailModal.data.due_date) : '-' }}</p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3 text-sm">
            <div class="text-center bg-blue-50 rounded-lg p-3">
              <p class="text-xs text-blue-600">Total</p>
              <p class="font-black text-blue-800">{{ fmt(detailModal.data.amount) }}</p>
            </div>
            <div class="text-center bg-green-50 rounded-lg p-3">
              <p class="text-xs text-green-600">Terbayar</p>
              <p class="font-black text-green-800">{{ fmt(detailModal.data.paid_amount) }}</p>
            </div>
            <div class="text-center bg-amber-50 rounded-lg p-3">
              <p class="text-xs text-amber-600">Sisa</p>
              <p class="font-black text-amber-800">{{ fmt(Number(detailModal.data.amount) - Number(detailModal.data.paid_amount)) }}</p>
            </div>
          </div>
          <div v-if="detailModal.data.payments?.length">
            <h3 class="font-semibold text-gray-700 mb-2">🧾 Riwayat Pembayaran</h3>
            <div class="space-y-2">
              <div v-for="p in detailModal.data.payments" :key="p.id" class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                <div>
                  <span class="font-medium">{{ fmtDate(p.payment_date) }}</span>
                  <span class="text-gray-500 ml-2">{{ p.payment_method }}</span>
                  <span v-if="p.reference_number" class="text-gray-400 ml-2 text-xs">{{ p.reference_number }}</span>
                </div>
                <span class="font-bold text-green-700">{{ fmt(p.amount) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="text-sm text-gray-400 text-center py-4">Belum ada riwayat pembayaran</div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-4 right-4 z-50">
      <div :class="toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'" class="text-white px-5 py-3 rounded-lg shadow-lg">
        {{ toast.type === 'success' ? '✅' : '❌' }} {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';

const apList  = ref<any[]>([]);
const vendors = ref<any[]>([]);
const search  = ref('');
const filterStatus = ref('');
const saving  = ref(false);
const toast   = ref<any>(null);

const showCreateModal = ref(false);
const createForm = ref({ vendor_id: '', amount: 0, vendor_invoice_number: '', invoice_date: '', due_date: '', description: '' });

const paymentModal = ref({ show: false, ap: null as any, amount: 0, date: new Date().toISOString().slice(0,10), method: 'Transfer', reference: '' });
const detailModal  = ref({ show: false, data: null as any });

const fmt     = (v: any) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v)||0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '-';
const isOverdue   = (ap: any) => ap.status !== 'paid' && ap.due_date && new Date(ap.due_date) < new Date();
const daysOverdue = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

const statusLabel = (s: string) => ({ open: 'Open', partial: 'Partial', paid: 'Lunas' }[s] || s);
const statusClass = (s: string) => ({
  open:    'bg-blue-100 text-blue-800',
  partial: 'bg-amber-100 text-amber-800',
  paid:    'bg-green-100 text-green-800',
}[s] || 'bg-gray-100 text-gray-800');

const totals = computed(() => ({
  total:       apList.value.reduce((s, a) => s + Number(a.amount||0), 0),
  paid:        apList.value.reduce((s, a) => s + Number(a.paid_amount||0), 0),
  outstanding: apList.value.reduce((s, a) => s + (Number(a.amount||0) - Number(a.paid_amount||0)), 0),
}));
const overdue  = computed(() => apList.value.filter(isOverdue));
const filtered = computed(() => apList.value.filter(a => {
  const q = search.value.toLowerCase();
  const matchSearch = !q || (a.vendor_name||'').toLowerCase().includes(q) || (a.invoice_number||'').includes(q) || (a.vendor_invoice_number||'').includes(q);
  const matchStatus = !filterStatus.value || a.status === filterStatus.value;
  return matchSearch && matchStatus;
}));

const agingBuckets = computed(() => {
  const buckets = [
    { label: 'Current', key: 'current', class: 'bg-green-50 text-green-800', amount: 0, count: 0 },
    { label: '1–30 hr', key: '1-30',    class: 'bg-yellow-50 text-yellow-800', amount: 0, count: 0 },
    { label: '31–60 hr', key: '31-60',  class: 'bg-orange-50 text-orange-800', amount: 0, count: 0 },
    { label: '61–90 hr', key: '61-90',  class: 'bg-red-50 text-red-800', amount: 0, count: 0 },
    { label: '90+ hr',   key: '90+',    class: 'bg-red-100 text-red-900', amount: 0, count: 0 },
  ];
  for (const a of apList.value.filter(x => x.status !== 'paid')) {
    const d = a.due_date ? Math.floor((Date.now() - new Date(a.due_date).getTime()) / 86400000) : 0;
    const key = d <= 0 ? 'current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
    const b = buckets.find(x => x.key === key);
    if (b) { b.amount += Number(a.amount||0) - Number(a.paid_amount||0); b.count++; }
  }
  return buckets;
});

async function load() {
  const [apRes, vRes] = await Promise.all([api.get('/finance/accounts-payable'), api.get('/procurement/vendors')]);
  apList.value  = apRes.data.data || [];
  vendors.value = vRes.data.data || [];
}

async function createAP() {
  if (!createForm.value.vendor_id || !createForm.value.amount) return;
  saving.value = true;
  try {
    await api.post('/finance/accounts-payable', { ...createForm.value, po_id: null });
    showToast('success', 'AP berhasil ditambahkan');
    showCreateModal.value = false;
    createForm.value = { vendor_id: '', amount: 0, vendor_invoice_number: '', invoice_date: '', due_date: '', description: '' };
    await load();
  } catch (e: any) {
    showToast('error', e.response?.data?.error || 'Gagal menyimpan');
  } finally { saving.value = false; }
}

async function openPayment(ap: any) {
  paymentModal.value = { show: true, ap, amount: Number(ap.amount) - Number(ap.paid_amount), date: new Date().toISOString().slice(0,10), method: 'Transfer', reference: '' };
}

async function recordPayment() {
  saving.value = true;
  try {
    await api.post(`/finance/accounts-payable/${paymentModal.value.ap.id}/payments`, {
      payment_date: paymentModal.value.date,
      amount: paymentModal.value.amount,
      payment_method: paymentModal.value.method,
      reference_number: paymentModal.value.reference,
    });
    showToast('success', 'Pembayaran berhasil dicatat');
    paymentModal.value.show = false;
    await load();
  } catch (e: any) {
    showToast('error', e.response?.data?.error || 'Gagal mencatat pembayaran');
  } finally { saving.value = false; }
}

async function openDetail(ap: any) {
  try {
    const res = await api.get(`/finance/accounts-payable/${ap.id}`);
    detailModal.value = { show: true, data: res.data.data };
  } catch { detailModal.value = { show: true, data: ap }; }
}

const showToast = (type: string, message: string) => {
  toast.value = { type, message };
  setTimeout(() => { toast.value = null; }, 3500);
};

onMounted(load);
</script>
