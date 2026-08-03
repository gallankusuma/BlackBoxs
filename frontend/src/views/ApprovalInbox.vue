<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">My Approval Inbox</h1>

    <!-- Filter bar -->
    <div class="flex flex-wrap gap-3 mb-6">
      <select v-model="filterModule" class="border rounded px-3 py-2 text-sm">
        <option value="">All Modules</option>
        <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
      </select>
      <button @click="loadInbox" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Refresh</button>
      <span class="ml-auto text-sm text-gray-500">{{ store.inbox.length }} pending item(s)</span>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Empty state -->
    <div v-else-if="store.inbox.length === 0" class="text-center py-16 bg-white rounded shadow">
      <p class="text-gray-400 text-lg">No pending approvals</p>
    </div>

    <!-- Inbox cards -->
    <div v-else class="space-y-4">
      <div v-for="item in store.inbox" :key="item.id" class="bg-white rounded shadow p-5 flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-2">
            <span class="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">{{ item.module }}</span>
            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{{ item.entity_type }}</span>
            <span class="text-xs text-gray-400">{{ item.request_number }}</span>
          </div>
          <p class="text-sm text-gray-700">
            <span class="font-medium">Requested by:</span> {{ item.requester_name || 'Unknown' }}
          </p>
          <p class="text-sm text-gray-500">Entity #{{ item.entity_id }} &middot; Step {{ item.current_step }}</p>

          <!-- Entity summary for fund_request -->
          <div v-if="item.entity_type === 'fund_request' && item.entity" class="mt-2 p-3 bg-gray-50 rounded border text-sm">
            <div class="font-medium text-gray-800">{{ item.entity.request_number }} — {{ item.entity.purpose }}</div>
            <div class="text-gray-600 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              <div><span class="text-gray-500">Amount:</span> <span class="font-mono font-semibold">{{ formatMoney(item.entity.amount) }}</span></div>
              <div><span class="text-gray-500">Needed:</span> {{ formatDate(item.entity.needed_date) }}</div>
              <div v-if="item.entity.cash_account"><span class="text-gray-500">Bank:</span> {{ item.entity.cash_account }}</div>
              <div><span class="text-gray-500">Items:</span> {{ item.entity.item_count }} <span v-if="item.entity.pending_count" class="text-yellow-700">({{ item.entity.pending_count }} pending)</span></div>
            </div>
          </div>

          <p v-if="item.notes" class="text-sm text-gray-500 mt-1">{{ item.notes }}</p>
          <p class="text-xs text-gray-400 mt-1">Submitted: {{ formatDate(item.submitted_at) }}</p>
        </div>
        <div class="flex flex-col gap-2 ml-4">
          <template v-if="item.entity_type === 'fund_request'">
            <button @click="openFundRequest(item)"
              class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm ring-1 ring-inset ring-blue-700/20 hover:from-blue-600 hover:to-blue-700 active:scale-[0.98] transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              Open &amp; Review
            </button>
          </template>
          <template v-else>
            <button @click="approve(item)"
              class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm ring-1 ring-inset ring-emerald-700/20 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98] transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
              Approve
            </button>
            <button @click="openReject(item)"
              class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white text-rose-700 shadow-sm ring-1 ring-inset ring-rose-300 hover:bg-rose-50 active:scale-[0.98] transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              Reject
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Reject Modal -->
    <div v-if="rejectModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="rejectModal = false">
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-4">Reject Request</h3>
        <p class="text-sm text-gray-600 mb-3">{{ selectedItem?.request_number }} — {{ selectedItem?.entity_type }}</p>
        <textarea v-model="rejectComments" rows="3" placeholder="Reason for rejection..." class="w-full border rounded px-3 py-2 text-sm mb-4"></textarea>
        <div class="flex justify-end gap-3">
          <button @click="rejectModal = false" class="px-4 py-2 border rounded text-sm">Cancel</button>
          <button @click="confirmReject" :disabled="!rejectComments.trim()" class="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useApprovalStore } from '../stores/approval';

const store = useApprovalStore();
const router = useRouter();
const filterModule = ref('');
const rejectModal = ref(false);
const rejectComments = ref('');
const selectedItem = ref<any>(null);
const modules = ['finance', 'pr', 'po', 'so', 'wo', 'batch_release', 'grn'];

const loadInbox = () => {
  store.fetchInbox(filterModule.value ? { module: filterModule.value } : undefined);
};

const formatDate = (d: string) => d ? new Date(d).toLocaleString() : '-';
const formatMoney = (v: any) => v ? Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const approve = async (item: any) => {
  if (confirm('Approve this request?')) {
    await store.approveRequest(item.id);
  }
};

const openFundRequest = (item: any) => {
  router.push({ path: '/finance/fund-requests', query: { openId: item.entity_id } });
};

const openReject = (item: any) => {
  selectedItem.value = item;
  rejectComments.value = '';
  rejectModal.value = true;
};

const confirmReject = async () => {
  if (selectedItem.value && rejectComments.value.trim()) {
    await store.rejectRequest(selectedItem.value.id, rejectComments.value);
    rejectModal.value = false;
  }
};

onMounted(loadInbox);
</script>
