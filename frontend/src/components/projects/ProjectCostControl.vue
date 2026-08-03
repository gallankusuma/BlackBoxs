<template>
  <div class="space-y-6">
    <!-- Budget Overview Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div class="text-sm text-gray-500 mb-1">Total Budget</div>
        <div class="text-2xl font-bold text-gray-800">{{ formatCurrency(summary.budget) }}</div>
      </div>
      <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div class="text-sm text-gray-500 mb-1">Total Terpakai</div>
        <div class="text-2xl font-bold" :class="summary.usage_percent > 90 ? 'text-red-600' : summary.usage_percent > 70 ? 'text-yellow-600' : 'text-green-600'">
          {{ formatCurrency(summary.total_spent) }}
        </div>
        <div class="w-full bg-gray-100 rounded-full h-2 mt-2">
          <div class="h-2 rounded-full transition-all" :class="summary.usage_percent > 90 ? 'bg-red-500' : summary.usage_percent > 70 ? 'bg-yellow-500' : 'bg-green-500'" :style="{ width: Math.min(summary.usage_percent, 100) + '%' }"></div>
        </div>
        <div class="text-xs text-gray-500 mt-1">{{ summary.usage_percent }}% dari budget</div>
      </div>
      <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div class="text-sm text-gray-500 mb-1">Sisa Budget</div>
        <div class="text-2xl font-bold" :class="summary.remaining < 0 ? 'text-red-600' : 'text-gray-800'">
          {{ formatCurrency(summary.remaining) }}
        </div>
        <div v-if="summary.remaining < 0" class="text-xs text-red-500 mt-1 font-medium">⚠ Over Budget!</div>
      </div>
      <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div class="text-sm text-gray-500 mb-1">Dokumen</div>
        <div class="flex items-center gap-3 mt-1">
          <div class="text-center">
            <div class="text-lg font-bold text-blue-600">{{ summary.pr?.count || 0 }}</div>
            <div class="text-xs text-gray-500">PR</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-bold text-purple-600">{{ summary.po?.count || 0 }}</div>
            <div class="text-xs text-gray-500">PO</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-bold text-orange-600">{{ summary.expenses?.count || 0 }}</div>
            <div class="text-xs text-gray-500">Expenses</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Cost Breakdown -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- By Source -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="font-bold text-gray-800 mb-4">Breakdown Biaya</h3>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-purple-500"></div>
              <span class="text-sm text-gray-700">Purchase Order (PO)</span>
            </div>
            <span class="text-sm font-semibold text-gray-900">{{ formatCurrency(summary.po?.total || 0) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-orange-500"></div>
              <span class="text-sm text-gray-700">Direct Expenses</span>
            </div>
            <span class="text-sm font-semibold text-gray-900">{{ formatCurrency(summary.expenses?.total || 0) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-blue-300"></div>
              <span class="text-sm text-gray-700">PR Estimasi</span>
            </div>
            <span class="text-sm font-semibold text-gray-500 italic">{{ formatCurrency(summary.pr?.estimated_total || 0) }}</span>
          </div>
          <div class="border-t border-gray-200 pt-2 flex items-center justify-between font-bold">
            <span class="text-sm text-gray-800">Total Aktual</span>
            <span class="text-sm text-gray-900">{{ formatCurrency(summary.total_spent) }}</span>
          </div>
        </div>
      </div>

      <!-- By Category (expenses) -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="font-bold text-gray-800 mb-4">Expense by Kategori</h3>
        <div v-if="(summary.expenses?.by_category || []).length === 0" class="text-sm text-gray-500 py-4 text-center">Belum ada expense.</div>
        <div v-else class="space-y-2">
          <div v-for="cat in summary.expenses?.by_category" :key="cat.category" class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm capitalize text-gray-700">{{ categoryLabel(cat.category) }}</span>
              <span class="text-xs text-gray-400">({{ cat.count }})</span>
            </div>
            <span class="text-sm font-semibold text-gray-900">{{ formatCurrency(cat.total) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs: RAB / PO / PR / Expenses -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <div class="border-b border-gray-200 px-6">
        <div class="flex gap-6 overflow-x-auto">
          <button v-for="t in detailTabs" :key="t.id" @click="activeDetailTab = t.id"
            class="py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap"
            :class="activeDetailTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'">
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- RAB Tab -->
      <div v-if="activeDetailTab === 'rab'" class="p-4">
        <ProjectRAB :projectId="props.projectId" />
      </div>

      <!-- PO List -->
      <div v-if="activeDetailTab === 'po'" class="p-6">
        <div v-if="poList.length === 0" class="text-center py-8 text-gray-500">Belum ada PO untuk project ini.</div>
        <table v-else class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO No</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="po in poList" :key="po.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ po.po_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ po.vendor_name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ formatDate(po.created_at) }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="po.approval_status === 2 ? 'bg-green-100 text-green-800' : po.approval_status === 1 ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'">
                  {{ po.approval_status === 2 ? 'Approved' : po.approval_status === 1 ? '1/2' : 'Pending' }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{{ formatCurrency(po.total_amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- PR List -->
      <div v-if="activeDetailTab === 'pr'" class="p-6">
        <div v-if="prList.length === 0" class="text-center py-8 text-gray-500">Belum ada PR untuk project ini.</div>
        <table v-else class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PR No</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="pr in prList" :key="pr.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ pr.pr_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ pr.requester_name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ formatDate(pr.created_at) }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="pr.approval_status === 2 ? 'bg-green-100 text-green-800' : pr.approval_status === 1 ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'">
                  {{ pr.approval_status === 2 ? 'Approved' : pr.approval_status === 1 ? '1/2' : 'Pending' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Expenses -->
      <div v-if="activeDetailTab === 'expenses'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h4 class="text-sm font-semibold text-gray-800">Direct Expenses</h4>
          <button @click="openExpenseForm()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Add Expense</button>
        </div>
        <div v-if="expenses.length === 0" class="text-center py-8 text-gray-500">Belum ada expense untuk project ini.</div>
        <table v-else class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deskripsi</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jumlah</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="exp in expenses" :key="exp.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm text-gray-700">{{ exp.expense_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-700">{{ formatDate(exp.expense_date) }}</td>
              <td class="px-4 py-3 text-sm text-gray-900 font-medium">{{ exp.description }}</td>
              <td class="px-4 py-3 text-sm text-gray-700 capitalize">{{ categoryLabel(exp.category) }}</td>
              <td class="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{{ formatCurrency(exp.amount) }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="{
                    'bg-gray-100 text-gray-600': exp.status === 'draft',
                    'bg-blue-100 text-blue-800': exp.status === 'submitted',
                    'bg-green-100 text-green-800': exp.status === 'approved' || exp.status === 'paid',
                    'bg-red-100 text-red-800': exp.status === 'rejected'
                  }">
                  {{ exp.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-right text-sm space-x-2">
                <button @click="openExpenseForm(exp)" class="text-blue-600 hover:text-blue-900">Edit</button>
                <button v-if="exp.status === 'draft' || exp.status === 'submitted'" @click="deleteExpense(exp.id)" class="text-red-600 hover:text-red-900">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Expense Form Modal -->
    <div v-if="showExpenseModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div class="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">{{ editingExpense ? 'Edit Expense' : 'Add Expense' }}</h3>
          <button @click="showExpenseModal = false" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
              <select v-model="expenseForm.category" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                <option value="material">Material</option>
                <option value="labor">Tenaga Kerja</option>
                <option value="equipment">Peralatan</option>
                <option value="subcontractor">Subkontraktor</option>
                <option value="overhead">Overhead</option>
                <option value="transport">Transport</option>
                <option value="other">Lainnya</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
              <input v-model="expenseForm.expense_date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Deskripsi *</label>
            <input v-model="expenseForm.description" type="text" placeholder="Misal: Sewa crane 3 hari" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah (Rp) *</label>
              <input v-model.number="expenseForm.amount" type="number" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">No. Kwitansi</label>
              <input v-model="expenseForm.receipt_number" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
            <textarea v-model="expenseForm.notes" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2"></textarea>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button @click="showExpenseModal = false" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
          <button @click="saveExpense" :disabled="saving" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {{ saving ? 'Saving...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';
import ProjectRAB from './ProjectRAB.vue';

const props = defineProps<{ projectId: number | string }>();

const summary = ref<any>({ budget: 0, total_spent: 0, remaining: 0, usage_percent: 0, pr: {}, po: {}, expenses: {} });
const poList = ref<any[]>([]);
const prList = ref<any[]>([]);
const expenses = ref<any[]>([]);
const activeDetailTab = ref('rab');
const showExpenseModal = ref(false);
const editingExpense = ref<any>(null);
const saving = ref(false);

const detailTabs = [
  { id: 'rab', label: '📋 RAB' },
  { id: 'po', label: 'Purchase Orders' },
  { id: 'pr', label: 'Purchase Requests' },
  { id: 'expenses', label: 'Expenses' },
];

const expenseForm = ref({
  category: 'other',
  description: '',
  amount: 0,
  expense_date: new Date().toISOString().split('T')[0],
  receipt_number: '',
  notes: '',
});

const categoryLabel = (cat: string) => {
  const map: Record<string, string> = {
    material: 'Material', labor: 'Tenaga Kerja', equipment: 'Peralatan',
    subcontractor: 'Subkontraktor', overhead: 'Overhead', transport: 'Transport', other: 'Lainnya',
  };
  return map[cat] || cat;
};

const formatDate = (d: string) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const loadSummary = async () => {
  try {
    const res = await api.get(`/projects/${props.projectId}/cost-summary`);
    summary.value = res.data;
  } catch { summary.value = { budget: 0, total_spent: 0, remaining: 0, usage_percent: 0, pr: {}, po: {}, expenses: {} }; }
};

const loadPOs = async () => {
  try {
    const res = await api.get(`/projects/${props.projectId}/purchase-orders`);
    poList.value = res.data.data || [];
  } catch { poList.value = []; }
};

const loadPRs = async () => {
  try {
    const res = await api.get(`/projects/${props.projectId}/purchase-requests`);
    prList.value = res.data.data || [];
  } catch { prList.value = []; }
};

const loadExpenses = async () => {
  try {
    const res = await api.get(`/projects/${props.projectId}/expenses`);
    expenses.value = res.data.data || [];
  } catch { expenses.value = []; }
};

const openExpenseForm = (exp: any = null) => {
  editingExpense.value = exp;
  if (exp) {
    expenseForm.value = {
      category: exp.category,
      description: exp.description,
      amount: exp.amount,
      expense_date: exp.expense_date?.split('T')[0] || '',
      receipt_number: exp.receipt_number || '',
      notes: exp.notes || '',
    };
  } else {
    expenseForm.value = { category: 'other', description: '', amount: 0, expense_date: new Date().toISOString().split('T')[0], receipt_number: '', notes: '' };
  }
  showExpenseModal.value = true;
};

const saveExpense = async () => {
  if (!expenseForm.value.description || !expenseForm.value.amount || !expenseForm.value.expense_date) {
    alert('Deskripsi, jumlah, dan tanggal wajib diisi.');
    return;
  }
  saving.value = true;
  try {
    if (editingExpense.value) {
      await api.put(`/projects/${props.projectId}/expenses/${editingExpense.value.id}`, expenseForm.value);
    } else {
      await api.post(`/projects/${props.projectId}/expenses`, expenseForm.value);
    }
    showExpenseModal.value = false;
    await Promise.all([loadExpenses(), loadSummary()]);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal menyimpan expense');
  } finally { saving.value = false; }
};

const deleteExpense = async (id: number) => {
  if (!confirm('Hapus expense ini?')) return;
  try {
    await api.delete(`/projects/${props.projectId}/expenses/${id}`);
    await Promise.all([loadExpenses(), loadSummary()]);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal menghapus expense');
  }
};

const loadAll = () => {
  loadSummary();
  loadPOs();
  loadPRs();
  loadExpenses();
};

watch(() => props.projectId, loadAll);
onMounted(loadAll);
</script>
