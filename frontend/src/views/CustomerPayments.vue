<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-800">💳 Customer Payments</h1>
      <p class="text-gray-600">Track customer payments and allocate to invoices</p>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div class="bg-blue-50 rounded-lg p-4">
        <div class="text-sm text-blue-600 font-medium">Total Receivable</div>
        <div class="text-2xl font-bold text-blue-900">${{ summary.total_receivable.toLocaleString() }}</div>
      </div>
      <div class="bg-green-50 rounded-lg p-4">
        <div class="text-sm text-green-600 font-medium">Paid This Month</div>
        <div class="text-2xl font-bold text-green-900">${{ summary.paid_this_month.toLocaleString() }}</div>
      </div>
      <div class="bg-yellow-50 rounded-lg p-4">
        <div class="text-sm text-yellow-600 font-medium">Overdue</div>
        <div class="text-2xl font-bold text-yellow-900">${{ summary.overdue.toLocaleString() }}</div>
      </div>
      <div class="bg-purple-50 rounded-lg p-4">
        <div class="text-sm text-purple-600 font-medium">Pending</div>
        <div class="text-2xl font-bold text-purple-900">${{ summary.pending.toLocaleString() }}</div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-between items-center mb-6">
      <div class="flex space-x-2">
        <button @click="filterStatus = 'all'" :class="filterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
          All Payments
        </button>
        <button @click="filterStatus = 'pending'" :class="filterStatus === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
          Pending
        </button>
        <button @click="filterStatus = 'paid'" :class="filterStatus === 'paid' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
          Paid
        </button>
      </div>
      <button @click="showRecordPaymentModal = true" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
        + Record Payment
      </button>
    </div>

    <!-- Payments List -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Date</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="payment in filteredPayments" :key="payment.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {{ formatDate(payment.payment_date) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ payment.customer_name }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
              {{ payment.invoice_number }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
              ${{ payment.amount.toLocaleString() }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ payment.payment_method }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span :class="statusBadgeClass(payment.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ payment.status }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
              <button @click="viewPayment(payment)" class="text-blue-600 hover:text-blue-800 mr-3">
                👁️ View
              </button>
              <button v-if="payment.status === 'pending'" @click="confirmPayment(payment)" class="text-green-600 hover:text-green-800">
                ✅ Confirm
              </button>
            </td>
          </tr>
          <tr v-if="filteredPayments.length === 0">
            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
              💳 No payments found
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Record Payment Modal -->
    <div v-if="showRecordPaymentModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showRecordPaymentModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold">💳 Record Payment</h2>
            <button @click="showRecordPaymentModal = false" class="text-gray-500 hover:text-gray-700">✕</button>
          </div>

          <form @submit.prevent="savePayment" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Invoice *</label>
                <select v-model="paymentForm.invoice_id" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">Select Invoice</option>
                  <option v-for="invoice in openInvoices" :key="invoice.id" :value="invoice.id">
                    {{ invoice.invoice_number }} - {{ invoice.customer_name }} (${{ invoice.amount }})
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                <input v-model="paymentForm.payment_date" type="date" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input v-model.number="paymentForm.amount" type="number" step="0.01" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select v-model="paymentForm.payment_method" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
              <input v-model="paymentForm.reference_number" type="text" placeholder="Transfer/Check reference..." class="w-full border border-gray-300 rounded-lg px-3 py-2">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea v-model="paymentForm.notes" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2"></textarea>
            </div>

            <div class="flex justify-end space-x-2 pt-4">
              <button type="button" @click="showRecordPaymentModal = false" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                💾 Save Payment
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

interface Payment {
  id: number;
  payment_date: string;
  customer_name: string;
  invoice_number: string;
  amount: number;
  payment_method: string;
  status: string;
  reference_number?: string;
  notes?: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  amount: number;
}

const payments = ref<Payment[]>([]);
const openInvoices = ref<Invoice[]>([]);
const filterStatus = ref('all');
const showRecordPaymentModal = ref(false);
const summary = ref({
  total_receivable: 0,
  paid_this_month: 0,
  overdue: 0,
  pending: 0
});

const paymentForm = ref({
  invoice_id: '',
  payment_date: new Date().toISOString().split('T')[0],
  amount: 0,
  payment_method: 'bank_transfer',
  reference_number: '',
  notes: ''
});

const filteredPayments = computed(() => {
  if (filterStatus.value === 'all') return payments.value;
  return payments.value.filter(p => p.status === filterStatus.value);
});

const loadPayments = async () => {
  try {
    const { data } = await api.get('/sales/payments');
    payments.value = data;
  } catch (error) {
    console.error('Failed to load payments:', error);
  }
};

const loadOpenInvoices = async () => {
  try {
    const { data } = await api.get('/sales/invoices?status=open');
    openInvoices.value = data;
  } catch (error) {
    console.error('Failed to load open invoices:', error);
  }
};

const loadSummary = async () => {
  try {
    const { data } = await api.get('/sales/payments/summary');
    summary.value = data;
  } catch (error) {
    console.error('Failed to load summary:', error);
  }
};

const savePayment = async () => {
  try {
    await api.post('/sales/payments', paymentForm.value);
    showRecordPaymentModal.value = false;
    await loadPayments();
    await loadSummary();
    alert('Payment recorded successfully!');
    resetForm();
  } catch (error) {
    console.error('Failed to save payment:', error);
    alert('Failed to record payment');
  }
};

const confirmPayment = async (payment: Payment) => {
  if (confirm(`Confirm payment of $${payment.amount}?`)) {
    try {
      await api.put(`/sales/payments/${payment.id}/confirm`);
      await loadPayments();
      await loadSummary();
      alert('Payment confirmed!');
    } catch (error) {
      console.error('Failed to confirm payment:', error);
      alert('Failed to confirm payment');
    }
  }
};

const viewPayment = (payment: Payment) => {
  alert(`Payment Details:\n\nInvoice: ${payment.invoice_number}\nAmount: $${payment.amount}\nMethod: ${payment.payment_method}\nReference: ${payment.reference_number || 'N/A'}`);
};

const statusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const resetForm = () => {
  paymentForm.value = {
    invoice_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: 0,
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: ''
  };
};

onMounted(() => {
  loadPayments();
  loadOpenInvoices();
  loadSummary();
});
</script>
