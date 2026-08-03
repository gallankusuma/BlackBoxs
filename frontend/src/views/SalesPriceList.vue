<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Price List</h2>
        <p class="text-sm text-gray-500 mt-1">Manage product selling prices</p>
      </div>

      <!-- Search -->
      <div class="bg-white shadow rounded-lg p-4 mb-4">
        <input v-model="search" placeholder="Search product name or SKU..." class="px-3 py-2 border rounded-md text-sm w-64" />
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Base Price</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="p in filtered" :key="p.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-mono text-gray-600">{{ p.sku }}</td>
              <td class="px-4 py-3 text-sm text-gray-900 font-medium">{{ p.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ p.unit || '-' }}</td>
              <td class="px-4 py-3 text-right">
                <span v-if="editId !== p.id" class="text-sm font-mono font-medium">{{ fmt(p.base_price) }}</span>
                <input v-else v-model.number="editPrice" type="number" step="0.01" class="w-32 px-2 py-1 border rounded text-sm text-right" @keyup.enter="savePrice(p.id)" />
              </td>
              <td class="px-4 py-3 text-right">
                <button v-if="editId !== p.id" @click="startEdit(p)" class="text-blue-600 hover:underline text-xs">Edit</button>
                <span v-else class="space-x-2">
                  <button @click="savePrice(p.id)" class="text-green-600 hover:underline text-xs">Save</button>
                  <button @click="editId = null" class="text-gray-500 hover:underline text-xs">Cancel</button>
                </span>
              </td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="5" class="text-center py-8 text-gray-400">No products with prices</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useSalesStore } from '../stores/sales';

const store = useSalesStore();
const search = ref('');
const editId = ref<number | null>(null);
const editPrice = ref(0);

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID') : '0';

const filtered = computed(() => {
  if (!search.value) return store.priceList;
  const q = search.value.toLowerCase();
  return store.priceList.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
});

const startEdit = (p: any) => { editId.value = p.id; editPrice.value = p.base_price || 0; };
const savePrice = async (id: number) => { await store.updatePrice(id, editPrice.value); editId.value = null; };

onMounted(() => store.fetchPriceList());
</script>
