<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold text-gray-900">Deliveries / Shipments</h1>
      <button
        @click="showForm = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        + Create Delivery Order
      </button>
    </div>

    <!-- Delivery Form Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-full max-w-2xl max-h-96 overflow-auto">
        <h2 class="text-xl font-bold mb-4">Create Delivery Order</h2>
        <form @submit.prevent="saveDelivery" class="space-y-4">
          <select
            v-model="formData.sales_order_id"
            class="w-full px-3 py-2 border border-gray-300 rounded"
            required
          >
            <option value="">Select Sales Order</option>
            <option v-for="so in salesOrders" :key="so.id" :value="so.id">
              {{ so.so_number }} - {{ getCustomerName(so.customer_id) }}
            </option>
          </select>

          <input
            v-model="formData.delivery_date"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded"
            required
          />

          <input
            v-model="formData.tracking_number"
            type="text"
            placeholder="Tracking Number (optional)"
            class="w-full px-3 py-2 border border-gray-300 rounded"
          />

          <textarea
            v-model="formData.notes"
            placeholder="Delivery notes (optional)"
            class="w-full px-3 py-2 border border-gray-300 rounded"
            rows="3"
          ></textarea>

          <div class="flex gap-2">
            <button
              type="submit"
              class="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Create DO
            </button>
            <button
              type="button"
              @click="closeForm"
              class="flex-1 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Deliveries Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">DO Number</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Sales Order</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Customer</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Delivery Date</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tracking</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="delivery in deliveries" :key="delivery.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-semibold text-gray-900">{{ delivery.do_number }}</td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ getSalesOrderNumber(delivery.sales_order_id) }}</td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ getCustomerNameBySO(delivery.sales_order_id) }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ formatDate(delivery.delivery_date) }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ delivery.tracking_number || '-' }}</td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="{
                  'px-2 py-1 rounded text-xs font-semibold': true,
                  'bg-yellow-100 text-yellow-800': delivery.status === 'DRAFT',
                  'bg-blue-100 text-blue-800': delivery.status === 'SHIPPED',
                  'bg-green-100 text-green-800': delivery.status === 'DELIVERED',
                }"
              >
                {{ delivery.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
              <button
                @click="updateStatus(delivery.id, 'SHIPPED')"
                v-if="delivery.status === 'DRAFT'"
                class="text-blue-600 hover:text-blue-900 font-semibold"
              >
                Ship
              </button>
              <button
                @click="updateStatus(delivery.id, 'DELIVERED')"
                v-if="delivery.status === 'SHIPPED'"
                class="text-green-600 hover:text-green-900 font-semibold"
              >
                Deliver
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '@/lib/api';

interface SalesOrder {
  id: number;
  so_number: string;
  customer_id: number;
}

interface Customer {
  id: number;
  name: string;
}

interface Delivery {
  id: number;
  do_number: string;
  sales_order_id: number;
  delivery_date: string;
  tracking_number: string;
  status: string;
  notes: string;
}

const { api } = useApi();

const salesOrders = ref<SalesOrder[]>([]);
const customers = ref<Customer[]>([]);
const deliveries = ref<Delivery[]>([]);
const showForm = ref(false);

const formData = ref({
  sales_order_id: '',
  delivery_date: new Date().toISOString().split('T')[0],
  tracking_number: '',
  notes: '',
});

onMounted(async () => {
  await Promise.all([
    fetchSalesOrders(),
    fetchCustomers(),
    fetchDeliveries(),
  ]);
});

const fetchSalesOrders = async () => {
  try {
    const response = await api.get('/sales/orders');
    salesOrders.value = response.data;
  } catch (error) {
    console.error('Failed to fetch sales orders:', error);
  }
};

const fetchCustomers = async () => {
  try {
    const response = await api.get('/sales/customers');
    customers.value = response.data;
  } catch (error) {
    console.error('Failed to fetch customers:', error);
  }
};

const fetchDeliveries = async () => {
  try {
    const response = await api.get('/sales/deliveries');
    deliveries.value = response.data;
  } catch (error) {
    console.error('Failed to fetch deliveries:', error);
  }
};

const saveDelivery = async () => {
  try {
    await api.post('/sales/deliveries', {
      sales_order_id: formData.value.sales_order_id,
      delivery_date: formData.value.delivery_date,
      tracking_number: formData.value.tracking_number,
      notes: formData.value.notes,
    });
    await fetchDeliveries();
    closeForm();
  } catch (error) {
    console.error('Failed to create delivery:', error);
  }
};

const updateStatus = async (deliveryId: number, newStatus: string) => {
  try {
    await api.put(`/sales/deliveries/${deliveryId}`, { status: newStatus });
    await fetchDeliveries();
  } catch (error) {
    console.error('Failed to update delivery status:', error);
  }
};

const closeForm = () => {
  showForm.value = false;
  formData.value = {
    sales_order_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    tracking_number: '',
    notes: '',
  };
};

const getSalesOrderNumber = (soId: number) => {
  const so = salesOrders.value.find((s) => s.id === soId);
  return so ? so.so_number : '-';
};

const getCustomerNameBySO = (soId: number) => {
  const so = salesOrders.value.find((s) => s.id === soId);
  if (!so) return '-';
  const customer = customers.value.find((c) => c.id === so.customer_id);
  return customer ? customer.name : '-';
};

const getCustomerName = (customerId: number) => {
  const customer = customers.value.find((c) => c.id === customerId);
  return customer ? customer.name : '-';
};

const formatDate = (date: string) => new Date(date).toLocaleDateString();
</script>
