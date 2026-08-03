<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-6xl mx-auto flex flex-col gap-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p class="text-sm text-gray-500">Inventory</p>
          <h2 class="text-2xl font-bold text-gray-900">Expiry Monitoring (FEFO)</h2>
          <p class="text-sm text-gray-600">Pantau batch yang mendekati kadaluarsa, jalankan FEFO.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-gray-600">Horizon (hari)</label>
          <input type="number" min="1" v-model.number="days" class="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <button @click="load" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Refresh</button>
        </div>
      </div>

      <div class="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Exp Date</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Days Left</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="rows.length === 0">
              <td colspan="6" class="px-4 py-6 text-center text-gray-500">No expiring batches</td>
            </tr>
            <tr v-for="b in rows" :key="b.id">
              <td class="px-4 py-3 text-sm text-gray-900">{{ b.product_name }}</td>
              <td class="px-4 py-3 text-sm font-semibold text-gray-900">{{ b.batch_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ b.quantity }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ formatDate(b.exp_date) }}</td>
              <td class="px-4 py-3 text-sm font-semibold" :class="dayClass(b.days_to_expiry)">{{ b.days_to_expiry }}</td>
              <td class="px-4 py-3 text-sm">
                <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold" :class="badgeClass(b.days_to_expiry)">
                  {{ label(b.days_to_expiry) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useInventoryStore } from '@/stores/inventory';

const inventoryStore = useInventoryStore();
const days = ref(45);

onMounted(async () => {
  await load();
});

const load = async () => {
  await inventoryStore.fetchExpiringBatches(days.value);
};

const rows = computed(() => inventoryStore.batches || []);

const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '-');
const dayClass = (d?: number) => {
  if (d === undefined || d === null) return 'text-gray-600';
  if (d <= 0) return 'text-red-600';
  if (d <= 7) return 'text-amber-700';
  return 'text-emerald-700';
};

const badgeClass = (d?: number) => {
  if (d === undefined || d === null) return 'bg-gray-50 text-gray-600';
  if (d <= 0) return 'bg-red-50 text-red-700';
  if (d <= 7) return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
};

const label = (d?: number) => {
  if (d === undefined || d === null) return 'N/A';
  if (d <= 0) return 'Expired';
  if (d <= 7) return 'Critical';
  if (d <= 14) return 'Warning';
  return 'OK';
};
</script>
