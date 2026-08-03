<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Material Requirement Planning</h2>
          <p class="text-sm text-gray-500 mt-1">BOM explosion — calculate material needs vs available stock</p>
        </div>
        <button @click="activeTab = activeTab === 'all' ? 'shortage' : 'all'"
          class="px-4 py-2 rounded-md text-sm font-medium"
          :class="activeTab === 'shortage' ? 'bg-red-600 text-white' : 'bg-white border text-gray-700'">
          {{ activeTab === 'shortage' ? 'Show All' : 'Show Shortages Only' }}
        </button>
      </div>

      <!-- Shortage Summary -->
      <div v-if="store.mrpShortages.length" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <h3 class="text-sm font-semibold text-red-700 mb-2">Material Shortages ({{ store.mrpShortages.length }} items)</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div v-for="s in store.mrpShortages.slice(0, 6)" :key="s.product_id" class="bg-white rounded p-3">
            <p class="text-sm font-medium text-gray-900">{{ s.material_name }}</p>
            <p class="text-xs text-gray-500">{{ s.material_sku }}</p>
            <div class="flex justify-between mt-1 text-xs">
              <span class="text-gray-600">Required: {{ s.total_required }}</span>
              <span class="text-red-600 font-semibold">Short: {{ s.shortage }}</span>
            </div>
          </div>
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
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Per Unit</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Required</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shortage</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="item in filteredItems" :key="`${item.wo_id}-${item.raw_material_id}`"
              :class="{ 'bg-red-50': item.shortage > 0 }" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ item.wo_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-900">{{ item.product_name }}</td>
              <td class="px-4 py-3 text-sm">
                <div class="text-gray-900">{{ item.material_name }}</div>
                <div class="text-xs text-gray-400">{{ item.material_sku }}</div>
              </td>
              <td class="px-4 py-3 text-sm text-right text-gray-600">{{ item.bom_qty_per_unit }}</td>
              <td class="px-4 py-3 text-sm text-right font-medium text-gray-900">{{ item.total_required }}</td>
              <td class="px-4 py-3 text-sm text-right text-gray-600">{{ item.stock_available }}</td>
              <td class="px-4 py-3 text-sm text-right">
                <span v-if="item.shortage > 0" class="text-red-600 font-bold">-{{ item.shortage }}</span>
                <span v-else class="text-green-600">OK</span>
              </td>
            </tr>
            <tr v-if="!filteredItems.length">
              <td colspan="7" class="text-center py-8 text-gray-400">
                {{ activeTab === 'shortage' ? 'No material shortages — all stock sufficient' : 'No MRP data available' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useProductionStore } from '../stores/production';

const store = useProductionStore();
const activeTab = ref<'all' | 'shortage'>('all');

onMounted(async () => {
  await Promise.all([store.fetchMRP(), store.fetchMRPShortages()]);
});

const filteredItems = computed(() => {
  if (activeTab.value === 'shortage') {
    return store.mrpItems.filter(i => i.shortage > 0);
  }
  return store.mrpItems;
});
</script>
