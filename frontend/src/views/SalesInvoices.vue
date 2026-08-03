<template>
  <div class="min-h-screen bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Invoices</h1>
          <p class="text-gray-500 mt-1">Manage sales invoices and billing</p>
        </div>
        <button
          @click="openAddModal"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Invoice
        </button>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total Invoices</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ invoices.length }}</p>
            </div>
            <div class="bg-blue-100 p-3 rounded-lg">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Unpaid</p>
              <p class="text-2xl font-bold text-red-600 mt-1">{{ invoices.filter(i => i.status === 'unpaid').length }}</p>
            </div>
            <div class="bg-red-100 p-3 rounded-lg">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Paid</p>
              <p class="text-2xl font-bold text-green-600 mt-1">{{ invoices.filter(i => i.status === 'paid').length }}</p>
            </div>
            <div class="bg-green-100 p-3 rounded-lg">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total Amount</p>
              <p class="text-2xl font-bold text-blue-600 mt-1">{{ formatCurrency(totalAmount) }}</p>
            </div>
            <div class="bg-blue-100 p-3 rounded-lg">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div class="flex flex-wrap gap-3">
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="status in statusFilters"
              :key="status.value"
              @click="filterStatus = status.value"
              :class="[
                filterStatus === status.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
                'px-4 py-2 rounded-lg text-sm font-medium transition-all'
              ]"
            >
              {{ status.label }}
            </button>
          </div>
          <div class="flex-1 min-w-[200px]">
            <div class="relative">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search invoices..."
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg class="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Invoices Table -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Invoice #</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">SO Number</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Issued Date</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Due Date</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="loading" class="text-center">
                <td colspan="7" class="px-6 py-12">
                  <div class="flex justify-center items-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span class="ml-3 text-gray-500">Loading invoices...</span>
                  </div>
                </td>
              </tr>
              <tr v-else-if="filteredInvoices.length === 0" class="text-center">
                <td colspan="7" class="px-6 py-12 text-gray-500">
                  <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p class="font-medium">No invoices found</p>
                </td>
              </tr>
              <tr
                v-else
                v-for="invoice in filteredInvoices"
                :key="invoice.id"
                class="hover:bg-blue-50 transition-colors cursor-pointer"
                @click="viewInvoice(invoice)"
              >
                <td class="px-6 py-4">
                  <span class="text-blue-600 hover:text-blue-800 font-semibold">{{ invoice.invoice_number }}</span>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600">{{ invoice.so_number || '-' }}</p>
                </td>
                <td class="px-6 py-4">
                  <p class="font-semibold text-gray-900">{{ invoice.currency || 'IDR' }} {{ formatNumber(invoice.amount) }}</p>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600">{{ formatDate(invoice.issued_at) }}</p>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600">{{ formatDate(invoice.due_at) }}</p>
                </td>
                <td class="px-6 py-4">
                  <span
                    class="px-3 py-1 rounded-full text-xs font-semibold capitalize"
                    :class="getStatusColor(invoice.status)"
                  >
                    {{ invoice.status }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex gap-2">
                    <button
                      @click.stop="viewInvoice(invoice)"
                      class="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      title="View"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import { useToast } from 'vue-toastification';
import { formatCurrency } from '@/utils/format';

const toast = useToast();

interface Invoice {
  id: number;
  invoice_number: string;
  so_id: number;
  so_number?: string;
  amount: number;
  currency?: string;
  status: string;
  issued_at?: string;
  due_at?: string;
  notes?: string;
}

const statusFilters = [
  { label: 'All', value: '' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Cancelled', value: 'cancelled' }
];

const filterStatus = ref('');
const searchQuery = ref('');
const loading = ref(false);
const invoices = ref<Invoice[]>([]);

onMounted(async () => {
  await fetchInvoices();
});

const fetchInvoices = async () => {
  loading.value = true;
  try {
    const res = await api.get('/sales/invoices');
    invoices.value = res.data.data;
  } catch (error: any) {
    toast.error('Failed to fetch invoices');
  } finally {
    loading.value = false;
  }
};

const filteredInvoices = computed(() => {
  return invoices.value.filter(invoice => {
    const matchStatus = !filterStatus.value || invoice.status.toLowerCase() === filterStatus.value.toLowerCase();
    const matchSearch = !searchQuery.value || 
      invoice.invoice_number.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (invoice.so_number && invoice.so_number.toLowerCase().includes(searchQuery.value.toLowerCase()));
    return matchStatus && matchSearch;
  });
});

const totalAmount = computed(() => {
  return filteredInvoices.value.reduce((sum, invoice) => sum + invoice.amount, 0);
});

const getStatusColor = (status: string) => {
  const colors: { [key: string]: string } = {
    'unpaid': 'bg-yellow-100 text-yellow-800',
    'paid': 'bg-green-100 text-green-800',
    'overdue': 'bg-red-100 text-red-800',
    'cancelled': 'bg-gray-100 text-gray-800'
  };
  return colors[status.toLowerCase()] || 'bg-gray-100 text-gray-800';
};

const formatNumber = (num: number) => {
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
};



const formatDate = (date: string | undefined) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const viewInvoice = (_invoice: Invoice) => {
  toast.info('Invoice details coming soon');
};

const openAddModal = () => {
  toast.info('Create invoice coming soon');
};
</script>
