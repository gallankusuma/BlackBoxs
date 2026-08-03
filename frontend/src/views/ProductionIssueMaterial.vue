<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Issue Material</h2>
          <p class="text-sm text-gray-500 mt-1">Pick and issue raw materials from warehouse to work orders</p>
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
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Required</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Issued</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issued By</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="mat in store.materialIssues" :key="mat.id" class="hover:bg-gray-50"
              :class="{ 'bg-green-50': mat.pending_qty <= 0 }">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ mat.wo_number }}</td>
              <td class="px-4 py-3 text-sm">
                <div class="text-gray-900">{{ mat.material_name }}</div>
                <div class="text-xs text-gray-400">{{ mat.material_sku }}</div>
              </td>
              <td class="px-4 py-3 text-sm text-right text-gray-900">{{ mat.quantity_required }}</td>
              <td class="px-4 py-3 text-sm text-right text-green-600 font-medium">{{ mat.quantity_issued || 0 }}</td>
              <td class="px-4 py-3 text-sm text-right">
                <span :class="mat.pending_qty > 0 ? 'text-red-600 font-bold' : 'text-green-600'">
                  {{ mat.pending_qty > 0 ? mat.pending_qty : 'Done' }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ mat.warehouse_name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ mat.issued_by_name || '-' }}</td>
              <td class="px-4 py-3 text-right">
                <button v-if="mat.pending_qty > 0" @click="openIssueModal(mat)"
                  class="text-sm text-blue-600 hover:text-blue-900 font-medium">
                  Issue
                </button>
                <span v-else class="text-xs text-green-600">Completed</span>
              </td>
            </tr>
            <tr v-if="!store.materialIssues.length">
              <td colspan="8" class="text-center py-8 text-gray-400">No material issues pending</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Issue Modal -->
      <div v-if="showModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-4">Issue Material</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Material</label>
              <p class="text-sm text-gray-900">{{ selectedMat?.material_name }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Pending Qty</label>
              <p class="text-sm text-gray-900">{{ selectedMat?.pending_qty }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Issue Quantity</label>
              <input v-model.number="issueForm.quantity" type="number" min="1" :max="selectedMat?.pending_qty"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Batch Number (optional)</label>
              <input v-model="issueForm.batch_number" type="text"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button @click="showModal = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
            <button @click="doIssue" :disabled="issuing"
              class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
              {{ issuing ? 'Issuing...' : 'Confirm Issue' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useProductionStore, type MaterialIssue } from '../stores/production';

const store = useProductionStore();
const showModal = ref(false);
const issuing = ref(false);
const selectedMat = ref<MaterialIssue | null>(null);
const issueForm = ref({ quantity: 0, batch_number: '' });

onMounted(() => store.fetchMaterialIssues());

const openIssueModal = (mat: MaterialIssue) => {
  selectedMat.value = mat;
  issueForm.value = { quantity: mat.pending_qty, batch_number: '' };
  showModal.value = true;
};

const doIssue = async () => {
  if (!selectedMat.value || issueForm.value.quantity <= 0) return;
  issuing.value = true;
  try {
    await store.issueMaterial({
      wo_material_id: selectedMat.value.id,
      quantity: issueForm.value.quantity,
      batch_number: issueForm.value.batch_number || undefined,
    });
    showModal.value = false;
    await store.fetchMaterialIssues();
  } catch (e) {
    console.error('Issue failed:', e);
  } finally {
    issuing.value = false;
  }
};
</script>
