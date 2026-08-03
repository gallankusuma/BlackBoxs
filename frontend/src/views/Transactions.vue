<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 sm:px-0 space-y-8">
        <!-- Header -->
        <header class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Inventory Management</p>
            <h1 class="text-2xl font-bold text-gray-900">Stock Transactions</h1>
          </div>
          <span v-if="loading" class="text-sm text-gray-500">Loading...</span>
        </header>

        <!-- Messages -->
        <div v-if="errorMsg" class="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">{{ errorMsg }}</div>
        <div v-if="successMsg" class="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded">{{ successMsg }}</div>

        <!-- Tabs Navigation -->
        <div class="border-b border-gray-200">
          <nav class="flex gap-4">
            <button
              @click="activeTab = 'transfer'"
              :class="[
                'px-4 py-2 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'transfer'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              ]"
            >
              🔄 Stock Transfer
            </button>
            <button
              @click="activeTab = 'adjustment'"
              :class="[
                'px-4 py-2 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'adjustment'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              ]"
            >
              ✏️ Stock Adjustment
            </button>
            <button
              @click="activeTab = 'opname'"
              :class="[
                'px-4 py-2 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'opname'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              ]"
            >
              📋 Stock Opname
            </button>
          </nav>
        </div>

        <!-- STOCK TRANSFER TAB -->
        <div v-if="activeTab === 'transfer'" class="space-y-6">
          <!-- Transfer Form -->
          <section class="bg-white shadow sm:rounded-lg p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Create Stock Transfer</h2>
            <form @submit.prevent="submitTransfer" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">From Location</label>
                  <select v-model="transferForm.from_location_id" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option :value="null">Select warehouse location</option>
                    <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                      {{ loc.warehouse_name }} - {{ loc.code }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">To Location</label>
                  <select v-model="transferForm.to_location_id" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option :value="null">Select warehouse location</option>
                    <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                      {{ loc.warehouse_name }} - {{ loc.code }}
                    </option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Transfer Date</label>
                <input v-model="transferForm.transfer_date" type="date" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                <textarea v-model="transferForm.notes" rows="2" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"></textarea>
              </div>

              <!-- Line Items -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Items</label>
                <div class="space-y-3 mb-3">
                  <div v-for="(item, idx) in transferItems" :key="idx" class="flex gap-2">
                    <select v-model="item.product_id" required class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm">
                      <option :value="null">Select product</option>
                      <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} ({{ p.sku }})</option>
                    </select>
                    <input v-model.number="item.quantity" type="number" required placeholder="Qty" class="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    <select v-model="item.batch_number" class="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm">
                      <option value="">Batch</option>
                      <option v-for="b in batches" :key="b.id" :value="b.batch_number">{{ b.batch_number }}</option>
                    </select>
                    <button v-if="transferItems.length > 1" type="button" @click="removeTransferItem(idx)" class="px-2 py-2 text-red-600 hover:text-red-900">✕</button>
                  </div>
                </div>
                <button type="button" @click="addTransferItem" class="text-sm text-blue-600 hover:text-blue-900">+ Add Item</button>
              </div>

              <div class="flex gap-3">
                <button type="button" @click="resetTransfer" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Cancel</button>
                <button type="submit" :disabled="submitting" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {{ submitting ? 'Processing...' : 'Transfer Stock' }}
                </button>
              </div>
            </form>
          </section>

          <!-- Transfer History Table -->
          <section class="bg-white shadow sm:rounded-lg p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Transfer History</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">From</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">To</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Product</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Qty</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Batch</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="record in transfers" :key="record.id">
                    <td class="px-4 py-2">{{ formatDate(record.created_at) }}</td>
                    <td class="px-4 py-2">{{ record.from_location }}</td>
                    <td class="px-4 py-2">{{ record.to_location }}</td>
                    <td class="px-4 py-2">{{ record.product_name }}</td>
                    <td class="px-4 py-2">{{ record.quantity }} {{ record.uom }}</td>
                    <td class="px-4 py-2">{{ record.batch_number || '-' }}</td>
                    <td class="px-4 py-2 text-gray-600">{{ record.notes || '-' }}</td>
                  </tr>
                  <tr v-if="transfers.length === 0">
                    <td colspan="7" class="px-4 py-4 text-center text-gray-500">No transfers recorded</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- STOCK ADJUSTMENT TAB -->
        <div v-if="activeTab === 'adjustment'" class="space-y-6">
          <!-- Adjustment Form -->
          <section class="bg-white shadow sm:rounded-lg p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Create Stock Adjustment</h2>
            <form @submit.prevent="submitAdjustment" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Warehouse</label>
                  <select v-model="adjustmentForm.warehouse_id" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option :value="null">Select warehouse</option>
                    <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Adjustment Type</label>
                  <select v-model="adjustmentForm.adjustment_type" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Select type</option>
                    <option value="increase">Increase (Damaged, Return)</option>
                    <option value="decrease">Decrease (Damage, Loss)</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Adjustment Date</label>
                <input v-model="adjustmentForm.adjustment_date" type="date" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Reason</label>
                <input v-model="adjustmentForm.reason" type="text" placeholder="e.g. Damaged goods, Shrinkage" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                <textarea v-model="adjustmentForm.notes" rows="2" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"></textarea>
              </div>

              <!-- Line Items -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Items</label>
                <div class="space-y-3 mb-3">
                  <div v-for="(item, idx) in adjustmentItems" :key="idx" class="flex gap-2">
                    <select v-model="item.product_id" required class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm">
                      <option :value="null">Select product</option>
                      <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} ({{ p.sku }})</option>
                    </select>
                    <input v-model.number="item.quantity" type="number" required placeholder="Qty" class="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    <select v-model="item.batch_number" class="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm">
                      <option value="">Batch</option>
                      <option v-for="b in batches" :key="b.id" :value="b.batch_number">{{ b.batch_number }}</option>
                    </select>
                    <button v-if="adjustmentItems.length > 1" type="button" @click="removeAdjustmentItem(idx)" class="px-2 py-2 text-red-600 hover:text-red-900">✕</button>
                  </div>
                </div>
                <button type="button" @click="addAdjustmentItem" class="text-sm text-blue-600 hover:text-blue-900">+ Add Item</button>
              </div>

              <div class="flex gap-3">
                <button type="button" @click="resetAdjustment" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Cancel</button>
                <button type="submit" :disabled="submitting" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {{ submitting ? 'Processing...' : 'Post Adjustment' }}
                </button>
              </div>
            </form>
          </section>

          <!-- Adjustment History Table -->
          <section class="bg-white shadow sm:rounded-lg p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Adjustment History</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Warehouse</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Type</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Product</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Qty</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Reason</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="record in adjustments" :key="record.id">
                    <td class="px-4 py-2">{{ formatDate(record.created_at) }}</td>
                    <td class="px-4 py-2">{{ record.warehouse_name }}</td>
                    <td class="px-4 py-2">
                      <span :class="[
                        'px-2 py-1 rounded text-xs font-semibold',
                        record.adjustment_type === 'increase' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      ]">
                        {{ record.adjustment_type }}
                      </span>
                    </td>
                    <td class="px-4 py-2">{{ record.product_name }}</td>
                    <td class="px-4 py-2">{{ record.quantity }} {{ record.uom }}</td>
                    <td class="px-4 py-2">{{ record.reason || '-' }}</td>
                    <td class="px-4 py-2 text-gray-600">{{ record.notes || '-' }}</td>
                  </tr>
                  <tr v-if="adjustments.length === 0">
                    <td colspan="7" class="px-4 py-4 text-center text-gray-500">No adjustments recorded</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- STOCK OPNAME TAB -->
        <div v-if="activeTab === 'opname'" class="space-y-6">
          <!-- Opname Form -->
          <section class="bg-white shadow sm:rounded-lg p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Create Stock Opname</h2>
            <form @submit.prevent="submitOpname" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Warehouse</label>
                  <select v-model="opnameForm.warehouse_id" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option :value="null">Select warehouse</option>
                    <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Opname Date</label>
                  <input v-model="opnameForm.opname_date" type="date" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                <textarea v-model="opnameForm.notes" rows="2" placeholder="Observations, issues found, etc." class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"></textarea>
              </div>

              <!-- Line Items: System vs Physical -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Items (System vs Physical Count)</label>
                <div class="space-y-3 mb-3 max-h-96 overflow-y-auto border border-gray-200 rounded p-3">
                  <div v-for="(item, idx) in opnameItems" :key="idx" class="flex gap-2 pb-2 border-b border-gray-100 last:border-0">
                    <select v-model="item.product_id" required class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm">
                      <option :value="null">Select product</option>
                      <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} ({{ p.sku }})</option>
                    </select>
                    <input v-model.number="item.system_qty" type="number" placeholder="System Qty" class="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100" disabled />
                    <input v-model.number="item.physical_qty" type="number" required placeholder="Physical Qty" class="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                    <input :value="(item.physical_qty || 0) - (item.system_qty || 0)" type="number" placeholder="Diff" class="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100" disabled />
                    <button v-if="opnameItems.length > 1" type="button" @click="removeOpnameItem(idx)" class="px-2 py-2 text-red-600 hover:text-red-900">✕</button>
                  </div>
                </div>
                <button type="button" @click="addOpnameItem" class="text-sm text-blue-600 hover:text-blue-900">+ Add Product</button>
              </div>

              <div class="flex gap-3">
                <button type="button" @click="resetOpname" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Cancel</button>
                <button type="submit" :disabled="submitting" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {{ submitting ? 'Processing...' : 'Post Opname' }}
                </button>
              </div>
            </form>
          </section>

          <!-- Opname History Table -->
          <section class="bg-white shadow sm:rounded-lg p-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Opname History</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Warehouse</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Product</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">System Qty</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Physical Qty</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Variance</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="record in opnames" :key="record.id">
                    <td class="px-4 py-2">{{ formatDate(record.created_at) }}</td>
                    <td class="px-4 py-2">{{ record.warehouse_name }}</td>
                    <td class="px-4 py-2">{{ record.product_name }}</td>
                    <td class="px-4 py-2 text-right">{{ record.system_qty }}</td>
                    <td class="px-4 py-2 text-right">{{ record.physical_qty }}</td>
                    <td class="px-4 py-2 text-right">
                      <span :class="[
                        'font-semibold',
                        record.variance === 0 ? 'text-green-600' : record.variance > 0 ? 'text-blue-600' : 'text-red-600'
                      ]">
                        {{ record.variance > 0 ? '+' : '' }}{{ record.variance }}
                      </span>
                    </td>
                    <td class="px-4 py-2 text-gray-600">{{ record.notes || '-' }}</td>
                  </tr>
                  <tr v-if="opnames.length === 0">
                    <td colspan="7" class="px-4 py-4 text-center text-gray-500">No opnames recorded</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useProductStore } from '../stores/products';
