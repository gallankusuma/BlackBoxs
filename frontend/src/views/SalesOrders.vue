<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold text-gray-900">Sales Orders</h1>
      <button
        @click="showForm = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        + Create Sales Order
      </button>
    </div>

    <!-- Sales Order Form Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-full max-w-2xl max-h-96 overflow-auto">
        <h2 class="text-xl font-bold mb-4">Create Sales Order</h2>
        <form @submit.prevent="saveSalesOrder" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <select
              v-model="formData.customer_id"
              class="px-3 py-2 border border-gray-300 rounded"
              required
            >
              <option value="">Select Customer</option>
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">
                {{ customer.name }} ({{ customer.code }})
              </option>
            </select>
            <input
              v-model="formData.so_date"
              type="date"
              class="px-3 py-2 border border-gray-300 rounded"
              required
            />
          </div>

          <!-- SO Items -->
          <div class="border-t pt-4">
            <h3 class="font-semibold mb-3">Order Items</h3>
            <div v-for="(item, index) in formData.items" :key="index" class="grid grid-cols-5 gap-2 mb-2">
              <select
                v-model="item.product_id"
                class="px-2 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="">Product</option>
                <option v-for="product in products" :key="product.id" :value="product.id">
                  {{ product.name }}
                </option>
              </select>
              <input
                v-model.number="item.qty"
                type="number"
                placeholder="Qty"
                class="px-2 py-2 border border-gray-300 rounded text-sm"
              />
              <input
                v-model.number="item.unit_price"
                type="number"
                placeholder="Price"
                class="px-2 py-2 border border-gray-300 rounded text-sm"
              />
              <div class="px-2 py-2 bg-gray-50 rounded text-sm">
                {{ (item.qty * item.unit_price).toFixed(2) }}
              </div>
              <button
                type="button"
                @click="formData.items.splice(index, 1)"
                class="px-2 py-2 bg-red-100 text-red-600 rounded text-sm"
              >
                Remove
              </button>
            </div>
            <button
              type="button"
              @click="formData.items.push({ product_id: '', qty: 0, unit_price: 0 })"
              class="text-sm text-blue-600 hover:text-blue-900 font-semibold mt-2"
            >
              + Add Item
            </button>
          </div>

          <div class="flex gap-2">
            <button
              type="submit"
              class="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Create SO
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

    <!-- Sales Orders Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">SO Number</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Customer</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">SO Date</th>
            <th class="px-6 py-3 text-right text-sm font-semibold text-gray-900">Total Amount</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="so in salesOrders" :key="so.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-semibold text-gray-900">{{ so.so_number }}</td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ getCustomerName(so.customer_id) }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ formatDate(so.so_date) }}</td>
            <td class="px-6 py-4 text-right text-sm font-semibold text-gray-900">
              {{ formatCurrency(so.total_amount) }}
            </td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="{
                  'px-2 py-1 rounded text-xs font-semibold': true,
                  'bg-yellow-100 text-yellow-800': so.status === 'DRAFT',
                  'bg-blue-100 text-blue-800': so.status === 'OPEN',
                  'bg-orange-100 text-orange-800': so.status === 'PARTIAL',
                  'bg-green-100 text-green-800': so.status === 'CLOSED',
                  'bg-red-100 text-red-800': so.status === 'CANCELLED',
                }"
              >
                {{ so.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
              <router-link
                :to="`/sales-order/${so.id}`"
                class="text-blue-600 hover:text-blue-900"
              >
                View
              </router-link>
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
import { formatCurrency } from '@/utils/format';

interface Customer {
  id: number;
  name: string;
  code: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
  customer_id: number;
  so_date: string;
  total_amount: number;
  status: string;
}

const { api } = useApi();

const customers = ref<Customer[]>([]);
const products = ref<Product[]>([]);
const salesOrders = ref<SalesOrder[]>([]);
const showForm = ref(false);

const formData = ref({
  customer_id: '',
  so_date: new Date().toISOString().split('T')[0],
  items: [{ product_id: '', qty: 0, unit_price: 0 }],
});

onMounted(async () => {
  await Promise.all([
    fetchCustomers(),
    fetchProducts(),
    fetchSalesOrders(),
  ]);
});

const fetchCustomers = async () => {
  try {
    const response = await api.get('/sales/customers');
    customers.value = response.data;
  } catch (error) {
    console.error('Failed to fetch customers:', error);
  }
};

const fetchProducts = async () => {
  try {
    const response = await api.get('/products');
    products.value = response.data;
  } catch (error) {
    console.error('Failed to fetch products:', error);
  }
};

const fetchSalesOrders = async () => {
  try {
    const response = await api.get('/sales/orders');
    salesOrders.value = response.data;
  } catch (error) {
    console.error('Failed to fetch sales orders:', error);
  }
};

const saveSalesOrder = async () => {
  try {
    const soData = {
      customer_id: formData.value.customer_id,
      so_date: formData.value.so_date,
      items: formData.value.items.filter((item) => item.product_id),
    };
    await api.post('/sales/orders', soData);
    await fetchSalesOrders();
    closeForm();
  } catch (error) {
    console.error('Failed to create sales order:', error);
  }
};

const closeForm = () => {
  showForm.value = false;
  formData.value = {
    customer_id: '',
    so_date: new Date().toISOString().split('T')[0],
    items: [{ product_id: '', qty: 0, unit_price: 0 }],
  };
};

const getCustomerName = (customerId: number) => {
  const customer = customers.value.find((c) => c.id === customerId);
  return customer ? customer.name : '-';
};

const formatDate = (date: string) => new Date(date).toLocaleDateString();
</script>
