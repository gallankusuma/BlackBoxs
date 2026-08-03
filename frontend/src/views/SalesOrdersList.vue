<template>
  <div class="min-h-screen bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Sales Orders</h1>
          <p class="text-gray-500 mt-1">Manage customer orders and track sales</p>
        </div>
        <button
          @click="openAddOrderModal"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Order
        </button>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total Orders</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ orders.length }}</p>
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
              <p class="text-sm text-gray-600">Draft</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ orders.filter(o => o.status === 'draft').length }}</p>
            </div>
            <div class="bg-gray-100 p-3 rounded-lg">
              <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Confirmed</p>
              <p class="text-2xl font-bold text-green-600 mt-1">{{ orders.filter(o => o.status === 'confirmed').length }}</p>
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
              <p class="text-sm text-gray-600">Total Value</p>
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

      <!-- Filters & Search -->
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
                placeholder="Search by SO number or customer..."
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg class="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Orders Table -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">SO Number</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Customer</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Items</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Total Amount</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Ship Date</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="loading" class="text-center">
                <td colspan="7" class="px-6 py-12">
                  <div class="flex justify-center items-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span class="ml-3 text-gray-500">Loading orders...</span>
                  </div>
                </td>
              </tr>
              <tr v-else-if="filteredOrders.length === 0" class="text-center">
                <td colspan="7" class="px-6 py-12 text-gray-500">
                  <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p class="font-medium">No orders found</p>
                  <p class="text-sm mt-1">Try adjusting your filters or create a new order</p>
                </td>
              </tr>
              <tr
                v-else
                v-for="order in filteredOrders"
                :key="order.id"
                class="hover:bg-blue-50 transition-colors cursor-pointer"
                @click="viewOrder(order)"
              >
                <td class="px-6 py-4">
                  <span class="text-blue-600 hover:text-blue-800 font-semibold">{{ order.so_number }}</span>
                </td>
                <td class="px-6 py-4">
                  <p class="font-medium text-gray-900">{{ order.customer_name || '-' }}</p>
                </td>
                <td class="px-6 py-4">
                  <span class="text-sm text-gray-600">{{ order.item_count || 0 }} items</span>
                </td>
                <td class="px-6 py-4">
                  <p class="font-semibold text-gray-900">{{ order.currency || 'IDR' }} {{ formatNumber(calculateOrderTotal(order)) }}</p>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600">{{ formatDate(order.expected_ship_date || '') }}</p>
                </td>
                <td class="px-6 py-4">
                  <span
                    class="px-3 py-1 rounded-full text-xs font-semibold capitalize"
                    :class="getStatusColor(order.status)"
                  >
                    {{ order.status }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex gap-2">
                    <button
                      @click.stop="viewOrder(order)"
                      class="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      title="View"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      @click.stop="editOrder(order)"
                      class="text-gray-600 hover:text-gray-800 font-medium text-sm"
                      title="Edit"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-between items-center">
          <p class="text-sm text-gray-600">
            Showing <span class="font-medium">{{ filteredOrders.length }}</span> of <span class="font-medium">{{ orders.length }}</span> orders
          </p>
          <div class="flex gap-2">
            <button class="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100 text-sm disabled:opacity-50" disabled>
              Previous
            </button>
            <button class="px-3 py-1 bg-blue-600 text-white rounded text-sm">1</button>
            <button class="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100 text-sm disabled:opacity-50" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- View Order Modal -->
    <div v-if="selectedOrder" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="selectedOrder = null">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="text-xl font-bold text-gray-900">{{ selectedOrder.so_number }}</h3>
              <p class="text-sm text-gray-500 mt-1">Sales Order Details</p>
            </div>
            <button
              @click="selectedOrder = null"
              class="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              ×
            </button>
          </div>
        </div>

        <div class="px-6 py-6 space-y-6">
          <!-- Order Info Grid -->
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-gray-500 mb-1">Customer</p>
                <p class="text-base font-semibold text-gray-900">{{ selectedOrder.customer_name }}</p>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-500 mb-1">Expected Ship Date</p>
                <p class="text-base text-gray-900">{{ formatDate(selectedOrder.expected_ship_date || '') }}</p>
              </div>
            </div>
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-gray-500 mb-1">Currency</p>
                <p class="text-base text-gray-900">{{ selectedOrder.currency || 'IDR' }}</p>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-500 mb-1">Status</p>
                <span
                  class="inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize"
                  :class="getStatusColor(selectedOrder.status)"
                >
                  {{ selectedOrder.status }}
                </span>
              </div>
            </div>
          </div>

          <!-- Order Items -->
          <div>
            <h4 class="text-lg font-semibold text-gray-900 mb-4">Order Items</h4>
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <table class="w-full">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">Product</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">SKU</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-700">Quantity</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-700">Unit Price</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-if="!selectedOrder.items || selectedOrder.items.length === 0">
                    <td colspan="5" class="px-4 py-6 text-center text-gray-500">No items</td>
                  </tr>
                  <tr v-else v-for="(item, index) in selectedOrder.items" :key="index" class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <p class="font-medium text-gray-900">{{ item.product_name }}</p>
                      <p v-if="item.notes" class="text-xs text-gray-500 mt-1">{{ item.notes }}</p>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ item.sku }}</td>
                    <td class="px-4 py-3 text-right text-gray-900">{{ item.quantity }} {{ item.uom || 'pcs' }}</td>
                    <td class="px-4 py-3 text-right text-gray-900">{{ formatNumber(item.unit_price) }}</td>
                    <td class="px-4 py-3 text-right font-semibold text-gray-900">{{ formatNumber(item.quantity * item.unit_price) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Total Section -->
          <div class="bg-blue-50 rounded-lg p-6 border border-blue-200">
            <div class="flex justify-between items-center">
              <span class="text-lg font-bold text-gray-900">Total Amount</span>
              <span class="text-3xl font-bold text-blue-600">
                {{ selectedOrder.currency || 'IDR' }} {{ formatNumber(selectedOrder.items?.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) || 0) }}
              </span>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="selectedOrder.notes">
            <p class="text-sm font-medium text-gray-500 mb-2">Notes</p>
            <p class="text-gray-900 bg-gray-50 p-4 rounded-lg">{{ selectedOrder.notes }}</p>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button
            @click="selectedOrder = null"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Close
          </button>
          <button
            @click="editOrder(selectedOrder)"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Edit Order
          </button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Order Modal -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="showAddModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 class="text-xl font-bold text-gray-900">
            {{ editingOrder ? 'Edit Sales Order' : 'Create New Sales Order' }}
          </h3>
        </div>

        <div class="px-6 py-6 space-y-6">
          <!-- Customer & Basic Info -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Customer <span class="text-red-500">*</span></label>
              <select
                v-model="newOrder.customer_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option :value="null">Select Customer</option>
                <option v-for="customer in customers" :key="customer.id" :value="customer.id">
                  {{ customer.name }} ({{ customer.code }})
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                v-model="newOrder.status"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Expected Ship Date</label>
              <input
                v-model="newOrder.expected_ship_date"
                type="date"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Currency</label>
              <select
                v-model="newOrder.currency"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="IDR">IDR - Indonesian Rupiah</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="SGD">SGD - Singapore Dollar</option>
              </select>
            </div>
          </div>

          <!-- Order Items -->
          <div>
            <div class="flex justify-between items-center mb-4">
              <h4 class="text-lg font-semibold text-gray-900">Order Items</h4>
              <button
                @click="addOrderItem"
                type="button"
                class="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </button>
            </div>

            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">Product</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">Quantity</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">UOM</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit Price</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">Total</th>
                      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-if="newOrder.items.length === 0">
                      <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                        No items added. Click "Add Item" to start.
                      </td>
                    </tr>
                    <tr v-else v-for="(item, index) in newOrder.items" :key="index" class="hover:bg-gray-50">
                      <td class="px-4 py-3">
                        <select
                          v-model="item.product_id"
                          @change="onProductSelect(index)"
                          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        >
                          <option :value="0">Select Product</option>
                          <option v-for="product in products" :key="product.id" :value="product.id">
                            {{ product.name }} ({{ product.sku }})
                          </option>
                        </select>
                      </td>
                      <td class="px-4 py-3">
                        <input
                          v-model.number="item.quantity"
                          type="number"
                          min="1"
                          class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </td>
                      <td class="px-4 py-3">
                        <input
                          v-model="item.uom"
                          type="text"
                          placeholder="pcs"
                          class="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </td>
                      <td class="px-4 py-3">
                        <input
                          v-model.number="item.unit_price"
                          type="number"
                          min="0"
                          step="0.01"
                          class="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </td>
                      <td class="px-4 py-3">
                        <span class="font-semibold text-gray-900">{{ formatNumber(item.quantity * item.unit_price) }}</span>
                      </td>
                      <td class="px-4 py-3">
                        <button
                          @click="removeOrderItem(index)"
                          type="button"
                          class="text-red-600 hover:text-red-800"
                          title="Remove"
                        >
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Order Total -->
            <div class="mt-4 bg-gray-50 rounded-lg p-4 flex justify-between items-center">
              <span class="text-lg font-semibold text-gray-900">Order Total</span>
              <span class="text-2xl font-bold text-blue-600">
                {{ newOrder.currency }} {{ formatNumber(newOrder.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)) }}
              </span>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              v-model="newOrder.notes"
              rows="3"
              placeholder="Add any additional notes or instructions..."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button
            @click="showAddModal = false"
            type="button"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            @click="saveOrder"
            type="button"
            :disabled="loading"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ loading ? 'Saving...' : (editingOrder ? 'Update Order' : 'Create Order') }}
          </button>
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

