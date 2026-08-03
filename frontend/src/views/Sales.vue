<template>
  <div class="min-h-screen bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900">Sales</h1>
        <p class="text-gray-500 mt-1">Manage sales orders, invoices, and customer relationships</p>
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="bg-blue-100 p-3 rounded-lg">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-600">Total Invoices</p>
              <p class="text-2xl font-bold text-gray-900">0</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="bg-green-100 p-3 rounded-lg">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-600">Total Orders</p>
              <p class="text-2xl font-bold text-gray-900">0</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="bg-yellow-100 p-3 rounded-lg">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-600">Pending Payments</p>
              <p class="text-2xl font-bold text-gray-900">0</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="bg-purple-100 p-3 rounded-lg">
              <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-600">Total Revenue</p>
              <p class="text-2xl font-bold text-gray-900">IDR 0</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Access Menu -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Access</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <router-link
            to="/sales/invoices"
            class="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <svg class="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="text-sm font-medium text-gray-700">Invoices</span>
          </router-link>

          <router-link
            to="/sales/orders-list"
            class="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <svg class="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span class="text-sm font-medium text-gray-700">Orders</span>
          </router-link>

          <router-link
            to="/sales/store"
            class="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors"
          >
            <svg class="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span class="text-sm font-medium text-gray-700">Store</span>
          </router-link>

          <router-link
            to="/sales/payments"
            class="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 transition-colors"
          >
            <svg class="w-8 h-8 text-yellow-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span class="text-sm font-medium text-gray-700">Payments</span>
          </router-link>

          <router-link
            to="/sales/items"
            class="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <svg class="w-8 h-8 text-indigo-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span class="text-sm font-medium text-gray-700">Items</span>
          </router-link>

          <router-link
            to="/sales/contracts"
            class="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors"
          >
            <svg class="w-8 h-8 text-red-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="text-sm font-medium text-gray-700">Contracts</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Sales module main page
</script>