import { useWarehouseStore } from '../stores/warehouse';
import { useInventoryStore } from '../stores/inventory';

const productStore = useProductStore();
const warehouseStore = useWarehouseStore();
const inventoryStore = useInventoryStore();

const activeTab = ref('transfer');
const loading = ref(false);
const submitting = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

const formatDate = (date: string) => new Date(date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });

// Data from stores
const products = computed(() => productStore.products || []);
const warehouses = computed(() => warehouseStore.warehouses || []);
const batches = computed(() => inventoryStore.batches || []);
const locations = computed(() => warehouseStore.warehouse_locations || []);

// Transfer Form
const transferForm = ref({
  from_location_id: null as number | null,
  to_location_id: null as number | null,
  transfer_date: new Date().toISOString().split('T')[0],
  notes: '',
});
const transferItems = ref([{ product_id: null as number | null, quantity: 1, batch_number: '' }]);
const transfers = ref<any[]>([]);

// Adjustment Form
const adjustmentForm = ref({
  warehouse_id: null as number | null,
  adjustment_type: '',
  adjustment_date: new Date().toISOString().split('T')[0],
  reason: '',
  notes: '',
});
const adjustmentItems = ref([{ product_id: null as number | null, quantity: 1, batch_number: '' }]);
const adjustments = ref<any[]>([]);

