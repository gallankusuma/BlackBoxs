<template>
  <div class="space-y-6">
    <!-- Header -->
    <PageHeader title="Work Orders" icon="🏭" subtitle="Manage production work orders and scheduling">
      <template #actions>
        <button @click="showAddModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 font-medium transition-colors">
          + Create Work Order
        </button>
      </template>
    </PageHeader>

    <!-- Loading / Error -->
    <div v-if="store.loading" class="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
    <div v-else-if="store.error" class="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
      {{ store.error }}
    </div>

    <!-- Work Orders Table -->
    <DataTable v-else :columns="columns" :rows="store.workOrders" :loading="false">
      <template #cell-status="{ row }">
        <StatusBadge :status="row.status" />
      </template>
      <template #cell-scheduled_start="{ row }">
        {{ row.scheduled_start ? new Date(row.scheduled_start).toLocaleDateString() : '-' }}
      </template>
      <template #cell-actions="{ row }">
        <div class="flex gap-2">
          <button @click="editWorkOrder(row)" class="px-3 py-1 rounded text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors">
            Edit
          </button>
          <button @click="promptDelete(row.id)" class="px-3 py-1 rounded text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors">
            Delete
          </button>
        </div>
      </template>
    </DataTable>

    <!-- Add/Edit Modal -->
    <Dialog :is-open="showAddModal || showEditModal" @update:is-open="closeModal" size="small">
      <template #title>{{ showEditModal ? 'Edit' : 'Create' }} Work Order</template>
      <form @submit.prevent="showEditModal ? updateWorkOrder() : createWorkOrder()" class="space-y-4">
        <FormField name="product_id" label="Product" type="select" :model-value="form.product_id" @update:model-value="form.product_id = $event" :options="productStore.products.map(p => ({ value: p.id, label: p.name }))" select-placeholder="Select Product" required />
        <FormField name="quantity" label="Quantity" type="number" :model-value="form.quantity" @update:model-value="form.quantity = $event" required />
        <FormField name="status" label="Status" type="select" :model-value="form.status" @update:model-value="form.status = $event" :options="statusOptions" />
        <FormField name="priority" label="Priority" type="select" :model-value="form.priority" @update:model-value="form.priority = $event" :options="priorityOptions" />
      </form>
      <template #actions="{ close }">
        <button @click="close" class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">Cancel</button>
        <button @click="showEditModal ? updateWorkOrder() : createWorkOrder()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 font-medium">
          {{ showEditModal ? 'Update' : 'Create' }}
        </button>
      </template>
    </Dialog>

    <!-- Delete confirm -->
    <ConfirmDialog
      :is-open="showDeleteConfirm"
      title="Delete Work Order"
      message="Are you sure you want to delete this work order?"
      confirm-label="Delete"
      confirm-variant="danger"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useWorkOrderStore } from '../stores/workorders';
import { useProductStore } from '../stores/products';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import DataTable from '../components/DataTable.vue';
import Dialog from '../components/ui/Dialog.vue';
import FormField from '../components/FormField.vue';

const store = useWorkOrderStore();
const productStore = useProductStore();

const showAddModal = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const deletingId = ref<number | null>(null);
const form = ref({
  id: 0,
  product_id: '',
  quantity: 1,
  status: 'pending',
  priority: 'normal',
  scheduled_start: '',
  scheduled_end: '',
});

const columns = [
  { key: 'product_name', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'scheduled_start', label: 'Scheduled Start' },
  { key: 'actions', label: 'Actions' },
];

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

onMounted(async () => {
  await Promise.all([
    store.fetchWorkOrders(),
    productStore.fetchProducts(),
  ]);
});

const createWorkOrder = async () => {
  try {
    await store.createWorkOrder(form.value);
    closeModal();
  } catch (error) {
    console.error('Failed to create work order:', error);
  }
};

const editWorkOrder = (wo: any) => {
  form.value = { ...wo };
  showEditModal.value = true;
};

const updateWorkOrder = async () => {
  try {
    await store.updateWorkOrder(form.value.id, form.value);
    closeModal();
  } catch (error) {
    console.error('Failed to update work order:', error);
  }
};

const promptDelete = (id: number) => {
  deletingId.value = id;
  showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
  if (!deletingId.value) return;
  try {
    await store.deleteWorkOrder(deletingId.value);
  } catch (error) {
    console.error('Failed to delete work order:', error);
  }
  showDeleteConfirm.value = false;
  deletingId.value = null;
};

const closeModal = () => {
  showAddModal.value = false;
  showEditModal.value = false;
  form.value = {
    id: 0,
    product_id: '',
    quantity: 1,
    status: 'pending',
    priority: 'normal',
    scheduled_start: '',
    scheduled_end: '',
  };
};
</script>
