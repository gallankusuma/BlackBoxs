<template>
  <div class="space-y-6">
    <!-- Header -->
    <PageHeader title="Stock Overview" icon="📦" subtitle="Manage warehouse inventory levels and transactions">
      <template #actions>
        <button @click="showUpdateModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 font-medium transition-colors">
          + Update Stock
        </button>
      </template>
    </PageHeader>

    <!-- KPIs -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard title="Total SKU" :value="totalSku" icon="📊" color="primary" />
      <StatCard title="Qty On Hand" :value="totalOnHand" icon="🏭" color="success" />
      <StatCard title="Low Stock (< 10)" :value="lowStock.length" icon="⚠️" :color="lowStock.length ? 'warning' : 'success'" />
    </div>

    <!-- Search -->
    <FilterBar v-model="search" search-placeholder="Search product..." />

    <!-- Loading / Error -->
    <div v-if="store.loading" class="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
    <div v-else-if="store.error" class="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
      {{ store.error }}
    </div>

    <template v-else>
      <!-- Inventory Table -->
      <DataTable :columns="columns" :rows="filtered" :loading="false">
        <template #cell-available="{ row }">
          <StatusBadge
            :status="String(row.quantity_on_hand - row.quantity_reserved)"
            :variant="availabilityVariant(row)"
            size="md"
          />
        </template>
        <template #cell-location="{ row }">
          {{ row.location || '-' }}
        </template>
        <template #cell-actions="{ row }">
          <div class="flex gap-2">
            <button @click="viewTransactions(row.product_id)" class="px-3 py-1 rounded text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors">
              History
            </button>
            <button @click="editInventory(row)" class="px-3 py-1 rounded text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors">
              Update
            </button>
          </div>
        </template>
      </DataTable>

      <!-- Transaction History -->
      <div v-if="showTransactions" class="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">Transaction History</h3>
          <button @click="showTransactions = false" class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl">&times;</button>
        </div>
        <div v-if="store.transactions.length === 0" class="text-gray-500 dark:text-gray-400 text-center py-4">
          No transactions found
        </div>
        <DataTable v-else :columns="txnColumns" :rows="store.transactions">
          <template #cell-transaction_date="{ value }">
            {{ new Date(value).toLocaleString() }}
          </template>
          <template #cell-transaction_type="{ value }">
            <span :class="value === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ value === 'in' ? '+ Receipt' : '- Issue' }}
            </span>
          </template>
          <template #cell-notes="{ value }">
            {{ value || '-' }}
          </template>
        </DataTable>
      </div>
    </template>

    <!-- Update Modal -->
    <Dialog :is-open="showUpdateModal" @update:is-open="showUpdateModal = $event" size="small">
      <template #title>Update Inventory</template>
      <form @submit.prevent="updateInventory()" class="space-y-4">
        <FormField name="product_id" label="Product" type="select" :model-value="form.product_id" @update:model-value="form.product_id = $event" :options="productStore.products.map(p => ({ value: p.id, label: p.name }))" select-placeholder="Select Product" required />
        <FormField name="transaction_type" label="Transaction Type" type="select" :model-value="form.transaction_type" @update:model-value="form.transaction_type = $event" :options="[{ value: 'in', label: 'Receipt (Add Stock)' }, { value: 'out', label: 'Issue (Remove Stock)' }]" required />
        <FormField name="quantity" label="Quantity" type="number" :model-value="form.quantity" @update:model-value="form.quantity = $event" required />
        <FormField name="location" label="Location" :model-value="form.location" @update:model-value="form.location = $event" />
        <FormField name="notes" label="Notes" type="textarea" :model-value="form.notes" @update:model-value="form.notes = $event" :rows="3" />
      </form>
      <template #actions="{ close }">
        <button @click="close" class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">Cancel</button>
        <button @click="updateInventory()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 font-medium">Update</button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useInventoryStore } from '../stores/inventory';
import { useProductStore } from '../stores/products';
import PageHeader from '../components/ui/PageHeader.vue';
import StatCard from '../components/ui/StatCard.vue';
import FilterBar from '../components/ui/FilterBar.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import DataTable from '../components/DataTable.vue';
import Dialog from '../components/ui/Dialog.vue';
import FormField from '../components/FormField.vue';

const store = useInventoryStore();
const productStore = useProductStore();

const showUpdateModal = ref(false);
const showTransactions = ref(false);
const search = ref('');
const form = ref({
  product_id: '',
  inventory_id: 0,
  transaction_type: 'in',
  quantity: 1,
  location: '',
  notes: '',
});

const columns = [
  { key: 'product_name', label: 'Product' },
  { key: 'quantity_on_hand', label: 'On Hand' },
  { key: 'quantity_reserved', label: 'Reserved' },
  { key: 'available', label: 'Available' },
  { key: 'location', label: 'Location' },
  { key: 'actions', label: 'Action' },
];

const txnColumns = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'transaction_type', label: 'Type' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'notes', label: 'Notes' },
];

onMounted(async () => {
  await Promise.all([
    store.fetchInventory(),
    productStore.fetchProducts(),
  ]);
});

const filtered = computed(() => {
  const term = search.value.toLowerCase();
  return store.inventory.filter((inv) =>
    !term || (inv.product_name || '').toLowerCase().includes(term) || (inv.sku || '').toLowerCase().includes(term)
  );
});

const totalSku = computed(() => store.inventory.length);
const totalOnHand = computed(() => store.inventory.reduce((sum, inv) => sum + (inv.quantity_on_hand || 0), 0));
const lowStock = computed(() => store.inventory.filter((inv) => inv.quantity_on_hand - inv.quantity_reserved < 10));

const availabilityVariant = (inv: any): 'success' | 'warning' | 'danger' => {
  const available = (inv.quantity_on_hand || 0) - (inv.quantity_reserved || 0);
  if (available <= 0) return 'danger';
  if (available < 10) return 'warning';
  return 'success';
};

const editInventory = (inv: any) => {
  form.value = {
    product_id: inv.product_id,
    inventory_id: inv.id,
    transaction_type: 'in',
    quantity: 1,
    location: inv.location || '',
    notes: '',
  };
  showUpdateModal.value = true;
};

const updateInventory = async () => {
  try {
    await store.recordTransaction(form.value.inventory_id, {
      transaction_type: form.value.transaction_type,
      quantity: form.value.quantity,
      notes: form.value.notes,
    });
    
    const inv = store.inventory.find(i => i.id === form.value.inventory_id);
    if (inv) {
      const newQty = form.value.transaction_type === 'in' 
        ? inv.quantity_on_hand + form.value.quantity 
        : inv.quantity_on_hand - form.value.quantity;
      
      await store.updateInventory(form.value.inventory_id, {
        quantity_on_hand: newQty,
        quantity_reserved: inv.quantity_reserved,
        location: form.value.location,
      });
    }
    
    closeModal();
  } catch (error) {
    console.error('Failed to update inventory:', error);
  }
};

const viewTransactions = async (productId: number) => {
  await store.fetchTransactions(productId);
  showTransactions.value = true;
};

const closeModal = () => {
  showUpdateModal.value = false;
  form.value = {
    product_id: '',
    inventory_id: 0,
    transaction_type: 'in',
    quantity: 1,
    location: '',
    notes: '',
  };
};
</script>
