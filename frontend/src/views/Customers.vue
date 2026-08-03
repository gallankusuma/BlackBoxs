<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Customers</h2>
          <button
          @click="handleExport"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
        <button
            @click="openAddModal"
            class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            + Add Customer
          </button>
        </div>

        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="customer in customers" :key="customer.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ customer.code }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ customer.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ customer.contact_person || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ customer.city || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ customer.customer_type || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="customer.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ customer.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="editCustomer(customer)" class="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                  <button @click="deleteCustomer(customer.id)" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="customers.length === 0" class="text-center py-8 text-gray-500">
            No customers found
          </div>
        </div>
      </div>
    </main>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 class="text-lg font-bold text-gray-900">{{ editingId ? 'Edit Customer' : 'Add Customer' }}</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input
                v-model="form.code"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Customer code"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Customer name"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
              <input
                v-model="form.contact_person"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Contact person name"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                v-model="form.email"
                type="email"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Email address"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                v-model="form.phone"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
              <select
                v-model="form.customer_type"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              >
                <option value="">Select Type</option>
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Distributor">Distributor</option>
                <option value="End User">End User</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                v-model="form.city"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="City"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <input
                v-model="form.province"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Province"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              v-model="form.address"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              placeholder="Full address"
              rows="2"
            ></textarea>
          </div>
          <div>
            <label class="flex items-center">
              <input v-model="form.active" type="checkbox" class="rounded border-gray-300" />
              <span class="ml-2 text-sm text-gray-700">Active</span>
            </label>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button
            @click="showModal = false"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="saveCustomer"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {{ editingId ? 'Update' : 'Add' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, onMounted } from 'vue';

interface Customer {
  id: number;
  code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  city?: string;
  province?: string;
  address?: string;
  customer_type?: string;
  active: boolean;
}

const customers = ref<Customer[]>([]);
const showModal = ref(false);
const editingId = ref<number | null>(null);
const form = ref({ code: '', name: '', contact_person: '', email: '', phone: '', city: '', province: '', address: '', customer_type: '', active: true });

const openAddModal = () => {
  editingId.value = null;
  form.value = { code: '', name: '', contact_person: '', email: '', phone: '', city: '', province: '', address: '', customer_type: '', active: true };
  showModal.value = true;
};

const editCustomer = (customer: Customer) => {
  editingId.value = customer.id;
  form.value = {
    code: customer.code,
    name: customer.name,
    contact_person: customer.contact_person || '',
    email: customer.email || '',
    phone: customer.phone || '',
    city: customer.city || '',
    province: customer.province || '',
    address: customer.address || '',
    customer_type: customer.customer_type || '',
    active: customer.active
  };
  showModal.value = true;
};

const saveCustomer = () => {
  if (!form.value.code.trim() || !form.value.name.trim()) {
    alert('Code and Name are required');
    return;
  }

  if (editingId.value) {
    const index = customers.value.findIndex(c => c.id === editingId.value);
    if (index !== -1) {
      customers.value[index] = { id: editingId.value, ...form.value };
    }
  } else {
    const newId = Math.max(...customers.value.map(c => c.id), 0) + 1;
    customers.value.push({ id: newId, ...form.value });
  }

  showModal.value = false;
};

const deleteCustomer = (id: number) => {
  if (confirm('Are you sure?')) {
    customers.value = customers.value.filter(c => c.id !== id);
  }
};

onMounted(() => {
  // Sample data
  customers.value = [
    { id: 1, code: 'CUST001', name: 'PT Customer A', contact_person: 'Alice Brown', email: 'alice@customera.com', phone: '+62812111111', city: 'Jakarta', province: 'DKI Jakarta', customer_type: 'Retail', active: true },
    { id: 2, code: 'CUST002', name: 'PT Customer B', contact_person: 'Bob White', email: 'bob@customerb.com', phone: '+62877222222', city: 'Surabaya', province: 'Jawa Timur', customer_type: 'Wholesale', active: true },
    { id: 3, code: 'CUST003', name: 'CV Customer C', contact_person: 'Charlie Green', email: 'charlie@customerc.com', phone: '+62821333333', city: 'Bandung', province: 'Jawa Barat', customer_type: 'Distributor', active: true },
  ];
});

function handleExport() {
  exportToCSV(customers.value, 'Customers_Export');
}

</script>
