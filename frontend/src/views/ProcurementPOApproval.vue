<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Purchase Order Approval</h1>

    <!-- Stats -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded shadow p-4">
        <p class="text-xs text-gray-400 uppercase">Pending</p>
        <p class="text-2xl font-bold text-yellow-600">{{ pendingCount }}</p>
      </div>
      <div class="bg-white rounded shadow p-4">
        <p class="text-xs text-gray-400 uppercase">Supervisor Approved</p>
        <p class="text-2xl font-bold text-blue-600">{{ supervisorCount }}</p>
      </div>
      <div class="bg-white rounded shadow p-4">
        <p class="text-xs text-gray-400 uppercase">Fully Approved</p>
        <p class="text-2xl font-bold text-green-600">{{ approvedCount }}</p>
      </div>
      <div class="bg-white rounded shadow p-4">
        <p class="text-xs text-gray-400 uppercase">Total POs</p>
        <p class="text-2xl font-bold">{{ store.purchaseOrders.length }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded shadow p-4 mb-4 flex gap-4 items-end">
      <div>
        <label class="block text-xs font-medium mb-1">Status Filter</label>
        <select v-model="statusFilter" class="border rounded px-3 py-2 text-sm">
          <option value="all">All</option>
          <option value="pending">Pending (0)</option>
          <option value="supervisor">Supervisor Approved (1)</option>
          <option value="approved">Fully Approved (2)</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium mb-1">Vendor</label>
        <input v-model="vendorFilter" placeholder="Filter by vendor..." class="border rounded px-3 py-2 text-sm" />
      </div>
      <div class="flex-1">
        <label class="block text-xs font-medium mb-1">Search</label>
        <input v-model="search" placeholder="Search PO number..." class="w-full border rounded px-3 py-2 text-sm" />
      </div>
      <button @click="loadData" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Refresh</button>
    </div>

    <!-- PO Table -->
    <div class="bg-white rounded shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left">PO Number</th>
            <th class="px-4 py-3 text-left">Date</th>
            <th class="px-4 py-3 text-left">Vendor</th>
            <th class="px-4 py-3 text-left">PR Reference</th>
            <th class="px-4 py-3 text-right">Total Amount</th>
            <th class="px-4 py-3 text-center">Approval Status</th>
            <th class="px-4 py-3 text-left">Approvers</th>
            <th class="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="po in filteredPOs" :key="po.id" class="border-t hover:bg-gray-50">
            <td class="px-4 py-3 font-medium">{{ po.po_number }}</td>
            <td class="px-4 py-3 text-gray-500">{{ formatDate(po.order_date || po.created_at) }}</td>
            <td class="px-4 py-3">{{ po.vendor_name || '-' }}</td>
            <td class="px-4 py-3 text-xs text-gray-500">{{ po.pr_number || '-' }}</td>
            <td class="px-4 py-3 text-right font-medium">{{ formatCurrency(po.total_amount) }}</td>
            <td class="px-4 py-3 text-center">
              <span :class="getStatusClass(po.approval_status)" class="inline-block px-2 py-0.5 rounded-full text-xs font-medium">
                {{ getStatusText(po.approval_status) }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs">
              <div v-if="po.approved_by_supervisor_id">
                <span class="text-green-600">✓ Supervisor</span>
                <span class="text-gray-400 ml-1">{{ formatDate(po.approved_at_supervisor) }}</span>
              </div>
              <div v-if="po.approved_by_manager_id">
                <span class="text-green-600">✓ Manager</span>
                <span class="text-gray-400 ml-1">{{ formatDate(po.approved_at_manager) }}</span>
              </div>
              <span v-if="!po.approved_by_supervisor_id && !po.approved_by_manager_id" class="text-gray-400">—</span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex gap-1 justify-center">
                <button v-if="canApprove(po.approval_status)" @click="approve(po)"
                  class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
                  Approve
                </button>
                <button v-if="canReject(po.approval_status)" @click="openReject(po)"
                  class="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700">
                  Reject
                </button>
                <span v-if="po.approval_status >= 2" class="text-green-600 text-xs font-medium">Completed</span>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredPOs.length">
            <td colspan="8" class="text-center py-8 text-gray-400">No purchase orders found</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Reject Modal -->
    <div v-if="rejectTarget" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 class="font-bold text-lg mb-3">Reject PO {{ rejectTarget.po_number }}</h3>
        <label class="block text-sm font-medium mb-1">Reason</label>
        <textarea v-model="rejectReason" rows="3" class="w-full border rounded px-3 py-2 text-sm" placeholder="Enter rejection reason..."></textarea>
        <div class="flex gap-3 justify-end mt-4">
          <button @click="rejectTarget = null" class="px-4 py-2 border rounded text-sm">Cancel</button>
          <button @click="reject" class="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProcurementStore } from '../stores/procurement';
import { useApprovalWorkflow } from '../composables/useApprovalWorkflow';
import { formatCurrency } from '../utils/format';

const store = useProcurementStore();
const { canApprove, canReject } = useApprovalWorkflow();

const statusFilter = ref('all');
const vendorFilter = ref('');
const search = ref('');
const rejectTarget = ref<any>(null);
const rejectReason = ref('');

const pendingCount = computed(() => store.purchaseOrders.filter(p => (p as any).approval_status === 0).length);
const supervisorCount = computed(() => store.purchaseOrders.filter(p => (p as any).approval_status === 1).length);
const approvedCount = computed(() => store.purchaseOrders.filter(p => (p as any).approval_status >= 2).length);

const filteredPOs = computed(() => {
  let list = store.purchaseOrders as any[];
  if (statusFilter.value === 'pending') list = list.filter(p => p.approval_status === 0);
  else if (statusFilter.value === 'supervisor') list = list.filter(p => p.approval_status === 1);
  else if (statusFilter.value === 'approved') list = list.filter(p => p.approval_status >= 2);
  if (vendorFilter.value) {
    const v = vendorFilter.value.toLowerCase();
    list = list.filter(p => (p.vendor_name || '').toLowerCase().includes(v));
  }
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter(p => (p.po_number || '').toLowerCase().includes(q));
  }
  return list;
});

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const getStatusText = (s: number) => {
  if (s === 0) return 'Pending';
  if (s === 1) return 'Supervisor Approved';
  if (s >= 2) return 'Fully Approved';
  return 'Unknown';
};

const getStatusClass = (s: number) => {
  if (s === 0) return 'bg-yellow-100 text-yellow-700';
  if (s === 1) return 'bg-blue-100 text-blue-700';
  if (s >= 2) return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-600';
};

const loadData = () => store.fetchPurchaseOrders();

const approve = async (po: any) => {
  if (!confirm(`Approve PO ${po.po_number}?`)) return;
  await store.approvePurchaseOrder(po.id);
  loadData();
};

const openReject = (po: any) => {
  rejectTarget.value = po;
  rejectReason.value = '';
};

const reject = async () => {
  await store.rejectPurchaseOrder(rejectTarget.value.id);
  rejectTarget.value = null;
  loadData();
};

onMounted(() => loadData());
</script>
