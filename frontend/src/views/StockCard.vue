<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Stock Card</h2>
          <div class="flex gap-3">
            <button @click="load" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Refresh</button>
            <button @click="exportCsv" class="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Export CSV</button>
          </div>
        </div>

        <div class="bg-white shadow-sm rounded-md p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 tilt-card">
          <div>
            <label class="block text-sm font-medium text-gray-700">Product</label>
            <select v-model.number="filters.productId" class="mt-1 block w-full border-gray-300 rounded-md">
              <option :value="0">All products</option>
              <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} ({{ p.sku }})</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Warehouse</label>
            <select v-model.number="filters.warehouseId" class="mt-1 block w-full border-gray-300 rounded-md">
              <option :value="0">All warehouses</option>
              <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">From</label>
            <input type="date" v-model="filters.from" class="mt-1 block w-full border-gray-300 rounded-md" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">To</label>
            <input type="date" v-model="filters.to" class="mt-1 block w-full border-gray-300 rounded-md" />
          </div>
        </div>

        <div class="bg-white shadow overflow-hidden sm:rounded-md tilt-card">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref No</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">IN</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">OUT</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="rows.length === 0">
                <td colspan="8" class="px-4 py-6 text-center text-gray-500">No data</td>
              </tr>
              <tr v-else v-for="(r, idx) in rows" :key="idx">
                <td class="px-4 py-2 text-sm text-gray-900">{{ r.date }}</td>
                <td class="px-4 py-2 text-sm text-gray-700">{{ r.ref }}</td>
                <td class="px-4 py-2 text-sm">
                  <span :class="r.type === 'IN' ? 'text-green-600' : r.type === 'OUT' ? 'text-red-600' : 'text-gray-600'">{{ r.type }}</span>
                </td>
                <td class="px-4 py-2 text-sm text-gray-700">{{ r.warehouse }}</td>
                <td class="px-4 py-2 text-sm text-right">{{ formatQty(r.in) }}</td>
                <td class="px-4 py-2 text-sm text-right">{{ formatQty(r.out) }}</td>
                <td class="px-4 py-2 text-sm text-right font-semibold">{{ formatQty(r.balance) }}</td>
                <td class="px-4 py-2 text-sm text-gray-500">{{ r.notes || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../lib/api';

interface MovementRow {
  dateTs: number;
  date: string;
  ref: string;
  type: 'IN' | 'OUT';
  warehouse: string;
  warehouse_id: number;
  product_id: number;
  qty: number;
  notes: string;
}

interface Product { id: number; name: string; sku: string }
interface Warehouse { id: number; name: string }

const products = ref<Product[]>([]);
const warehouses = ref<Warehouse[]>([]);
const transfers = ref<any[]>([]);
const adjustments = ref<any[]>([]);

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const filters = reactive({
  productId: 0,
  warehouseId: 0,
  from: toDateInput(monthStart),
  to: toDateInput(today),
});

const load = async () => {
  await Promise.all([fetchProducts(), fetchWarehouses(), fetchTransfers(), fetchAdjustments()]);
};

onMounted(() => {
  load();
});

const fetchProducts = async () => {
  const res = await api.get('/api/products');
  products.value = res.data.data || [];
};

const fetchWarehouses = async () => {
  const res = await api.get('/api/warehouses');
  warehouses.value = res.data.data || [];
};

const fetchTransfers = async () => {
  const res = await api.get('/api/inventory/stock-transfers');
  transfers.value = res.data.data || [];
};

const fetchAdjustments = async () => {
  const res = await api.get('/api/inventory/stock-adjustments');
  adjustments.value = res.data.data || [];
};

const warehouseName = (id: number) => warehouses.value.find((w) => w.id === id)?.name || `WH-${id}`;

const movements = computed<MovementRow[]>(() => {
  const rows: MovementRow[] = [];

  // Transfers: generate OUT (source) and IN (destination)
  transfers.value.forEach((t: any) => {
    const ts = new Date(t.moved_at).getTime();
    const dateStr = new Date(t.moved_at).toLocaleString();
    // OUT from source
    rows.push({
      dateTs: ts,
      date: dateStr,
      ref: t.reference_id || `TRF-${t.id}`,
      type: 'OUT',
      warehouse: warehouseName(t.from_warehouse_id),
      warehouse_id: t.from_warehouse_id,
      product_id: t.product_id,
      qty: Number(t.quantity) || 0,
      notes: `Transfer to ${warehouseName(t.to_warehouse_id)}`,
    });
    // IN to destination
    rows.push({
      dateTs: ts,
      date: dateStr,
      ref: t.reference_id || `TRF-${t.id}`,
      type: 'IN',
      warehouse: warehouseName(t.to_warehouse_id),
      warehouse_id: t.to_warehouse_id,
      product_id: t.product_id,
      qty: Number(t.quantity) || 0,
      notes: `Transfer from ${warehouseName(t.from_warehouse_id)}`,
    });
  });

  // Adjustments: qty may be positive (IN) or negative (OUT)
  adjustments.value.forEach((a: any) => {
    const ts = new Date(a.moved_at).getTime();
    const dateStr = new Date(a.moved_at).toLocaleString();
    const qty = Number(a.quantity) || 0;
    rows.push({
      dateTs: ts,
      date: dateStr,
      ref: a.reference_id || `ADJ-${a.id}`,
      type: qty >= 0 ? 'IN' : 'OUT',
      warehouse: warehouseName(a.warehouse_id),
      warehouse_id: a.warehouse_id,
      product_id: a.product_id,
      qty: Math.abs(qty),
      notes: a.notes || a.reason || '',
    });
  });

  return rows;
});

const filtered = computed(() => {
  return movements.value
    .filter((m) => (filters.productId ? m.product_id === filters.productId : true))
    .filter((m) => (filters.warehouseId ? m.warehouse_id === filters.warehouseId : true))
    .sort((a, b) => a.dateTs - b.dateTs);
});

const rows = computed(() => {
  let balance = 0;
  const fromTs = filters.from ? new Date(filters.from + 'T00:00:00').getTime() : -Infinity;
  const toTs = filters.to ? new Date(filters.to + 'T23:59:59').getTime() : Infinity;

  // Opening balance
  filtered.value.forEach((m) => {
    if (m.dateTs < fromTs) {
      if (m.type === 'IN') balance += m.qty;
      if (m.type === 'OUT') balance -= m.qty;
    }
  });

  const within = filtered.value.filter((m) => m.dateTs >= fromTs && m.dateTs <= toTs);

  return within.map((m) => {
    const inc = m.type === 'IN' ? m.qty : 0;
    const dec = m.type === 'OUT' ? m.qty : 0;
    balance = balance + inc - dec;
    return {
      date: m.date,
      ref: m.ref,
      type: m.type,
      warehouse: m.warehouse,
      in: inc,
      out: dec,
      balance,
      notes: m.notes,
    };
  });
});

const formatQty = (v: number) => (v ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '');

const exportCsv = () => {
  const headers = ['Date', 'Ref No', 'Type', 'Warehouse', 'IN', 'OUT', 'Balance', 'Notes'];
  const lines = rows.value.map((r) => [r.date, r.ref, r.type, r.warehouse, r.in, r.out, r.balance, (r.notes || '').replace(/\n/g, ' ')].join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stock_card.csv';
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<style scoped>
</style>
