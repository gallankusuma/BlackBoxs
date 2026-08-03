<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Approval History</h1>

    <!-- Stats -->
    <div v-if="store.historyStats" class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold">{{ store.historyStats.total || 0 }}</p>
        <p class="text-xs text-gray-500">Total</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold text-green-600">{{ store.historyStats.approved || 0 }}</p>
        <p class="text-xs text-gray-500">Approved</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold text-red-600">{{ store.historyStats.rejected || 0 }}</p>
        <p class="text-xs text-gray-500">Rejected</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold text-yellow-600">{{ store.historyStats.pending || 0 }}</p>
        <p class="text-xs text-gray-500">Pending</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold text-gray-500">{{ store.historyStats.cancelled || 0 }}</p>
        <p class="text-xs text-gray-500">Cancelled</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-6 bg-white p-4 rounded shadow">
      <select v-model="filters.module" class="border rounded px-3 py-2 text-sm">
        <option value="">All Modules</option>
        <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
      </select>
      <select v-model="filters.status" class="border rounded px-3 py-2 text-sm">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <input type="date" v-model="filters.from_date" class="border rounded px-3 py-2 text-sm" />
      <input type="date" v-model="filters.to_date" class="border rounded px-3 py-2 text-sm" />
      <button @click="loadHistory" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Search</button>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Table -->
    <div v-else class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-4 py-3 text-left">Request #</th>
            <th class="px-4 py-3 text-left">Module</th>
            <th class="px-4 py-3 text-left">Entity</th>
            <th class="px-4 py-3 text-left">Requester</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3 text-left">Submitted</th>
            <th class="px-4 py-3 text-left">Completed</th>
            <th class="px-4 py-3 text-left">Trail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in store.history" :key="item.id" class="border-b hover:bg-gray-50">
            <td class="px-4 py-3 font-mono text-xs">{{ item.request_number }}</td>
            <td class="px-4 py-3">{{ item.module }}</td>
            <td class="px-4 py-3">{{ item.entity_type }} #{{ item.entity_id }}</td>
            <td class="px-4 py-3">{{ item.requester_name || '-' }}</td>
            <td class="px-4 py-3 text-center">
              <span :class="statusClass(item.status)" class="px-2 py-0.5 rounded text-xs font-medium">{{ item.status }}</span>
            </td>
            <td class="px-4 py-3 text-xs">{{ formatDate(item.submitted_at) }}</td>
            <td class="px-4 py-3 text-xs">{{ formatDate(item.completed_at) }}</td>
            <td class="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" :title="item.action_trail">{{ item.action_trail || '-' }}</td>
          </tr>
          <tr v-if="store.history.length === 0">
            <td colspan="8" class="px-4 py-8 text-center text-gray-400">No history found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue';
import { useApprovalStore } from '../stores/approval';

const store = useApprovalStore();
const modules = ['pr', 'po', 'so', 'wo', 'batch_release', 'grn'];
const filters = reactive({ module: '', status: '', from_date: '', to_date: '' });

const loadHistory = () => {
  const params: Record<string, any> = {};
  if (filters.module) params.module = filters.module;
  if (filters.status) params.status = filters.status;
  if (filters.from_date) params.from_date = filters.from_date;
  if (filters.to_date) params.to_date = filters.to_date;
  store.fetchHistory(params);
};

const formatDate = (d: string) => d ? new Date(d).toLocaleString() : '-';

const statusClass = (s: string) => ({
  'bg-green-100 text-green-700': s === 'approved',
  'bg-red-100 text-red-700': s === 'rejected',
  'bg-yellow-100 text-yellow-700': s === 'pending',
  'bg-gray-100 text-gray-600': s === 'cancelled',
});

onMounted(() => {
  store.fetchHistoryStats();
  loadHistory();
});
</script>
