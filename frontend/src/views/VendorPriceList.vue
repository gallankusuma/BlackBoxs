<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Vendor Price List</h2>
        <button @click="showForm = true" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">+ Add Price</button>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow-sm rounded-md p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 tilt-card">
        <div>
          <label class="block text-sm font-medium text-gray-700">Vendor</label>
          <select v-model.number="filters.vendorId" class="mt-1 block w-full border-gray-300 rounded-md">
            <option :value="0">All Vendors</option>
            <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Product</label>
          <select v-model.number="filters.productId" class="mt-1 block w-full border-gray-300 rounded-md">
            <option :value="0">All Products</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="flex items-end">
          <button @click="load" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Filter</button>
        </div>
      </div>

      <!-- Price List Table -->
      <div class="bg-white shadow overflow-hidden sm:rounded-md tilt-card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">MOQ</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Lead Time</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="prices.length === 0">
              <td colspan="9" class="px-4 py-6 text-center text-gray-500">No price data</td>
            </tr>
            <tr v-for="price in prices" :key="price.id">
              <td class="px-4 py-2 text-sm text-gray-900">{{ price.vendor_name }}</td>
              <td class="px-4 py-2 text-sm text-gray-700">{{ price.product_name }}</td>
              <td class="px-4 py-2 text-sm text-right">{{ formatPrice(price.price) }}</td>
              <td class="px-4 py-2 text-sm">{{ price.currency }}</td>
              <td class="px-4 py-2 text-sm">{{ formatDate(price.effective_date) }}</td>
              <td class="px-4 py-2 text-sm">{{ price.valid_until ? formatDate(price.valid_until) : '-' }}</td>
              <td class="px-4 py-2 text-sm text-right">{{ price.min_order_qty || '-' }}</td>
              <td class="px-4 py-2 text-sm text-right">{{ price.lead_time_days ? price.lead_time_days + ' days' : '-' }}</td>
              <td class="px-4 py-2 text-sm text-right">
                <button @click="editPrice(price)" class="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                <button @click="deletePrice(price.id)" class="text-red-600 hover:text-red-800">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add/Edit Price Modal -->
      <div v-if="showForm" class="fixed inset-0 bg-black/40 flex items-start justify-center z-50">
        <div class="bg-white rounded-md shadow-lg w-full max-w-2xl mt-10 p-6 tilt-card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">{{ editMode ? 'Edit' : 'Add' }} Vendor Price</h3>
            <button @click="closeForm" class="text-gray-500 hover:text-gray-700">&times;</button>
          </div>

          <form @submit.prevent="submit">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Vendor *</label>
                <select v-model.number="form.vendor_id" required class="mt-1 block w-full border-gray-300 rounded-md" :disabled="editMode">
                  <option :value="0">Select vendor</option>
                  <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Product *</label>
                <select v-model.number="form.product_id" required class="mt-1 block w-full border-gray-300 rounded-md" :disabled="editMode">
                  <option :value="0">Select product</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Price *</label>
                <input type="number" step="0.01" min="0" v-model.number="form.price" required class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Currency</label>
                <select v-model="form.currency" class="mt-1 block w-full border-gray-300 rounded-md">
                  <option value="IDR">IDR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Effective Date *</label>
                <input type="date" v-model="form.effective_date" required class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Valid Until</label>
                <input type="date" v-model="form.valid_until" class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Min Order Qty</label>
                <input type="number" step="0.01" min="0" v-model.number="form.min_order_qty" class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Lead Time (days)</label>
                <input type="number" min="0" v-model.number="form.lead_time_days" class="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700">Notes</label>
                <textarea v-model="form.notes" rows="2" class="mt-1 block w-full border-gray-300 rounded-md"></textarea>
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <button type="button" @click="closeForm" class="px-4 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</button>
              <button type="submit" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">{{ editMode ? 'Update' : 'Create' }}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '@/lib/api';

const prices = ref<any[]>([]);
const vendors = ref<any[]>([]);
const products = ref<any[]>([]);
const showForm = ref(false);
const editMode = ref(false);

const filters = reactive({
  vendorId: 0,
  productId: 0,
});

const form = reactive({
  id: 0,
  vendor_id: 0,
  product_id: 0,
  price: 0,
  currency: 'IDR',
  effective_date: '',
  valid_until: '',
  min_order_qty: 0,
  lead_time_days: 0,
  notes: '',
});

onMounted(async () => {
  await Promise.all([
    loadVendors(),
    loadProducts(),
    load(),
  ]);
});

const loadVendors = async () => {
  try {
    const res = await api.get('/procurement/vendors');
    vendors.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load vendors:', error);
    vendors.value = [];
  }
};

const loadProducts = async () => {
  try {
    const res = await api.get('/products');
    products.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load products:', error);
    products.value = [];
  }
};

const load = async () => {
  try {
    const params = new URLSearchParams();
    if (filters.vendorId) params.append('vendor_id', String(filters.vendorId));
    if (filters.productId) params.append('product_id', String(filters.productId));
    
    const res = await api.get(`/procurement/vendor-prices?${params}`);
    prices.value = res.data.data || [];
  } catch (error) {
    console.error('Failed to load vendor prices:', error);
    prices.value = [];
  }
};

const closeForm = () => {
  showForm.value = false;
  editMode.value = false;
  form.id = 0;
  form.vendor_id = 0;
  form.product_id = 0;
  form.price = 0;
  form.currency = 'IDR';
  form.effective_date = '';
  form.valid_until = '';
  form.min_order_qty = 0;
  form.lead_time_days = 0;
  form.notes = '';
};

const submit = async () => {
  try {
    if (editMode.value) {
      await api.put(`/procurement/vendor-prices/${form.id}`, form);
    } else {
      await api.post('/procurement/vendor-prices', form);
    }
    await load();
    closeForm();
  } catch (error: any) {
    alert(error.response?.data?.error || 'Failed to save vendor price');
  }
};

const editPrice = (price: any) => {
  form.id = price.id;
  form.vendor_id = price.vendor_id;
  form.product_id = price.product_id;
  form.price = price.price;
  form.currency = price.currency;
  form.effective_date = price.effective_date;
  form.valid_until = price.valid_until || '';
  form.min_order_qty = price.min_order_qty || 0;
  form.lead_time_days = price.lead_time_days || 0;
  form.notes = price.notes || '';
  editMode.value = true;
  showForm.value = true;
};

const deletePrice = async (id: number) => {
  if (!confirm('Delete this price record?')) return;
  await api.delete(`/procurement/vendor-prices/${id}`);
  await load();
};

const formatPrice = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (val: string) => val ? new Date(val).toLocaleDateString() : '-';
</script>

<style scoped>
</style>
