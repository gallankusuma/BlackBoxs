<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Batch Release</h2>
        <p class="text-sm text-gray-500 mt-1">Release, reject, or hold batches based on QC results</p>
      </div>

      <div v-if="loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else>
        <!-- Summary cards -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white shadow rounded-lg p-4">
            <p class="text-xs text-gray-500 uppercase">Total Batches</p>
            <p class="text-2xl font-bold">{{ batches.length }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-4">
            <p class="text-xs text-green-600 uppercase">Released</p>
            <p class="text-2xl font-bold text-green-700">{{ batches.filter(b => b.status === 'released').length }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-4">
            <p class="text-xs text-yellow-600 uppercase">On Hold</p>
            <p class="text-2xl font-bold text-yellow-700">{{ batches.filter(b => b.status === 'on_hold').length }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-4">
            <p class="text-xs text-red-600 uppercase">Rejected</p>
            <p class="text-2xl font-bold text-red-700">{{ batches.filter(b => b.status === 'rejected').length }}</p>
          </div>
        </div>

        <!-- Filter -->
        <div class="mb-4 flex gap-2">
          <button v-for="s in ['all','pending','released','on_hold','rejected']" :key="s"
            @click="statusFilter = s" :class="statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'" class="px-3 py-1.5 rounded-md text-sm border hover:bg-blue-50">
            {{ s === 'all' ? 'All' : s.replace('_', ' ') }}
          </button>
        </div>

        <div class="bg-white shadow rounded-lg overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tests Pass</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tests Fail</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="b in filteredBatches" :key="b.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ b.batch_number }}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ b.product_name }}</td>
                <td class="px-4 py-3 text-sm text-right">{{ b.quantity }}</td>
                <td class="px-4 py-3 text-center"><span class="text-green-600 font-medium text-sm">{{ b.tests_passed ?? 0 }}</span></td>
                <td class="px-4 py-3 text-center"><span class="text-red-600 font-medium text-sm">{{ b.tests_failed ?? 0 }}</span></td>
                <td class="px-4 py-3 text-center">
                  <span :class="statusBadge(b.status)" class="px-2 py-1 rounded-full text-xs font-medium">{{ b.status?.replace('_', ' ') }}</span>
                </td>
                <td class="px-4 py-3 text-right space-x-1">
                  <button v-if="b.status !== 'released'" @click="action('release', b.id)" class="text-green-600 hover:underline text-xs">Release</button>
                  <button v-if="b.status !== 'on_hold'" @click="action('hold', b.id)" class="text-yellow-600 hover:underline text-xs">Hold</button>
                  <button v-if="b.status !== 'rejected'" @click="action('reject', b.id)" class="text-red-600 hover:underline text-xs">Reject</button>
                </td>
              </tr>
              <tr v-if="!filteredBatches.length"><td colspan="7" class="text-center py-8 text-gray-400">No batches found</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useQualityStore } from '../stores/quality';

const store = useQualityStore();
const loading = ref(true);
const batches = ref<any[]>([]);
const statusFilter = ref('all');

const filteredBatches = computed(() => {
  if (statusFilter.value === 'all') return batches.value;
  return batches.value.filter(b => b.status === statusFilter.value);
});

const statusBadge = (s: string) => ({
  'bg-green-100 text-green-800': s === 'released',
  'bg-yellow-100 text-yellow-800': s === 'on_hold' || s === 'pending',
  'bg-red-100 text-red-800': s === 'rejected',
  'bg-gray-100 text-gray-600': !['released', 'on_hold', 'pending', 'rejected'].includes(s),
});

const load = async () => {
  loading.value = true;
  await store.fetchBatchRelease();
  batches.value = store.batchRelease;
  loading.value = false;
};

const action = async (type: 'release' | 'reject' | 'hold', id: number) => {
  const msgs: Record<string, string> = { release: 'Release this batch?', reject: 'Reject this batch?', hold: 'Put this batch on hold?' };
  if (!confirm(msgs[type])) return;
  if (type === 'release') await store.releaseBatch(id);
  else if (type === 'reject') await store.rejectBatch(id);
  else await store.holdBatch(id);
  await load();
};

onMounted(load);
</script>
