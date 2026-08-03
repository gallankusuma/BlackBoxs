<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Approval Summary Dashboard</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-blue-500">
          <p class="text-3xl font-bold">{{ data.stats?.total || 0 }}</p>
          <p class="text-sm text-gray-500">Total Requests</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-yellow-500">
          <p class="text-3xl font-bold text-yellow-600">{{ data.stats?.pending || 0 }}</p>
          <p class="text-sm text-gray-500">Pending</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-green-500">
          <p class="text-3xl font-bold text-green-600">{{ data.stats?.approved || 0 }}</p>
          <p class="text-sm text-gray-500">Approved</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-red-500">
          <p class="text-3xl font-bold text-red-600">{{ data.stats?.rejected || 0 }}</p>
          <p class="text-sm text-gray-500">Rejected</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-gray-400">
          <p class="text-3xl font-bold text-gray-500">{{ data.stats?.cancelled || 0 }}</p>
          <p class="text-sm text-gray-500">Cancelled</p>
        </div>
      </div>

      <!-- Approval Rate -->
      <div v-if="totalDecided > 0" class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-2">Approval Rate</h3>
        <div class="flex items-center gap-4">
          <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div class="bg-green-500 h-4" :style="{ width: approvalRate + '%' }"></div>
          </div>
          <span class="text-lg font-bold text-green-600">{{ approvalRate }}%</span>
        </div>
      </div>

      <!-- My Pending Items -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">My Pending Approvals ({{ pendingList.length }})</h3>
        <div v-if="pendingList.length" class="space-y-2">
          <div v-for="item in pendingList.slice(0, 10)" :key="item.id" class="flex items-center justify-between bg-gray-50 rounded px-4 py-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{{ item.module }}</span>
                <span class="text-sm font-medium">{{ item.entity_type }} #{{ item.entity_id }}</span>
              </div>
              <p class="text-xs text-gray-400 mt-0.5">{{ item.request_number }} · by {{ item.requester_name || 'Unknown' }}</p>
            </div>
            <p class="text-xs text-gray-400">{{ formatDate(item.submitted_at) }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400">No pending approvals</p>
      </div>

      <!-- Status Distribution Visual -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Status Distribution</h3>
        <div class="flex h-8 rounded overflow-hidden">
          <div v-if="data.stats?.approved" class="bg-green-500" :style="{ width: pct('approved') }" :title="`Approved: ${data.stats.approved}`"></div>
          <div v-if="data.stats?.pending" class="bg-yellow-500" :style="{ width: pct('pending') }" :title="`Pending: ${data.stats.pending}`"></div>
          <div v-if="data.stats?.rejected" class="bg-red-500" :style="{ width: pct('rejected') }" :title="`Rejected: ${data.stats.rejected}`"></div>
          <div v-if="data.stats?.cancelled" class="bg-gray-400" :style="{ width: pct('cancelled') }" :title="`Cancelled: ${data.stats.cancelled}`"></div>
        </div>
        <div class="flex gap-4 mt-3 text-xs">
          <span class="flex items-center gap-1"><span class="w-3 h-3 bg-green-500 rounded"></span> Approved</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 bg-yellow-500 rounded"></span> Pending</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 bg-red-500 rounded"></span> Rejected</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 bg-gray-400 rounded"></span> Cancelled</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDashboardStore } from '../stores/dashboard';

const store = useDashboardStore();
const data = computed(() => store.approvals);
const pendingList = computed(() => data.value?.pending || []);
const totalDecided = computed(() => Number(data.value?.stats?.approved || 0) + Number(data.value?.stats?.rejected || 0));
const approvalRate = computed(() => totalDecided.value > 0 ? ((data.value?.stats?.approved || 0) / totalDecided.value * 100).toFixed(1) : '0');
const totalAll = computed(() => Number(data.value?.stats?.total || 0));

const formatDate = (d: string) => d ? new Date(d).toLocaleString() : '-';
const pct = (key: string) => totalAll.value > 0 ? `${(Number(data.value?.stats?.[key] || 0) / totalAll.value) * 100}%` : '0%';

onMounted(() => store.fetchApprovalKPI());
</script>
