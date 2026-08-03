<template>
  <div class="space-y-6">
    <h1 class="text-3xl font-bold text-gray-900">Finance Management</h1>

    <!-- Quick Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-gray-500 text-sm font-semibold uppercase">Total Revenue</div>
        <div class="text-3xl font-bold text-gray-900 mt-2">
          {{ formatCurrency(totalRevenue) }}
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-gray-500 text-sm font-semibold uppercase">Total COGS</div>
        <div class="text-3xl font-bold text-red-600 mt-2">
          {{ formatCurrency(totalCogs) }}
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-gray-500 text-sm font-semibold uppercase">Gross Profit</div>
        <div class="text-3xl font-bold text-green-600 mt-2">
          {{ formatCurrency(grossProfit) }}
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-gray-500 text-sm font-semibold uppercase">Margin %</div>
        <div class="text-3xl font-bold text-blue-600 mt-2">{{ marginPercent.toFixed(2) }}%</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 flex gap-8">
      <button
        v-for="tab in tabs"
        :key="tab"
        @click="activeTab = tab"
        :class="{
          'pb-4 px-2 font-semibold border-b-2': true,
          'border-blue-600 text-blue-600': activeTab === tab,
          'border-transparent text-gray-500 hover:text-gray-700': activeTab !== tab,
        }"
      >
        {{ tab }}
      </button>
    </div>

    <!-- COGS Tab -->
    <div v-if="activeTab === 'COGS'" class="space-y-4">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">Cost of Goods Sold</h2>
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-6 py-3 text-left text-sm font-semibold">Product</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Batch</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Raw Material</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Labor</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Overhead</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Total Cost</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Cost/Unit</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="item in cogsList" :key="item.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 text-sm text-gray-900">{{ item.product_name }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ item.batch_number }}</td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.raw_material_cost) }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.labor_cost) }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.overhead_cost) }}
              </td>
              <td class="px-6 py-4 text-right text-sm font-semibold">
                {{ formatCurrency(item.total_cost) }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.cost_per_unit) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Accounts Payable Tab -->
    <div v-if="activeTab === 'Accounts Payable'" class="space-y-4">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">Outstanding Payables</h2>
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-6 py-3 text-left text-sm font-semibold">PO Number</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Vendor</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Invoice</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Due Date</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Amount</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Paid</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Outstanding</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="item in apList" :key="item.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 text-sm text-gray-900">{{ item.po_number }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ item.vendor_name }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ item.invoice_number }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">
                {{ item.due_date ? new Date(item.due_date).toLocaleDateString() : '-' }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.amount) }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.paid_amount) }}
              </td>
              <td class="px-6 py-4 text-right text-sm font-semibold text-red-600">
                {{ formatCurrency(item.amount - item.paid_amount) }}
              </td>
              <td class="px-6 py-4 text-sm">
                <span
                  :class="{
                    'px-2 py-1 rounded text-xs font-semibold': true,
                    'bg-green-100 text-green-800': item.status === 'paid',
                    'bg-yellow-100 text-yellow-800': item.status === 'partial',
                    'bg-red-100 text-red-800': item.status === 'open',
                  }"
                >
                  {{ item.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Accounts Receivable Tab -->
    <div v-if="activeTab === 'Accounts Receivable'" class="space-y-4">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">Outstanding Receivables</h2>
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-6 py-3 text-left text-sm font-semibold">Invoice</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Customer</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Due Date</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Amount</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Received</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Outstanding</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="item in arList" :key="item.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 text-sm text-gray-900">{{ item.invoice_number }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ item.customer_name }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">
                {{ item.due_date ? new Date(item.due_date).toLocaleDateString() : '-' }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.amount) }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.paid_amount) }}
              </td>
              <td class="px-6 py-4 text-right text-sm font-semibold text-red-600">
                {{ formatCurrency(item.amount - item.paid_amount) }}
              </td>
              <td class="px-6 py-4 text-sm">
                <span
                  :class="{
                    'px-2 py-1 rounded text-xs font-semibold': true,
                    'bg-green-100 text-green-800': item.status === 'paid',
                    'bg-yellow-100 text-yellow-800': item.status === 'partial',
                    'bg-red-100 text-red-800': item.status === 'open',
                  }"
                >
                  {{ item.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Profitability Tab -->
    <div v-if="activeTab === 'Profitability'" class="space-y-4">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">Product Profitability</h2>
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-6 py-3 text-left text-sm font-semibold">Product</th>
              <th class="px-6 py-3 text-left text-sm font-semibold">Period</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Revenue</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">COGS</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Gross Profit</th>
              <th class="px-6 py-3 text-right text-sm font-semibold">Margin %</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="item in profitabilityList" :key="item.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 text-sm text-gray-900">{{ item.product_name }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ item.period }}</td>
              <td class="px-6 py-4 text-right text-sm">
                {{ formatCurrency(item.total_revenue) }}
              </td>
              <td class="px-6 py-4 text-right text-sm text-red-600">
                {{ formatCurrency(item.total_cogs) }}
              </td>
              <td class="px-6 py-4 text-right text-sm font-semibold text-green-600">
                {{ formatCurrency(item.gross_profit) }}
              </td>
              <td class="px-6 py-4 text-right text-sm">
                {{ item.gross_margin_pct.toFixed(2) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useApi } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const { api } = useApi();

const tabs = ['COGS', 'Accounts Payable', 'Accounts Receivable', 'Profitability'];
const activeTab = ref('COGS');

interface CogsItem {
  id: number;
  product_name: string;
  batch_number: string;
  raw_material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  total_cost: number;
  cost_per_unit: number;
}

interface ApItem {
  id: number;
  po_number: string;
  vendor_name: string;
  invoice_number: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
  total_amount: number; // Inferred from usage in totalRevenue computed
}

interface ArItem {
  id: number;
  invoice_number: string;
  customer_name: string;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
}

interface ProfitItem {
  id: number;
  product_name: string;
  period: string;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
}

const cogsList = ref<CogsItem[]>([]);
const apList = ref<ApItem[]>([]);
const arList = ref<ArItem[]>([]);
const profitabilityList = ref<ProfitItem[]>([]);

const totalRevenue = computed(() =>
  apList.value.reduce((sum, item) => sum + item.total_amount, 0)
);
const totalCogs = computed(() => cogsList.value.reduce((sum, item) => sum + item.total_cost, 0));
const grossProfit = computed(() => totalRevenue.value - totalCogs.value);
const marginPercent = computed(() =>
  totalRevenue.value > 0 ? (grossProfit.value / totalRevenue.value) * 100 : 0
);

onMounted(async () => {
  await fetchFinanceData();
});

const fetchFinanceData = async () => {
  try {
    const [cogsRes, apRes, arRes, profitRes] = await Promise.all([
      api.get('/finance/cogs'),
      api.get('/finance/accounts-payable'),
      api.get('/finance/accounts-receivable'),
      api.get('/finance/profitability'),
    ]);

    cogsList.value = cogsRes.data.data || cogsRes.data || [];
    apList.value = apRes.data.data || apRes.data || [];
    arList.value = arRes.data.data || arRes.data || [];
    profitabilityList.value = profitRes.data.data || profitRes.data || [];
  } catch (error) {
    console.error('Failed to fetch finance data:', error);
  }
};
</script>