// Opname Form
const opnameForm = ref({
  warehouse_id: null as number | null,
  opname_date: new Date().toISOString().split('T')[0],
  notes: '',
});
const opnameItems = ref([{ product_id: null as number | null, system_qty: 0, physical_qty: 0 }]);
const opnames = ref<any[]>([]);

// Initialize
onMounted(async () => {
  loading.value = true;
  try {
    await Promise.all([
      productStore.fetchProducts(),
      warehouseStore.fetchWarehouses(),
      warehouseStore.fetchWarehouseLocations(),
      inventoryStore.fetchBatches(),
    ]);
  } finally {
    loading.value = false;
  }
});

// Transfer functions
const addTransferItem = () => {
  transferItems.value.push({ product_id: null, quantity: 1, batch_number: '' });
};
const removeTransferItem = (idx: number) => {
  transferItems.value.splice(idx, 1);
};
const resetTransfer = () => {
  transferForm.value = {
    from_location_id: null,
    to_location_id: null,
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
  };
  transferItems.value = [{ product_id: null, quantity: 1, batch_number: '' }];
  errorMsg.value = '';
};
const submitTransfer = async () => {
  if (!transferForm.value.from_location_id || !transferForm.value.to_location_id) {
    errorMsg.value = 'From dan To Location wajib diisi';
    return;
  }
  const validItems = transferItems.value.filter(i => i.product_id && i.quantity > 0);
  if (validItems.length === 0) {
    errorMsg.value = 'Minimal satu item harus diisi';
    return;
  }
  errorMsg.value = '';
  submitting.value = true;
  try {
    // Simulate API call
    for (const item of validItems) {
      const product = products.value.find(p => p.id === item.product_id);
      const fromLoc = locations.value.find(l => l.id === transferForm.value.from_location_id);
      const toLoc = locations.value.find(l => l.id === transferForm.value.to_location_id);
      transfers.value.unshift({
        id: Date.now() + Math.random(),
        created_at: new Date().toISOString(),
        from_location: `${fromLoc?.warehouse_name || ''} - ${fromLoc?.code || ''}`,
        to_location: `${toLoc?.warehouse_name || ''} - ${toLoc?.code || ''}`,
        product_name: product?.name || '',
        quantity: item.quantity,
        uom: product?.unit_of_measure || '',
        batch_number: item.batch_number,
        notes: transferForm.value.notes,
      });
    }
    successMsg.value = 'Transfer berhasil dicatat';
    resetTransfer();
  } catch (err: any) {
    errorMsg.value = err?.message || 'Gagal mencatat transfer';
  } finally {
    submitting.value = false;
  }
};

