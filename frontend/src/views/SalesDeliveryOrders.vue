<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Delivery Orders</h2>
          <p class="text-sm text-gray-500 mt-1">Pick, pack, and ship — delivery order management</p>
        </div>
        <button @click="showCreate = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ Create DO</button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-gray-500 uppercase">Total</p>
          <p class="text-2xl font-bold">{{ store.deliveries.length }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-yellow-600 uppercase">Draft</p>
          <p class="text-2xl font-bold text-yellow-700">{{ store.deliveries.filter(d => d.status === 'draft').length }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-blue-600 uppercase">Shipped</p>
          <p class="text-2xl font-bold text-blue-700">{{ store.deliveries.filter(d => d.status === 'shipped').length }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-green-600 uppercase">Delivered</p>
          <p class="text-2xl font-bold text-green-700">{{ store.deliveries.filter(d => d.status === 'delivered').length }}</p>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SO #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship Date</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="d in store.deliveries" :key="d.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ d.do_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ d.so_number || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ d.customer_name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(d.shipped_at) }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="statusBadge(d.status)" class="px-2 py-1 rounded-full text-xs font-medium">{{ d.status }}</span>
              </td>
              <td class="px-4 py-3 text-right space-x-1">
                <button v-if="d.status === 'draft'" @click="ship(d.id)" class="text-blue-600 hover:underline text-xs">Ship</button>
                <button v-if="d.status === 'shipped'" @click="deliver(d.id)" class="text-green-600 hover:underline text-xs">Delivered</button>
              </td>
            </tr>
            <tr v-if="!store.deliveries.length"><td colspan="6" class="text-center py-8 text-gray-400">No delivery orders</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Create Modal -->
      <div v-if="showCreate" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-4">Create Delivery Order</h3>
          <form @submit.prevent="createDO" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700">Sales Order</label>
              <select v-model.number="form.so_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select</option>
                <option v-for="o in store.salesOrders.filter(o => o.status === 'open')" :key="o.id" :value="o.id">{{ o.so_number }} — {{ o.customer_name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Ship Date</label>
              <input v-model="form.shipped_at" type="date" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Notes</label>
              <textarea v-model="form.notes" rows="2" class="mt-1 w-full px-3 py-2 border rounded-md text-sm"></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showCreate = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useSalesStore } from '../stores/sales';
import { api } from '../lib/api';

const store = useSalesStore();
const showCreate = ref(false);
const form = ref({ so_id: '', shipped_at: '', notes: '' });

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const statusBadge = (s: string) => ({
  'bg-yellow-100 text-yellow-800': s === 'draft',
  'bg-blue-100 text-blue-800': s === 'shipped',
  'bg-green-100 text-green-800': s === 'delivered',
});

onMounted(async () => {
  await Promise.all([store.fetchDeliveries(), store.fetchSalesOrders()]);
});

const createDO = async () => {
  await store.createDelivery({ so_id: Number(form.value.so_id), shipped_at: form.value.shipped_at, notes: form.value.notes });
  showCreate.value = false;
  form.value = { so_id: '', shipped_at: '', notes: '' };
};

const ship = async (id: number) => {
  try { await api.put(`/sales/deliveries/${id}`, { status: 'shipped' }); await store.fetchDeliveries(); } catch {}
};
const deliver = async (id: number) => {
  try { await api.put(`/sales/deliveries/${id}`, { status: 'delivered' }); await store.fetchDeliveries(); } catch {}
};
</script>
