<template>
  <div class="min-h-screen bg-gray-50 p-6 space-y-4">
    <div class="bg-white border rounded-lg shadow-sm">
      <div class="px-6 py-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase text-gray-500 tracking-wide">Procurement</p>
          <h1 class="text-2xl font-semibold text-gray-900">Goods Receipt (GRN)</h1>
          <p class="text-sm text-gray-600">Terima barang dari PO → Update stok</p>
        </div>
        <div class="space-x-2">
          <button @click="fetchData" class="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            Refresh
          </button>
          <button @click="openCreateModal" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            + Create GRN
          </button>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      {{ store.error }}
    </div>
    <div v-if="successMsg" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
      {{ successMsg }}
    </div>

    <div class="bg-white border rounded-lg shadow-sm overflow-hidden">
      <div class="px-6 py-3 border-b flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-800">GRN List</h2>
        <span class="text-xs text-gray-500">GR No | PO No | Warehouse | Status | Action</span>
      </div>
      <div v-if="store.loading" class="p-8 text-center text-gray-500">Loading...</div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GR No</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO No</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Received By</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approval</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="gr in store.goodReceipts" :key="gr.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-semibold text-gray-900">{{ gr.gr_number }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ gr.po_number || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ gr.warehouse_name || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ gr.received_by_name || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ formatDate(gr.received_date || gr.received_at) }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="statusBadgeClass(gr.status)" class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ statusLabel(gr.status) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="approvalBadgeClass(gr.approval_status)" class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ approvalLabel(gr.approval_status) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button
                  v-if="canApproveGRN(gr)"
                  @click="approveGRN(gr.id)"
                  class="inline-flex items-center px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  :disabled="submitting"
                >
                  Approve
                </button>
                <button
                  v-if="canRejectGRN(gr)"
                  @click="rejectGRN(gr.id)"
                  class="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  :disabled="submitting"
                >
                  Reject
                </button>
                <button @click="viewGRN(gr)" class="text-blue-600 hover:text-blue-900">View</button>
                <button
                  v-if="gr.status === 'draft' || (gr.approval_status || 0) === 0"
                  @click="deleteGRN(gr.id)"
                  class="text-red-600 hover:text-red-900"
                  :disabled="submitting"
                >
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="store.goodReceipts.length === 0">
              <td colspan="7" class="px-6 py-8 text-center text-gray-500">Belum ada GRN. Klik "Create GRN" untuk mulai.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- GRN Form Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div class="bg-white h-screen overflow-y-auto flex flex-col">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 class="text-lg font-semibold text-gray-900">{{ isEditing ? 'Good Receipt Detail' : 'Create Good Receipt' }}</h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div class="px-6 py-4 space-y-4">
          <!-- Header Info -->
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
              <select
                v-model.number="form.po_id"
                class="w-full border border-gray-300 rounded-lg px-3 py-2"
                :disabled="isEditing"
                @change="onPOSelected"
              >
                <option value="">-- Pilih PO --</option>
                <option v-for="po in availablePOs" :key="po.id" :value="po.id">
                  {{ po.po_number }} ({{ po.vendor_name }})
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
              <select v-model.number="form.warehouse_id" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                <option value="">-- Pilih Warehouse --</option>
                <option v-for="wh in warehouses" :key="wh.id" :value="wh.id">{{ wh.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Received Date</label>
              <input v-model="form.received_at" type="datetime-local" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Received By</label>
              <input
                :value="authStore.user?.name || 'Current user'"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-700"
                disabled
              />
            </div>
          </div>

          <!-- PO Details -->
          <div v-if="selectedPO" class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <div class="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span class="text-gray-600">Supplier:</span>
                <p class="font-semibold">{{ selectedPO.vendor_name }}</p>
              </div>
              <div>
                <span class="text-gray-600">Expected Date:</span>
                <p class="font-semibold">{{ formatDate(selectedPO.expected_date) }}</p>
              </div>
              <div>
                <span class="text-gray-600">Total Amount:</span>
                <p class="font-semibold">{{ formatCurrency(selectedPO.total_amount || 0) }}</p>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <div class="border border-gray-200 rounded-lg">
            <div class="px-4 py-3 bg-gray-50">
              <p class="text-sm font-semibold text-gray-800">Received Items</p>
              <p class="text-xs text-gray-500">Masukkan qty yang diterima untuk setiap item PO</p>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Qty</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Received Qty</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UoM</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spec Check</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remarks</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(item, idx) in formItems" :key="idx">
                    <td class="px-4 py-2 text-sm text-gray-900">
                      <div class="font-medium">{{ item.product_name }}</div>
                      <div class="text-xs text-gray-500">#{{ item.product_id }}</div>
                    </td>
                    <td class="px-4 py-2 text-sm font-semibold text-gray-700">{{ item.po_quantity }}</td>
                    <td class="px-4 py-2">
                      <input
                        v-model="item.received_quantity"
                        type="number"
                        min="0"
                        :max="item.po_quantity"
                        step="0.01"
                        placeholder="Ketik qty..."
                        class="w-24 border-2 border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                        :disabled="isEditing"
                        @input="handleReceivedQtyInput(item, $event)"
                        @focus="($event.target as HTMLInputElement).select()"
                      />
                      <div v-if="(item.po_quantity - (item.received_quantity || 0)) > 0" class="mt-1 text-[10px] inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Short: {{ item.po_quantity - (item.received_quantity || 0) }}
                      </div>
                    </td>
                    <td class="px-4 py-2 text-sm text-gray-700">{{ item.unit_of_measure }}</td>
                    <td class="px-4 py-2 text-center">
                      <label class="inline-flex items-center cursor-pointer" :class="{ 'cursor-not-allowed': isEditing }">
                        <input
                          v-model="item.spec_checked"
                          type="checkbox"
                          class="form-checkbox h-5 w-5 text-green-600 rounded"
                          :disabled="isEditing"
                          @change="updateShortageRemark(item)"
                        />
                        <span class="ml-2 text-sm" :class="item.spec_checked ? 'text-green-700 font-semibold' : 'text-gray-500'">{{ item.spec_checked ? '✓ OK' : 'Check' }}</span>
                      </label>
                    </td>
                    <td class="px-4 py-2">
                      <input
                        v-model="item.remarks"
                        type="text"
                        placeholder="e.g., OK, Rusak, Kurang"
                        class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                        :disabled="isEditing"
                      />
                    </td>
                  </tr>
                  <tr v-if="formItems.length === 0">
                    <td colspan="6" class="px-4 py-4 text-center text-gray-500 text-sm">Pilih PO untuk load items.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea v-model="form.notes" rows="3" placeholder="Catatan penerimaan, kondisi barang, dll" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing"></textarea>
          </div>

          <!-- Summary -->
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">Total Items in PO:</span>
              <span class="font-semibold">{{ formItems.length }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">Items Received:</span>
              <span class="font-semibold">{{ itemsReceived }} / {{ formItems.length }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">Spec Checked:</span>
              <span class="font-semibold" :class="itemsSpecChecked === formItems.length ? 'text-green-600' : 'text-orange-600'">{{ itemsSpecChecked }} / {{ formItems.length }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">Short Items:</span>
              <span class="font-semibold text-red-600">{{ shortItems.length > 0 ? shortItems.join(', ') : 'None' }}</span>
            </div>
          </div>

          <!-- Actions / Footer -->
          <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-white mt-auto">
            <button @click="closeModal" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <div class="space-x-2">
              <button
                v-if="!isEditing"
                @click="saveDraft"
                class="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                :disabled="submitting"
              >
                Save as Draft
              </button>
              <button
                v-if="!isEditing"
                @click="submitGRN"
                class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                :disabled="submitting || formItems.length === 0"
              >
                Confirm Receipt
              </button>
              <button
                v-if="isEditing && selectedGRN?.status === 'draft'"
                @click="updateGRN"
                class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                :disabled="submitting"
              >
                💾 Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useGoodReceiptStore } from '../stores/goodreceipts';
import { useWarehouseStore } from '../stores/warehouse';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { useApprovalWorkflow } from '../composables/useApprovalWorkflow';
import { formatCurrency } from '../utils/format';

interface PODetail {
  id: number;
  po_number: string;
  vendor_name: string;
  expected_date: string;
  total_amount: number;
  items: any[];
}

interface GRItem {
  product_id: number;
  product_name: string;
  po_quantity: number;
  received_quantity: number;
  unit_of_measure: string;
  spec_checked: boolean;
  remarks: string;
}

const store = useGoodReceiptStore();
const warehouseStore = useWarehouseStore();
const authStore = useAuthStore();
const { canApprove, canReject } = useApprovalWorkflow();

const showModal = ref(false);
const isEditing = ref(false);
const submitting = ref(false);
const successMsg = ref('');
const selectedGRN = ref<any>(null);

const form = ref({
  po_id: null as number | null,
  warehouse_id: null as number | null,
  received_at: new Date().toISOString().slice(0, 16),
  received_by: authStore.user?.id || null,
  notes: ''
});

const formItems = ref<GRItem[]>([]);
const selectedPO = ref<PODetail | null>(null);
const availablePOs = ref<any[]>([]);
const warehouses = ref<any[]>([]);

const itemsReceived = computed(() => formItems.value.filter(item => item.received_quantity > 0).length);

const itemsSpecChecked = computed(() => formItems.value.filter(item => item.spec_checked).length);

const shortItems = computed(() => {
  return formItems.value
    .filter(item => {
      const received = item.received_quantity || 0;
      return received < item.po_quantity;
    })
    .map(item => `${item.product_name} (${item.po_quantity - (item.received_quantity || 0)})`);
});

const fetchData = async () => {
  await store.fetchGoodReceipts();
  await loadAvailablePOs();
  await loadWarehouses();
};

const loadAvailablePOs = async () => {
  try {
    const response = await api.get('/procurement/purchase-orders');
    
    // Get PO IDs that already have an active (non-rejected) GRN
    const activeGRNPOs = new Set(
      store.goodReceipts
        .filter((gr: any) => (gr.approval_status || 0) !== -1)
        .map((gr: any) => gr.po_id)
    );
    
    // Filter POs yang status 'approved' dan belum punya GRN yang aktif
    availablePOs.value = (response.data.data || []).filter((po: any) => {
      return po.approval_status === 2 && !activeGRNPOs.has(po.id);
    });
  } catch (error) {
    console.error('Failed to load POs:', error);
  }
};

const loadWarehouses = async () => {
  try {
    if (!warehouseStore.warehouses.length) {
      await warehouseStore.fetchWarehouses();
    }
    warehouses.value = warehouseStore.warehouses;
  } catch (error) {
    console.error('Failed to load warehouses:', error);
  }
};

const onPOSelected = async () => {
  formItems.value = [];
  selectedPO.value = null;

  if (!form.value.po_id) {
    console.log('No PO selected');
    return;
  }

  console.log('Loading PO details for ID:', form.value.po_id);

  try {
    const response = await api.get(`/procurement/purchase-orders/${form.value.po_id}`);
    console.log('PO API response:', response.data);
    
    const po = response.data.data;
    selectedPO.value = {
      id: po.id,
      po_number: po.po_number,
      vendor_name: po.vendor_name,
      expected_date: po.expected_date,
      total_amount: po.total_amount,
      items: po.items || []
    };

    console.log('Selected PO:', selectedPO.value);
    console.log('PO items array:', po.items);

    // Load PO items directly from the items array
    if (po.items && po.items.length > 0) {
      console.log('Found', po.items.length, 'items in PO response');
      
      formItems.value = po.items.map((item: any) => {
        console.log('Mapping item:', item);
        return {
          product_id: item.product_id,
          product_name: item.product_name || item.name,
          po_quantity: item.quantity || item.qty,
          received_quantity: 0,
          unit_of_measure: item.unit || item.uom,
          spec_checked: false,
          remarks: ''
        };
      });
      
      console.log('✅ Loaded', formItems.value.length, 'items from PO');
    } else {
      console.warn('⚠️ PO has no items - no items to load');
      alert('This PO has no items. Please check the PO.');
    }
  } catch (error: any) {
    console.error('Failed to load PO details:', error);
    alert('Failed to load PO: ' + (error.response?.data?.error || error.message));
  }
};

const validateQty = (item: GRItem) => {
  if (item.received_quantity === undefined || item.received_quantity === null) return;
  if (item.received_quantity > item.po_quantity) {
    item.received_quantity = item.po_quantity;
  }
  if (item.received_quantity < 0) {
    item.received_quantity = 0;
  }
};

const handleReceivedQtyInput = (item: GRItem, event: Event) => {
  const target = event.target as HTMLInputElement;
  item.received_quantity = parseFloat(target.value) || 0;
  validateQty(item);
  updateShortageRemark(item);
};

const isAutoRemark = (txt: string | undefined | null) => (txt || '').startsWith('[auto]');
const updateShortageRemark = (item: GRItem) => {
  const received = item.received_quantity || 0;
  const shortage = Math.max(0, (item.po_quantity || 0) - received);
  if (shortage > 0 && item.spec_checked) {
    if (!item.remarks || isAutoRemark(item.remarks)) {
      item.remarks = `[auto] Short by ${shortage}`;
    }
  } else {
    if (isAutoRemark(item.remarks)) {
      item.remarks = '';
    }
  }
};

const saveDraft = async () => {
  if (!form.value.po_id) {
    alert('Pilih PO terlebih dahulu');
    return;
  }
  if (!form.value.warehouse_id) {
    alert('Pilih Warehouse terlebih dahulu');
    return;
  }

  submitting.value = true;
  try {
    await store.createGoodReceipt({
      po_id: form.value.po_id,
      warehouse_id: form.value.warehouse_id,
      received_date: toDateOnly(form.value.received_at) || undefined,
      notes: JSON.stringify({
        items: formItems.value,
        generalNotes: form.value.notes
      }),
      status: 'draft'
    });
    successMsg.value = 'GRN saved as draft';
    closeModal();
    await fetchData();
  } catch (error: any) {
    alert(error?.response?.data?.error || 'Failed to save GRN');
  } finally {
    submitting.value = false;
  }
};

const submitGRN = async () => {
  if (!form.value.po_id) {
    alert('Pilih PO terlebih dahulu');
    return;
  }
  if (!form.value.warehouse_id) {
    alert('Pilih Warehouse terlebih dahulu');
    return;
  }
  if (formItems.value.length === 0) {
    alert('Tambah items terlebih dahulu');
    return;
  }

  // Validate at least some quantities received
  const totalReceived = formItems.value.reduce((sum, item) => sum + (item.received_quantity || 0), 0);
  if (totalReceived === 0) {
    alert('❌ ERROR: Masukkan qty yang diterima untuk minimal 1 item!\n\nRECEIVED QTY harus > 0');
    return;
  }

  submitting.value = true;
  try {
    await store.createGoodReceipt({
      po_id: form.value.po_id,
      warehouse_id: form.value.warehouse_id,
      received_date: toDateOnly(form.value.received_at) || undefined,
      notes: JSON.stringify({
        items: formItems.value,
        generalNotes: form.value.notes
      }),
      status: 'received'
    });
    successMsg.value = 'GRN created & stok updated';
    closeModal();
    await fetchData();
  } catch (error: any) {
    alert(error?.response?.data?.error || 'Failed to create GRN');
  } finally {
    submitting.value = false;
  }
};

const approveGRN = async (id: number) => {
  if (!confirm('Approve GRN? Pastikan semua data sudah benar.')) return;

  submitting.value = true;
  try {
    await store.approveGoodReceipt(id);
    successMsg.value = 'GRN approved';
    await fetchData();
  } catch (error: any) {
    alert(error?.response?.data?.error || 'Failed to approve GRN');
  } finally {
    submitting.value = false;
  }
};

const rejectGRN = async (id: number) => {
  if (!confirm('Reject dan kembalikan GRN ke pending?')) return;

  submitting.value = true;
  try {
    await store.rejectGoodReceipt(id);
    successMsg.value = 'GRN rejected successfully';
    await fetchData();
  } catch (error: any) {
    alert(error?.response?.data?.error || 'Failed to reject GRN');
  } finally {
    submitting.value = false;
  }
};

const viewGRN = async (gr: any) => {
  isEditing.value = (gr.approval_status || 0) > 0;
  selectedGRN.value = gr;
  form.value = {
    po_id: gr.po_id,
    warehouse_id: gr.warehouse_id,
    received_at: toDateTimeLocal(gr.received_date || gr.received_at),
    received_by: gr.received_by || authStore.user?.id || null,
    notes: gr.notes || ''
  };

  try {
    const notes = JSON.parse(gr.notes || '{}');
    formItems.value = notes.items || [];
    selectedPO.value = await loadPOData(gr.po_id);
  } catch (error) {
    console.error('Failed to load GRN details:', error);
  }

  showModal.value = true;
};

const updateGRN = async () => {
  if (!selectedGRN.value) return;

  submitting.value = true;
  try {
    await api.put(`/procurement/goods-receipts/${selectedGRN.value.id}`, {
      warehouse_id: form.value.warehouse_id,
      received_date: toDateOnly(form.value.received_at),
      received_by: form.value.received_by || authStore.user?.id,
      status: 'draft',
      notes: JSON.stringify({ items: formItems.value, generalNotes: form.value.notes })
    });
    successMsg.value = 'GRN updated successfully';
    closeModal();
    await fetchData();
  } catch (error: any) {
    alert(error?.response?.data?.error || 'Failed to update GRN');
  } finally {
    submitting.value = false;
  }
};

const deleteGRN = async (id: number) => {
  if (!confirm('Delete this draft GRN? This action cannot be undone.')) return;

  submitting.value = true;
  try {
    await api.delete(`/procurement/goods-receipts/${id}`);
    successMsg.value = 'GRN deleted successfully';
    await fetchData();
  } catch (error: any) {
    alert(error?.response?.data?.error || 'Failed to delete GRN');
  } finally {
    submitting.value = false;
  }
};

const loadPOData = async (poId: number) => {
  try {
    const response = await api.get(`/procurement/purchase-orders/${poId}`);
    const po = response.data.data;
    return {
      id: po.id,
      po_number: po.po_number,
      vendor_name: po.vendor_name,
      expected_date: po.expected_date,
      total_amount: po.total_amount,
      items: po.items || []
    };
  } catch (error) {
    console.error('Failed to load PO:', error);
    return null;
  }
};

const openCreateModal = () => {
  isEditing.value = false;
  form.value = {
    po_id: null,
    warehouse_id: null,
    received_at: new Date().toISOString().slice(0, 16),
    received_by: authStore.user?.id || 1,
    notes: ''
  };
  formItems.value = [];
  selectedPO.value = null;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  successMsg.value = '';
};

const toDateOnly = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
};

const toDateTimeLocal = (value: string | null | undefined) => {
  if (!value) return new Date().toISOString().slice(0, 16);
  const trimmed = value.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 16);
  return trimmed.includes('T') ? trimmed.slice(0, 16) : `${trimmed}T00:00`;
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID');
};



const statusBadgeClass = (status: string) => {
  const classes = {
    draft: 'bg-yellow-100 text-yellow-800',
    received: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800'
  };
  return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
};

const statusLabel = (status: string) => {
  const labels = {
    draft: 'Draft',
    received: 'Received',
    approved: 'Approved'
  };
  return labels[status as keyof typeof labels] || status;
};

const approvalBadgeClass = (approval?: number) => {
  const classes: Record<number, string> = {
    [-1]: 'bg-red-100 text-red-800',
    0: 'bg-yellow-100 text-yellow-800',
    1: 'bg-blue-100 text-blue-800',
    2: 'bg-green-100 text-green-800'
  };
  return classes[approval ?? 0] || 'bg-gray-100 text-gray-800';
};

const approvalLabel = (approval?: number) => {
  if (approval === 2) return 'Approved (Manager/Director)';
  if (approval === 1) return 'Approved (Supervisor)';
  if (approval === -1) return 'Rejected';
  return 'Pending';
};

const canApproveGRN = (gr: any) => {
  return canApprove(Number(gr.approval_status || 0));
};

const canRejectGRN = (gr: any) => {
  return canReject(Number(gr.approval_status || 0));
};

onMounted(() => {
  fetchData();
});
</script>
