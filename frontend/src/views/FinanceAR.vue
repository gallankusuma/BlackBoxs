<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">🧾 Accounts Receivable</h1>
        <p class="text-gray-500 text-sm mt-1">Invoice ke klien — tracking penagihan & pembayaran</p>
      </div>
      <button @click="openCreate" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">+ Buat Invoice</button>
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border p-4 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-medium">Total Piutang</p>
        <p class="text-2xl font-black text-gray-900 mt-1">{{ fmt(totals.total) }}</p>
      </div>
      <div class="bg-white rounded-xl border p-4 shadow-sm">
        <p class="text-xs text-green-600 uppercase font-medium">Terkumpul</p>
        <p class="text-2xl font-black text-green-700 mt-1">{{ fmt(totals.paid) }}</p>
      </div>
      <div class="bg-amber-50 rounded-xl border border-amber-200 p-4 shadow-sm">
        <p class="text-xs text-amber-600 uppercase font-medium">Outstanding</p>
        <p class="text-2xl font-black text-amber-700 mt-1">{{ fmt(totals.outstanding) }}</p>
      </div>
      <div class="bg-red-50 rounded-xl border border-red-200 p-4 shadow-sm">
        <p class="text-xs text-red-600 uppercase font-medium">Overdue</p>
        <p class="text-2xl font-black text-red-700 mt-1">{{ overdue.length }}</p>
        <p class="text-xs text-red-500">invoice jatuh tempo</p>
      </div>
    </div>

    <!-- Aging -->
    <div class="bg-white rounded-xl border p-4 shadow-sm">
      <h3 class="font-semibold text-gray-700 mb-3">📊 AR Aging</h3>
      <div class="grid grid-cols-5 gap-2 text-center text-sm">
        <div v-for="b in agingBuckets" :key="b.label" class="rounded-lg p-3" :class="b.cls">
          <p class="text-xs font-medium opacity-80">{{ b.label }}</p>
          <p class="text-lg font-black mt-1">{{ fmt(b.amount) }}</p>
          <p class="text-xs opacity-70">{{ b.count }} inv</p>
        </div>
      </div>
    </div>

    <!-- Filter & Table -->
    <div class="flex gap-3 flex-wrap items-center">
      <input v-model="search" type="text" placeholder="Cari klien / invoice..." class="px-3 py-2 border rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500" />
      <select v-model="filterStatus" class="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
        <option value="">Semua Status</option>
        <option value="open">Open</option>
        <option value="partial">Partial</option>
        <option value="paid">Paid</option>
      </select>
    </div>

    <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-800 text-white">
          <tr>
            <th class="text-left px-4 py-3">No. Invoice</th>
            <th class="text-left px-4 py-3">Klien</th>
            <th class="text-left px-4 py-3">Project</th>
            <th class="text-left px-4 py-3">Jatuh Tempo</th>
            <th class="text-right px-4 py-3">Jumlah</th>
            <th class="text-right px-4 py-3">Terkumpul</th>
            <th class="text-right px-4 py-3">Sisa</th>
            <th class="text-center px-4 py-3">Status</th>
            <th class="text-center px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="ar in filtered" :key="ar.id" class="hover:bg-blue-50/30" :class="{ 'bg-red-50': isOverdue(ar) }">
            <td class="px-4 py-3 font-mono text-blue-700 font-semibold">{{ ar.invoice_number || '-' }}</td>
            <td class="px-4 py-3 font-medium">{{ ar.customer_name || '-' }}</td>
            <td class="px-4 py-3 text-gray-600">{{ ar.project_name || '-' }}</td>
            <td class="px-4 py-3" :class="isOverdue(ar) ? 'text-red-600 font-semibold' : 'text-gray-600'">
              {{ ar.due_date ? fmtDate(ar.due_date) : '-' }}
            </td>
            <td class="px-4 py-3 text-right font-medium">{{ fmt(ar.amount) }}</td>
            <td class="px-4 py-3 text-right text-green-700">{{ fmt(ar.paid_amount) }}</td>
            <td class="px-4 py-3 text-right font-semibold text-amber-700">{{ fmt(Number(ar.amount) - Number(ar.paid_amount)) }}</td>
            <td class="px-4 py-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="statusClass(ar.status)">{{ statusLabel(ar.status) }}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex gap-1 justify-center">
                <button @click="openDetail(ar)" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Detail</button>
                <button v-if="ar.status !== 'paid'" @click="openCollect(ar)" class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">Terima</button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="9" class="px-4 py-10 text-center text-gray-400">Belum ada data AR</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Invoice Modal -->
    <div v-if="showCreate" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showCreate = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div class="px-6 py-4 border-b bg-slate-800 flex justify-between items-center">
          <h2 class="font-bold text-white">🧾 Buat Invoice AR</h2>
          <button @click="showCreate = false" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <form @submit.prevent="createAR" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Klien *</label>
              <select v-model="createForm.customer_id" required class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">Pilih klien</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select v-model="createForm.project_id" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">Pilih project</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah (excl. PPN) *</label>
              <input v-model.number="createForm.amount" type="number" required class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PPN %</label>
              <input v-model.number="createForm.tax_percent" type="number" min="0" max="100" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tgl Invoice</label>
              <input v-model="createForm.invoice_date" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jatuh Tempo</label>
              <input v-model="createForm.due_date" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
            <textarea v-model="createForm.description" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
          </div>
          <div v-if="createForm.amount > 0" class="bg-blue-50 rounded-lg p-3 text-sm">
            <div class="flex justify-between"><span>Subtotal</span><span class="font-medium">{{ fmt(createForm.amount) }}</span></div>
            <div class="flex justify-between"><span>PPN {{ createForm.tax_percent }}%</span><span>{{ fmt(createForm.amount * createForm.tax_percent / 100) }}</span></div>
            <div class="flex justify-between font-black border-t mt-1 pt-1"><span>Total</span><span>{{ fmt(createForm.amount * (1 + createForm.tax_percent/100)) }}</span></div>
          </div>
          <div class="flex justify-end gap-3 border-t pt-3">
            <button type="button" @click="showCreate = false" class="px-4 py-2 border rounded-lg text-sm">Batal</button>
            <button type="submit" :disabled="saving" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{{ saving ? 'Menyimpan...' : 'Buat Invoice' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Collect Payment Modal -->
    <div v-if="collectModal.show" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="collectModal.show = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div class="px-6 py-4 border-b bg-green-700 flex justify-between items-center">
          <div>
            <h2 class="font-bold text-white">💰 Terima Pembayaran</h2>
            <p class="text-green-200 text-xs">{{ collectModal.ar?.customer_name }}</p>
          </div>
          <button @click="collectModal.show = false" class="text-green-200 hover:text-white text-xl">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="bg-green-50 rounded-lg p-3 text-sm space-y-1">
            <div class="flex justify-between"><span>Total Invoice</span><span class="font-bold">{{ fmt(collectModal.ar?.amount) }}</span></div>
            <div class="flex justify-between"><span>Terkumpul</span><span class="font-bold text-green-700">{{ fmt(collectModal.ar?.paid_amount) }}</span></div>
            <div class="flex justify-between border-t pt-1 font-black"><span>Sisa</span><span class="text-amber-700">{{ fmt(Number(collectModal.ar?.amount) - Number(collectModal.ar?.paid_amount)) }}</span></div>
          </div>
          <form @submit.prevent="recordCollection" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Diterima *</label>
              <input v-model.number="collectModal.amount" type="number" required class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                <input v-model="collectModal.date" type="date" class="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Metode</label>
                <select v-model="collectModal.method" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option>Transfer</option><option>Tunai</option><option>Cek</option><option>Giro</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">No. Referensi</label>
              <input v-model="collectModal.reference" type="text" placeholder="No. transfer / kwitansi" class="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div class="flex justify-end gap-3 border-t pt-3">
              <button type="button" @click="collectModal.show = false" class="px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button type="submit" :disabled="saving" class="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{{ saving ? '...' : '✓ Terima' }}</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="detailModal.show" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="detailModal.show = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <div class="px-6 py-4 border-b bg-slate-800 flex justify-between items-center sticky top-0">
          <h2 class="font-bold text-white">{{ detailModal.data?.invoice_number }}</h2>
          <button @click="detailModal.show = false" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <div v-if="detailModal.data" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-500">Klien</p><p class="font-semibold">{{ detailModal.data.customer_name }}</p></div>
            <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-500">Project</p><p class="font-semibold">{{ detailModal.data.project_name || '-' }}</p></div>
            <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-500">Tgl Invoice</p><p class="font-semibold">{{ fmtDate(detailModal.data.invoice_date) }}</p></div>
            <div class="bg-gray-50 rounded-lg p-3"><p class="text-xs text-gray-500">Jatuh Tempo</p><p class="font-semibold">{{ fmtDate(detailModal.data.due_date) }}</p></div>
          </div>
          <div class="grid grid-cols-3 gap-3 text-sm text-center">
            <div class="bg-blue-50 rounded-lg p-3"><p class="text-xs text-blue-600">Total</p><p class="font-black text-blue-800">{{ fmt(detailModal.data.amount) }}</p></div>
            <div class="bg-green-50 rounded-lg p-3"><p class="text-xs text-green-600">Terkumpul</p><p class="font-black text-green-800">{{ fmt(detailModal.data.paid_amount) }}</p></div>
            <div class="bg-amber-50 rounded-lg p-3"><p class="text-xs text-amber-600">Sisa</p><p class="font-black text-amber-800">{{ fmt(Number(detailModal.data.amount) - Number(detailModal.data.paid_amount)) }}</p></div>
          </div>
          <div v-if="detailModal.data.payments?.length">
            <h3 class="font-semibold text-gray-700 mb-2">🧾 Riwayat Penerimaan</h3>
            <div class="space-y-2">
              <div v-for="p in detailModal.data.payments" :key="p.id" class="flex justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                <div><span class="font-medium">{{ fmtDate(p.payment_date) }}</span><span class="text-gray-500 ml-2">{{ p.payment_method }}</span></div>
                <span class="font-bold text-green-700">{{ fmt(p.amount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

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

const arList   = ref<any[]>([]);
const clients  = ref<any[]>([]);
const projects = ref<any[]>([]);
const search   = ref('');
const filterStatus = ref('');
const saving   = ref(false);
const toast    = ref<any>(null);
const showCreate = ref(false);

const createForm = ref({ customer_id: '', project_id: '', amount: 0, tax_percent: 11, invoice_date: new Date().toISOString().slice(0,10), due_date: '', description: '' });
const collectModal = ref({ show: false, ar: null as any, amount: 0, date: new Date().toISOString().slice(0,10), method: 'Transfer', reference: '' });
const detailModal  = ref({ show: false, data: null as any });

const fmt     = (v: any) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v)||0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '-';
const isOverdue = (ar: any) => ar.status !== 'paid' && ar.due_date && new Date(ar.due_date) < new Date();
const statusLabel = (s: string) => ({ open:'Open', partial:'Partial', paid:'Lunas' }[s] || s);
const statusClass = (s: string) => ({ open:'bg-blue-100 text-blue-800', partial:'bg-amber-100 text-amber-800', paid:'bg-green-100 text-green-800' }[s] || 'bg-gray-100 text-gray-800');

const totals = computed(() => ({
  total:       arList.value.reduce((s,a) => s + Number(a.amount||0), 0),
  paid:        arList.value.reduce((s,a) => s + Number(a.paid_amount||0), 0),
  outstanding: arList.value.reduce((s,a) => s + (Number(a.amount||0) - Number(a.paid_amount||0)), 0),
}));
const overdue  = computed(() => arList.value.filter(isOverdue));
const filtered = computed(() => arList.value.filter(a => {
  const q = search.value.toLowerCase();
  return (!q || (a.customer_name||'').toLowerCase().includes(q) || (a.invoice_number||'').includes(q))
    && (!filterStatus.value || a.status === filterStatus.value);
}));

const agingBuckets = computed(() => {
  const bs = [
    { label:'Current', key:'current', cls:'bg-green-50 text-green-800', amount:0, count:0 },
    { label:'1–30 hr', key:'1-30',   cls:'bg-yellow-50 text-yellow-800', amount:0, count:0 },
    { label:'31–60 hr',key:'31-60',  cls:'bg-orange-50 text-orange-800', amount:0, count:0 },
    { label:'61–90 hr',key:'61-90',  cls:'bg-red-50 text-red-800', amount:0, count:0 },
    { label:'90+ hr',  key:'90+',    cls:'bg-red-100 text-red-900', amount:0, count:0 },
  ];
  for (const a of arList.value.filter(x => x.status !== 'paid')) {
    const d = a.due_date ? Math.floor((Date.now() - new Date(a.due_date).getTime()) / 86400000) : 0;
    const key = d <= 0 ? 'current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
    const b = bs.find(x => x.key === key);
    if (b) { b.amount += Number(a.amount||0) - Number(a.paid_amount||0); b.count++; }
  }
  return bs;
});

async function load() {
  const [arRes, cRes, pRes] = await Promise.all([
    api.get('/finance/accounts-receivable'),
    api.get('/clients'),
    api.get('/projects'),
  ]);
  arList.value   = arRes.data.data || [];
  clients.value  = cRes.data.data  || cRes.data || [];
  projects.value = pRes.data.data  || pRes.data || [];
}

function openCreate() {
  createForm.value = { customer_id:'', project_id:'', amount:0, tax_percent:11, invoice_date: new Date().toISOString().slice(0,10), due_date:'', description:'' };
  showCreate.value = true;
}

async function createAR() {
  saving.value = true;
  try {
    await api.post('/finance/accounts-receivable/create', createForm.value);
    showCreate.value = false;
    showToast('success', 'Invoice AR berhasil dibuat');
    await load();
  } catch (e: any) { showToast('error', e.response?.data?.error || 'Gagal'); } finally { saving.value = false; }
}

function openCollect(ar: any) {
  collectModal.value = { show:true, ar, amount: Number(ar.amount)-Number(ar.paid_amount), date: new Date().toISOString().slice(0,10), method:'Transfer', reference:'' };
}

async function recordCollection() {
  saving.value = true;
  try {
    await api.post(`/finance/accounts-receivable/${collectModal.value.ar.id}/payments`, {
      payment_date: collectModal.value.date, amount: collectModal.value.amount,
      payment_method: collectModal.value.method, reference_number: collectModal.value.reference,
    });
    showToast('success', 'Penerimaan dicatat');
    collectModal.value.show = false;
    await load();
  } catch (e: any) { showToast('error', 'Gagal'); } finally { saving.value = false; }
}

async function openDetail(ar: any) {
  try {
    const res = await api.get(`/finance/accounts-receivable/${ar.id}`);
    detailModal.value = { show:true, data: res.data.data };
  } catch { detailModal.value = { show:true, data: ar }; }
}

const showToast = (type: string, message: string) => {
  toast.value = { type, message };
  setTimeout(() => { toast.value = null; }, 3500);
};

onMounted(load);
</script>
