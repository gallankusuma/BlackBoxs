<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Rework Orders</h2>
          <p class="text-sm text-gray-500 mt-1">Manage rework activities for non-conforming products</p>
        </div>
        <button @click="showCreate = true" class="px-4 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700">+ Create Rework</button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-gray-500 uppercase">Total</p>
          <p class="text-2xl font-bold">{{ store.reworkOrders.length }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-orange-600 uppercase">Pending</p>
          <p class="text-2xl font-bold text-orange-700">{{ store.reworkOrders.filter(r => r.status === 'pending').length }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-blue-600 uppercase">In Progress</p>
          <p class="text-2xl font-bold text-blue-700">{{ store.reworkOrders.filter(r => r.status === 'in_progress').length }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-green-600 uppercase">Completed</p>
          <p class="text-2xl font-bold text-green-700">{{ store.reworkOrders.filter(r => r.status === 'completed').length }}</p>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rework #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NCR Ref</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="r in store.reworkOrders" :key="r.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-orange-600">{{ r.rework_number }}</td>
              <td class="px-4 py-3 text-sm text-blue-600">{{ r.ncr_number || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-900">{{ r.product_name }}</td>
              <td class="px-4 py-3 text-sm text-right">{{ r.quantity }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="statusBadge(r.status)" class="px-2 py-1 rounded-full text-xs font-medium">{{ r.status?.replace('_', ' ') }}</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{{ r.description }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ formatDate(r.created_at) }}</td>
              <td class="px-4 py-3 text-right space-x-1">
                <button v-if="r.status === 'pending'" @click="updateStatus(r.id, 'in_progress')" class="text-blue-600 hover:underline text-xs">Start</button>
                <button v-if="r.status === 'in_progress'" @click="updateStatus(r.id, 'completed')" class="text-green-600 hover:underline text-xs">Complete</button>
                <button v-if="r.status === 'pending'" @click="updateStatus(r.id, 'cancelled')" class="text-red-600 hover:underline text-xs">Cancel</button>
              </td>
            </tr>
            <tr v-if="!store.reworkOrders.length"><td colspan="8" class="text-center py-8 text-gray-400">No rework orders</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Create Modal -->
      <div v-if="showCreate" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 class="text-lg font-bold mb-4">Create Rework Order</h3>
          <form @submit.prevent="createRework" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700">Product</label>
                <select v-model.number="form.product_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Select</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Quantity</label>
                <input v-model.number="form.quantity" type="number" min="1" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Link to NCR (optional)</label>
              <select v-model.number="form.ncr_id" class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="">None</option>
                <option v-for="n in ncrs" :key="n.id" :value="n.id">{{ n.ncr_number }} — {{ n.description?.substring(0, 40) }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Description</label>
              <textarea v-model="form.description" required rows="2" class="mt-1 w-full px-3 py-2 border rounded-md text-sm"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Instructions</label>
              <textarea v-model="form.instructions" rows="3" class="mt-1 w-full px-3 py-2 border rounded-md text-sm"></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showCreate = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700">Create</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQualityStore } from '../stores/quality';
import { api } from '../lib/api';

const store = useQualityStore();
const products = ref<any[]>([]);
const ncrs = ref<any[]>([]);
const showCreate = ref(false);
const form = ref({ product_id: '', ncr_id: '', quantity: 1, description: '', instructions: '' });

const statusBadge = (s: string) => ({
  'bg-orange-100 text-orange-800': s === 'pending',
  'bg-blue-100 text-blue-800': s === 'in_progress',
  'bg-green-100 text-green-800': s === 'completed',
  'bg-red-100 text-red-800': s === 'cancelled',
});

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

onMounted(async () => {
  await store.fetchRework();
  try { products.value = (await api.get('/products')).data.data || []; } catch {}
  try { ncrs.value = store.ncrs.length ? store.ncrs : []; if (!ncrs.value.length) { await store.fetchNCRs(); ncrs.value = store.ncrs; } } catch {}
});

const createRework = async () => {
  await store.createRework(form.value);
  showCreate.value = false;
  form.value = { product_id: '', ncr_id: '', quantity: 1, description: '', instructions: '' };
};

const updateStatus = async (id: number, status: string) => {
  await store.updateReworkStatus(id, status);
};
</script>