interface OrderItem {
  id?: number;
  product_id: number;
  product_name?: string;
  sku?: string;
  quantity: number;
  uom?: string;
  unit_price: number;
  currency?: string;
  notes?: string;
}

interface SalesOrder {
  id: number;
  so_number: string;
  customer_id: number;
  customer_name?: string;
  status: string;
  expected_ship_date?: string;
  currency?: string;
  notes?: string;
  item_count?: number;
  created_at?: string;
  items?: OrderItem[];
}

interface Customer {
  id: number;
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  price?: number;
}

const statusFilters = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Processing', value: 'processing' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' }
];

const filterStatus = ref('');
const searchQuery = ref('');
const selectedOrder = ref<SalesOrder | null>(null);
const showAddModal = ref(false);
const editingOrder = ref<SalesOrder | null>(null);
const loading = ref(false);

const orders = ref<SalesOrder[]>([]);
const customers = ref<Customer[]>([]);
const products = ref<Product[]>([]);

const newOrder = ref({
  customer_id: null as number | null,
  status: 'draft',
  expected_ship_date: '',
  currency: 'IDR',
  notes: '',
  items: [] as OrderItem[]
});

// Fetch data on mount
onMounted(async () => {
  await Promise.all([
    fetchOrders(),
    fetchCustomers(),
    fetchProducts()
  ]);
});

