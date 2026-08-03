<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Sales History</h2>
        <p class="text-sm text-gray-500 mt-1">Historical sales data and trends</p>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-gray-500 uppercase">Total Orders</p>
          <p class="text-2xl font-bold">{{ store.salesStats.total_orders ?? 0 }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-blue-600 uppercase">Open</p>
          <p class="text-2xl font-bold text-blue-700">{{ store.salesStats.open_orders ?? 0 }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-green-600 uppercase">Closed</p>
          <p class="text-2xl font-bold text-green-700">{{ store.salesStats.closed_orders ?? 0 }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-red-600 uppercase">Cancelled</p>
          <p class="text-2xl font-bold text-red-700">{{ store.salesStats.cancelled_orders ?? 0 }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Status</label>
          <select v-model="filters.status" @change="load" class="px-3 py-2 border rounded-md text-sm w-32">
            <option value="all">All</option>
            <option v-for="s in ['draft','open','partial','closed','cancelled']" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">From</label>
          <input v-model="filters.from" type="date" @change="load" class="px-3 py-2 border rounded-md text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">To</label>
          <input v-model="filters.to" type="date" @change="load" class="px-3 py-2 border rounded-md text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Search</label>
          <input v-model="filters.search" @input="load" placeholder="SO# or customer..." class="px-3 py-2 border rounded-md text-sm w-48" />
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SO #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">DOs</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Invoices</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="h in store.salesHistory" :key="h.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ h.so_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ h.customer_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(h.created_at) }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(h.total_amount) }}</td>
              <td class="px-4 py-3 text-center text-sm">{{ h.delivery_count }}</td>
              <td class="px-4 py-3 text-center text-sm">{{ h.invoice_count }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="statusBadge(h.status)" class="px-2 py-1 rounded-full text-xs font-medium">{{ h.status }}</span>
              </td>
            </tr>
            <tr v-if="!store.salesHistory.length"><td colspan="7" class="text-center py-8 text-gray-400">No sales history</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useSalesStore } from '../stores/sales';

const store = useSalesStore();
const filters = ref({ status: 'all', from: '', to: '', search: '' });

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID') : '0';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const statusBadge = (s: string) => ({
  'bg-yellow-100 text-yellow-800': s === 'draft',
  'bg-blue-100 text-blue-800': s === 'open',
  'bg-orange-100 text-orange-800': s === 'partial',
  'bg-green-100 text-green-800': s === 'closed',
  'bg-red-100 text-red-800': s === 'cancelled',
});

const load = () => {
  const p: any = {};
  if (filters.value.status !== 'all') p.status = filters.value.status;
  if (filters.value.from) p.from = filters.value.from;
  if (filters.value.to) p.to = filters.value.to;
  if (filters.value.search) p.search = filters.value.search;
  store.fetchSalesHistory(p);
};

onMounted(async () => {
  await Promise.all([store.fetchSalesHistory(), store.fetchSalesStats()]);
});
</script>
