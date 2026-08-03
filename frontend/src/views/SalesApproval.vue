<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">SO Approval</h2>
        <p class="text-sm text-gray-500 mt-1">Approve or reject draft sales orders</p>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else>
        <div class="bg-white shadow rounded-lg p-4 mb-4">
          <p class="text-sm text-gray-600"><span class="font-bold text-blue-600">{{ store.pendingApprovals.length }}</span> sales orders pending approval</p>
        </div>

        <div v-if="!store.pendingApprovals.length" class="text-center py-12 text-gray-400">No pending approvals</div>

        <div v-else class="space-y-4">
          <div v-for="so in store.pendingApprovals" :key="so.id" class="bg-white shadow rounded-lg p-5">
            <div class="flex justify-between items-start">
              <div>
                <h4 class="text-lg font-bold text-blue-600">{{ so.so_number }}</h4>
                <p class="text-sm text-gray-600">Customer: <span class="font-medium">{{ so.customer_name }}</span></p>
                <p class="text-sm text-gray-500">Created: {{ fmtDate(so.created_at) }}</p>
                <p v-if="so.expected_ship_date" class="text-sm text-gray-500">Ship by: {{ fmtDate(so.expected_ship_date) }}</p>
                <p v-if="so.notes" class="text-sm text-gray-400 mt-1">{{ so.notes }}</p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold">{{ fmt(so.total_amount) }}</p>
                <span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">DRAFT</span>
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-4 pt-4 border-t">
              <button @click="openReject(so)" class="px-4 py-2 bg-red-100 text-red-700 rounded-md text-sm hover:bg-red-200">Reject</button>
              <button @click="approve(so.id)" class="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700">Approve</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Reject Modal -->
      <div v-if="rejectTarget" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-2">Reject {{ rejectTarget.so_number }}?</h3>
          <div>
            <label class="block text-sm font-medium text-gray-700">Reason</label>
            <textarea v-model="rejectReason" rows="3" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" placeholder="Provide rejection reason..."></textarea>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button @click="rejectTarget = null" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
            <button @click="confirmReject" class="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Confirm Reject</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useSalesStore } from '../stores/sales';

const store = useSalesStore();
const rejectTarget = ref<any>(null);
const rejectReason = ref('');

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID') : '0';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

onMounted(() => store.fetchPendingApprovals());

const approve = async (id: number) => {
  if (!confirm('Approve this sales order?')) return;
  await store.approveSO(id);
};

const openReject = (so: any) => { rejectTarget.value = so; rejectReason.value = ''; };
const confirmReject = async () => {
  await store.rejectSO(rejectTarget.value.id, rejectReason.value);
  rejectTarget.value = null;
};
</script>
