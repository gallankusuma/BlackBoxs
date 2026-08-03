<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold text-gray-900">Attendance</h1>
      <button
        @click="showForm = true"
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        + Record Attendance
      </button>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 flex gap-4">
      <input
        v-model="filterDate"
        type="date"
        class="px-3 py-2 border border-gray-300 rounded"
      />
      <select
        v-model="filterEmployee"
        class="px-3 py-2 border border-gray-300 rounded"
      >
        <option value="">All Employees</option>
        <option v-for="emp in employees" :key="emp.id" :value="emp.id">
          {{ emp.first_name }} {{ emp.last_name }}
        </option>
      </select>
      <select
        v-model="filterStatus"
        class="px-3 py-2 border border-gray-300 rounded"
      >
        <option value="">All Status</option>
        <option value="present">Present</option>
        <option value="absent">Absent</option>
        <option value="late">Late</option>
        <option value="half_day">Half Day</option>
        <option value="leave">Leave</option>
      </select>
    </div>

    <!-- Attendance Form Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-96 max-h-96 overflow-auto">
        <h2 class="text-xl font-bold mb-4">Record Attendance</h2>
        <form @submit.prevent="saveAttendance" class="space-y-4">
          <select
            v-model="formData.employee_id"
            class="w-full px-3 py-2 border border-gray-300 rounded"
            required
          >
            <option value="">Select Employee</option>
            <option v-for="emp in employees" :key="emp.id" :value="emp.id">
              {{ emp.first_name }} {{ emp.last_name }}
            </option>
          </select>
          <input
            v-model="formData.attendance_date"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded"
            required
          />
          <input
            v-model="formData.check_in_time"
            type="time"
            class="w-full px-3 py-2 border border-gray-300 rounded"
          />
          <input
            v-model="formData.check_out_time"
            type="time"
            class="w-full px-3 py-2 border border-gray-300 rounded"
          />
          <select
            v-model="formData.status"
            class="w-full px-3 py-2 border border-gray-300 rounded"
          >
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="half_day">Half Day</option>
            <option value="leave">Leave</option>
          </select>
          <textarea
            v-model="formData.notes"
            placeholder="Notes"
            class="w-full px-3 py-2 border border-gray-300 rounded"
            rows="3"
          ></textarea>
          <div class="flex gap-2">
            <button
              type="submit"
              class="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Save
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

    <!-- Attendance Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Employee</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Check In</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Check Out</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
            <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Notes</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="log in filteredAttendance" :key="log.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ getEmployeeName(log.employee_id) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(log.attendance_date) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatTime(log.check_in_time) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatTime(log.check_out_time) }}
            </td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="{
                  'px-2 py-1 rounded text-xs font-semibold': true,
                  'bg-green-100 text-green-800': log.status === 'present',
                  'bg-red-100 text-red-800': log.status === 'absent',
                  'bg-yellow-100 text-yellow-800': log.status === 'late',
                  'bg-blue-100 text-blue-800': log.status === 'half_day',
                  'bg-purple-100 text-purple-800': log.status === 'leave',
                }"
              >
                {{ log.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ log.notes || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useApi } from '@/lib/api';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
}

interface AttendanceLog {
  id: number;
  employee_id: number;
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  notes?: string;
}

const { api } = useApi();

const employees = ref<Employee[]>([]);
const attendance = ref<AttendanceLog[]>([]);
const showForm = ref(false);
const filterDate = ref('');
const filterEmployee = ref('');
const filterStatus = ref('');

const formData = ref({
  employee_id: '',
  attendance_date: new Date().toISOString().split('T')[0],
  check_in_time: '',
  check_out_time: '',
  status: 'present',
  notes: '',
});

onMounted(async () => {
  await fetchEmployees();
  await fetchAttendance();
});

const fetchEmployees = async () => {
  try {
    const response = await api.get('/hr/employees');
    employees.value = response.data;
  } catch (error) {
    console.error('Failed to fetch employees:', error);
  }
};

const fetchAttendance = async () => {
  try {
    const response = await api.get('/hr/attendance');
    attendance.value = response.data;
  } catch (error) {
    console.error('Failed to fetch attendance:', error);
  }
};

const filteredAttendance = computed(() => {
  return attendance.value.filter((log) => {
    if (filterDate.value && log.attendance_date !== filterDate.value) return false;
    if (filterEmployee.value && log.employee_id !== parseInt(filterEmployee.value)) return false;
    if (filterStatus.value && log.status !== filterStatus.value) return false;
    return true;
  });
});

const saveAttendance = async () => {
  try {
    await api.post('/hr/attendance', formData.value);
    await fetchAttendance();
    closeForm();
  } catch (error) {
    console.error('Failed to save attendance:', error);
  }
};

const closeForm = () => {
  showForm.value = false;
  formData.value = {
    employee_id: '',
    attendance_date: new Date().toISOString().split('T')[0],
    check_in_time: '',
    check_out_time: '',
    status: 'present',
    notes: '',
  };
};

const getEmployeeName = (empId: number) => {
  const emp = employees.value.find((e) => e.id === empId);
  return emp ? `${emp.first_name} ${emp.last_name}` : '-';
};

const formatDate = (date: string) => new Date(date).toLocaleDateString();
const formatTime = (time?: string) => {
  if (!time) return '-';
  return new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>
