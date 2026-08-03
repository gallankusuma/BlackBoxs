<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Finished Goods Receipt</h2>
          <p class="text-sm text-gray-500 mt-1">Receive completed products into warehouse inventory</p>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">WO#</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Planned</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">QC</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="r in store.fgReceipts" :key="r.wo_id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ r.wo_number || 'WO-' + r.wo_id }}</td>
              <td class="px-4 py-3 text-sm">
                <div class="text-gray-900">{{ r.product_name }}</div>
                <div class="text-xs text-gray-400">{{ r.sku }}</div>
              </td>
              <td class="px-4 py-3 text-sm text-right text-gray-600">{{ r.planned_qty }}</td>
              <td class="px-4 py-3 text-sm text-right text-green-600 font-medium">{{ r.output_quantity || 0 }}</td>
              <td class="px-4 py-3">
                <span :class="qcBadge(r.qc_status)" class="px-2 py-1 text-xs rounded-full font-medium">
                  {{ r.qc_status || 'N/A' }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-right text-blue-600 font-medium">{{ r.received_into_stock }}</td>
              <td class="px-4 py-3 text-sm text-right">
                <span :class="pendingQty(r) > 0 ? 'text-red-600 font-bold' : 'text-green-600'">
                  {{ pendingQty(r) > 0 ? pendingQty(r) : 'Done' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button v-if="pendingQty(r) > 0 && r.qc_status === 'passed'"
                  @click="openReceiveModal(r)" class="text-sm text-blue-600 hover:text-blue-900 font-medium">
                  Receive
                </button>
                <span v-else-if="pendingQty(r) <= 0" class="text-xs text-green-600">Received</span>
                <span v-else class="text-xs text-gray-400">Awaiting QC</span>
              </td>
            </tr>
            <tr v-if="!store.fgReceipts.length">
              <td colspan="8" class="text-center py-8 text-gray-400">No completed work orders</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Receive Modal -->
      <div v-if="showModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-4">Receive Finished Goods</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Product</label>
              <p class="text-sm text-gray-900">{{ selectedReceipt?.product_name }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Warehouse</label>
              <select v-model.number="receiveForm.warehouse_id" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="">Select Warehouse</option>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Quantity</label>
              <input v-model.number="receiveForm.quantity" type="number" min="1" required
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Batch Number</label>
              <input v-model="receiveForm.batch_number" type="text"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                :placeholder="selectedReceipt?.batch_number || 'Auto-generate'" />
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button @click="showModal = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
            <button @click="doReceive" :disabled="receiving"
              class="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
              {{ receiving ? 'Receiving...' : 'Confirm Receipt' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useProductionStore, type FGReceipt } from '../stores/production';
import { api } from '../lib/api';

const store = useProductionStore();
const showModal = ref(false);
const receiving = ref(false);
const selectedReceipt = ref<FGReceipt | null>(null);
const receiveForm = ref({ warehouse_id: '' as string | number, quantity: 0, batch_number: '' });
const warehouses = ref<any[]>([]);

onMounted(async () => {
  await store.fetchFGReceipts();
  try {
    const res = await api.get('/warehouses');
    warehouses.value = res.data.data || res.data || [];
  } catch (e) { /* ignore */ }
});

const pendingQty = (r: FGReceipt) => (r.output_quantity || 0) - (r.received_into_stock || 0);

const openReceiveModal = (r: FGReceipt) => {
  selectedReceipt.value = r;
  receiveForm.value = {
    warehouse_id: '',
    quantity: pendingQty(r),
    batch_number: r.batch_number || '',
  };
  showModal.value = true;
};

const doReceive = async () => {
  if (!selectedReceipt.value || !receiveForm.value.warehouse_id || receiveForm.value.quantity <= 0) return;
  receiving.value = true;
  try {
    await store.receiveFG({
      wo_id: selectedReceipt.value.wo_id,
      warehouse_id: Number(receiveForm.value.warehouse_id),
      quantity: receiveForm.value.quantity,
      batch_number: receiveForm.value.batch_number || undefined,
    });
    showModal.value = false;
    await store.fetchFGReceipts();
  } catch (e) {
    console.error('Receive failed:', e);
  } finally {
    receiving.value = false;
  }
};

const qcBadge = (s: string | null) => ({
  pending: 'bg-yellow-100 text-yellow-800',
  passed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}[s || ''] || 'bg-gray-100 text-gray-800');
</script>
