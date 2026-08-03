<template>
  <div class="p-6">
    <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left: main placeholder content -->
      <div class="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-wide text-gray-500">X-Lerate</p>
            <h1 class="text-2xl font-bold text-gray-800">{{ pageTitle }}</h1>
            <p class="text-sm text-gray-600 mt-1">{{ pageDescription }}</p>
          </div>
          <span class="px-3 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700">Coming soon</span>
        </div>
        <div class="p-4 bg-gray-50 rounded border border-dashed border-gray-200 text-sm text-gray-600">
          This page is reserved for the upcoming module.
        </div>
      </div>

      <!-- Right: filters / summary / quick actions -->
      <div class="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
        <div>
          <p class="text-xs uppercase tracking-wide text-gray-500">Quick Filters</p>
          <div class="mt-2 space-y-3 text-sm text-gray-700">
            <div class="flex items-center justify-between">
              <span>Status</span>
              <select class="border border-gray-200 rounded px-2 py-1 text-sm">
                <option>All</option>
                <option>Draft</option>
                <option>Pending</option>
                <option>Approved</option>
              </select>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span>Date</span>
              <div class="flex gap-1">
                <input type="date" class="border border-gray-200 rounded px-2 py-1 text-sm" />
                <input type="date" class="border border-gray-200 rounded px-2 py-1 text-sm" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span>Warehouse/Dept</span>
              <select class="border border-gray-200 rounded px-2 py-1 text-sm">
                <option>All</option>
                <option>Production</option>
                <option>Quality</option>
                <option>Warehouse</option>
              </select>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-100 pt-3">
          <p class="text-xs uppercase tracking-wide text-gray-500">Summary</p>
          <div class="mt-2 space-y-2 text-sm text-gray-700">
            <div class="flex justify-between"><span>Total items</span><span class="font-semibold">—</span></div>
            <div class="flex justify-between"><span>Pending</span><span class="font-semibold text-amber-600">—</span></div>
            <div class="flex justify-between"><span>Approved</span><span class="font-semibold text-emerald-600">—</span></div>
            <div class="flex justify-between"><span>Rejected</span><span class="font-semibold text-rose-600">—</span></div>
            <div class="flex justify-between"><span>Last update</span><span class="font-semibold text-gray-500">—</span></div>
          </div>
        </div>

        <div class="border-t border-gray-100 pt-3 space-y-2">
          <p class="text-xs uppercase tracking-wide text-gray-500">Quick Actions</p>
          <div class="grid grid-cols-1 gap-2 text-sm">
            <button class="w-full px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Add New</button>
            <button class="w-full px-3 py-2 rounded bg-gray-100 text-gray-800 hover:bg-gray-200">Export</button>
            <button class="w-full px-3 py-2 rounded bg-gray-100 text-gray-800 hover:bg-gray-200">Import CSV</button>
            <button class="w-full px-3 py-2 rounded bg-gray-100 text-gray-800 hover:bg-gray-200">Refresh</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const pageTitle = computed(() => (route.meta.title as string) || 'Coming Soon');
const pageDescription = computed(() => (route.meta.description as string) || 'This screen will be implemented next.');
</script>
