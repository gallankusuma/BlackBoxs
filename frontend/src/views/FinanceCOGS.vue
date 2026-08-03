<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">COGS Calculation</h2>
          <p class="text-sm text-gray-500 mt-1">Cost of goods sold per product/batch with material, labor, and overhead breakdown</p>
        </div>
        <button @click="showAdd = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ Record COGS</button>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-gray-500 uppercase">Total COGS</p>
          <p class="text-2xl font-bold">{{ fmt(totals.totalCost) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-blue-600 uppercase">Material</p>
          <p class="text-2xl font-bold text-blue-700">{{ fmt(totals.material) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-green-600 uppercase">Labor</p>
          <p class="text-2xl font-bold text-green-700">{{ fmt(totals.labor) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-purple-600 uppercase">Overhead</p>
          <p class="text-2xl font-bold text-purple-700">{{ fmt(totals.overhead) }}</p>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Material</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Labor</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Overhead</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost/Unit</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="c in store.cogs" :key="c.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm text-gray-900">{{ c.product_name }} <span class="text-xs text-gray-400">({{ c.sku }})</span></td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ c.batch_number }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(c.raw_material_cost) }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(c.labor_cost) }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(c.overhead_cost) }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono font-medium">{{ fmt(c.total_cost) }}</td>
              <td class="px-4 py-3 text-sm text-right">{{ c.quantity_produced }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono text-blue-600">{{ fmt(c.cost_per_unit) }}</td>
            </tr>
            <tr v-if="!store.cogs.length"><td colspan="8" class="text-center py-8 text-gray-400">No COGS records</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Add Modal -->
      <div v-if="showAdd" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 class="text-lg font-bold mb-4">Record COGS</h3>
          <form @submit.prevent="submit" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700">Product</label>
                <select v-model.number="form.product_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Select</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Batch</label>
                <select v-model.number="form.batch_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Select</option>
                  <option v-for="b in batches" :key="b.id" :value="b.id">{{ b.batch_number }}</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="block text-sm font-medium text-gray-700">Material Cost</label><input v-model.number="form.raw_material_cost" type="number" step="0.01" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" /></div>
              <div><label class="block text-sm font-medium text-gray-700">Labor Cost</label><input v-model.number="form.labor_cost" type="number" step="0.01" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" /></div>
              <div><label class="block text-sm font-medium text-gray-700">Overhead</label><input v-model.number="form.overhead_cost" type="number" step="0.01" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-sm font-medium text-gray-700">Total Cost</label><input v-model.number="form.total_cost" type="number" step="0.01" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm" /></div>
              <div><label class="block text-sm font-medium text-gray-700">Qty Produced</label><input v-model.number="form.quantity_produced" type="number" min="1" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" /></div>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showAdd = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useFinanceStore } from '../stores/finance';
import { api } from '../lib/api';

const store = useFinanceStore();
const showAdd = ref(false);
const products = ref<any[]>([]);
const batches = ref<any[]>([]);
const form = ref({ product_id: '', batch_id: '', raw_material_cost: 0, labor_cost: 0, overhead_cost: 0, total_cost: 0, quantity_produced: 0 });

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID', { minimumFractionDigits: 0 }) : '0';

const totals = computed(() => ({
  totalCost: store.cogs.reduce((s, c) => s + Number(c.total_cost || 0), 0),
  material: store.cogs.reduce((s, c) => s + Number(c.raw_material_cost || 0), 0),
  labor: store.cogs.reduce((s, c) => s + Number(c.labor_cost || 0), 0),
  overhead: store.cogs.reduce((s, c) => s + Number(c.overhead_cost || 0), 0),
}));

onMounted(async () => {
  await store.fetchCOGS();
  try { products.value = (await api.get('/products')).data.data || []; } catch {}
  try { batches.value = (await api.get('/batches')).data.data || (await api.get('/batches')).data || []; } catch {}
});

const submit = async () => {
  const cpu = form.value.quantity_produced ? form.value.total_cost / form.value.quantity_produced : 0;
  await store.createCOGS({ ...form.value, cost_per_unit: cpu });
  showAdd.value = false;
};
</script>