const fetchOrders = async () => {
  loading.value = true;
  try {
    const res = await api.get('/sales/sales-orders');
    orders.value = res.data.data;
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Failed to fetch orders');
  } finally {
    loading.value = false;
  }
};

const fetchCustomers = async () => {
  try {
    const res = await api.get('/sales/customers');
    customers.value = res.data.data;
  } catch (error: any) {
    toast.error('Failed to fetch customers');
  }
};

const fetchProducts = async () => {
  try {
    const res = await api.get('/products');
    products.value = res.data.data || [];
  } catch (error: any) {
    console.error('Failed to fetch products:', error);
  }
};

const filteredOrders = computed(() => {
  return orders.value.filter(order => {
    const matchStatus = !filterStatus.value || order.status.toLowerCase() === filterStatus.value.toLowerCase();
    const matchSearch = !searchQuery.value || 
      order.so_number.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.value.toLowerCase()));
    return matchStatus && matchSearch;
  });
});

const totalAmount = computed(() => {
  return filteredOrders.value.reduce((sum, order) => {
    return sum + calculateOrderTotal(order);
  }, 0);
});

const calculateOrderTotal = (order: SalesOrder) => {
  if (!order.items || order.items.length === 0) return 0;
  return order.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
};

const getStatusColor = (status: string) => {
  const colors: { [key: string]: string } = {
    'draft': 'bg-gray-100 text-gray-800',
    'pending': 'bg-yellow-100 text-yellow-800',
    'confirmed': 'bg-green-100 text-green-800',
    'processing': 'bg-cyan-100 text-cyan-800',
    'shipped': 'bg-blue-100 text-blue-800',
    'delivered': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800'
  };
  return colors[status.toLowerCase()] || 'bg-gray-100 text-gray-800';
};

const formatNumber = (num: number) => {
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
};



const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const viewOrder = async (order: SalesOrder) => {
  try {
    loading.value = true;
    const res = await api.get(`/sales/sales-orders/${order.id}`);
    selectedOrder.value = res.data.data;
  } catch (error: any) {
    toast.error('Failed to fetch order details');
  } finally {
    loading.value = false;
  }
};

const openAddOrderModal = () => {
  editingOrder.value = null;
  newOrder.value = {
    customer_id: null,
    status: 'draft',
    expected_ship_date: '',
    currency: 'IDR',
    notes: '',
    items: []
  };
  showAddModal.value = true;
};

const editOrder = (order: SalesOrder) => {
  editingOrder.value = order;
  newOrder.value = {
    customer_id: order.customer_id,
    status: order.status,
    expected_ship_date: order.expected_ship_date || '',
    currency: order.currency || 'IDR',
    notes: order.notes || '',
    items: order.items?.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      uom: item.uom || 'pcs',
      notes: item.notes
    })) || []
  };
  selectedOrder.value = null;
  showAddModal.value = true;
};

const addOrderItem = () => {
  newOrder.value.items.push({
    product_id: 0,
    quantity: 1,
    unit_price: 0,
    uom: 'pcs'
  });
};

const removeOrderItem = (index: number) => {
  newOrder.value.items.splice(index, 1);
};

const onProductSelect = (index: number) => {
  const item = newOrder.value.items[index];
  const product = products.value.find(p => p.id === item.product_id);
  if (product && product.price) {
    item.unit_price = product.price;
  }
};

const saveOrder = async () => {
  if (!newOrder.value.customer_id) {
    toast.error('Please select a customer');
    return;
  }
  
  if (newOrder.value.items.length === 0 || newOrder.value.items.some(item => !item.product_id || item.product_id === 0)) {
    toast.error('Please add at least one valid product');
    return;
  }

  loading.value = true;
  try {
    if (editingOrder.value) {
      await api.put(`/sales/sales-orders/${editingOrder.value.id}`, newOrder.value);
      toast.success('Order updated successfully');
    } else {
      await api.post('/sales/sales-orders', newOrder.value);
      toast.success('Order created successfully');
    }
    showAddModal.value = false;
    await fetchOrders();
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Failed to save order');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
