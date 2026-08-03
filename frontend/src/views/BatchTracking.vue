<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto flex flex-col gap-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p class="text-sm text-gray-500">Inventory</p>
          <h2 class="text-2xl font-bold text-gray-900">Batch / Lot Tracking</h2>
          <p class="text-sm text-gray-600">Traceability batch dari GRN → produksi → penjualan.</p>
        </div>
        <div class="flex gap-3">
          <select v-model="status" class="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">All status</option>
            <option value="open">Open</option>
            <option value="released">Released</option>
            <option value="blocked">Blocked</option>
          </select>
          <input v-model="search" type="text" placeholder="Cari batch / produk" class="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">MFG</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">EXP</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Location</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="filtered.length === 0">
              <td colspan="8" class="px-4 py-6 text-center text-gray-500">No batches found</td>
            </tr>
            <tr v-for="b in filtered" :key="b.id">
              <td class="px-4 py-3 text-sm font-semibold text-gray-900">{{ b.batch_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ b.product_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ b.quantity }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ formatDate(b.mfg_date) }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ formatDate(b.exp_date) || '-' }}</td>
              <td class="px-4 py-3 text-sm">
                <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold" :class="statusClass(b.status)">{{ b.status }}</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ b.location_code || '-' }}</td>
              <td class="px-4 py-3 text-right text-sm">
                <button class="text-blue-600 hover:text-blue-800" @click="viewTrace(b)">Trace</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="trace" class="bg-white rounded-md border border-gray-200 shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Trace {{ trace.batch_number }}</h3>
            <p class="text-sm text-gray-600">Product: {{ trace.product_name }}</p>
          </div>
          <button class="text-gray-500 hover:text-gray-700" @click="trace = null">&times;</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <div class="border rounded-md p-3">
            <p class="font-semibold text-gray-900 mb-2">Lifecycle</p>
            <ul class="space-y-1 list-disc list-inside">
              <li>GRN / receipt reference: TBD</li>
              <li>WO usage / issue: TBD</li>
              <li>Delivery / sales: TBD</li>
            </ul>
            <p class="text-xs text-gray-500 mt-2">Integrasi detail referensi akan dihubungkan ke stock movements ketika tersedia.</p>
          </div>
          <div class="border rounded-md p-3">
            <p class="font-semibold text-gray-900 mb-2">QC Status</p>
            <p class="text-sm">{{ trace.qc_status || 'pending' }}</p>
            <p class="text-xs text-gray-500">Update rilis batch via modul QC.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useInventoryStore } from '@/stores/inventory';

const inventoryStore = useInventoryStore();
const search = ref('');
const status = ref('');
const trace = ref<any | null>(null);

onMounted(async () => {
  await inventoryStore.fetchBatches();
});

const filtered = computed(() => {
  const term = search.value.toLowerCase();
  return inventoryStore.batches
    .filter((b: any) => (!status.value ? true : (b.status || '').toLowerCase() === status.value.toLowerCase()))
    .filter((b: any) =>
      !term ||
      (b.batch_number || '').toLowerCase().includes(term) ||
      (b.product_name || '').toLowerCase().includes(term) ||
      (b.sku || '').toLowerCase().includes(term)
    );
});

const statusClass = (value: string) => {
  const v = (value || '').toLowerCase();
  if (v === 'released') return 'bg-emerald-50 text-emerald-700';
  if (v === 'blocked') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
};

const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '');

const viewTrace = (batch: any) => {
  trace.value = batch;
};
</script>
