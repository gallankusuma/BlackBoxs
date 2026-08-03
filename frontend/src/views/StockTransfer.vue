<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <!-- Header -->
        <div class="flex justify-between items-center mb-6">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Stock Transfer</h2>
            <p class="text-sm text-gray-500">Transfer stock between warehouses with 2-level approval</p>
          </div>
          <button 
            @click="openCreateModal" 
            class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            + Create Transfer
          </button>
        </div>

        <!-- Transfer List Table -->
        <div v-if="loading" class="text-center py-8">Loading...</div>
        <div v-else-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {{ error }}
        </div>

        <div v-else class="bg-white shadow overflow-hidden sm:rounded-md">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer No</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">From → To</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval Status</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="transfers.length === 0">
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">No stock transfers yet. Create one to get started.</td>
              </tr>
              <tr v-for="transfer in transfers" :key="transfer.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ transfer.reference_id || `TRF-${transfer.id}` }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(transfer.moved_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {{ transfer.product_name }} <span class="text-gray-400">({{ transfer.sku }})</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  <div class="flex items-center space-x-2">
                    <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{{ transfer.from_warehouse_name }}</span>
                    <span>→</span>
                    <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{{ transfer.to_warehouse_name }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">
                  {{ transfer.quantity }} {{ transfer.uom || 'units' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <span :class="getApprovalStatusClass(transfer.approval_status)" class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ getApprovalStatusText(transfer.approval_status) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <div v-if="getApprovalMessage(transfer.approval_status)" class="mb-2 text-xs text-orange-600 font-semibold">
                    ⚠️ {{ getApprovalMessage(transfer.approval_status) }}
                  </div>
                  <button 
                    v-if="canApprove(transfer.approval_status)" 
                    @click="approveTransfer(transfer.id)" 
                    class="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium transition"
                  >
                    Approve
                  </button>
                  <button 
                    v-if="canReject(transfer.approval_status)" 
                    @click="rejectTransfer(transfer.id)" 
                    class="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 font-medium transition"
                  >
                    Reject
                  </button>
                  <button 
                    v-if="(transfer.approval_status || 0) === 0" 
                    @click="deleteTransfer(transfer.id)" 
                    class="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 font-medium transition"
                  >
                    Delete
                  </button>
                  <button 
                    @click="viewTransfer(transfer)" 
                    class="text-blue-600 hover:text-blue-900"
                  >
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Create/View Transfer Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 class="text-2xl font-bold text-gray-900">
            {{ isViewMode ? 'View Stock Transfer' : 'Create Stock Transfer' }}
            <span v-if="isFullyApproved" class="ml-3 inline-block bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              ✓ FULLY APPROVED (2/2) - EXECUTED
            </span>
          </h2>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <!-- Modal Body -->
        <div class="px-6 py-4 space-y-6">
          <!-- Product Selection -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Product <span class="text-red-500">*</span>
            </label>
            <select 
              v-model="formData.product_id" 
              :disabled="isViewMode"
              required 
              class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              <option value="">-- Select Product --</option>
              <option v-for="product in products" :key="product.id" :value="product.id">
                {{ product.name }} ({{ product.sku }})
              </option>
            </select>
          </div>

          <!-- Warehouse From/To -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                From Warehouse <span class="text-red-500">*</span>
              </label>
              <select 
                v-model="formData.from_warehouse_id" 
                :disabled="isViewMode"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="">-- Select Source --</option>
                <option v-for="wh in warehouses" :key="wh.id" :value="wh.id">
                  {{ wh.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                To Warehouse <span class="text-red-500">*</span>
              </label>
              <select 
                v-model="formData.to_warehouse_id" 
                :disabled="isViewMode"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="">-- Select Destination --</option>
                <option v-for="wh in warehouses" :key="wh.id" :value="wh.id">
                  {{ wh.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Quantity & UoM -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Quantity <span class="text-red-500">*</span>
              </label>
              <input 
                v-model.number="formData.quantity" 
                type="number" 
                step="0.01"
                min="0.01"
                :disabled="isViewMode"
                required 
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Unit of Measure</label>
              <input 
                v-model="formData.uom" 
                type="text" 
                placeholder="kg, litre, box"
                :disabled="isViewMode"
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea 
              v-model="formData.notes" 
              rows="3"
              :disabled="isViewMode"
              placeholder="Transfer reason, special instructions..."
              class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            ></textarea>
          </div>

          <!-- Approval Info (View Mode) -->
          <div v-if="isViewMode && formData.approval_status" class="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 class="text-sm font-semibold text-blue-900 mb-2">Approval Trail</h4>
            <div class="text-sm text-blue-800 space-y-1">
              <div v-if="formData.approved_by_supervisor_id">
                ✓ Supervisor Approved: {{ formData.approved_at_supervisor ? formatDate(formData.approved_at_supervisor) : 'N/A' }}
              </div>
              <div v-if="formData.approved_by_manager_id">
                ✓ Manager Approved: {{ formData.approved_at_manager ? formatDate(formData.approved_at_manager) : 'N/A' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50">
          <button 
            @click="closeModal" 
            class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition"
          >
            {{ isViewMode ? 'Close' : 'Cancel' }}
          </button>
          <button 
            v-if="!isViewMode" 
            @click="saveTransfer" 
            :disabled="!canSave"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            Create Transfer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import { useApprovalWorkflow } from '../composables/useApprovalWorkflow';

const { canApprove, canReject, getApprovalStatusText, getApprovalStatusClass, getApprovalMessage, isFullyApproved: isFullyApprovedFn } = useApprovalWorkflow();

interface StockTransfer {
  id: number;
  reference_id: string;
  product_id: number;
  product_name: string;
  sku: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  from_warehouse_name: string;
  to_warehouse_name: string;
  quantity: number;
  uom: string;
  notes: string;
  approval_status: number;
  approved_by_supervisor_id?: number;
  approved_by_manager_id?: number;
  approved_at_supervisor?: string;
  approved_at_manager?: string;
  created_by?: number;
  created_by_name?: string;
  moved_at: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

const transfers = ref<StockTransfer[]>([]);
const products = ref<Product[]>([]);
const warehouses = ref<Warehouse[]>([]);
const loading = ref(false);
const error = ref('');
const showModal = ref(false);
const isViewMode = ref(false);

const formData = ref({
  product_id: '',
  from_warehouse_id: '',
  to_warehouse_id: '',
  quantity: 0,
  uom: '',
  notes: '',
  approval_status: 0,
  approved_by_supervisor_id: null as number | null,
  approved_by_manager_id: null as number | null,
  approved_at_supervisor: null as string | null,
  approved_at_manager: null as string | null
});

const isFullyApproved = computed(() => isFullyApprovedFn((formData.value.approval_status || 0)));

const canSave = computed(() => {
  return formData.value.product_id && 
         formData.value.from_warehouse_id && 
         formData.value.to_warehouse_id && 
         formData.value.from_warehouse_id !== formData.value.to_warehouse_id &&
         formData.value.quantity > 0;
});

const fetchTransfers = async () => {
  try {
    loading.value = true;
    error.value = '';
    const response = await api.get('/api/inventory/stock-transfers');
    transfers.value = response.data.data || [];
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to fetch stock transfers';
    console.error('Error fetching stock transfers:', err);
  } finally {
    loading.value = false;
  }
};

const fetchProducts = async () => {
  try {
    const response = await api.get('/api/products');
    products.value = response.data.data || [];
  } catch (err) {
    console.error('Error fetching products:', err);
  }
};

const fetchWarehouses = async () => {
  try {
    const response = await api.get('/api/warehouses');
    warehouses.value = response.data.data || [];
  } catch (err) {
    console.error('Error fetching warehouses:', err);
  }
};

const openCreateModal = () => {
  isViewMode.value = false;
  formData.value = {
    product_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: 0,
    uom: '',
    notes: '',
    approval_status: 0,
    approved_by_supervisor_id: null,
    approved_by_manager_id: null,
    approved_at_supervisor: null,
    approved_at_manager: null
  };
  showModal.value = true;
};

const viewTransfer = (transfer: StockTransfer) => {
  isViewMode.value = true;
  formData.value = {
    product_id: transfer.product_id.toString(),
    from_warehouse_id: transfer.from_warehouse_id.toString(),
    to_warehouse_id: transfer.to_warehouse_id.toString(),
    quantity: transfer.quantity,
    uom: transfer.uom || '',
    notes: transfer.notes || '',
    approval_status: transfer.approval_status || 0,
    approved_by_supervisor_id: transfer.approved_by_supervisor_id || null,
    approved_by_manager_id: transfer.approved_by_manager_id || null,
    approved_at_supervisor: transfer.approved_at_supervisor || null,
    approved_at_manager: transfer.approved_at_manager || null
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  formData.value = {
    product_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: 0,
    uom: '',
    notes: '',
    approval_status: 0,
    approved_by_supervisor_id: null,
    approved_by_manager_id: null,
    approved_at_supervisor: null,
    approved_at_manager: null
  };
};

const saveTransfer = async () => {
  if (!canSave.value) return;

  try {
    loading.value = true;
    await api.post('/api/inventory/stock-transfers', formData.value);
    closeModal();
    await fetchTransfers();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to create stock transfer';
    console.error('Error creating stock transfer:', err);
  } finally {
    loading.value = false;
  }
};

const approveTransfer = async (id: number) => {
  if (!confirm('Approve Stock Transfer? Pastikan semua data sudah benar.')) return;

  try {
    loading.value = true;
    await api.post(`/api/inventory/stock-transfers/${id}/approve`);
    await fetchTransfers();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to approve stock transfer';
    console.error('Error approving stock transfer:', err);
  } finally {
    loading.value = false;
  }
};

const rejectTransfer = async (id: number) => {
  if (!confirm('Reject dan kembalikan Stock Transfer ke pending?')) return;

  try {
    loading.value = true;
    await api.post(`/api/inventory/stock-transfers/${id}/reject`);
    await fetchTransfers();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to reject stock transfer';
    console.error('Error rejecting stock transfer:', err);
  } finally {
    loading.value = false;
  }
};

const deleteTransfer = async (id: number) => {
  if (!confirm('Delete this draft Stock Transfer? This action cannot be undone.')) return;

  try {
    loading.value = true;
    await api.delete(`/api/inventory/stock-transfers/${id}`);
    await fetchTransfers();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to delete stock transfer';
    console.error('Error deleting stock transfer:', err);
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(() => {
  fetchTransfers();
  fetchProducts();
  fetchWarehouses();
});
</script>
