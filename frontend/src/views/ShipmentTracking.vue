<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-800">📦 Shipment Tracking</h1>
      <p class="text-gray-600">Monitor delivery status and shipment progress</p>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select v-model="filters.status" class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">All Status</option>
            <option value="pending">Pending Pickup</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Customer</label>
          <input v-model="filters.customer" type="text" placeholder="Search customer..." class="w-full border border-gray-300 rounded-lg px-3 py-2">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
          <input v-model="filters.tracking" type="text" placeholder="Enter tracking #" class="w-full border border-gray-300 rounded-lg px-3 py-2">
        </div>
        <div class="flex items-end">
          <button @click="loadShipments" class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            🔍 Search
          </button>
        </div>
      </div>
    </div>

    <!-- Shipments List -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivery #</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking Number</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shipment Date</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Delivery</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="shipment in shipments" :key="shipment.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
              {{ shipment.delivery_number }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ shipment.customer_name }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600">
              {{ shipment.tracking_number || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ formatDate(shipment.shipment_date) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ formatDate(shipment.estimated_delivery) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span :class="statusBadgeClass(shipment.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ shipment.status }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
              <button @click="viewDetails(shipment)" class="text-blue-600 hover:text-blue-800 mr-3">
                👁️ View
              </button>
              <button v-if="shipment.status === 'in_transit'" @click="updateStatus(shipment, 'delivered')" class="text-green-600 hover:text-green-800">
                ✅ Mark Delivered
              </button>
            </td>
          </tr>
          <tr v-if="shipments.length === 0">
            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
              📦 No shipments found
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Shipment Detail Modal -->
    <div v-if="selectedShipment" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="selectedShipment = null">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold">📦 Shipment Details</h2>
            <button @click="selectedShipment = null" class="text-gray-500 hover:text-gray-700">✕</button>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-500">Delivery Number</label>
                <p class="text-lg font-semibold">{{ selectedShipment.delivery_number }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-500">Customer</label>
                <p class="text-lg font-semibold">{{ selectedShipment.customer_name }}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-500">Tracking Number</label>
                <p class="text-lg font-mono text-blue-600">{{ selectedShipment.tracking_number || '-' }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-500">Carrier</label>
                <p class="text-lg">{{ selectedShipment.carrier || 'Own Fleet' }}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-500">Shipment Date</label>
                <p class="text-lg">{{ formatDate(selectedShipment.shipment_date) }}</p>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-500">Estimated Delivery</label>
                <p class="text-lg">{{ formatDate(selectedShipment.estimated_delivery) }}</p>
              </div>
            </div>

            <div>
              <label class="text-sm font-medium text-gray-500">Status</label>
              <p>
                <span :class="statusBadgeClass(selectedShipment.status)" class="px-3 py-1 text-sm font-semibold rounded-full">
                  {{ selectedShipment.status }}
                </span>
              </p>
            </div>

            <div v-if="selectedShipment.notes">
              <label class="text-sm font-medium text-gray-500">Notes</label>
              <p class="text-gray-700">{{ selectedShipment.notes }}</p>
            </div>

            <!-- Delivery Items -->
            <div v-if="selectedShipment.items">
              <label class="text-sm font-medium text-gray-500 mb-2 block">Items</label>
              <table class="min-w-full border border-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in selectedShipment.items" :key="item.id" class="border-t">
                    <td class="px-4 py-2 text-sm">{{ item.product_name }}</td>
                    <td class="px-4 py-2 text-sm">{{ item.quantity }} {{ item.uom }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/lib/api';

interface Shipment {
  id: number;
  delivery_number: string;
  customer_name: string;
  tracking_number: string | null;
  carrier: string | null;
  shipment_date: string;
  estimated_delivery: string;
  status: string;
  notes: string | null;
  items?: any[];
}

const shipments = ref<Shipment[]>([]);
const selectedShipment = ref<Shipment | null>(null);
const filters = ref({
  status: '',
  customer: '',
  tracking: ''
});

const loadShipments = async () => {
  try {
    const params = new URLSearchParams();
    if (filters.value.status) params.append('status', filters.value.status);
    if (filters.value.customer) params.append('customer', filters.value.customer);
    if (filters.value.tracking) params.append('tracking', filters.value.tracking);

    const { data } = await api.get(`/sales/shipments?${params.toString()}`);
    shipments.value = data;
  } catch (error) {
    console.error('Failed to load shipments:', error);
    shipments.value = [];
  }
};

const viewDetails = async (shipment: Shipment) => {
  try {
    const { data } = await api.get(`/sales/shipments/${shipment.id}`);
    selectedShipment.value = data;
  } catch (error) {
    console.error('Failed to load shipment details:', error);
  }
};

const updateStatus = async (shipment: Shipment, status: string) => {
  try {
    await api.put(`/sales/shipments/${shipment.id}/status`, { status });
    await loadShipments();
    alert(`Shipment ${shipment.delivery_number} marked as ${status}`);
  } catch (error) {
    console.error('Failed to update status:', error);
    alert('Failed to update shipment status');
  }
};

const statusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_transit: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

onMounted(() => {
  loadShipments();
});
</script>