// Adjustment functions
const addAdjustmentItem = () => {
  adjustmentItems.value.push({ product_id: null, quantity: 1, batch_number: '' });
};
const removeAdjustmentItem = (idx: number) => {
  adjustmentItems.value.splice(idx, 1);
};
const resetAdjustment = () => {
  adjustmentForm.value = {
    warehouse_id: null,
    adjustment_type: '',
    adjustment_date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
  };
  adjustmentItems.value = [{ product_id: null, quantity: 1, batch_number: '' }];
  errorMsg.value = '';
};
const submitAdjustment = async () => {
  if (!adjustmentForm.value.warehouse_id || !adjustmentForm.value.adjustment_type) {
    errorMsg.value = 'Warehouse dan Adjustment Type wajib diisi';
    return;
  }
  const validItems = adjustmentItems.value.filter(i => i.product_id && i.quantity > 0);
  if (validItems.length === 0) {
    errorMsg.value = 'Minimal satu item harus diisi';
    return;
  }
  errorMsg.value = '';
  submitting.value = true;
  try {
    for (const item of validItems) {
      const product = products.value.find(p => p.id === item.product_id);
      const warehouse = warehouses.value.find(w => w.id === adjustmentForm.value.warehouse_id);
      adjustments.value.unshift({
        id: Date.now() + Math.random(),
        created_at: new Date().toISOString(),
        warehouse_name: warehouse?.name || '',
        adjustment_type: adjustmentForm.value.adjustment_type,
        product_name: product?.name || '',
        quantity: item.quantity,
        uom: product?.unit_of_measure || '',
        reason: adjustmentForm.value.reason,
        notes: adjustmentForm.value.notes,
      });
    }
    successMsg.value = 'Adjustment berhasil dicatat';
    resetAdjustment();
  } catch (err: any) {
    errorMsg.value = err?.message || 'Gagal mencatat adjustment';
  } finally {
    submitting.value = false;
  }
};

// Opname functions
const addOpnameItem = () => {
  opnameItems.value.push({ product_id: null, system_qty: 0, physical_qty: 0 });
};
const removeOpnameItem = (idx: number) => {
  opnameItems.value.splice(idx, 1);
};
const resetOpname = () => {
  opnameForm.value = {
    warehouse_id: null,
    opname_date: new Date().toISOString().split('T')[0],
    notes: '',
  };
  opnameItems.value = [{ product_id: null, system_qty: 0, physical_qty: 0 }];
  errorMsg.value = '';
};
const submitOpname = async () => {
  if (!opnameForm.value.warehouse_id) {
    errorMsg.value = 'Warehouse wajib diisi';
    return;
  }
  const validItems = opnameItems.value.filter(i => i.product_id && i.physical_qty !== undefined);
  if (validItems.length === 0) {
    errorMsg.value = 'Minimal satu item harus diisi';
    return;
  }
  errorMsg.value = '';
  submitting.value = true;
  try {
    for (const item of validItems) {
      const product = products.value.find(p => p.id === item.product_id);
      const warehouse = warehouses.value.find(w => w.id === opnameForm.value.warehouse_id);
      const variance = (item.physical_qty || 0) - (item.system_qty || 0);
      opnames.value.unshift({
        id: Date.now() + Math.random(),
        created_at: new Date().toISOString(),
        warehouse_name: warehouse?.name || '',
        product_name: product?.name || '',
        system_qty: item.system_qty,
        physical_qty: item.physical_qty,
        variance,
        notes: opnameForm.value.notes,
      });
    }
    successMsg.value = 'Opname berhasil dicatat';
    resetOpname();
  } catch (err: any) {
    errorMsg.value = err?.message || 'Gagal mencatat opname';
  } finally {
    submitting.value = false;
  }
};
</script>
