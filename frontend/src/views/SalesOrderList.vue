<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Sales Orders</h2>
          <p class="text-sm text-gray-500 mt-1">Manage all sales orders — create, track, and fulfill</p>
        </div>
        <button @click="showCreate = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ New SO</button>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-gray-500 uppercase">Total</p>
          <p class="text-2xl font-bold">{{ store.salesOrders.length }}</p>
        </div>
        <div v-for="s in ['draft','open','partial','closed','cancelled']" :key="s" class="bg-white shadow rounded-lg p-4">
          <p class="text-xs uppercase" :class="statusColor(s)">{{ s }}</p>
          <p class="text-2xl font-bold" :class="statusColor(s)">{{ store.salesOrders.filter(o => o.status === s).length }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Status</label>
          <select v-model="filters.status" class="px-3 py-2 border rounded-md text-sm w-32">
            <option value="all">All</option>
            <option v-for="s in ['draft','open','partial','closed','cancelled']" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Search</label>
          <input v-model="filters.search" placeholder="SO# or customer..." class="px-3 py-2 border rounded-md text-sm w-48" />
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
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship Date</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="o in filtered" :key="o.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ o.so_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ o.customer_name || customers[o.customer_id] || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(o.created_at) }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(o.expected_ship_date) }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(o.total_amount || o.total) }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="statusBadge(o.status)" class="px-2 py-1 rounded-full text-xs font-medium">{{ o.status }}</span>
              </td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="6" class="text-center py-8 text-gray-400">No orders found</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Create SO Modal -->
      <div v-if="showCreate" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold mb-4">New Sales Order</h3>
          <form @submit.prevent="createSO" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700">Customer</label>
              <select v-model.number="form.customer_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select</option>
                <option v-for="c in store.customers" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Expected Ship Date</label>
              <input v-model="form.expected_ship_date" type="date" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Notes</label>
              <textarea v-model="form.notes" rows="2" class="mt-1 w-full px-3 py-2 border rounded-md text-sm"></textarea>
            </div>
            <!-- Line items -->
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="text-sm font-medium text-gray-700">Items</label>
                <button type="button" @click="addItem" class="text-xs text-blue-600 hover:underline">+ Add Item</button>
              </div>
              <div v-for="(item, i) in form.items" :key="i" class="grid grid-cols-12 gap-2 mb-2">
                <select v-model.number="item.product_id" class="col-span-5 px-2 py-1 border rounded text-sm">
                  <option value="">Product</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <input v-model.number="item.quantity" type="number" min="1" placeholder="Qty" class="col-span-2 px-2 py-1 border rounded text-sm" />
                <input v-model.number="item.unit_price" type="number" step="0.01" placeholder="Price" class="col-span-3 px-2 py-1 border rounded text-sm" />
                <button type="button" @click="form.items.splice(i, 1)" class="col-span-2 text-red-500 text-xs">Remove</button>
              </div>
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
import { onMounted, ref, computed } from 'vue';
import { useSalesStore } from '../stores/sales';
import { api } from '../lib/api';

const store = useSalesStore();
const products = ref<any[]>([]);
const customers = ref<Record<number, string>>({});
const showCreate = ref(false);
const filters = ref({ status: 'all', search: '' });
const form = ref({ customer_id: '', expected_ship_date: '', notes: '', items: [{ product_id: '', quantity: 1, unit_price: 0 }] });

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID') : '0';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const statusColor = (s: string) => ({
  'text-yellow-600': s === 'draft',
  'text-blue-600': s === 'open',
  'text-orange-600': s === 'partial',
  'text-green-600': s === 'closed',
  'text-red-600': s === 'cancelled',
})[`text-${s === 'draft' ? 'yellow' : s === 'open' ? 'blue' : s === 'partial' ? 'orange' : s === 'closed' ? 'green' : 'red'}-600`] ? `text-${s === 'draft' ? 'yellow' : s === 'open' ? 'blue' : s === 'partial' ? 'orange' : s === 'closed' ? 'green' : 'red'}-600` : 'text-gray-600';

const statusBadge = (s: string) => ({
  'bg-yellow-100 text-yellow-800': s === 'draft',
  'bg-blue-100 text-blue-800': s === 'open',
  'bg-orange-100 text-orange-800': s === 'partial',
  'bg-green-100 text-green-800': s === 'closed',
  'bg-red-100 text-red-800': s === 'cancelled',
});

const filtered = computed(() => {
  let list = store.salesOrders;
  if (filters.value.status !== 'all') list = list.filter(o => o.status === filters.value.status);
  if (filters.value.search) {
    const q = filters.value.search.toLowerCase();
    list = list.filter(o => (o.so_number || '').toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q));
  }
  return list;
});

const addItem = () => form.value.items.push({ product_id: '', quantity: 1, unit_price: 0 });

onMounted(async () => {
  await Promise.all([store.fetchSalesOrders(), store.fetchCustomers()]);
  store.customers.forEach((c: any) => { customers.value[c.id] = c.name; });
  try { products.value = (await api.get('/products')).data.data || []; } catch {}
});

const createSO = async () => {
  await store.createSalesOrder({ customer_id: Number(form.value.customer_id), expected_ship_date: form.value.expected_ship_date, notes: form.value.notes, items: form.value.items.filter(i => i.product_id).map(i => ({ product_id: Number(i.product_id), quantity: i.quantity, unit_price: i.unit_price })) });
  showCreate.value = false;
  form.value = { customer_id: '', expected_ship_date: '', notes: '', items: [{ product_id: '', quantity: 1, unit_price: 0 }] };
};
</script>
