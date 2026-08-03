<template>
  <div class="min-h-screen bg-gray-50">
    <main class="w-full mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="max-w-full">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Suppliers</h2>
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
            + Add Supplier
          </button>
        </div>

        <div class="bg-white shadow overflow-x-auto sm:rounded-lg">
          <table class="w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supply Category</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="supplier in suppliers" :key="supplier.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <span class="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{{ supplier.code }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ supplier.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span v-if="supplier.supply" :class="categoryBadgeClass(supplier.supply)" class="px-2 py-1 rounded text-xs font-medium">{{ supplier.supply }}</span>
                  <span v-else class="text-gray-300">-</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ supplier.contact_person || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ supplier.phone || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ supplier.city || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="supplier.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ supplier.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="editSupplier(supplier)" class="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                  <button @click="deleteSupplier(supplier.id)" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="suppliers.length === 0" class="text-center py-8 text-gray-500">
            No suppliers found
          </div>
        </div>
      </div>
    </main>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 class="text-lg font-bold text-gray-900">{{ editingId ? 'Edit Supplier' : 'Add Supplier' }}</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <!-- Supply Category FIRST (triggers auto-code) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Supply Category *</label>
            <select
              v-model="form.supply"
              @change="onCategoryChange"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              required
            >
              <option value="">-- Select Category --</option>
              <option value="Raw Material">Raw Material</option>
              <option value="Chemical">Chemical</option>
              <option value="Packaging">Packaging</option>
              <option value="Equipment">Equipment</option>
              <option value="Spare Parts">Spare Parts</option>
              <option value="Services">Services</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Code
                <span v-if="codeLoading" class="text-blue-500 text-xs ml-1">⏳ generating...</span>
                <span v-else-if="!editingId" class="text-gray-400 text-xs ml-1">(auto-generated)</span>
              </label>
              <input
                v-model="form.code"
                type="text"
                class="w-full px-3 py-2 border rounded-md font-mono text-sm"
                :class="editingId ? 'border-gray-300 bg-white' : 'border-blue-200 bg-blue-50'"
                :readonly="!editingId"
                placeholder="Select category to auto-generate"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="Supplier name"
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
              <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                v-model="form.city"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="City"
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
            @click="saveSupplier"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            :disabled="saving"
          >
            {{ saving ? 'Saving...' : (editingId ? 'Update' : 'Add') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, onMounted } from 'vue';
import { api } from '@/lib/api';

interface Supplier {
  id: number;
  code: string;
  name: string;
  supply?: string;
  contact_person?: string;
  contact?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  active?: boolean;
}

const suppliers = ref<Supplier[]>([]);
const showModal = ref(false);
const editingId = ref<number | null>(null);
const loading = ref(false);
const saving = ref(false);
const codeLoading = ref(false);
const error = ref<string | null>(null);

const form = ref({ 
  code: '', 
  name: '', 
  supply: '', 
  contact_person: '', 
  email: '', 
  phone: '', 
  city: '', 
  address: '', 
  active: true 
});

const categoryBadgeClass = (category: string) => {
  const map: Record<string, string> = {
    'Raw Material': 'bg-amber-100 text-amber-800',
    'Chemical': 'bg-purple-100 text-purple-800',
    'Packaging': 'bg-blue-100 text-blue-800',
    'Equipment': 'bg-green-100 text-green-800',
    'Spare Parts': 'bg-orange-100 text-orange-800',
    'Services': 'bg-teal-100 text-teal-800',
    'Other': 'bg-gray-100 text-gray-800',
  };
  return map[category] || 'bg-gray-100 text-gray-800';
};

const onCategoryChange = async () => {
  // Only auto-generate code for NEW suppliers, not editing
  if (editingId.value) return;
  if (!form.value.supply) {
    form.value.code = '';
    return;
  }
  
  try {
    codeLoading.value = true;
    const res = await api.get(`/procurement/vendors/next-code/${encodeURIComponent(form.value.supply)}`);
    form.value.code = res.data.code;
  } catch (err) {
    console.error('Failed to generate code:', err);
  } finally {
    codeLoading.value = false;
  }
};

const loadSuppliers = async () => {
  try {
    loading.value = true;
    error.value = null;
    const token = localStorage.getItem('token');
    if (!token) {
      error.value = 'Please login first';
      return;
    }

    const response = await api.get('/procurement/vendors', {
      headers: { Authorization: `Bearer ${token}` }
    });
    suppliers.value = (Array.isArray(response.data) ? response.data : (response.data?.data || [])).map((v: any) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      supply: v.supply_category || v.supply || '',
      contact_person: v.contact_person || v.contact || '',
      contact: v.contact_person || v.contact || '',
      email: v.email || '',
      phone: v.phone || '',
      city: v.city || '',
      address: v.address || '',
      active: v.is_active !== 0 && v.active !== false
    }));
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load suppliers';
    console.error('Error loading suppliers:', err);
  } finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  editingId.value = null;
  form.value = { code: '', name: '', supply: '', contact_person: '', email: '', phone: '', city: '', address: '', active: true };
  showModal.value = true;
};

const editSupplier = (supplier: Supplier) => {
  editingId.value = supplier.id;
  form.value = {
    code: supplier.code,
    name: supplier.name,
    supply: supplier.supply || '',
    contact_person: supplier.contact_person || supplier.contact || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    city: supplier.city || '',
    address: supplier.address || '',
    active: supplier.active !== false
  };
  showModal.value = true;
};

const saveSupplier = async () => {
  if (!form.value.name.trim()) {
    alert('Name is required');
    return;
  }
  if (!form.value.supply) {
    alert('Supply Category is required');
    return;
  }

  try {
    saving.value = true;
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please login first');
      return;
    }

    const payload = {
      code: form.value.code,
      name: form.value.name,
      contact_person: form.value.contact_person,
      email: form.value.email,
      phone: form.value.phone,
      address: form.value.address,
      city: form.value.city,
      supply_category: form.value.supply,
      is_active: form.value.active ? 1 : 0
    };

    if (editingId.value) {
      await api.put(`/procurement/vendors/${editingId.value}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('✅ Supplier updated successfully');
    } else {
      await api.post('/procurement/vendors', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('✅ Supplier created successfully');
    }

    showModal.value = false;
    editingId.value = null;
    await loadSuppliers();
  } catch (err: any) {
    const msg = err.response?.data?.error || 'Failed to save supplier';
    alert(`❌ Error: ${msg}`);
    console.error('Error saving supplier:', err);
  } finally {
    saving.value = false;
  }
};

const deleteSupplier = async (id: number) => {
  if (!confirm('Are you sure you want to delete this supplier?')) return;

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please login first');
      return;
    }

    await api.delete(`/procurement/vendors/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    alert('✅ Supplier deleted successfully');
    await loadSuppliers();
  } catch (err: any) {
    const msg = err.response?.data?.error || 'Failed to delete supplier';
    alert(`❌ Error: ${msg}`);
    console.error('Error deleting supplier:', err);
  }
};

onMounted(() => {
  loadSuppliers();
});

function handleExport() {
  exportToCSV(suppliers.value, 'Suppliers_Export');
}

</script>
