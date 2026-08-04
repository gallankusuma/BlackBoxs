<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Employees</h1>
        <p class="text-sm text-gray-500 mt-1">
          <span class="text-green-600 font-semibold">{{ employees.filter(e => e.status === 'ACTIVE').length }} aktif</span> · 
          <span class="text-gray-400">{{ employees.filter(e => e.status !== 'ACTIVE').length }} nonaktif</span> · 
          {{ employees.length }} total
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Download Sample -->
        <button @click="downloadSample"
          class="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex items-center gap-1">
          ⬇ Sample CSV
        </button>
        <!-- Import CSV -->
        <label class="px-3 py-2 text-sm border border-indigo-300 text-indigo-700 rounded-lg bg-indigo-50 hover:bg-indigo-100 cursor-pointer flex items-center gap-1">
          📥 Import CSV
          <input type="file" accept=".csv" class="hidden" @change="onFileSelected" ref="fileInput" />
        </label>
        <!-- Migrasi awal PIN mobile -->
        <button @click="generateMissingPins"
          class="px-3 py-2 text-sm border border-amber-300 text-amber-700 rounded-lg bg-amber-50 hover:bg-amber-100">
          🔑 Buat PIN yang Belum Ada
        </button>
        <button @click="showForm = true"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          + Add Employee
        </button>
      </div>
    </div>

    <!-- Import Preview Modal -->
    <div v-if="showImportModal" class="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-gray-900">Preview Import — {{ importRows.length }} baris</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              <span class="text-green-600 font-semibold">{{ importRows.filter(r => r._status === 'ok').length }} siap import</span> ·
              <span class="text-orange-500 font-semibold">{{ importRows.filter(r => r._status === 'duplicate').length }} duplikat</span> ·
              <span class="text-red-500 font-semibold">{{ importRows.filter(r => r._status === 'error').length }} error</span>
            </p>
          </div>
          <button @click="closeImport" class="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div class="overflow-auto flex-1 px-6 py-4">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Nama</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Position</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Hire Date</th>
                <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Keterangan</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="(row, idx) in importRows" :key="idx"
                :class="{
                  'bg-green-50': row._status === 'ok',
                  'bg-orange-50': row._status === 'duplicate',
                  'bg-red-50': row._status === 'error'
                }">
                <td class="px-3 py-2">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="{
                      'bg-green-100 text-green-800': row._status === 'ok',
                      'bg-orange-100 text-orange-800': row._status === 'duplicate',
                      'bg-red-100 text-red-800': row._status === 'error'
                    }">
                    {{ row._status === 'ok' ? '✓ Baru' : row._status === 'duplicate' ? '⚠ Duplikat' : '✗ Error' }}
                  </span>
                </td>
                <td class="px-3 py-2 font-mono text-gray-900">{{ row.employee_code }}</td>
                <td class="px-3 py-2 text-gray-900">{{ row.first_name }} {{ row.last_name }}</td>
                <td class="px-3 py-2 text-gray-600">{{ row.email }}</td>
                <td class="px-3 py-2 text-gray-600">{{ row.position }}</td>
                <td class="px-3 py-2 text-gray-600">{{ row.department_name }}</td>
                <td class="px-3 py-2 text-gray-600">{{ row.hire_date }}</td>
                <td class="px-3 py-2 text-xs" :class="row._status === 'duplicate' ? 'text-orange-700' : 'text-red-600'">
                  {{ row._note }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" v-model="skipDuplicates" class="rounded" />
              Lewati duplikat (hanya import baris baru)
            </label>
          </div>
          <div class="flex gap-2">
            <button @click="closeImport" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              Batal
            </button>
            <button @click="confirmImport" :disabled="importing"
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {{ importing ? 'Importing...' : `Import ${rowsToImport} baris` }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Import Result -->
    <div v-if="importResult" class="p-4 rounded-lg border"
      :class="importResult.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'">
      {{ importResult.message }}
      <button @click="importResult = null" class="ml-3 text-xs underline">Tutup</button>
    </div>

    <!-- Add/Edit Employee Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-[480px] max-h-[90vh] overflow-auto">
        <h2 class="text-xl font-bold mb-4">{{ editingId ? 'Edit' : 'Add' }} Employee</h2>
        <form @submit.prevent="saveEmployee" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Employee Code *</label>
              <input v-model="formData.employee_code" placeholder="EMP-001" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" required />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Hire Date</label>
              <input v-model="formData.hire_date" type="date" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">First Name *</label>
              <input v-model="formData.first_name" placeholder="Budi" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" required />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Last Name</label>
              <input v-model="formData.last_name" placeholder="Santoso (opsional)" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Email</label>
            <input v-model="formData.email" type="email" placeholder="budi@blackboxs.io" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Phone</label>
              <input v-model="formData.phone" placeholder="08xxxxxxxxxx" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Position</label>
              <input v-model="formData.position" placeholder="Engineer" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">Department</label>
            <select v-model="formData.department_id" class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
              <option value="">— Pilih Department —</option>
              <option v-for="dept in departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Contract Type</label>
              <select v-model="formData.contract_type" class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Basic Salary (Monthly)</label>
              <input v-model.number="formData.basic_salary" type="number" placeholder="0" class="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Basic Rate / Hari (Harian)</label>
              <input v-model.number="formData.basic_rate" type="number" placeholder="150000" class="w-full px-3 py-2 border border-green-300 rounded text-sm" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Tunjangan / Hari</label>
              <input v-model.number="formData.tunjangan_rate" type="number" placeholder="30000" class="w-full px-3 py-2 border border-green-300 rounded text-sm" />
            </div>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm">Save</button>
            <button type="button" @click="closeForm" class="flex-1 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500 text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Employees Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <div class="px-6 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <input v-model="search" placeholder="🔍 Cari nama, kode, email..." class="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-64" />
          <div class="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            <button @click="statusFilter = 'all'" :class="statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" class="px-3 py-1.5 font-medium transition">Semua</button>
            <button @click="statusFilter = 'ACTIVE'" :class="statusFilter === 'ACTIVE' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" class="px-3 py-1.5 font-medium border-x border-gray-300 transition">Aktif</button>
            <button @click="statusFilter = 'INACTIVE'" :class="statusFilter === 'INACTIVE' ? 'bg-gray-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" class="px-3 py-1.5 font-medium transition">Nonaktif</button>
          </div>
        </div>
        <span class="text-xs text-gray-500">{{ filteredEmployees.length }} hasil</span>
      </div>
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</th>
            <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Position</th>
            <th class="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipe</th>
            <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate/Hari</th>
            <th class="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="employee in filteredEmployees" :key="employee.id" class="hover:bg-gray-50" :class="employee.status !== 'ACTIVE' ? 'opacity-50' : ''">
            <td class="px-6 py-3 text-sm font-mono text-gray-900">{{ employee.employee_code }}</td>
            <td class="px-6 py-3 text-sm font-medium text-gray-900">{{ employee.first_name }} {{ employee.last_name }}</td>
            <td class="px-6 py-3 text-sm text-gray-900">{{ employee.position || '-' }}</td>
            <td class="px-6 py-3 text-center">
              <span :class="{
                'bg-green-100 text-green-700':  (employee.contract_type||'monthly') === 'daily',
                'bg-blue-100 text-blue-700':    (employee.contract_type||'monthly') === 'hourly',
                'bg-purple-100 text-purple-700':(employee.contract_type||'monthly') === 'monthly'
              }" class="px-2 py-0.5 rounded-full text-xs font-medium">
                {{ (employee.contract_type||'monthly') === 'daily' ? 'Harian'
                 : (employee.contract_type||'monthly') === 'hourly' ? 'Per Jam'
                 : 'Bulanan' }}
              </span>
            </td>
            <td class="px-6 py-3 text-sm text-right font-mono text-gray-700">
              {{ (employee.contract_type||'monthly') === 'daily' || (employee.contract_type||'monthly') === 'hourly'
                 ? fmtCur(employee.basic_rate || 0)
                 : fmtCur(employee.basic_salary || 0) }}
            </td>
            <td class="px-6 py-3 text-center">
              <button @click="toggleStatus(employee)" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none" :class="employee.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'">
                <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform" :class="employee.status === 'ACTIVE' ? 'translate-x-6' : 'translate-x-1'"></span>
              </button>
            </td>
            <td class="px-6 py-3 text-sm text-right space-x-2">
              <button @click="resetPin(employee)" class="text-amber-600 hover:text-amber-900">Reset PIN</button>
              <button @click="editEmployee(employee)" class="text-blue-600 hover:text-blue-900">Edit</button>
              <button @click="deleteEmployee(employee.id)" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
          </tr>
          <tr v-if="filteredEmployees.length === 0">
            <td colspan="7" class="px-6 py-8 text-center text-gray-400 text-sm">
              {{ search ? 'Tidak ada hasil pencarian.' : 'Belum ada karyawan. Klik "+ Add Employee" atau "📥 Import CSV".' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Hasil reset PIN — hanya ditampilkan sekali -->
  <div v-if="pinResult.length" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="pinResult = []">
    <div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
      <div class="px-5 py-4 border-b">
        <h3 class="font-semibold text-gray-900">PIN Awal Karyawan</h3>
        <p class="text-sm text-amber-700 mt-1">
          ⚠️ PIN hanya ditampilkan sekali. Catat atau cetak sekarang — setelah dialog ditutup,
          PIN tidak bisa dilihat lagi dan harus di-reset ulang.
        </p>
      </div>
      <div class="overflow-auto px-5 py-3">
        <table class="w-full text-sm">
          <thead class="text-xs text-gray-500 uppercase">
            <tr><th class="text-left py-1">Kode</th><th class="text-left py-1">Nama</th><th class="text-right py-1">PIN</th></tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="r in pinResult" :key="r.id">
              <td class="py-1.5 font-mono">{{ r.code }}</td>
              <td class="py-1.5">{{ r.name }}</td>
              <td class="py-1.5 text-right font-mono font-bold tracking-widest">{{ r.pin }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-5 py-3 border-t flex justify-end gap-2">
        <button @click="copyPins" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Salin</button>
        <button @click="pinResult = []" class="px-3 py-1.5 text-sm bg-gray-900 text-white rounded">Tutup</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useApi } from '@/lib/api';

interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  position?: string;
  department_id?: number;
  hire_date?: string;
  basic_salary?: number;
  basic_rate?: number;
  tunjangan_rate?: number;
  contract_type?: string;
  status?: string;
}

interface Department { id: number; name: string; }

interface ImportRow {
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  department_name: string;
  hire_date: string;
  basic_salary: string;
  contract_type: string;
  _status: 'ok' | 'duplicate' | 'error';
  _note: string;
}

const { api } = useApi();
const employees = ref<Employee[]>([]);
const departments = ref<Department[]>([]);
const showForm = ref(false);
const editingId = ref<number | null>(null);
const search = ref('');
const statusFilter = ref('ACTIVE');
const fileInput = ref<HTMLInputElement | null>(null);
const showImportModal = ref(false);
const importRows = ref<ImportRow[]>([]);
const skipDuplicates = ref(true);
const importing = ref(false);
const importResult = ref<{ type: 'success' | 'error'; message: string } | null>(null);

// ─── PIN login mobile ────────────────────────────────────────────────────────
// PIN di-hash di server, jadi nilai aslinya hanya ada di respons ini — sekali.
const pinResult = ref<{ id: number; code: string; name: string; pin: string }[]>([]);

async function resetPin(employee: Employee) {
  if (!confirm(`Reset PIN mobile untuk ${employee.first_name}?\n\nPIN lama langsung tidak berlaku, dan PIN baru hanya ditampilkan sekali.`)) return;
  try {
    const res = await api.post(`/hr/employees/${employee.id}/reset-pin`);
    pinResult.value = [res.data.employee ? { ...res.data.employee, pin: res.data.pin } : res.data];
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal reset PIN');
  }
}

async function generateMissingPins() {
  if (!confirm('Buatkan PIN untuk semua karyawan aktif yang belum punya?\n\nPIN hanya ditampilkan sekali setelah ini.')) return;
  try {
    const res = await api.post('/hr/employees/generate-missing-pins');
    if (!res.data.count) { alert('Semua karyawan aktif sudah punya PIN.'); return; }
    pinResult.value = res.data.data || [];
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal membuat PIN');
  }
}

async function copyPins() {
  const text = pinResult.value.map(r => `${r.code}\t${r.name}\t${r.pin}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    alert('PIN disalin ke clipboard.');
  } catch {
    alert('Gagal menyalin. Silakan catat manual.');
  }
}

const formData = ref({
  employee_code: '', first_name: '', last_name: '',
  email: '', phone: '', position: '',
  department_id: '' as string | number,
  hire_date: '', basic_salary: 0, contract_type: 'monthly',
  basic_rate: 0, tunjangan_rate: 0,
});

const filteredEmployees = computed(() => {
  let list = employees.value;
  if (statusFilter.value !== 'all') list = list.filter(e => e.status === statusFilter.value);
  if (!search.value) return list;
  const q = search.value.toLowerCase();
  return list.filter(e =>
    (e.employee_code || '').toLowerCase().includes(q) ||
    (e.first_name + ' ' + e.last_name).toLowerCase().includes(q) ||
    (e.email || '').toLowerCase().includes(q) ||
    (e.position || '').toLowerCase().includes(q)
  );
});

const fmtCur = (v: number) => {
  if (!v) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
};

const rowsToImport = computed(() => {
  if (skipDuplicates.value) return importRows.value.filter(r => r._status === 'ok').length;
  return importRows.value.filter(r => r._status !== 'error').length;
});

onMounted(async () => {
  await fetchEmployees();
  await fetchDepartments();
});

const fetchEmployees = async () => {
  try { const res = await api.get('/hr/employees'); employees.value = res.data.data || res.data || []; } catch { /* ignore */ }
};
const fetchDepartments = async () => {
  try { const res = await api.get('/departments'); departments.value = res.data.data || res.data || []; } catch { /* ignore */ }
};

// ── SAMPLE CSV DOWNLOAD ──────────────────────────────────────────
const downloadSample = () => {
  const headers = ['employee_code','first_name','last_name','email','phone','position','department_name','hire_date','basic_salary','contract_type'];
  const samples = [
    ['EMP-001','Budi','Santoso','budi@blackboxs.io','081234567890','Site Engineer','Engineering','2024-01-15','8000000','monthly'],
    ['EMP-002','Siti','Rahayu','siti@blackboxs.io','082345678901','Procurement Staff','Procurement','2024-02-01','6000000','monthly'],
    ['EMP-003','Ahmad','Fauzi','','085678901234','Operator','Operations','2024-03-10','350000','daily'],
  ];
  const csv = [headers.join(','), ...samples.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'sample_employees.csv'; a.click();
  URL.revokeObjectURL(url);
};

// ── IMPORT CSV ────────────────────────────────────────────────────
const onFileSelected = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    parseCSV((e.target?.result as string) || '');
    if (fileInput.value) fileInput.value.value = '';
  };
  reader.readAsText(file);
};

const parseCSV = (text: string) => {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) { alert('File CSV kosong atau tidak valid.'); return; }

  const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());
  const rows: ImportRow[] = [];

  // Build lookup sets for duplicate detection
  const existingCodes = new Set(employees.value.map(e => e.employee_code?.toLowerCase()));
  const existingEmails = new Set(employees.value.filter(e => e.email).map(e => e.email!.toLowerCase()));
  const importedCodes = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].replace(/"/g, '').split(',').map(v => v.trim());
    const get = (key: string) => vals[headers.indexOf(key)] || '';

    const row: ImportRow = {
      employee_code: get('employee_code'),
      first_name: get('first_name'),
      last_name: get('last_name'),
      email: get('email'),
      phone: get('phone'),
      position: get('position'),
      department_name: get('department_name'),
      hire_date: get('hire_date'),
      basic_salary: get('basic_salary'),
      contract_type: get('contract_type') || 'monthly',
      _status: 'ok',
      _note: '',
    };

    // Validate required fields
    if (!row.employee_code || !row.first_name) {
      row._status = 'error';
      row._note = 'employee_code dan first_name wajib diisi';
    }
    // Detect duplicate in existing DB
    else if (existingCodes.has(row.employee_code.toLowerCase())) {
      row._status = 'duplicate';
      row._note = `Kode "${row.employee_code}" sudah ada di database`;
    }
    else if (row.email && existingEmails.has(row.email.toLowerCase())) {
      row._status = 'duplicate';
      row._note = `Email "${row.email}" sudah ada di database`;
    }
    // Detect duplicate within import file itself
    else if (importedCodes.has(row.employee_code.toLowerCase())) {
      row._status = 'duplicate';
      row._note = `Kode "${row.employee_code}" duplikat dalam file CSV`;
    }
    else {
      importedCodes.add(row.employee_code.toLowerCase());
    }

    rows.push(row);
  }

  importRows.value = rows;
  showImportModal.value = true;
};

const closeImport = () => {
  showImportModal.value = false;
  importRows.value = [];
};

const confirmImport = async () => {
  const toImport = skipDuplicates.value
    ? importRows.value.filter(r => r._status === 'ok')
    : importRows.value.filter(r => r._status !== 'error');

  if (toImport.length === 0) { alert('Tidak ada baris yang bisa diimport.'); return; }
  importing.value = true;

  let success = 0, failed = 0;
  for (const row of toImport) {
    try {
      const deptId = departments.value.find(d => d.name.toLowerCase() === row.department_name.toLowerCase())?.id || null;
      await api.post('/hr/employees', {
        employee_code: row.employee_code,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email || null,
        phone: row.phone || null,
        position: row.position || null,
        department_id: deptId,
        hire_date: row.hire_date || null,
        basic_salary: Number(row.basic_salary) || 0,
        contract_type: row.contract_type || 'monthly',
      });
      success++;
    } catch { failed++; }
  }

  await fetchEmployees();
  importing.value = false;
  closeImport();
  importResult.value = {
    type: success > 0 ? 'success' : 'error',
    message: `✅ ${success} karyawan berhasil diimport${failed > 0 ? ` · ⚠ ${failed} gagal` : ''}.`,
  };
};

// ── CRUD ─────────────────────────────────────────────────────────
const saveEmployee = async () => {
  try {
    if (editingId.value) {
      await api.put(`/hr/employees/${editingId.value}`, formData.value);
    } else {
      await api.post('/hr/employees', formData.value);
    }
    await fetchEmployees();
    closeForm();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal menyimpan karyawan');
  }
};

const editEmployee = (emp: Employee) => {
  editingId.value = emp.id;
  // Backend may return salary_type instead of contract_type — handle both
  const ct = (emp as any).salary_type || emp.contract_type || 'monthly';
  formData.value = {
    employee_code: emp.employee_code,
    first_name: emp.first_name,
    last_name: emp.last_name,
    email: emp.email || '',
    phone: emp.phone || '',
    position: emp.position || '',
    department_id: emp.department_id || '',
    hire_date: emp.hire_date ? emp.hire_date.slice(0, 10) : '',
    basic_salary: emp.basic_salary || 0,
    contract_type: ct,
    basic_rate: emp.basic_rate || 0,
    tunjangan_rate: emp.tunjangan_rate || 0,
  };
  showForm.value = true;
};

const deleteEmployee = async (id: number) => {
  if (!confirm('Hapus karyawan ini?')) return;
  try { await api.delete(`/hr/employees/${id}`); await fetchEmployees(); } catch { /* ignore */ }
};

const toggleStatus = async (emp: Employee) => {
  const newStatus = emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  try {
    await api.put(`/hr/employees/${emp.id}`, { ...emp, first_name: emp.first_name, last_name: emp.last_name, is_active: newStatus === 'ACTIVE' });
    emp.status = newStatus;
  } catch {
    alert('Gagal update status');
  }
};

const closeForm = () => {
  showForm.value = false;
  editingId.value = null;
  formData.value = { employee_code: '', first_name: '', last_name: '', email: '', phone: '', position: '', department_id: '', hire_date: '', basic_salary: 0, contract_type: 'monthly', basic_rate: 0, tunjangan_rate: 0 };
};

const getDepartmentName = (deptId?: number) => {
  if (!deptId) return '-';
  return departments.value.find(d => d.id === deptId)?.name || '-';
};

const formatDate = (date?: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('id-ID');
};
</script>
