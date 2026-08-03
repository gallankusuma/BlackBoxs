<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Approval Configuration</h1>

    <!-- Summary -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold">{{ store.approvalRules.length }}</p>
        <p class="text-xs text-gray-500">Total Rules</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold text-green-600">{{ activeCount }}</p>
        <p class="text-xs text-gray-500">Active</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <p class="text-2xl font-bold text-gray-400">{{ store.approvalRules.length - activeCount }}</p>
        <p class="text-xs text-gray-500">Inactive</p>
      </div>
    </div>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Rules by Module -->
    <div v-else>
      <div v-for="mod in modules" :key="mod" class="mb-6">
        <h3 class="font-semibold text-lg mb-3 flex items-center gap-2">
          <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded uppercase">{{ mod }}</span>
          Rules ({{ rulesByModule(mod).length }})
        </h3>
        <div v-if="rulesByModule(mod).length" class="bg-white rounded shadow overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b"><tr>
              <th class="px-4 py-2 text-left">Name</th>
              <th class="px-4 py-2 text-left">Condition</th>
              <th class="px-4 py-2 text-right">Min</th>
              <th class="px-4 py-2 text-right">Max</th>
              <th class="px-4 py-2 text-center">Seq</th>
              <th class="px-4 py-2 text-center">Steps</th>
              <th class="px-4 py-2 text-center">Active</th>
            </tr></thead>
            <tbody>
              <tr v-for="rule in rulesByModule(mod)" :key="rule.id" class="border-b hover:bg-gray-50">
                <td class="px-4 py-2 font-medium">{{ rule.name }}</td>
                <td class="px-4 py-2">{{ rule.condition_field || '-' }}</td>
                <td class="px-4 py-2 text-right">{{ rule.min_value != null ? formatCurrency(rule.min_value) : '-' }}</td>
                <td class="px-4 py-2 text-right">{{ rule.max_value != null ? formatCurrency(rule.max_value) : '-' }}</td>
                <td class="px-4 py-2 text-center">{{ rule.sequence }}</td>
                <td class="px-4 py-2 text-center">{{ (rule.steps || []).length }}</td>
                <td class="px-4 py-2 text-center">
                  <span :class="rule.is_active ? 'text-green-600' : 'text-gray-400'">{{ rule.is_active ? '✓' : '✗' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-gray-400 bg-white rounded shadow p-4">No rules configured for {{ mod }}</p>
      </div>
    </div>

    <!-- Link to full rules management -->
    <div class="mt-6 bg-blue-50 rounded p-4 text-sm">
      <p>To create, edit, or delete approval rules, go to
        <router-link to="/approval/rules" class="text-blue-600 hover:underline font-medium">Approval Rules Management</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAdminStore } from '../stores/admin';
import { formatCurrency } from '../utils/format';

const store = useAdminStore();
const modules = ['pr', 'po', 'so', 'wo', 'batch_release', 'grn'];
const activeCount = computed(() => store.approvalRules.filter((r: any) => r.is_active).length);
const rulesByModule = (mod: string) => store.approvalRules.filter((r: any) => r.module === mod);

onMounted(() => store.fetchApprovalRules());
</script>
