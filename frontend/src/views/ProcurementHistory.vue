<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Procurement History</h2>
        <button @click="load" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Refresh</button>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow-sm rounded-md p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 tilt-card">
        <div>
          <label class="block text-sm font-medium text-gray-700">Start Date</label>
          <input type="date" v-model="filters.start_date" class="mt-1 block w-full border-gray-300 rounded-md" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">End Date</label>
          <input type="date" v-model="filters.end_date" class="mt-1 block w-full border-gray-300 rounded-md" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Vendor</label>
          <select v-model.number="filters.vendor_id" class="mt-1 block w-full border-gray-300 rounded-md">
            <option :value="0">All Vendors</option>
            <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </div>
        <div class="flex items-end">
          <button @click="load" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Filter</button>
        </div>
      </div>

      <!-- History Table -->
      <div class="bg-white shadow overflow-hidden sm:rounded-md tilt-card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Document No</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor / Dept</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Approval</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="history.length === 0">
              <td colspan="8" class="px-4 py-6 text-center text-gray-500">No history data</td>
            </tr>
            <tr v-for="item in history" :key="`${item.doc_type}-${item.id}`">
              <td class="px-4 py-2 text-sm">
                <span :class="docTypeBadge(item.doc_type)" class="px-2 py-1 rounded text-xs font-semibold">
                  {{ item.doc_type }}
                </span>
              </td>
              <td class="px-4 py-2 text-sm text-gray-900">{{ item.doc_number }}</td>
              <td class="px-4 py-2 text-sm text-gray-700">{{ formatDate(item.doc_date) }}</td>
              <td class="px-4 py-2 text-sm">{{ item.vendor_name || item.department || '-' }}</td>
              <td class="px-4 py-2 text-sm text-gray-600 truncate max-w-xs">{{ item.items_summary || '-' }}</td>
              <td class="px-4 py-2 text-sm">
                <span :class="statusBadge(item.status)" class="px-2 py-1 rounded text-xs">
                  {{ item.status }}
                </span>
              </td>
              <td class="px-4 py-2 text-sm">
                <span :class="approvalBadge(item.approval_status)" class="px-2 py-1 rounded text-xs">
                  {{ approvalLabel(item.approval_status) }}
                </span>
              </td>
              <td class="px-4 py-2 text-sm text-right">
                <button @click="viewDetail(item)" class="text-blue-600 hover:text-blue-800">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '@/lib/api';
import { useRouter } from 'vue-router';

const router = useRouter();
const history = ref<any[]>([]);
const vendors = ref<any[]>([]);

const filters = reactive({
  start_date: '',
  end_date: '',
  vendor_id: 0,
});

onMounted(async () => {
  await loadVendors();
  await load();
});

const loadVendors = async () => {
  try {
    const res = await api.get('/procurement/vendors');
    vendors.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load vendors:', error);
    vendors.value = [];
  }
};

const load = async () => {
  try {
    const params = new URLSearchParams();
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.vendor_id) params.append('vendor_id', String(filters.vendor_id));
    
    const res = await api.get(`/procurement/procurement-history?${params}`);
    history.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load procurement history:', error);
    history.value = [];
  }
};

const docTypeBadge = (type: string) => {
  if (type === 'PR') return 'bg-purple-100 text-purple-700';
  if (type === 'PO') return 'bg-blue-100 text-blue-700';
  if (type === 'GRN') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
};

const statusBadge = (status: string) => {
  if (status === 'draft') return 'bg-gray-100 text-gray-700';
  if (status === 'approved') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  if (status === 'posted') return 'bg-blue-100 text-blue-700';
  return 'bg-yellow-100 text-yellow-700';
};

const approvalBadge = (approval: number) => {
  if (approval === 0) return 'bg-yellow-100 text-yellow-700';
  if (approval === 1) return 'bg-orange-100 text-orange-700';
  if (approval === 2) return 'bg-green-100 text-green-700';
  if (approval === -1) return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

const approvalLabel = (approval: number) => {
  if (approval === 0) return '0/2';
  if (approval === 1) return '1/2';
  if (approval === 2) return '2/2';
  if (approval === -1) return 'Rejected';
  return '-';
};

const viewDetail = (item: any) => {
  if (item.doc_type === 'PR') {
    router.push('/procurement/pr');
  } else if (item.doc_type === 'PO') {
    router.push('/procurement/po');
  } else if (item.doc_type === 'GRN') {
    router.push('/procurement/goods-receipt');
  }
};

const formatDate = (val: string) => val ? new Date(val).toLocaleDateString() : '-';
</script>

<style scoped>
</style>
