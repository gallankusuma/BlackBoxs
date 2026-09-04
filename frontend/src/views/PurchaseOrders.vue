<template>
  <div class="min-h-screen bg-gray-50 p-6 space-y-4">
    <div class="bg-white border rounded-lg shadow-sm tilt-card">
      <div class="px-6 py-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase text-gray-500 tracking-wide">Procurement</p>
          <h1 class="text-2xl font-semibold text-gray-900">Purchase Order (PO)</h1>
          <p class="text-sm text-gray-600">Create PO from approved PR</p>
        </div>
        <div class="space-x-2">
          <button @click="fetchData" class="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            Refresh
          </button>
          <button @click="() => openCreateModal()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            + Create PO
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      {{ error }}
    </div>
    <div v-if="successMsg" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
      {{ successMsg }}
    </div>
    <div class="bg-white border rounded-lg shadow-sm overflow-hidden tilt-card">
      <div class="px-6 py-3 border-b flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-800">PO List + Approval</h2>
      </div>
      <div v-if="loading" class="p-8 text-center text-gray-500">Loading...</div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO No</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PR No</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Description</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approval</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="po in purchaseOrders" :key="po.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-semibold text-gray-900">{{ po.po_number }}</div>
                <div class="text-xs text-gray-500">{{ po.status || 'draft' }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                <span v-if="po.project_name" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{{ po.project_number }}</span>
                <span v-else class="text-gray-400">—</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ po.pr_number || '-' }}</td>
              <td class="px-6 py-4 text-sm text-gray-700 max-w-md">
                <div v-if="po.items_description" class="space-y-1 whitespace-pre-wrap text-xs">
                  <div v-for="(item, idx) in formatItemsDescription(po.items_description).split('\n')" :key="idx" class="py-0.5">
                    <span class="font-semibold text-gray-900">{{ item }}</span>
                  </div>
                </div>
                <div v-else class="text-gray-500">-</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ po.vendor_name || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ formatDate(po.expected_date) }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="approvalBadgeClass(po)" class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ approvalLabel(po) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <!-- Aksi berbentuk ikon; alasan & aturan title/aria-label sama
                     dengan PurchaseRequests.vue. -->
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="canApprove(po.approval_status || 0)"
                    @click="approvePO(po.id)"
                    :disabled="submitting"
                    title="Setujui PO"
                    aria-label="Setujui PO"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-green-600 hover:bg-green-700"
                  >
                    <Icon name="check" :size="15" />
                  </button>
                  <button
                    v-if="canReject(po.approval_status || 0)"
                    @click="rejectPO(po.id)"
                    :disabled="submitting"
                    title="Tolak PO"
                    aria-label="Tolak PO"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-red-600 hover:bg-red-700"
                  >
                    <Icon name="x" :size="15" />
                  </button>
                  <button
                    @click="viewPO(po)"
                    title="Lihat detail PO"
                    aria-label="Lihat detail PO"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-blue-600 hover:bg-blue-50"
                  >
                    <Icon name="eye" :size="16" />
                  </button>
                  <button
                    v-if="(po.approval_status || 0) === 0"
                    @click="handleDeletePO(po.id)"
                    :disabled="submitting"
                    title="Hapus PO"
                    aria-label="Hapus PO"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-red-600 hover:bg-red-50"
                  >
                    <Icon name="trash" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="purchaseOrders.length === 0">
              <td colspan="6" class="px-6 py-8 text-center text-gray-500">Belum ada PO. Klik "Create PO" untuk mulai.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PO Form Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
      <div class="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto tilt-card">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">{{ isEditing && !editModeEnabled ? 'Purchase Order Detail' : (editModeEnabled ? 'Edit Purchase Order' : 'Create Purchase Order') }}</h3>
          <div class="flex items-center gap-2">
            <button 
              v-if="isEditing && !editModeEnabled && (currentPO?.status === 'draft' || (currentPO?.approval_status || 0) === 0)" 
              @click="enableEditMode" 
              class="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              ✏️ Edit
            </button>
            <button v-if="isEditing && form.po_number" @click="printPO" class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
              🖨️ Print
            </button>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>

        <div class="px-6 py-4 space-y-4">
          <!-- Header Section -->
          <div class="grid grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">PO No.</label>
              <input v-model="form.po_number" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50" disabled />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input v-model="form.po_date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Expected Date</label>
              <input v-model="form.expected_date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Valuta</label>
              <select v-model="form.currency" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Term of Payment</label>
              <select v-model="form.payment_term" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled">
                <option value="">-- Select Term --</option>
                <option value="Cash">Cash</option>
                <option value="COD">COD</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
                <option value="1.5 Month After Receiving of Goods and Invoiced">1.5 Month After Receiving of Goods and Invoiced</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Term of Payment 2</label>
              <input v-model="form.payment_term_2" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled" />
            </div>
          </div>

          <!-- Payment Schedule moved to Finance module -->

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea v-model="form.address" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled"></textarea>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select v-model="form.type" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled">
                <option value="Local">Local</option>
                <option value="Import">Import</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Supplier * <span class="text-xs text-gray-500">(Supply: Chemical, Raw Material, Packaging, etc)</span></label>
              <p v-if="gagalSaringVendor" class="mb-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {{ gagalSaringVendor }}
              </p>
              <select v-model="form.vendor_id" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled" required>
                <option :value="null">-- Pilih Supplier --</option>
                <option v-for="vendor in filteredVendors" :key="vendor.id" :value="vendor.id">
                  {{ vendor.name }} ({{ vendor.code }}) - Supply: {{ vendor.supply || 'General' }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Inv/NonInv</label>
              <div class="flex items-center space-x-4 mt-2">
                <label class="flex items-center">
                  <input type="radio" value="inventory" v-model="form.item_type" :disabled="isEditing && !editModeEnabled" class="mr-1" />
                  <span class="text-sm">Inventory</span>
                </label>
                <label class="flex items-center">
                  <input type="radio" value="non-inventory" v-model="form.item_type" :disabled="isEditing && !editModeEnabled" class="mr-1" />
                  <span class="text-sm">Non-Inventory</span>
                </label>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
              <input v-model="form.contact_person" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Delivery To</label>
              <textarea v-model="form.delivery_to" rows="1" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled"></textarea>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project (optional)</label>
              <select v-model="form.project_id" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled">
                <option :value="null">— Tanpa Project —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.project_number }} — {{ p.title }}</option>
              </select>
              <p class="text-xs text-gray-500 mt-1">Cost control: biaya PO masuk ke budget project.</p>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-1">
              <label class="block text-sm font-medium text-gray-700">Select Approved PR *</label>
              <span
                class="text-xs text-gray-500 cursor-help"
                title="Only PRs with unallocated items are shown. Fully allocated PRs are hidden. Select a PR, then use 'Add Item' to pick remaining items."
              >ⓘ</span>
            </div>
            <div class="relative">
              <div class="flex items-center gap-2">
                <div class="flex-1 relative">
                  <input
                    v-model="prSearchQuery"
                    type="text"
                    placeholder="🔍 Search or scroll to select PR..."
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8"
                    :disabled="isEditing && (currentPO?.approval_status || 0) > 0"
                    @focus="prDropdownOpen = true"
                  />
                  <button 
                    v-if="prSearchQuery"
                    @click="prSearchQuery = ''"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <button
                  type="button"
                  @click="prDropdownOpen = !prDropdownOpen"
                  class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  :disabled="isEditing && (currentPO?.approval_status || 0) > 0"
                >
                  {{ prDropdownOpen ? '▲' : '▼' }}
                </button>
              </div>
              
              <div 
                v-show="prDropdownOpen" 
                class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              >
                <div 
                  v-if="filteredApprovedPRs.length === 0"
                  class="px-4 py-8 text-center text-gray-400 text-sm"
                >
                  No PR found
                </div>
                <button
                  v-for="pr in filteredApprovedPRs"
                  :key="pr.id"
                  type="button"
                  @click="selectPR(pr)"
                  class="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  :class="{ 'bg-blue-100': form.pr_id === pr.id }"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="font-medium text-gray-900">{{ pr.pr_number }}</div>
                      <div class="text-xs text-gray-500">{{ pr.requester_name }} • {{ pr.department }}</div>
                    </div>
                    <div class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      Open ({{ getOpenItemCount(pr) }})
                    </div>
                  </div>
                </button>
              </div>
            </div>
            
            <div v-if="form.pr_id" class="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
              <strong>Selected:</strong> {{ selectedPRDisplay }}
            </div>
            
            <p class="text-xs text-gray-500 mt-1">
              Showing only PRs with unallocated items • {{ filteredApprovedPRs.length }} of {{ approvedPRs.length }} approved PRs
            </p>
             <div v-if="prSummary.length" class="mt-2 border border-gray-200 rounded-md divide-y">
               <div class="px-3 py-2 bg-gray-50 text-xs text-gray-600">Remaining per item (PR → Allocated → Remaining)</div>
               <div v-for="row in prSummary" :key="row.product_id" class="px-3 py-1 flex justify-between text-xs">
                 <div class="text-gray-700 truncate">#{{ row.product_id }} • {{ row.productName }}</div>
                 <div>
                   <span class="text-gray-500">{{ row.requested }}</span>
                   <span class="mx-1">→</span>
                   <span class="text-blue-600">{{ row.allocated }}</span>
                   <span class="mx-1">→</span>
                   <span class="font-semibold text-green-700">{{ row.remaining }}</span>
                 </div>
               </div>
             </div>
          </div>

          <!-- PR Items Verification Table -->
          <div v-if="form.pr_id && prVerificationItems.length > 0" class="mt-4 border border-blue-200 rounded-lg bg-blue-50">
            <div class="px-4 py-3 bg-blue-100 border-b border-blue-200">
              <p class="text-sm font-semibold text-blue-900">📋 PR Items Available for Selection</p>
              <p class="text-xs text-blue-700 mt-1">Click "Add Item" to select items for this Purchase Order</p>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-blue-200 text-xs">
                <thead class="bg-blue-100">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium text-blue-900 uppercase">Item Code</th>
                    <th class="px-3 py-2 text-left font-medium text-blue-900 uppercase">Description</th>
                    <th class="px-3 py-2 text-center font-medium text-blue-900 uppercase w-24">Requested</th>
                    <th class="px-3 py-2 text-center font-medium text-blue-900 uppercase w-24">Allocated</th>
                    <th class="px-3 py-2 text-center font-medium text-blue-900 uppercase w-24">Remaining</th>
                    <th class="px-3 py-2 text-center font-medium text-blue-900 uppercase w-20">Status</th>
                    <th class="px-3 py-2 text-center font-medium text-blue-900 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-blue-100">
                  <tr v-for="item in prVerificationItems" :key="item.product_id" :class="{ 'bg-gray-100 opacity-60': item.isAllocated }">
                    <td class="px-3 py-2 font-medium text-gray-900">#{{ item.product_id }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ item.productName }}</td>
                    <td class="px-3 py-2 text-center font-semibold text-gray-900">{{ item.requested_qty }}</td>
                    <td class="px-3 py-2 text-center font-semibold text-blue-600">{{ item.allocated_qty }}</td>
                    <td class="px-3 py-2 text-center font-semibold text-green-700">{{ item.remaining_qty }}</td>
                    <td class="px-3 py-2 text-center">
                      <span v-if="item.isAllocated" class="inline-block px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-semibold">Allocated</span>
                      <span v-else-if="item.remaining_qty > 0" class="inline-block px-2 py-1 rounded-full bg-green-100 text-green-800 font-semibold">Open</span>
                      <span v-else class="inline-block px-2 py-1 rounded-full bg-gray-100 text-gray-800 font-semibold">Closed</span>
                    </td>
                    <td class="px-3 py-2 text-center">
                      <button
                        v-if="!item.isAllocated && item.remaining_qty > 0"
                        @click="addItemToPO(item)"
                        class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 font-medium"
                      >
                        Add Item
                      </button>
                      <span v-else class="text-gray-400 text-xs">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="border border-gray-200 rounded-lg">
            <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <p class="text-sm font-semibold text-gray-800">Items from PR</p>
              <div class="flex items-center gap-2" v-if="formItems.length > 0">
                <button
                  type="button"
                  @click="checkAllPrices"
                  :disabled="aiChecking"
                  class="ai-check-all-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                >
                  <span v-if="aiChecking" class="ai-spinner">⏳</span>
                  <span v-else>✨</span>
                  {{ aiChecking ? 'Analyzing...' : 'AI Price Check' }}
                </button>
                <button
                  type="button"
                  @click="runPoAdvisor"
                  :disabled="advisorLoading"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                  :class="advisorLoading ? 'bg-gray-200 text-gray-400' : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-sm'"
                  title="Analisis komprehensif PO: harga, vendor, anomali, risiko"
                >
                  <span>{{ advisorLoading ? '⏳' : '🧠' }}</span>
                  {{ advisorLoading ? 'Analyzing...' : 'AI PO Advisor' }}
                </button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-xs">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">No.</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">PR Date</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">PR No.</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">Item Code</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">Item Description</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase w-32">Qty</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase w-16">Unit</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">Unit Price</th>
                    <th class="px-2 py-2 text-right font-medium text-gray-500 uppercase">Total</th>
                    <th class="px-2 py-2 text-left font-medium text-gray-500 uppercase">Remark</th>
                    <th v-if="form.project_id" class="px-2 py-2 text-left font-medium text-gray-500 uppercase bg-green-50 min-w-[160px]">🔗 Link RAB</th>
                    <th class="px-2 py-2 text-center font-medium text-gray-500 uppercase">Price Check</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(item, idx) in formItems" :key="idx" :class="{ 'bg-gray-100 opacity-60': item.isAllocated }">
                    <td class="px-2 py-2">{{ idx + 1 }}</td>
                    <td class="px-2 py-2 text-gray-600">{{ formatDate(selectedPR?.request_date) }}</td>
                    <td class="px-2 py-2 text-gray-600">{{ selectedPR?.pr_number || '-' }}</td>
                    <td class="px-2 py-2">
                      <div class="text-xs font-medium text-gray-900">#{{ item.product_id }}</div>
                      <div v-if="item.isAllocated" class="text-[10px] text-red-600 font-semibold">Already allocated</div>
                    </td>
                    <td class="px-2 py-2">
                      <div class="text-xs font-medium text-gray-900">{{ item.productName || item.name || '-' }}</div>
                    </td>
                    <td class="px-2 py-2 w-32">
                      <div class="flex items-center gap-1">
                        <input
                          v-model.number="item.quantity"
                          type="number"
                          min="0"
                          :max="item.remaining_qty"
                          step="1"
                          class="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                          :disabled="(isEditing && !editModeEnabled) || item.isAllocated"
                          @change="onItemQtyChange(item)"
                        />
                        <button
                          type="button"
                          class="px-2 py-1 text-[10px] bg-gray-100 hover:bg-gray-200 border rounded"
                          @click="item.quantity = item.remaining_qty"
                          :disabled="(isEditing && !editModeEnabled) || (item.remaining_qty || 0) <= 0 || item.isAllocated"
                          title="Set to remaining"
                        >Max</button>
                      </div>
                       <div v-if="!item.isAllocated" class="mt-1 text-[10px] inline-block px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Remaining: {{ item.remaining_qty }}</div>
                    </td>
                    <td class="px-2 py-2 w-16">
                      <input
                        v-model="item.uom"
                        type="text"
                        class="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-gray-50"
                        disabled
                      />
                    </td>
                    <td class="px-2 py-2">
                      <input
                        :value="formatNumberInput(item.unit_price)"
                        @input="onItemMoneyInput(item, 'unit_price', $event)"
                        inputmode="numeric"
                        pattern="[0-9\.]*"
                        class="w-full border rounded px-2 py-1 text-xs"
                        :class="item.from_bid && item.unit_price === item.bid_unit_price
                          ? 'border-green-400 bg-green-50'
                          : (item.from_bid ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300')"
                        :disabled="isEditing && !editModeEnabled"
                        :title="item.from_bid ? `Harga dari bidding: ${item.bid_vendor_name}` : 'Input harga manual'"
                      />
                      <div v-if="item.from_bid" class="flex items-center gap-1 mt-0.5">
                        <span class="text-[9px] text-green-700 font-medium">📊 Bid: {{ item.bid_vendor_name }}</span>
                        <button v-if="item.unit_price !== item.bid_unit_price"
                          type="button"
                          @click="item.unit_price = item.bid_unit_price"
                          class="text-[9px] text-blue-600 underline hover:no-underline"
                        >Reset</button>
                      </div>
                    </td>
                    <td class="px-2 py-2 text-right text-xs font-semibold">{{ formatCurrency(calcLineTotal(item)) }}</td>
                    <td class="px-2 py-2">
                      <input
                        v-model="item.remark"
                        type="text"
                        class="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        :disabled="isEditing && !editModeEnabled"
                      />
                    </td>
                    <!-- RAB Link column -->
                    <td v-if="form.project_id" class="px-2 py-2 bg-green-50">
                      <select
                        v-model="item.proposal_item_id"
                        class="w-full border border-green-200 rounded px-2 py-1 text-xs bg-white focus:ring-1 focus:ring-green-400"
                        :disabled="isEditing && !editModeEnabled"
                        title="Link item ini ke baris RAB untuk tracking aktual biaya"
                      >
                        <option :value="null">— Tidak di-link —</option>
                        <optgroup v-for="disc in rabItems" :key="disc.id" :label="disc.name">
                          <option
                            v-for="rabItem in disc.items"
                            :key="rabItem.id"
                            :value="rabItem.id"
                          >
                            {{ rabItem.ahsp_code }} — {{ rabItem.uraian?.substring(0, 40) }}
                          </option>
                        </optgroup>
                      </select>
                    </td>
                    <td class="px-2 py-2 text-center">
                      <div class="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          @click="openManualSearch(item)"
                          class="px-2 py-1 text-[10px] rounded-md font-semibold transition-all bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white hover:border-transparent"
                          title="Search Price History"
                        >
                          🔍
                        </button>
                        <button
                          type="button"
                          @click="checkItemPrice(item)"
                          :disabled="aiChecking"
                          class="ai-item-btn px-2 py-1 text-[10px] rounded-md font-semibold transition-all"
                          title="AI Price Check"
                        >
                          🤖
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="formItems.length === 0">
                    <td colspan="11" class="px-4 py-4 text-center text-gray-500 text-sm">Pilih PR untuk load items</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="px-4 py-3 border-t border-gray-200 space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">Sub Total</span>
                <span class="font-semibold text-gray-900">{{ formatCurrency(subTotal) }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center space-x-2">
                  <span class="text-gray-600">Discount (Rp)</span>
                  <input
                    v-model.number="form.discount_value"
                    type="number"
                    min="0"
                    step="1000"
                    class="w-32 border border-gray-300 rounded px-2 py-1 text-xs"
                    placeholder="0"
                    :disabled="isEditing && !editModeEnabled"
                  />
                </div>
                <span class="text-gray-900">-{{ formatCurrency(discountAmount) }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center space-x-2">
                  <span class="text-gray-600">PPN</span>
                  <input
                    v-model.number="form.ppn_percent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    class="w-16 border border-gray-300 rounded px-2 py-1 text-xs"
                    :disabled="isEditing && !editModeEnabled"
                  />
                  <span class="text-xs">%</span>
                </div>
                <span class="text-gray-900">{{ formatCurrency(ppnAmount) }}</span>
              </div>
              <div class="flex items-center justify-between text-lg border-t pt-2">
                <span class="text-gray-700 font-semibold">Grand Total</span>
                <span class="font-bold text-gray-900">{{ formatCurrency(grandTotal) }}</span>
              </div>

              <!-- Advance Payment as note (not reducing Grand Total) -->
              <div v-if="form.advance_payment > 0" class="border-t pt-2 mt-1 space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-blue-700 font-medium">📋 DP (Advance Payment) {{ form.advance_payment }}%</span>
                  <span class="text-blue-700 font-semibold">{{ formatCurrency(advancePaymentAmount) }}</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-orange-700 font-medium">📌 Sisa Tagihan</span>
                  <span class="text-orange-700 font-semibold">{{ formatCurrency(grandTotal - advancePaymentAmount) }}</span>
                </div>
                <p class="text-[10px] text-gray-400 italic">*DP & Sisa Tagihan akan masuk ke Payment Schedule di module Finance</p>
              </div>

              <!-- Advance Payment input (always visible) -->
              <div class="flex items-center justify-between text-sm border-t pt-2">
                <div class="flex items-center space-x-2">
                  <span class="text-gray-600">Advance Payment (%)</span>
                  <input
                    v-model.number="form.advance_payment"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    class="w-24 border border-gray-300 rounded px-2 py-1 text-xs"
                    :disabled="isEditing && !editModeEnabled"
                  />
                </div>
                <span class="text-gray-500 text-xs">{{ formatCurrency(advancePaymentAmount) }}</span>
              </div>
            </div>
          </div>

          <!-- ═══ AI Price Analysis Panel ═══════════════════════════════════ -->
          <div v-if="aiPanelVisible" class="ai-panel rounded-xl overflow-hidden">
            <!-- Header -->
            <div class="ai-panel-header px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg">🤖</span>
                <div>
                  <p class="text-sm font-bold text-white">AI Price Intelligence</p>
                  <p class="text-xs text-purple-200">Powered by AI · {{ aiResult?.product_name }}</p>
                </div>
              </div>
              <button @click="aiPanelVisible = false" class="text-purple-200 hover:text-white text-lg leading-none">✕</button>
            </div>

            <!-- Keyword Search Input -->
            <div class="px-5 py-3 bg-white border-b border-gray-100">
              <label class="block text-xs text-gray-500 uppercase tracking-wide mb-1 font-medium">🔎 Kata Kunci Pencarian AI</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="aiSearchQuery"
                  type="text"
                  placeholder="Ketik keyword untuk AI cari harga, misal: 'harga pellicle membrane 2026 indonesia'"
                  class="flex-1 border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200"
                  @keyup.enter="aiSearchWithKeyword"
                  :disabled="aiChecking"
                />
                <button
                  type="button"
                  @click="aiSearchWithKeyword"
                  :disabled="aiChecking || !aiSearchQuery.trim()"
                  class="px-4 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
                  :class="aiChecking ? 'bg-gray-200 text-gray-500' : 'bg-purple-600 hover:bg-purple-700 text-white'"
                >
                  {{ aiChecking ? '⏳' : '🤖 Search' }}
                </button>
              </div>
              <p class="text-[10px] text-gray-400 mt-1">Tekan Enter atau klik Search untuk AI cari ulang berdasarkan keyword di atas.</p>
            </div>

            <!-- Loading State -->
            <div v-if="aiChecking" class="px-5 py-8 flex flex-col items-center gap-3 bg-white">
              <div class="ai-loader"></div>
              <p class="text-sm text-gray-500 animate-pulse">AI sedang menganalisis harga pasar...</p>
            </div>

            <!-- Error -->
            <div v-else-if="aiError" class="px-5 py-4 bg-red-50 border-t border-red-100">
              <p class="text-sm text-red-600 font-medium">⚠️ {{ aiError }}</p>
              <p class="text-xs text-red-400 mt-1">Pastikan OPENAI_API_KEY atau GEMINI_API_KEY sudah dikonfigurasi di server.</p>
              <p class="text-xs text-gray-500 mt-2">💡 Coba ketik keyword di atas dan klik Search untuk mencoba lagi.</p>
            </div>

            <!-- Result -->
            <div v-else-if="aiResult" class="bg-white">
              <!-- Stats Row -->
              <div class="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                <div class="px-4 py-3 text-center">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide">Harga Direkomendasikan</p>
                  <p class="text-lg font-bold text-purple-700 mt-0.5">{{ formatCurrency(aiResult.ai?.recommended_price || 0) }}</p>
                  <span class="inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full font-semibold"
                    :class="aiResult.ai?.confidence === 'high' ? 'bg-green-100 text-green-700' : aiResult.ai?.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'">
                    {{ aiResult.ai?.confidence === 'high' ? '✅ High Confidence' : aiResult.ai?.confidence === 'medium' ? '⚠️ Medium' : '❓ Low' }}
                  </span>
                </div>
                <div class="px-4 py-3 text-center">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide">Range Harga Wajar</p>
                  <p class="text-sm font-semibold text-gray-700 mt-1">
                    {{ formatCurrency(aiResult.ai?.price_range?.min || 0) }}
                    <span class="text-gray-400 mx-1">–</span>
                    {{ formatCurrency(aiResult.ai?.price_range?.max || 0) }}
                  </p>
                </div>
                <div class="px-4 py-3 text-center">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide">Histori Pembelian</p>
                  <p class="text-sm font-semibold text-gray-700 mt-1">{{ aiResult.stats?.count || 0 }}x transaksi</p>
                  <p v-if="aiResult.stats" class="text-[10px] text-gray-400">Avg {{ formatCurrency(aiResult.stats.avg) }}</p>
                </div>
              </div>

              <!-- Analysis -->
              <div class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">📊 Analisis AI</p>
                <p class="text-sm text-gray-700 leading-relaxed">{{ aiResult.ai?.analysis }}</p>
              </div>

              <!-- Negotiation Tips -->
              <div v-if="aiResult.ai?.negotiation_tips?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">💡 Tips Negosiasi</p>
                <ul class="space-y-1">
                  <li v-for="(tip, i) in aiResult.ai.negotiation_tips" :key="i" class="flex items-start gap-2 text-sm text-gray-700">
                    <span class="text-green-500 mt-0.5 shrink-0">→</span>
                    <span>{{ tip }}</span>
                  </li>
                </ul>
              </div>

              <!-- Marketplace Prices (from AI search) -->
              <div v-if="aiResult.ai?.marketplace_prices?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">🛒 Harga Marketplace (AI Research)</p>
                <div class="overflow-x-auto">
                  <table class="min-w-full text-xs">
                    <thead>
                      <tr class="text-gray-400">
                        <th class="text-left py-1 pr-3">Marketplace / Toko</th>
                        <th class="text-right py-1 pr-3">Harga</th>
                        <th class="text-center py-1">Pakai</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                      <tr v-for="(mp, i) in aiResult.ai.marketplace_prices" :key="'mp-'+i">
                        <td class="py-1.5 pr-3 text-gray-700 font-medium">
                          <span :class="{
                            'text-orange-600': mp.source?.toLowerCase().includes('shopee'),
                            'text-green-600': mp.source?.toLowerCase().includes('tokopedia'),
                            'text-red-600': mp.source?.toLowerCase().includes('bukalapak'),
                            'text-blue-600': mp.source?.toLowerCase().includes('blibli'),
                          }">{{ mp.source }}</span>
                        </td>
                        <td class="py-1.5 pr-3 text-right font-bold text-gray-900">{{ formatCurrency(mp.price) }}</td>
                        <td class="py-1.5 text-center">
                          <button
                            type="button"
                            @click="applyMarketplacePrice(mp.price)"
                            class="px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 text-[10px] font-semibold"
                          >Apply</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Real Marketplace Search Links -->
              <div v-if="aiResult.marketplace_links?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">🔗 Cek Langsung di Marketplace</p>
                <div class="flex flex-wrap gap-2">
                  <a v-for="(ml, i) in aiResult.marketplace_links" :key="'ml-'+i"
                    :href="ml.url" target="_blank" rel="noopener"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:shadow-sm"
                    :class="{
                      'bg-green-50 text-green-700 border-green-200 hover:bg-green-100': ml.color === 'green',
                      'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100': ml.color === 'orange',
                      'bg-red-50 text-red-700 border-red-200 hover:bg-red-100': ml.color === 'red',
                      'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100': ml.color === 'blue',
                      'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100': ml.color === 'gray',
                    }"
                  >
                    <span>{{ ml.name === 'Tokopedia' ? '🟢' : ml.name === 'Shopee' ? '🟠' : ml.name === 'Bukalapak' ? '🔴' : ml.name === 'Blibli' ? '🔵' : '🔍' }}</span>
                    {{ ml.name }}
                    <span class="text-[10px] opacity-60">↗</span>
                  </a>
                </div>
                <p class="text-[10px] text-gray-400 mt-1.5">Klik untuk buka halaman pencarian di marketplace. Verifikasi harga secara langsung.</p>
              </div>

              <!-- Google Search Sources -->
              <div v-if="aiResult.search_sources?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">🌐 Sumber Referensi AI</p>
                <div class="flex flex-wrap gap-2">
                  <a v-for="(src, i) in aiResult.search_sources.slice(0,6)" :key="'src-'+i"
                    :href="src.url" target="_blank" rel="noopener"
                    class="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-lg text-[10px] text-gray-600 hover:text-blue-700 transition-colors"
                  >
                    <span>🔗</span>
                    <span class="truncate max-w-[200px]">{{ src.title || src.url }}</span>
                  </a>
                </div>
              </div>

              <!-- History Table -->
              <div v-if="aiResult.history?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">🕐 Histori Pembelian Terakhir</p>
                <div class="overflow-x-auto">
                  <table class="min-w-full text-xs">
                    <thead>
                      <tr class="text-gray-400">
                        <th class="text-left py-1 pr-3">Vendor</th>
                        <th class="text-right py-1 pr-3">Harga</th>
                        <th class="text-right py-1 pr-3">Qty</th>
                        <th class="text-left py-1">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                      <tr v-for="(h, i) in aiResult.history.slice(0,5)" :key="i">
                        <td class="py-1 pr-3 text-gray-700 font-medium">{{ h.vendor_name }}</td>
                        <td class="py-1 pr-3 text-right font-semibold text-gray-900">{{ formatCurrency(h.unit_price) }}</td>
                        <td class="py-1 pr-3 text-right text-gray-500">{{ h.quantity }}</td>
                        <td class="py-1 text-gray-400">{{ h.po_date?.slice(0,10) || '-' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Apply Button -->
              <div class="px-5 py-3 bg-purple-50 flex items-center justify-between">
                <p class="text-xs text-purple-600">Terapkan harga rekomendasi ke item yang dipilih?</p>
                <button
                  type="button"
                  @click="applyAiPrice"
                  class="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  ✅ Apply {{ formatCurrency(aiResult.ai?.recommended_price || 0) }}
                </button>
              </div>
            </div>
          </div>
          <!-- ══════════════════════════════════════════════════════════════════ -->

          <!-- ═══ Manual Price Search Panel ═══════════════════════════════════ -->
          <div v-if="manualSearchVisible" class="manual-search-panel rounded-xl overflow-hidden">
            <!-- Header -->
            <div class="manual-search-header px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg">🔍</span>
                <div>
                  <p class="text-sm font-bold text-white">Manual Price Search</p>
                  <p class="text-xs text-blue-200">Cari harga dari vendor prices & histori PO</p>
                </div>
              </div>
              <button @click="manualSearchVisible = false" class="text-blue-200 hover:text-white text-lg leading-none">✕</button>
            </div>

            <!-- Search Input -->
            <div class="px-5 py-3 bg-white border-b border-gray-100">
              <div class="flex items-center gap-2">
                <input
                  v-model="manualSearchQuery"
                  @input="onManualSearchInput"
                  type="text"
                  placeholder="Ketik nama item atau SKU untuk cari harga..."
                  class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                />
                <button
                  type="button"
                  @click="doManualSearch(manualSearchQuery)"
                  :disabled="manualSearchLoading || !manualSearchQuery.trim()"
                  class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {{ manualSearchLoading ? '⏳' : 'Search' }}
                </button>
              </div>
            </div>

            <!-- Loading -->
            <div v-if="manualSearchLoading" class="px-5 py-6 flex items-center justify-center bg-white">
              <div class="ai-loader"></div>
              <p class="ml-3 text-sm text-gray-500">Mencari harga...</p>
            </div>

            <!-- No Results -->
            <div v-else-if="manualSearchResults.length === 0 && manualSearchQuery" class="px-5 py-6 text-center bg-white">
              <p class="text-gray-400 text-sm">Belum ada data harga untuk item ini.</p>
              <p class="text-xs text-gray-400 mt-1">Coba keyword lain, atau input harga manual di kolom Unit Price.</p>
            </div>

            <!-- Results -->
            <div v-else class="bg-white divide-y divide-gray-100 max-h-96 overflow-y-auto">
              <div v-for="result in manualSearchResults" :key="result.product_id" class="px-5 py-3">
                <!-- Product Header -->
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <p class="text-sm font-bold text-gray-900">{{ result.product_name }}</p>
                    <p class="text-xs text-gray-500">SKU: {{ result.sku || '-' }} · Standard Cost: {{ formatCurrency(result.standard_cost) }}</p>
                  </div>
                  <button
                    v-if="result.standard_cost > 0"
                    type="button"
                    @click="applyManualPrice(result.standard_cost)"
                    class="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border"
                  >
                    Apply Standard
                  </button>
                </div>

                <!-- Stats summary -->
                <div v-if="result.stats && result.stats.count > 0" class="grid grid-cols-4 gap-2 mb-3 p-2 bg-blue-50 rounded-lg">
                  <div class="text-center">
                    <p class="text-[10px] text-gray-500 uppercase">Transaksi</p>
                    <p class="text-sm font-bold text-blue-700">{{ result.stats.count }}x</p>
                  </div>
                  <div class="text-center">
                    <p class="text-[10px] text-gray-500 uppercase">Rata-rata</p>
                    <p class="text-sm font-bold text-blue-700">{{ formatCurrency(result.stats.avg) }}</p>
                  </div>
                  <div class="text-center">
                    <p class="text-[10px] text-gray-500 uppercase">Min</p>
                    <p class="text-sm font-semibold text-green-600">{{ formatCurrency(result.stats.min) }}</p>
                  </div>
                  <div class="text-center">
                    <p class="text-[10px] text-gray-500 uppercase">Max</p>
                    <p class="text-sm font-semibold text-red-600">{{ formatCurrency(result.stats.max) }}</p>
                  </div>
                </div>

                <!-- Vendor Prices -->
                <div v-if="result.vendor_prices?.length > 0" class="mb-2">
                  <p class="text-xs text-gray-500 uppercase tracking-wide mb-1 font-medium">💰 Vendor Price List</p>
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="text-gray-400">
                          <th class="text-left py-1 pr-2">Vendor</th>
                          <th class="text-right py-1 pr-2">Harga</th>
                          <th class="text-left py-1 pr-2">Berlaku</th>
                          <th class="text-center py-1">Pakai</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-50">
                        <tr v-for="(vp, i) in result.vendor_prices" :key="'vp-'+i">
                          <td class="py-1 pr-2 text-gray-700 font-medium">{{ vp.vendor_name || vp.vendor_code }}</td>
                          <td class="py-1 pr-2 text-right font-bold text-gray-900">{{ formatCurrency(vp.price) }}</td>
                          <td class="py-1 pr-2 text-gray-500">{{ vp.effective_date?.slice(0,10) || '-' }}</td>
                          <td class="py-1 text-center">
                            <button
                              type="button"
                              @click="applyManualPrice(vp.price)"
                              class="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px] font-semibold"
                            >Apply</button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- PO History -->
                <div v-if="result.po_history?.length > 0">
                  <p class="text-xs text-gray-500 uppercase tracking-wide mb-1 font-medium">🕐 Histori PO</p>
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="text-gray-400">
                          <th class="text-left py-1 pr-2">Vendor</th>
                          <th class="text-right py-1 pr-2">Harga</th>
                          <th class="text-right py-1 pr-2">Qty</th>
                          <th class="text-left py-1 pr-2">Tgl PO</th>
                          <th class="text-center py-1">Pakai</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-50">
                        <tr v-for="(h, i) in result.po_history" :key="'po-'+i">
                          <td class="py-1 pr-2 text-gray-700 font-medium">{{ h.vendor_name || '-' }}</td>
                          <td class="py-1 pr-2 text-right font-bold text-gray-900">{{ formatCurrency(h.unit_price) }}</td>
                          <td class="py-1 pr-2 text-right text-gray-500">{{ h.quantity }}</td>
                          <td class="py-1 pr-2 text-gray-400">{{ h.po_date?.slice(0,10) || '-' }}</td>
                          <td class="py-1 text-center">
                            <button
                              type="button"
                              @click="applyManualPrice(h.unit_price)"
                              class="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 text-[10px] font-semibold"
                            >Apply</button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- ══════════════════════════════════════════════════════════════════ -->

          <!-- ═══ AI PO Advisor Panel ════════════════════════════════════════ -->
          <div v-if="advisorPanelVisible" class="advisor-panel rounded-xl overflow-hidden mt-2">
            <div class="advisor-header px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-2xl">🧠</span>
                <div>
                  <p class="text-sm font-bold text-white">AI PO Advisor</p>
                  <p class="text-xs text-emerald-200">Analisis komprehensif seluruh Purchase Order</p>
                </div>
              </div>
              <button @click="advisorPanelVisible = false" class="text-emerald-200 hover:text-white text-lg">✕</button>
            </div>
            <div v-if="advisorLoading" class="px-5 py-10 flex flex-col items-center gap-3 bg-white">
              <div class="ai-loader"></div>
              <p class="text-sm text-gray-500 animate-pulse">AI sedang menganalisis seluruh PO secara mendalam...</p>
            </div>
            <div v-else-if="advisorError" class="px-5 py-4 bg-red-50">
              <p class="text-sm text-red-600 font-medium">⚠️ {{ advisorError }}</p>
            </div>
            <div v-else-if="advisorResult" class="bg-white">
              <!-- Score Banner -->
              <div class="px-5 py-4 flex items-center gap-6 border-b border-gray-100">
                <div class="flex-shrink-0 relative w-20 h-20">
                  <svg viewBox="0 0 36 36" class="w-20 h-20 -rotate-90">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" stroke-width="3"/>
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      :stroke="(advisorResult.ai?.overall_score||0) >= 80 ? '#10b981' : (advisorResult.ai?.overall_score||0) >= 60 ? '#f59e0b' : '#ef4444'"
                      stroke-width="3"
                      :stroke-dasharray="`${advisorResult.ai?.overall_score || 0}, 100`"/>
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-xl font-black" :class="(advisorResult.ai?.overall_score||0) >= 80 ? 'text-emerald-600' : (advisorResult.ai?.overall_score||0) >= 60 ? 'text-amber-600' : 'text-red-600'">{{ advisorResult.ai?.overall_score || 0 }}</span>
                    <span class="text-[9px] text-gray-400 font-medium">/ 100</span>
                  </div>
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-base font-bold text-gray-900">{{ advisorResult.ai?.overall_verdict }}</span>
                    <span class="px-2 py-0.5 text-xs font-bold rounded-full"
                      :class="advisorResult.ai?.risk_level === 'low' ? 'bg-green-100 text-green-700' : advisorResult.ai?.risk_level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'">
                      {{ advisorResult.ai?.risk_level === 'low' ? '🟢 Risiko Rendah' : advisorResult.ai?.risk_level === 'medium' ? '🟡 Risiko Sedang' : '🔴 Risiko Tinggi' }}
                    </span>
                  </div>
                  <p class="text-sm text-gray-600 leading-relaxed">{{ advisorResult.ai?.executive_summary }}</p>
                  <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{{ advisorResult.item_analysis?.length }} item</span>
                    <span>·</span>
                    <span>{{ advisorResult.anomaly_count }} anomali</span>
                    <span>·</span>
                    <span>{{ advisorResult.vendor_history?.length }} histori PO vendor</span>
                  </div>
                </div>
                <div class="flex-shrink-0">
                  <div class="px-4 py-2 rounded-xl text-center font-bold text-sm"
                    :class="advisorResult.ai?.approval_recommendation === 'APPROVE' ? 'bg-green-100 text-green-800' : advisorResult.ai?.approval_recommendation === 'CONDITIONAL' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'">
                    <div class="text-lg">{{ advisorResult.ai?.approval_recommendation === 'APPROVE' ? '✅' : advisorResult.ai?.approval_recommendation === 'CONDITIONAL' ? '⚠️' : '❌' }}</div>
                    <div>{{ advisorResult.ai?.approval_recommendation }}</div>
                  </div>
                </div>
              </div>
              <!-- 3-column metrics -->
              <div class="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                <div class="px-4 py-3">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide mb-1">💲 Analisis Harga</p>
                  <span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-1"
                    :class="advisorResult.ai?.price_analysis?.verdict === 'Wajar' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">{{ advisorResult.ai?.price_analysis?.verdict }}</span>
                  <p class="text-xs text-gray-600 leading-relaxed">{{ advisorResult.ai?.price_analysis?.details }}</p>
                </div>
                <div class="px-4 py-3">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide mb-1">🏢 Vendor Score</p>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-2xl font-black" :class="(advisorResult.ai?.vendor_assessment?.score||0) >= 75 ? 'text-emerald-600' : 'text-amber-600'">{{ advisorResult.ai?.vendor_assessment?.score || '—' }}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full"
                      :class="advisorResult.ai?.vendor_assessment?.reliability === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'">
                      {{ advisorResult.ai?.vendor_assessment?.reliability === 'high' ? 'Andal' : 'Cukup' }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-600">{{ advisorResult.ai?.vendor_assessment?.comment }}</p>
                </div>
                <div class="px-4 py-3">
                  <p class="text-[10px] text-gray-400 uppercase tracking-wide mb-1">🤝 Potensi Hemat</p>
                  <p class="text-2xl font-black text-emerald-600">{{ advisorResult.ai?.negotiation_strategy?.potential_saving_pct || 0 }}%</p>
                  <p class="text-xs text-gray-500">≈ {{ formatCurrency((advisorResult.total_po||0) * (advisorResult.ai?.negotiation_strategy?.potential_saving_pct||0) / 100) }}</p>
                  <p class="text-xs text-gray-600 mt-1 italic">{{ advisorResult.ai?.negotiation_strategy?.best_approach }}</p>
                </div>
              </div>
              <!-- Anomaly Flags -->
              <div v-if="advisorResult.ai?.anomaly_flags?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">⚠️ Anomali Harga</p>
                <div class="space-y-2">
                  <div v-for="(flag, i) in advisorResult.ai.anomaly_flags" :key="i" class="flex items-start gap-3 p-2 bg-amber-50 border border-amber-100 rounded-lg text-xs">
                    <span class="text-amber-500 shrink-0">⚠</span>
                    <div class="flex-1"><span class="font-semibold text-amber-900">{{ flag.item }}:</span><span class="text-amber-700 ml-1">{{ flag.issue }}</span></div>
                    <div class="shrink-0 text-emerald-700 font-medium">→ {{ flag.action }}</div>
                  </div>
                </div>
              </div>
              <!-- Per-item deviation table -->
              <div v-if="advisorResult.item_analysis?.length" class="px-5 py-3 border-b border-gray-100">
                <p class="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">📊 Deviasi Harga Per Item</p>
                <table class="min-w-full text-xs">
                  <thead>
                    <tr class="text-gray-400 border-b border-gray-100">
                      <th class="text-left py-1 pr-3">Item</th>
                      <th class="text-right py-1 pr-3">Harga Input</th>
                      <th class="text-right py-1 pr-3">Avg Histori</th>
                      <th class="text-right py-1 pr-3">Min</th>
                      <th class="text-right py-1 pr-3">Max</th>
                      <th class="text-right py-1">Deviasi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    <tr v-for="it in advisorResult.item_analysis" :key="it.product_id" :class="it.is_anomaly ? 'bg-amber-50' : ''">
                      <td class="py-1.5 pr-3 font-medium" :class="it.is_anomaly ? 'text-amber-900' : 'text-gray-700'">{{ it.name?.substring(0,28) }}<span v-if="it.is_anomaly" class="ml-1 text-amber-500">⚠</span></td>
                      <td class="py-1.5 pr-3 text-right font-semibold">{{ formatCurrency(it.current_price) }}</td>
                      <td class="py-1.5 pr-3 text-right text-gray-500">{{ it.history_count > 0 ? formatCurrency(it.history_avg) : '—' }}</td>
                      <td class="py-1.5 pr-3 text-right text-green-600">{{ it.history_min > 0 ? formatCurrency(it.history_min) : '—' }}</td>
                      <td class="py-1.5 pr-3 text-right text-red-600">{{ it.history_max > 0 ? formatCurrency(it.history_max) : '—' }}</td>
                      <td class="py-1.5 text-right font-bold"
                        :class="Math.abs(it.price_deviation_pct) > 20 ? 'text-red-600' : Math.abs(it.price_deviation_pct) > 10 ? 'text-amber-600' : 'text-emerald-600'">
                        {{ it.history_count > 0 ? (it.price_deviation_pct > 0 ? '+' : '') + it.price_deviation_pct + '%' : '—' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <!-- Tactics + Recommendations + Red Flags -->
              <div class="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                <div class="px-4 py-3">
                  <p class="text-[10px] text-gray-400 uppercase font-medium mb-2">💡 Taktik Negosiasi</p>
                  <ul class="space-y-1">
                    <li v-for="(t,i) in advisorResult.ai?.negotiation_strategy?.tactics" :key="i" class="flex gap-1.5 text-xs text-gray-700">
                      <span class="text-emerald-500 font-bold shrink-0">{{ i+1 }}.</span><span>{{ t }}</span>
                    </li>
                  </ul>
                </div>
                <div class="px-4 py-3">
                  <p class="text-[10px] text-gray-400 uppercase font-medium mb-2">✅ Rekomendasi</p>
                  <ul class="space-y-1">
                    <li v-for="(r,i) in advisorResult.ai?.recommendations" :key="i" class="flex gap-1.5 text-xs text-gray-700">
                      <span class="text-blue-400 shrink-0">→</span><span>{{ r }}</span>
                    </li>
                  </ul>
                </div>
                <div class="px-4 py-3">
                  <p class="text-[10px] text-red-400 uppercase font-medium mb-2">🚩 Red Flags</p>
                  <div v-if="advisorResult.ai?.red_flags?.filter((r:string)=>r).length">
                    <p v-for="(r,i) in advisorResult.ai.red_flags.filter((r:string)=>r)" :key="i" class="text-xs text-red-700">! {{ r }}</p>
                  </div>
                  <p v-else class="text-xs text-green-600">✅ Tidak ada red flag</p>
                </div>
              </div>
              <!-- Approval Notes -->
              <div class="px-5 py-3 bg-gray-50">
                <p class="text-[10px] text-gray-400 uppercase font-medium mb-1">📋 Catatan untuk Approver</p>
                <p class="text-xs text-gray-700">{{ advisorResult.ai?.approval_notes }}</p>
              </div>
            </div>
          </div>
          <!-- ══════════════════════════════════════════════════════════════════ -->

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea v-model="form.notes" rows="2" placeholder="Catatan untuk PO" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing && !editModeEnabled"></textarea>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-between items-center gap-4">
          <div class="flex-1">
            <div class="text-xs text-gray-500">Submit PO akan masuk ke approval workflow (Supervisor → Manager)</div>
            <!-- Dynamic hints showing what's still needed -->
            <div class="flex flex-wrap gap-2 mt-1">
              <span v-if="!form.vendor_id" class="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                ⚠️ Pilih Vendor dulu
              </span>
              <span v-if="formItems.length === 0" class="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                ⚠️ Add Item dari PR dulu
              </span>
            </div>
          </div>
          <div class="space-x-2 flex-shrink-0">
            <button @click="closeModal" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              {{ (isEditing && !editModeEnabled) ? 'Close' : 'Cancel' }}
            </button>
            <button
              v-if="!isEditing || editModeEnabled"
              @click="submitPO"
              class="px-4 py-2 rounded-lg font-medium transition-all"
              :class="(submitting || !form.pr_id || !form.vendor_id || formItems.length === 0)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'"
            >
              {{ submitting ? 'Submitting...' : (editModeEnabled ? 'Update PO' : 'Submit PO') }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue';
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../lib/api';
import { useApprovalWorkflow } from '../composables/useApprovalWorkflow';
import { formatCurrency } from '../utils/format';

const { canApprove, canReject } = useApprovalWorkflow();
const route = useRoute();
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const successMsg = ref('');
const showModal = ref(false);
const isEditing = ref(false);
const editModeEnabled = ref(false);

const purchaseOrders = ref<any[]>([]);
const approvedPRs = ref<any[]>([]);
const vendors = ref<any[]>([]);
const projects = ref<any[]>([]);
const rabItems = ref<any[]>([]); // flat list of RAB items grouped by discipline for the selected project
const formItems = ref<any[]>([]);
const paymentSchedules = ref<any[]>([]);
const selectedPR = ref<any>(null);
const currentPO = ref<any>(null);
const prSummary = ref<any[]>([]);
const prVerificationItems = ref<any[]>([]);
const prSearchQuery = ref('');
const prDropdownOpen = ref(false);

// ── AI Price Check state ──────────────────────────────────────────────────────
const aiChecking = ref(false);
const aiPanelVisible = ref(false);
const aiResult = ref<any>(null);
const aiError = ref<string | null>(null);
const aiTargetItem = ref<any>(null); // the item we're checking price for
const aiSearchQuery = ref(''); // manual keyword for AI search

// ── AI PO Advisor state ───────────────────────────────────────────────────────
const advisorPanelVisible = ref(false);
const advisorLoading = ref(false);
const advisorError = ref<string | null>(null);
const advisorResult = ref<any>(null);

// ── Manual Price Search state ─────────────────────────────────────────────────
const manualSearchVisible = ref(false);
const manualSearchQuery = ref('');
const manualSearchLoading = ref(false);
const manualSearchResults = ref<any[]>([]);
const manualSearchTargetItem = ref<any>(null);

// Map: PR ID -> Map of product_id -> total allocated quantity across all POs
const prAllocationMap = ref<Map<number, Map<number, number>>>(new Map());

const form = ref({
  po_number: '',
  po_date: new Date().toISOString().slice(0, 10),
  expected_date: '',
  currency: 'IDR',
  payment_term: '',
  payment_term_2: '',
  address: '',
  type: 'Local',
  vendor_id: null as number | null,
  item_type: 'inventory',
  contact_person: '',
  delivery_to: '',
  pr_id: null as number | null,
  project_id: null as number | null,
  advance_payment: 0,
  discount_value: 0,
  ppn_percent: 11,
  notes: '',
});

const subTotal = computed(() => {
  return formItems.value.reduce((sum, item) => sum + calcLineTotal(item), 0);
});

const discountAmount = computed(() => {
  return Number(form.value.discount_value || 0);
});

const ppnAmount = computed(() => {
  const base = subTotal.value - discountAmount.value;
  return (base * (form.value.ppn_percent || 0)) / 100;
});

const contractTotal = computed(() => {
  return subTotal.value - discountAmount.value + ppnAmount.value;
});

const advancePaymentAmount = computed(() => {
  return (contractTotal.value * (form.value.advance_payment || 0)) / 100;
});

const grandTotal = computed(() => {
  return contractTotal.value; // Advance payment does NOT reduce PO value — goes to Finance payment schedule
});

const paymentSchedulePreview = computed(() => {
  const total = Number(contractTotal.value || 0);
  if (total <= 0) return [];

  const poDate = form.value.po_date || new Date().toISOString().slice(0, 10);
  const dueDate = deriveScheduleDueDate(form.value.payment_term, poDate, form.value.expected_date || '');
  const advancePercent = Math.max(Number(form.value.advance_payment || 0), 0);
  const advanceAmount = (advancePercent / 100) * total; // convert % to nominal

  if (advancePercent > 0 && advancePercent < 100) {
    return [
      {
        schedule_no: 1,
        label: 'Down Payment',
        trigger_type: 'po_approved',
        percentage: Number(advancePercent.toFixed(2)),
        amount: Number(advanceAmount.toFixed(2)),
        due_date: poDate,
        status: 'open',
      },
      {
        schedule_no: 2,
        label: 'Final Payment',
        trigger_type: 'goods_received',
        percentage: Number((100 - advancePercent).toFixed(2)),
        amount: Number((total - advanceAmount).toFixed(2)),
        due_date: dueDate,
        status: 'open',
      },
    ];
  }

  if (advancePercent >= 100) {
    return [
      {
        schedule_no: 1,
        label: 'Full Advance Payment',
        trigger_type: 'po_approved',
        percentage: 100,
        amount: Number(total.toFixed(2)),
        due_date: poDate,
        status: 'open',
      },
    ];
  }

  return [
    {
      schedule_no: 1,
      label: 'Full Payment',
      trigger_type: 'goods_received',
      percentage: 100,
      amount: Number(total.toFixed(2)),
      due_date: dueDate,
      status: 'open',
    },
  ];
});

// Payment schedule moved to Finance module — keep logic for future use
// const paymentScheduleRows = computed(() => {
//   if (isEditing.value && !editModeEnabled.value && paymentSchedules.value.length > 0) {
//     return paymentSchedules.value;
//   }
//   return paymentSchedulePreview.value;
// });

// Filter and sort approved PRs, showing only those with unallocated quantities
const filteredApprovedPRs = computed(() => {
  // Helper: does PR still have items with remaining quantity (requested > allocated)?
  const hasOpenItems = (pr: any): boolean => {
    let prItems: Array<any> = [];
    try {
      const parsed = JSON.parse(pr?.notes || '{}');
      prItems = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      prItems = [];
    }
    if (prItems.length === 0) return false;
    const allocated = prAllocationMap.value.get(Number(pr.id)) || new Map<number, number>();
    for (const item of prItems) {
      const pid = Number(item.productId ?? item.product_id);
      const requested = Number(item.qty ?? item.quantity ?? 0);
      const allocatedQty = allocated.get(pid) || 0;
      if (requested > allocatedQty) return true; // found remaining quantity
    }
    return false;
  };

  let filtered = approvedPRs.value.filter(hasOpenItems);

  // Apply search filter
  if (prSearchQuery.value.trim()) {
    const query = prSearchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(pr => {
      const prNumber = (pr.pr_number || '').toLowerCase();
      const requester = (pr.requester_name || '').toLowerCase();
      const department = (pr.department || '').toLowerCase();
      return prNumber.includes(query) || requester.includes(query) || department.includes(query);
    });
  }

  // Sort: PRs with more open items first, then by oldest date
  const openCount = (pr: any) => {
    let prItems: Array<any> = [];
    try {
      const parsed = JSON.parse(pr?.notes || '{}');
      prItems = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      prItems = [];
    }
    const allocated = prAllocationMap.value.get(Number(pr.id)) || new Map<number, number>();
    return prItems.reduce((acc, it) => {
      const pid = Number(it.productId ?? it.product_id);
      const requested = Number(it.qty ?? it.quantity ?? 0);
      const allocatedQty = allocated.get(pid) || 0;
      return acc + (requested > allocatedQty ? 1 : 0);
    }, 0);
  };

  return filtered.sort((a, b) => {
    const diff = openCount(b) - openCount(a);
    if (diff !== 0) return diff;
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return aDate - bDate;
  });
});

// Helper for template: get remaining item count per PR
function getOpenItemCount(pr: any): number {
  let prItems: Array<any> = [];
  try {
    const parsed = JSON.parse(pr?.notes || '{}');
    prItems = Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    prItems = [];
  }
  const allocated = prAllocationMap.value.get(Number(pr.id)) || new Map<number, number>();
  return prItems.reduce((acc, it) => {
    const pid = Number(it.productId ?? it.product_id);
    const requested = Number(it.qty ?? it.quantity ?? 0);
    const allocatedQty = allocated.get(pid) || 0;
    return acc + (requested > allocatedQty ? 1 : 0);
  }, 0);
}

const selectedPRDisplay = computed(() => {
  if (!form.value.pr_id) return '';
  const pr = approvedPRs.value.find(p => p.id === form.value.pr_id);
  return pr ? `${pr.pr_number} - ${pr.requester_name} (${pr.department})` : '';
});

// Track filtered vendors based on product availability in vendor_prices table
const filteredVendorsList = ref<any[]>([]);
// Penyaring vendor yang GAGAL dimuat harus terlihat: tanpa ini daftar
// jatuh ke seluruh vendor dan penggunanya mengira semuanya memang memasok
// barang yang dipilih.
const gagalSaringVendor = ref('');

// Filter vendors yang punya pricing untuk semua items yang dipilih
const filteredVendors = computed(() => {
  if (formItems.value.length === 0) {
    // Jika belum ada items, tampilkan semua vendors
    return vendors.value;
  }
  
  // Use the filtered list from API
  return filteredVendorsList.value.length > 0 ? filteredVendorsList.value : vendors.value;
});

// Watch formItems to update filtered vendors from backend
watch(
  () => formItems.value,
  async (newItems) => {
    if (newItems.length === 0) {
      filteredVendorsList.value = [];
      return;
    }
    
    try {
      // Get product IDs from items
      const productIds = [...new Set(newItems.map(item => item.product_id).filter(Boolean))];
      
      if (productIds.length === 0) {
        filteredVendorsList.value = [];
        return;
      }
      
      // SATU panggilan, bukan satu per produk. Versi sebelumnya memanggil
      // /vendors-for-product/:id berurutan untuk tiap item PO — pola N+1 yang
      // sama dengan PROC-N1-01, dan endpoint batch-nya sudah ada sejak itu.
      //
      // Irisan "vendor yang punya SEMUA produk" diturunkan dari matched_items:
      // vendor yang cocok untuk seluruh produk yang diminta punya
      // matched_items === jumlah produknya.
      const res = await api.get(
        `/procurement/vendors-for-items?product_ids=${productIds.join(',')}`);
      const baris = res.data?.data || [];
      const punyaSemua = new Set(
        baris.filter((r: any) => Number(r.matched_items) === productIds.length)
             .map((r: any) => Number(r.id)));
      filteredVendorsList.value = vendors.value.filter(v => punyaSemua.has(Number(v.id)));
      gagalSaringVendor.value = '';
    } catch (err: any) {
      // Backend kini membalas 500 kalau query-nya gagal, bukan daftar kosong.
      // Daftarnya dikosongkan supaya `filteredVendors` jatuh ke SELURUH vendor —
      // penggunanya tidak terhalang — tapi ia harus tahu penyaringnya tidak
      // berlaku, kalau tidak ia mengira semua vendor itu memang memasok
      // barangnya.
      console.error('Gagal menyaring vendor per produk:', err);
      filteredVendorsList.value = [];
      gagalSaringVendor.value = err?.response?.data?.error
        || 'Penyaring vendor per produk gagal dimuat — daftar di bawah menampilkan SEMUA vendor, belum tersaring.';
    }
  },
  { deep: true }
);

function calcLineTotal(item: any): number {
  const qty = parseFloat(String(item.quantity || 0)) || 0;
  const unitPrice = parseFloat(String(item.unit_price || 0)) || 0;
  return qty * unitPrice;
}

onMounted(async () => {
  await fetchData();
  // Auto-open Create PO modal if pr_id is passed via URL query param
  const prIdFromQuery = route.query.pr_id ? Number(route.query.pr_id) : null;
  if (prIdFromQuery) {
    const pr = approvedPRs.value.find((p: any) => p.id === prIdFromQuery);
    if (pr) {
      openCreateModal(true); // bypass check since we came from URL
      await selectPR(pr);
    } else {
      // PR might not be in approved list (not approved yet or no bid)
      console.warn('[PO] PR', prIdFromQuery, 'not found in approved PRs list');
    }
  }
});

watch(
  () => form.value.vendor_id,
  async (newVendorId) => {
    if (!newVendorId) {
      form.value.address = '';
      form.value.contact_person = '';
      return;
    }
    
    try {
      const vendorRes = await api.get(`/procurement/vendors/${newVendorId}`);
      const vendor = vendorRes.data.data || {};
      form.value.address = vendor.address || '';
      form.value.contact_person = vendor.contact || '';
      
      // Auto-populate lead times from vendor prices for each item
      if (formItems.value.length > 0) {
        for (const item of formItems.value) {
          try {
            const pricingRes = await api.get(`/procurement/vendor-price-details/${newVendorId}/${item.product_id}`);
            const pricing = pricingRes.data.data;
            if (pricing) {
              item.lead_time_days = pricing.lead_time_days || null;
              if (!item.unit_price || item.unit_price === 0) {
                item.unit_price = pricing.price || 0;
              }
            }
          } catch (err) {
            console.warn(`No pricing for vendor ${newVendorId} and product ${item.product_id}`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch vendor details:', err);
    }
  }
);

watch(
  () => form.value.pr_id,
  async (newPrId) => {
    // Skip loadPRItems when viewing/editing existing PO — items already loaded from API
    if (isEditing.value) return;
    if (newPrId) {
      await loadPRItems();
      // Auto-inherit project_id from selected PR
      const pr = approvedPRs.value.find(p => p.id === newPrId);
      if (pr?.project_id && !form.value.project_id) {
        form.value.project_id = pr.project_id;
      }
    }
  }
);

// Load RAB items when project changes
watch(
  () => form.value.project_id,
  (newProjectId) => fetchRabItems(newProjectId)
);

async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    // PROC-N1-01: enam permintaan, bukan seratus lima puluh lima.
    //
    // Dulu layar ini memanggil `/purchase-requests/:id/bid-progress` sekali per
    // PR yang disetujui (54 di produksi) dan `/purchase-orders/:id` sekali per
    // PO (97) — semuanya paralel, di atas 4 permintaan dasar. Batas rate limit
    // 300 permintaan/menit habis hanya dengan membuka layar ini dua kali, dan
    // yang terlihat pengguna adalah 429 pada tombol Approve, seolah approval-nya
    // yang rusak. Angkanya sekarang dihitung di database.
    const [posRes, prsRes, vendorsRes, projRes, progressRes, allocRes] = await Promise.all([
      api.get('/procurement/purchase-orders'),
      api.get('/procurement/purchase-requests'),
      api.get('/procurement/vendors'),
      api.get('/projects'),
      api.get('/procurement/purchase-requests/bid-progress-summary', { params: { approval_status: 2 } }),
      api.get('/procurement/purchase-orders/allocations'),
    ]);
    purchaseOrders.value = posRes.data.data || [];
    projects.value = (projRes.data || []).filter((p: any) => p.status !== 'completed' && p.status !== 'canceled');
    
    // Show all PRs that are fully approved (2/2); allow partial allocations across multiple POs
    const allPRs = prsRes.data.data || [];
    const allApproved = allPRs.filter((pr: any) => pr.approval_status === 2);
    
    const prBidProgressMap = new Map<number, any>(
      Object.entries(progressRes.data?.data || {}).map(([id, v]) => [Number(id), v])
    );
    
    // Show PRs that have at least some bidding data (1+ items with price)
    approvedPRs.value = allApproved.filter((pr: any) => {
      const progress = prBidProgressMap.get(pr.id);
      return progress && progress.percentage > 0;
    });
    
    // Sisa alokasi per (PR, produk). Bentuk Map bersarangnya sengaja
    // dipertahankan persis seperti dulu supaya seluruh pembacanya di berkas ini
    // tidak perlu ikut diubah.
    prAllocationMap.value = new Map(
      Object.entries(allocRes.data?.data || {}).map(([prId, produk]) => [
        Number(prId),
        new Map<number, number>(
          Object.entries(produk as Record<string, any>).map(([pid, qty]) => [Number(pid), Number(qty || 0)])
        ),
      ])
    );

    vendors.value = vendorsRes.data.data || [];
    console.log('Vendors loaded:', vendors.value);
    
    if (vendors.value.length === 0) {
      console.warn('⚠️ No vendors found! Check database or API.');
    }
  } catch (err: any) {
    console.error('Error fetching data:', err);
    error.value = err.response?.data?.error || 'Failed to load data';
  } finally {
    loading.value = false;
  }
}

async function loadPRItems() {
  if (!form.value.pr_id) {
    formItems.value = [];
    prVerificationItems.value = [];
    selectedPR.value = null;
    return;
  }
  
  try {
    const res = await api.get(`/procurement/purchase-requests/${form.value.pr_id}`);
    const pr = res.data.data;
    selectedPR.value = pr;
    
    if (pr.selected_vendor_id) {
      form.value.vendor_id = pr.selected_vendor_id;
    }
    
    // Parse notes to get items (same format as PR)
    const notesData = JSON.parse(pr.notes || '{}');
    const items = notesData.items || [];
    // PROC-N1-01: sisa alokasi dihitung di database, bukan dengan mengambil
    // daftar PO lengkap lalu detail satu per satu. Angkanya berasal dari query
    // yang sama dengan yang dipakai daftar PO, jadi kedua layar tidak bisa
    // berselisih soal "berapa yang sudah dipesan".
    const allocatedQtyMap = new Map<number, number>();
    try {
      const allocRes = await api.get('/procurement/purchase-orders/allocations');
      const perProduk = (allocRes.data?.data || {})[String(form.value.pr_id)] || {};
      for (const [pid, qty] of Object.entries(perProduk as Record<string, any>)) {
        allocatedQtyMap.set(Number(pid), Number(qty || 0));
      }
    } catch (e) {
      console.warn('Failed to load PO allocations', e);
    }

    // Prepare verification items for manual selection
    const verification = items.map((item: any, idx: number) => {
      const pid = item.productId || item.product_id || null;
      const requested = Number(item.qty || item.quantity || 0);
      const allocatedQty = allocatedQtyMap.get(Number(pid)) || 0;
      const remaining = Math.max(requested - allocatedQty, 0);
      const isAllocated = remaining === 0 && requested > 0;
      return {
        product_id: pid,
        productName: item.productName || item.name || '',
        quantity: remaining,
        requested_qty: requested,
        allocated_qty: Math.min(allocatedQty, requested),
        _originalAllocated: Math.min(allocatedQty, requested),
        remaining_qty: remaining,
        rcv_qty: 0,
        uom: item.uom || '',
        unit_price: item.price || 0,
        bid_unit_price: 0,      // will be filled from bid winner
        bid_vendor_name: '',    // which vendor won this item
        from_bid: false,
        _item_index: idx,
        remark: '',
        notes: '',
        isAllocated: isAllocated,
        status: isAllocated ? 'allocated' : (remaining > 0 ? 'open' : 'closed'),
      };
    });

    // --- Auto-fill unit prices from per-item bid winners ---
    try {
      const bidsRes = await api.get(`/procurement/purchase-requests/${form.value.pr_id}/bids`);
      const bids = bidsRes.data.data || [];
      // Build item_index → winning price/vendor map
      const winnerPriceMap = new Map<number, { price: number; vendor_name: string; vendor_id: number }>();
      for (const bid of bids) {
        const bidItems = bid.items || [];
        for (const bi of bidItems) {
          if (bi.is_winner && Number(bi.unit_price) > 0) {
            winnerPriceMap.set(Number(bi.item_index), {
              price: Number(bi.unit_price),
              vendor_name: bid.vendor_name || bid.registered_vendor_name || '',
              vendor_id: bid.vendor_id || 0,
            });
          }
        }
      }
      // Build winner vendor map: item_index → vendor_id (for filtering auto-add)
      const winnerVendorMap = new Map<number, number>(); // item_index → vendor_id
      for (const bid of bids) {
        const bidItems = bid.items || [];
        for (const bi of bidItems) {
          if (bi.is_winner) {
            winnerVendorMap.set(Number(bi.item_index), bid.vendor_id || 0);
          }
        }
      }
      // Apply prices to verification items and mark winner vendor
      for (const vi of verification) {
        const w = winnerPriceMap.get(vi._item_index);
        const winVendorId = winnerVendorMap.get(vi._item_index);
        if (w && w.price > 0) {
          vi.unit_price = w.price;
          vi.bid_unit_price = w.price;
          vi.bid_vendor_name = w.vendor_name;
          vi.from_bid = true;
        }
        vi._winner_vendor_id = winVendorId || null; // store for auto-add filtering
      }

      // Set verification items
      prVerificationItems.value = verification;

      // AUTO-ADD: only items where this vendor won the bid
      formItems.value = [];
      const selectedVendorId = form.value.vendor_id ? Number(form.value.vendor_id) : null;
      for (const vi of verification) {
        if (vi.isAllocated || vi.remaining_qty <= 0) continue;
        // If vendor is selected and bids exist, only add items where this vendor won
        if (selectedVendorId && winnerVendorMap.size > 0) {
          if (vi._winner_vendor_id === selectedVendorId) addItemToPO(vi);
        } else {
          // No vendor selected yet or no bid data — add all open items
          addItemToPO(vi);
        }
      }

    } catch { /* no bids yet — all items added above */ }

    // Build PR summary showing all items with allocation status
    prSummary.value = items.map((item: any) => {
      const pid = item.productId || item.product_id || null;
      const requested = Number(item.qty || item.quantity || 0);
      const allocatedQty = allocatedQtyMap.get(Number(pid)) || 0;
      const remaining = Math.max(requested - allocatedQty, 0);
      return {
        product_id: pid,
        productName: item.productName || item.name || '',
        requested,
        allocated: Math.min(allocatedQty, requested),
        remaining,
      };
    });
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load PR items';
  }
}

async function fetchRabItems(projectId: number | null) {
  if (!projectId) { rabItems.value = []; return; }
  try {
    const res = await api.get(`/projects/${projectId}/rab`);
    // Flatten: array of disciplines, each with flat items list
    const discs = res.data.disciplines || [];
    rabItems.value = discs.map((d: any) => ({
      id: d.id,
      name: d.name,
      items: (d.sub_disciplines || []).flatMap((sd: any) =>
        (sd.items || []).filter((i: any) => !i.is_section)
      ),
    })).filter((d: any) => d.items.length > 0);
  } catch {
    rabItems.value = [];
  }
}

function addItemToPO(item: any) {
  // Add the selected item to formItems array
  const newItem = {
    product_id: item.product_id,
    productName: item.productName,
    quantity: item.remaining_qty,
    requested_qty: item.requested_qty,
    allocated_qty: item.allocated_qty,
    remaining_qty: item.remaining_qty,
    rcv_qty: 0,
    uom: item.uom,
    unit_price: item.unit_price || 0,      // pre-filled from bid if available
    bid_unit_price: item.bid_unit_price || 0,
    bid_vendor_name: item.bid_vendor_name || '',
    from_bid: item.from_bid || false,
    remark: '',
    notes: '',
    isAllocated: false,
    lead_time_days: null as number | null,
    proposal_item_id: null as number | null,
  };
  
  // If vendor is already selected, load pricing details
  if (form.value.vendor_id) {
    api.get(`/procurement/vendor-price-details/${form.value.vendor_id}/${item.product_id}`)
      .then(res => {
        const pricing = res.data.data;
        if (pricing) {
          newItem.unit_price = pricing.price || newItem.unit_price;
          newItem.lead_time_days = pricing.lead_time_days || null;
        }
      })
      .catch(_err => console.warn(`No pricing for vendor ${form.value.vendor_id} and product ${item.product_id}`));
  }
  
  formItems.value.push(newItem);

  // Sync PR verification table to reflect local allocation
  syncVerificationFromFormItems();
}

// Recalculate prVerificationItems when user changes qty in formItems
function onItemQtyChange(item: any) {
  // Clamp to valid range
  if (item.quantity < 0) item.quantity = 0;
  
  // Recalculate verification table from formItems
  syncVerificationFromFormItems();
}

// Sync prVerificationItems allocation state from formItems
function syncVerificationFromFormItems() {
  for (const vItem of prVerificationItems.value) {
    const pid = vItem.product_id;
    // Sum of all qty in formItems for this product
    const localQty = formItems.value
      .filter((fi: any) => fi.product_id === pid)
      .reduce((sum: number, fi: any) => sum + (Number(fi.quantity) || 0), 0);
    
    // Original server-side allocated qty (stored when PR was first loaded)
    const serverAllocated = vItem._originalAllocated ?? 0;
    vItem.allocated_qty = serverAllocated + localQty;
    vItem.remaining_qty = Math.max((vItem.requested_qty || 0) - vItem.allocated_qty, 0);
    vItem.isAllocated = vItem.remaining_qty === 0;
    vItem.status = vItem.isAllocated ? 'allocated' : (vItem.remaining_qty > 0 ? 'open' : 'closed');
  }

  // Also sync prSummary
  for (const sItem of prSummary.value) {
    const pid = sItem.product_id;
    const localQty = formItems.value
      .filter((fi: any) => fi.product_id === pid)
      .reduce((sum: number, fi: any) => sum + (Number(fi.quantity) || 0), 0);
    const vItem = prVerificationItems.value.find((v: any) => v.product_id === pid);
    const serverAllocated = vItem?._originalAllocated ?? 0;
    sItem.allocated = serverAllocated + localQty;
    sItem.remaining = Math.max((sItem.requested || 0) - sItem.allocated, 0);
  }
}

// ── Reset all AI / search panel state ─────────────────────────────────────────
function resetAIState() {
  aiChecking.value = false;
  aiPanelVisible.value = false;
  aiResult.value = null;
  aiError.value = null;
  aiTargetItem.value = null;
  aiSearchQuery.value = '';
  advisorPanelVisible.value = false;
  advisorLoading.value = false;
  advisorError.value = null;
  advisorResult.value = null;
  manualSearchVisible.value = false;
  manualSearchQuery.value = '';
  manualSearchLoading.value = false;
  manualSearchResults.value = [];
  manualSearchTargetItem.value = null;
}

function openCreateModal(bypassCheck?: boolean) {
  if (!bypassCheck && approvedPRs.value.length === 0) {
    alert('Tidak ada PR yang sudah approved 2/2. Buat dan approve PR terlebih dahulu.');
    return;
  }
  
  resetAIState();
  showModal.value = true;
  isEditing.value = false;
  const today = new Date().toISOString().slice(0, 10);
  form.value = {
    po_number: '',
    po_date: today,
    expected_date: '',
    currency: 'IDR',
    payment_term: '',
    payment_term_2: '',
    address: '',
    type: 'Local',
    vendor_id: null,
    item_type: 'inventory',
    contact_person: '',
    delivery_to: '',
    pr_id: null,
    project_id: null,
    advance_payment: 0,
    discount_value: 0,
    ppn_percent: 11,
    notes: '',
  };
  formItems.value = [];
  paymentSchedules.value = [];
  selectedPR.value = null;
}

function closeModal() {
  showModal.value = false;
  formItems.value = [];
  paymentSchedules.value = [];
  selectedPR.value = null;
  currentPO.value = null;
  isEditing.value = false;
  editModeEnabled.value = false;
  prSearchQuery.value = '';
  resetAIState();
}

  async function selectPR(pr: any) {
    form.value.pr_id = pr.id;
    prDropdownOpen.value = false;
    await loadPRItems();
    
    // Auto-fill from bid winner
    try {
      const winnerRes = await api.get(`/procurement/purchase-requests/${pr.id}/bid-winner`);
      const data = winnerRes.data;
      if (data.has_winner && data.winner) {
        // Auto-set vendor
        form.value.vendor_id = data.winner.vendor_id;
        
        // Auto-fill prices from winner bid items
        if (data.items && data.items.length > 0) {
          for (const winItem of data.items) {
            const matchingFormItem = formItems.value.find((fi: any) => 
              fi.name === winItem.item_name || fi.product_name === winItem.item_name
            );
            if (matchingFormItem && winItem.unit_price > 0) {
              matchingFormItem.unit_price = winItem.unit_price;
            }
          }
        }
        
        // Show info
        const msg = `✅ Vendor pemenang bidding: ${data.winner.vendor_name}\nHarga otomatis terisi dari hasil bidding.`;
        alert(msg);
      }
    } catch { /* no winner, user picks manually */ }

    // Auto-fill expected_date from PR needed_date if available
    if (pr.needed_date && !form.value.expected_date) {
      form.value.expected_date = pr.needed_date.slice(0, 10);
    }
  }

function enableEditMode() {
  editModeEnabled.value = true;
}

async function submitPO() {
  if (!form.value.pr_id || !form.value.vendor_id) {
    alert('PR dan Vendor harus dipilih');
    return;
  }
  
  if (formItems.value.length === 0) {
    alert('Tidak ada items untuk PO. Pilih item dari PR terlebih dahulu.');
    return;
  }

  // Check if all items are already fully allocated
  const validItems = formItems.value.filter(item => !item.isAllocated && (item.quantity || 0) > 0);
  if (validItems.length === 0) {
    alert('Semua item dari PR ini sudah teralokasi ke PO lain. Tidak ada sisa qty yang bisa di-PO-kan.');
    return;
  }
  
  submitting.value = true;
  error.value = '';
  successMsg.value = '';
  
  try {
    const payload = {
      pr_id: form.value.pr_id,
      project_id: form.value.project_id,
      vendor_id: form.value.vendor_id,
      po_date: form.value.po_date,
      expected_date: form.value.expected_date || null,
      currency: form.value.currency,
      payment_term: form.value.payment_term,
      payment_term_2: form.value.payment_term_2,
      address: form.value.address,
      type: form.value.type,
      contact_person: form.value.contact_person,
      delivery_to: form.value.delivery_to,
      advance_payment: form.value.advance_payment || 0,
      discount_percent: 0,
      discount_amount: discountAmount.value,
      ppn_percent: form.value.ppn_percent || 0,
      notes: JSON.stringify({
        item_type: form.value.item_type,
        user_notes: form.value.notes || '',
        sub_total: subTotal.value,
        discount_percent: 0,
        discount_amount: discountAmount.value,
        ppn_amount: ppnAmount.value,
        contract_total: contractTotal.value,
        grand_total: grandTotal.value,
        advance_payment_percent: form.value.advance_payment || 0,
        advance_payment_amount: advancePaymentAmount.value,
        sisa_tagihan: grandTotal.value - advancePaymentAmount.value,
      }),
      payment_schedules: paymentSchedulePreview.value,
      status: 'submitted',
      items: formItems.value
        .filter(item => !item.isAllocated && (item.quantity || 0) > 0)
        .map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          uom: item.uom,
          unit_price: item.unit_price || 0,
          currency: form.value.currency,
          // Preserve item name in notes when no product_id (bid-generated items)
          notes: item.product_id ? (item.remark || '') : (item.productName || item.remark || ''),
          proposal_item_id: item.proposal_item_id || null,
        })),
    };
    
    if (isEditing.value && currentPO.value?.id) {
      console.log('Updating PO ID:', currentPO.value.id);
      await api.put(`/procurement/purchase-orders/${currentPO.value.id}`, payload);
      successMsg.value = 'Purchase Order updated successfully!';
    } else {
      console.log('Creating new PO');
      await api.post('/procurement/purchase-orders', payload);
      successMsg.value = 'Purchase Order created successfully!';
    }
    closeModal();
    fetchData();
  } catch (err: any) {
    const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Gagal membuat PO. Coba lagi.';
    error.value = errMsg;
    alert('❌ Error: ' + errMsg);
  } finally {
    submitting.value = false;
  }
}

async function viewPO(po: any) {
  resetAIState();
  try {
    const res = await api.get(`/procurement/purchase-orders/${po.id}`);
    const poData = res.data.data;
    
    currentPO.value = poData;
    
    form.value = {
      po_number: poData.po_number || '',
      po_date: dateOnly(poData.po_date),
      expected_date: dateOnly(poData.expected_date),
      currency: poData.currency || 'IDR',
      payment_term: poData.payment_term || '',
      payment_term_2: poData.payment_term_2 || '',
      address: poData.address || '',
      type: poData.type || 'Local',
      vendor_id: poData.vendor_id,
      item_type: 'inventory',
      contact_person: poData.contact_person || '',
      delivery_to: poData.delivery_to || '',
      pr_id: poData.pr_id,
      project_id: poData.project_id || null,
      advance_payment: Number(poData.advance_payment) || 0,
      discount_value: Number((poData as any).discount_amount ?? (poData as any).discount_percent ?? 0) || 0,
      ppn_percent: poData.ppn_percent !== null && poData.ppn_percent !== undefined ? Number(poData.ppn_percent) : 11,
      notes: '',
    };

    const parsedNotes = (() => {
      try {
        return JSON.parse(poData.notes || '{}');
      } catch {
        return {} as any;
      }
    })();
    form.value.notes = parsedNotes.user_notes || '';
    
    formItems.value = (poData.items || []).map((item: any) => ({
      product_id: item.product_id,
      productName: item.product_name || item.item_name || item.notes || '',
      quantity: item.quantity,
      uom: item.uom,
      unit_price: item.unit_price,
      notes: item.notes || '',
    }));
    paymentSchedules.value = poData.payment_schedules || [];
    
    // Always set isEditing to true when viewing existing PO (read-only by default)
    isEditing.value = true;
    showModal.value = true;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load PO';
  }
}

async function approvePO(id: number) {
  if (!confirm('Approve PO? Pastikan semua data sudah benar.')) return;
  
  submitting.value = true;
  error.value = '';
  successMsg.value = '';
  
  try {
    const res = await api.post(`/procurement/purchase-orders/${id}/approve`);
    successMsg.value = res.data?.message || 'PO approved successfully!';
  } catch (err: any) {
    console.error('Approve PO error:', err);
    const errMsg = err.response?.data?.error || 'Failed to approve PO';
    error.value = errMsg;
    alert(errMsg);
  } finally {
    submitting.value = false;
    try { await fetchData(); } catch { /* ignore */ }
  }
}

async function rejectPO(id: number) {
  if (!confirm('Reject dan kembalikan PO ke pending?')) return;
  
  submitting.value = true;
  error.value = '';
  successMsg.value = '';
  
  try {
    const res = await api.post(`/procurement/purchase-orders/${id}/reject`);
    successMsg.value = res.data?.message || 'PO rejected and reset to pending!';
  } catch (err: any) {
    console.error('Reject PO error:', err);
    const errMsg = err.response?.data?.error || 'Failed to reject PO';
    error.value = errMsg;
    alert(errMsg);
  } finally {
    submitting.value = false;
    try { await fetchData(); } catch { /* ignore */ }
  }
}

async function handleDeletePO(id: number) {
  if (!confirm('Delete this PO? This action cannot be undone.')) return;
  
  submitting.value = true;
  error.value = '';
  successMsg.value = '';
  
  try {
    await api.delete(`/procurement/purchase-orders/${id}`);
    successMsg.value = 'PO deleted successfully!';
  } catch (err: any) {
    console.error('Delete PO error:', err);
    const errMsg = err.response?.data?.error || 'Failed to delete PO';
    error.value = errMsg;
    alert(errMsg);
  } finally {
    submitting.value = false;
    try { await fetchData(); } catch { /* ignore */ }
  }
}

function approvalLabel(po: any): string {
  const status = po.approval_status || 0;
  if (status === 0) return 'Pending (0/2)';
  if (status === 1) return 'Supervisor ✓ (1/2)';
  if (status === 2) return 'Approved (2/2)';
  return 'Unknown';
}

function approvalBadgeClass(po: any): string {
  const status = po.approval_status || 0;
  if (status === 0) return 'bg-yellow-100 text-yellow-800';
  if (status === 1) return 'bg-blue-100 text-blue-800';
  if (status === 2) return 'bg-green-100 text-green-800';
  return 'bg-gray-100 text-gray-800';
}

function formatDate(date: string | null): string {
  if (!date) return '-';
  try { return new Date(date).toLocaleDateString('id-ID'); } catch { return '-'; }
}


const dateOnly = (v?: string | null) => v ? v.split('T')[0] : '';


function deriveScheduleDueDate(paymentTerm: string, poDate: string, expectedDate: string): string {
  const baseDate = expectedDate || poDate || new Date().toISOString().slice(0, 10);
  const normalized = (paymentTerm || '').toLowerCase();
  const date = new Date(baseDate);

  if (normalized.includes('net 60')) date.setDate(date.getDate() + 60);
  else if (normalized.includes('net 45') || normalized.includes('1.5 month')) date.setDate(date.getDate() + 45);
  else if (normalized.includes('net 30')) date.setDate(date.getDate() + 30);

  return date.toISOString().slice(0, 10);
}

// function formatTrigger(trigger: string): string {
//   if (trigger === 'po_approved') return 'PO Approved';
//   if (trigger === 'goods_received') return 'Goods Received';
//   return trigger || 'Manual';
// }

// function scheduleStatusClass(status: string) {
//   if (status === 'paid') return 'bg-green-100 text-green-800';
//   if (status === 'partial') return 'bg-yellow-100 text-yellow-800';
//   if (status === 'overdue') return 'bg-red-100 text-red-800';
//   return 'bg-blue-100 text-blue-800';
// }

function formatItemsDescription(description: string | null): string {
  if (!description) return '-';
  // Split by '|' separator from backend GROUP_CONCAT and clean up whitespace
  return description
    .split('|')
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .join('\n');
}



function formatNumberInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('id-ID').format(value);
}

function parseNumberInput(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function onItemMoneyInput(item: any, key: 'unit_price' | 'nett_price' | 'disc_price', event: Event) {
  const target = event.target as HTMLInputElement;
  const num = parseNumberInput(target.value);
  item[key] = num;
  target.value = formatNumberInput(num);
}

// function onAdvancePaymentInput — removed, advance payment now uses v-model % input

function printPO() {
  const printContent = `
    <html>
      <head>
        <title>Purchase Order - ${form.value.po_number}</title>
        <style>
          body { font-family: 'Arial', sans-serif; margin: 20px; font-size: 11px; color: #000; }
          * { box-sizing: border-box; }
          .page-border { border: 2px solid #000; padding: 2px; }
          .inner-border { border: 2px solid #000; display: flex; flex-direction: column; min-height: 95vh; }
          
          /* Header area */
          .header-container { display: flex; border-bottom: 2px solid #000; }
          .header-left { width: 45%; padding: 5px; border-right: 2px solid #000; display: flex; flex-direction: column; justify-content: space-between;}
          .header-middle { width: 15%; padding: 5px; border-right: 2px solid #000; font-size: 10px; }
          .header-right { width: 40%; padding: 10px; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start;}
          
          .vendor-box { border: 1px solid #000; padding: 5px; min-height: 80px; margin-bottom: 5px; }
          
          .po-title { font-size: 18px; font-weight: bold; margin-bottom: 5px; letter-spacing: 1px; }
          .po-meta { text-align: right; margin-bottom: 15px; }
          .po-meta strong { font-size: 13px; }
          
          .checkbox-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
          .checkbox { width: 12px; height: 12px; border: 1px solid #000; display: inline-block; text-align: center; line-height: 10px; font-weight: bold;}
          
          /* Terms area */
          .terms-area { padding: 5px; border-bottom: 2px solid #000; font-weight: bold; }
          .terms-area span { margin-right: 20px; }
          
          /* Main Table */
          .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .items-table th, .items-table td { border: 1px solid #000; padding: 4px; text-align: left; vertical-align: top; }
          .items-table th { text-align: center; font-weight: bold; }
          .items-table tr th:nth-child(1) { width: 5%; border-left: none;}
          .items-table tr th:nth-child(2) { width: 10%; }
          .items-table tr th:nth-child(3) { width: 45%; }
          .items-table tr th:nth-child(4) { width: 10%; text-align: center;}
          .items-table tr th:nth-child(5) { width: 15%; text-align: right;}
          .items-table tr th:nth-child(6) { width: 15%; text-align: right; border-right: none;}
          
          .items-table td:nth-child(1) { text-align: center; border-left: none; }
          .items-table td:nth-child(4) { text-align: center; }
          .items-table td:nth-child(5), .items-table td:nth-child(6) { text-align: right; }
          
          /* Min height for items area to push totals down */
          .items-wrapper { flex: 1; border-bottom: 2px solid #000; min-height: 300px; display: flex; flex-direction: column; }
          .items-table { border-bottom: none; }
          .items-table td { border-bottom: none; border-top: none; }
          
          /* Totals area */
          .bottom-container { display: flex; border-bottom: 2px solid #000; }
          .bottom-left { width: 50%; border-right: 2px solid #000; display: flex; flex-direction: column; }
          .bottom-right { width: 50%; }
          
          /* Bottom left grid */
          .info-grid { display: flex; flex-wrap: wrap; width: 100%; }
          .info-row { display: flex; width: 100%; border-bottom: 1px solid #000; }
          .info-row:last-child { border-bottom: none; }
          .info-label { width: 30%; border-right: 1px solid #000; padding: 4px; font-weight: bold; }
          .info-value { width: 70%; padding: 4px; }
          
          .bank-box { border-bottom: 1px solid #000; padding: 4px; text-align: center; font-weight: bold; }
          
          /* Totals Grid */
          .totals-grid { display: flex; flex-direction: column; width: 100%; height: 100%; justify-content: flex-end;}
          .total-row { display: flex; justify-content: flex-end; padding: 2px 5px; }
          .total-label { width: 30%; font-weight: bold; }
          .total-percent { width: 15%; text-align: right; font-weight: bold;}
          .total-curr { width: 10%; text-align: center; font-weight: bold;}
          .total-val { width: 35%; text-align: right; font-weight: bold;}
          
          .highlight-dp { background-color: #ffeb3b; }
          .highlight-bp { background-color: #90caf9; }
          
          /* Signatures */
          .signatures { display: flex; text-align: center; font-size: 10px; }
          .signatures > div { flex: 1; padding: 10px 5px; border-right: 1px solid #000; }
          .signatures > div:last-child { border-right: none; }
          .sig-line { border-bottom: 1px solid #000; margin-top: 30px; margin-bottom: 5px; }
          
          .ack-section { border-top: 2px solid #000; padding: 10px; display: flex; }
          .ack-left { width: 50%; font-size: 9px; font-style: italic; }
          .ack-right { width: 50%; font-weight: bold; text-align: right; padding-top: 30px;}
          .form-line { display: flex; margin-bottom: 5px; }
          .form-line-label { width: 50px; font-weight: bold; }
          .form-line-input { flex: 1; border-bottom: 1px solid #000; }
          
          /* Page Footer */
          .page-footer { text-align: center; font-weight: bold; font-size: 9px; border-top: 2px solid #000; padding: 3px; }
        </style>
      </head>
      <body>
        <div class="page-border">
          <div class="inner-border">
            
            <!-- Header -->
            <div class="header-container">
              <div class="header-left">
                <div class="vendor-box">
                  <strong>To:</strong><br/>
                  <div style="padding-left: 20px; font-weight: bold; font-size: 13px;">${vendors.value.find(v => v.id === form.value.vendor_id)?.name || '-'}</div>
                  <div style="padding-left: 20px; margin-bottom: 10px;">${form.value.address || '-'}</div>
                </div>
                <div>
                  <strong>Attn.: ${form.value.contact_person || '-'}</strong><br/>
                  Tel/WA : -
                </div>
              </div>
              
              <div class="header-middle">
                <div class="checkbox-row"><span>Indirect</span> <span class="checkbox"></span></div>
                <div class="checkbox-row"><span>Services</span> <span class="checkbox"></span></div>
                <div class="checkbox-row"><span>Purchase</span> <span class="checkbox">X</span></div>
                <div class="checkbox-row"><span>Assets</span> <span class="checkbox"></span></div>
              </div>
              
              <div class="header-right">
                <div class="po-title">PURCHASE ORDER</div>
                <div class="po-meta">
                  <i>No.</i> <strong>${form.value.po_number}</strong><br/>
                  Date &nbsp; ${formatDate(form.value.po_date)}
                </div>
                <!-- Logo -->
                <div style="font-size: 24px; font-weight: 900; color: #64748b; letter-spacing: -1px; margin-top: auto; padding-right: 5px;">Rhe<span style="color: #3b82f6;">o</span>logi</div>
                <div style="font-size: 10px; font-weight: bold; color: #3b82f6; padding-right: 5px;">INDONESIA</div>
              </div>
            </div>
            
            <!-- Terms -->
            <div class="terms-area">
              Term and Condition :<br/>
              <span style="font-weight: normal;">i) Delivery Terms : ${form.value.delivery_to || '-'}</span><br/>
              <span style="font-weight: normal;">ii) Payment : ${form.value.payment_term || '-'}</span>
            </div>
            
            <!-- Items Table -->
            <div class="items-wrapper">
              <table class="items-table">
                <thead>
                  <tr style="border-bottom: 2px solid #000;">
                    <th>NO</th>
                    <th>Quantity</th>
                    <th>Particulars</th>
                    <th>USED TO</th>
                    <th>Unit Price (${form.value.currency})</th>
                    <th>Amount (${form.value.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  ${formItems.value
                    .map(
                      (item, idx) =>
                        '<tr>' +
                        '<td>' + (idx + 1) + '</td>' +
                        '<td>' + (item.quantity || 0) + ' <i style="font-size:10px">' + (item.uom || '-') + '</i></td>' +
                        '<td><strong>' + (item.productName || '-') + '</strong><br/><span style="font-size:9px">' + (item.notes || '') + '</span></td>' +
                        '<td>-</td>' +
                        '<td>' + formatCurrency(item.unit_price || 0) + '</td>' +
                        '<td>' + formatCurrency(calcLineTotal(item)) + '</td>' +
                        '</tr>'
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            
            <!-- Totals and PR Info -->
            <div class="bottom-container">
              <div class="bottom-left">
                <div class="bank-box">
                  <div style="font-size: 9px; text-align: left;">COST CODE:</div>
                  BANK TRANSFER<br/>
                  -
                </div>
                <div class="info-grid">
                  <div class="info-row" style="background-color: #ffeb3b;">
                    <div class="info-label">PR NO./DATE</div>
                    <div class="info-value"><strong>${approvedPRs.value.find(p => p.id === form.value.pr_id)?.pr_number || '-'}</strong> / ${formatDate(form.value.po_date)}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">DELIVERY DATE</div>
                    <div class="info-value">${formatDate(form.value.expected_date)}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">DELIVERY TO</div>
                    <div class="info-value">${form.value.delivery_to || 'ASTON ANYER'}</div>
                  </div>
                </div>
              </div>
              
              <div class="bottom-right">
                <div class="totals-grid">
                  <div class="total-row">
                    <div class="total-label">Sub Total</div><div class="total-percent"></div><div class="total-curr">Rp</div><div class="total-val">${formatCurrency(subTotal.value).replace('Rp', '').trim()}</div>
                  </div>
                  <div class="total-row">
                    <div class="total-label">DISC</div><div class="total-percent"></div><div class="total-curr">Rp</div><div class="total-val">${formatCurrency(discountAmount.value).replace('Rp', '').trim()}</div>
                  </div>
                  <div class="total-row">
                    <div class="total-label">PPN</div><div class="total-percent">${form.value.ppn_percent}%</div><div class="total-curr">Rp</div><div class="total-val">${formatCurrency(ppnAmount.value).replace('Rp', '').trim()}</div>
                  </div>
                  <div class="total-row" style="font-size: 13px;">
                    <div class="total-label">GRAND TOTAL</div><div class="total-percent"></div><div class="total-curr">Rp</div><div class="total-val">${formatCurrency(grandTotal.value).replace('Rp', '').trim()}</div>
                  </div>
                  <div class="total-row highlight-dp">
                    <div class="total-label">DP</div><div class="total-percent">${form.value.advance_payment || 0}%</div><div class="total-curr">Rp</div><div class="total-val">${formatCurrency(advancePaymentAmount.value).replace('Rp', '').trim()}</div>
                  </div>
                  <div class="total-row highlight-bp">
                    <div class="total-label">BP</div><div class="total-percent">${100 - (form.value.advance_payment || 0)}%</div><div class="total-curr">Rp</div><div class="total-val">${formatCurrency(grandTotal.value - advancePaymentAmount.value).replace('Rp', '').trim()}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Signatures Grid -->
            <div class="signatures">
              <div style="width: 33%;">
                 <br/><br/>
                 <div style="text-align: left; padding-left: 10px;">
                    REQUESTED BY : <strong>AA</strong><br/>
                    PREPARED BY : <strong>GK</strong><br/>
                    CHECKED BY : <strong>ZN</strong>
                 </div>
              </div>
              <div style="width: 33%;">
                 INTL. | DATE
                 <div style="border-bottom: 1px solid #000; height: 15px; margin-top: 15px;"></div>
                 <div style="border-bottom: 1px solid #000; height: 15px; margin-top: 5px;"></div>
                 <div style="border-bottom: 1px solid #000; height: 15px; margin-top: 5px;"></div>
              </div>
              <div style="width: 34%;">
                 AUTHORISED BY :
                 <div class="sig-line"></div>
                 (Authorised Signatories Only)
              </div>
            </div>
            
            <!-- Acknowledge Section -->
            <div class="ack-section">
              <div class="ack-left">
                <div style="text-align: center; margin-bottom: 10px; font-weight: bold; font-style: normal; font-size: 10px;">PLEASE ACKNOWLEDGE RECEIPT AND FAX TO ORIGINATOR AT +628121611121</div>
                <div style="display: flex;">
                  <div style="width: 40%; padding-top: 10px;">
                    We hereby accept all the terms and conditions of this Purchase Order
                  </div>
                  <div style="width: 60%; padding-left: 10px;">
                    <div class="form-line"><div class="form-line-label">NAME</div><div class="form-line-input"></div></div>
                    <div class="form-line"><div class="form-line-label">TITLE</div><div class="form-line-input"></div></div>
                    <div class="form-line"><div class="form-line-label">DATE</div><div class="form-line-input"></div></div>
                  </div>
                </div>
              </div>
              <div class="ack-right">
                 <div style="border-top: 1px solid #000; width: 150px; margin-left: auto; text-align: center; font-size: 10px;">
                    SIGNATURE AND<br/>COMPANY STAMP
                 </div>
              </div>
            </div>
            
            <div class="page-footer">
              1. ORIGINAL: CLIENT &nbsp; 2. RED COPY: ACCOUNTING &nbsp; 3. YELLOW COPY: PURCHASING
            </div>
            
          </div>
        </div>
      </body>
    </html>
  `;
  
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  }
}

// ── AI Price Check functions ──────────────────────────────────────────────────
async function checkItemPrice(item: any) {
  aiTargetItem.value = item;
  aiPanelVisible.value = true;
  aiChecking.value = true;
  aiError.value = null;
  aiResult.value = null;
  // Always set search query to the new item's name
  aiSearchQuery.value = item.productName || item.name || '';

  try {
    const res = await api.post('/ai/price-check', {
      product_id: item.product_id,
      product_name: item.productName || item.name,
      quantity: item.quantity,
      uom: item.uom,
      currency: form.value.currency || 'IDR',
      search_query: aiSearchQuery.value || undefined,
    });
    aiResult.value = res.data.data;
  } catch (err: any) {
    aiError.value = err.response?.data?.error || 'Gagal menghubungi AI. Cek API key.';
  } finally {
    aiChecking.value = false;
  }
}

async function aiSearchWithKeyword() {
  if (!aiSearchQuery.value.trim() || !aiTargetItem.value) return;
  aiChecking.value = true;
  aiError.value = null;
  aiResult.value = null;

  try {
    const item = aiTargetItem.value;
    const res = await api.post('/ai/price-check', {
      product_id: item.product_id,
      product_name: item.productName || item.name,
      quantity: item.quantity,
      uom: item.uom,
      currency: form.value.currency || 'IDR',
      search_query: aiSearchQuery.value.trim(),
    });
    aiResult.value = res.data.data;
  } catch (err: any) {
    aiError.value = err.response?.data?.error || 'Gagal menghubungi AI. Cek API key.';
  } finally {
    aiChecking.value = false;
  }
}

async function checkAllPrices() {
  if (formItems.value.length === 0) return;
  const item = formItems.value[0];
  aiSearchQuery.value = '';
  await checkItemPrice(item);
}

async function runPoAdvisor() {
  if (formItems.value.length === 0) return;
  advisorPanelVisible.value = true;
  advisorLoading.value = true;
  advisorError.value = null;
  advisorResult.value = null;

  try {
    const selectedVendor = vendors.value.find((v: any) => v.id === form.value.vendor_id);
    const res = await api.post('/ai/po-advisor', {
      items: formItems.value.map((it: any) => ({
        product_id: it.product_id,
        name: it.productName || it.name,
        quantity: it.quantity,
        uom: it.uom,
        unit_price: it.unit_price,
      })),
      vendor_id: form.value.vendor_id,
      vendor_name: selectedVendor?.name || '',
      total_amount: grandTotal.value,
      currency: form.value.currency || 'IDR',
      project_id: form.value.project_id || null,
      notes: form.value.notes || '',
    });
    advisorResult.value = res.data.data;
  } catch (err: any) {
    advisorError.value = err.response?.data?.error || 'Gagal menghubungi AI Advisor. Pastikan API key dikonfigurasi.';
  } finally {
    advisorLoading.value = false;
  }
}

function applyAiPrice() {
  if (!aiTargetItem.value || !aiResult.value?.ai?.recommended_price) return;
  aiTargetItem.value.unit_price = Number(aiResult.value.ai.recommended_price);
  aiPanelVisible.value = false;
  aiSearchQuery.value = '';
}

function applyMarketplacePrice(price: number) {
  if (!aiTargetItem.value || !price) return;
  aiTargetItem.value.unit_price = Number(price);
  aiPanelVisible.value = false;
  aiSearchQuery.value = '';
}

// ── Manual Price Search functions ─────────────────────────────────────────────
let manualSearchTimer: ReturnType<typeof setTimeout> | null = null;

function openManualSearch(item: any) {
  manualSearchTargetItem.value = item;
  manualSearchVisible.value = true;
  manualSearchQuery.value = item.productName || item.name || '';
  manualSearchResults.value = [];
  // Auto-search by product_id
  if (item.product_id) {
    doManualSearch(undefined, item.product_id);
  } else if (manualSearchQuery.value) {
    doManualSearch(manualSearchQuery.value);
  }
}

function onManualSearchInput() {
  if (manualSearchTimer) clearTimeout(manualSearchTimer);
  manualSearchTimer = setTimeout(() => {
    if (manualSearchQuery.value.trim().length >= 2) {
      doManualSearch(manualSearchQuery.value.trim());
    }
  }, 400);
}

async function doManualSearch(q?: string, productId?: number) {
  manualSearchLoading.value = true;
  try {
    const params: Record<string, string> = {};
    if (productId) params.product_id = String(productId);
    else if (q) params.q = q;
    else return;

    const res = await api.get('/procurement/price-search', { params });
    manualSearchResults.value = res.data.data || [];
  } catch (err) {
    console.error('Price search error:', err);
    manualSearchResults.value = [];
  } finally {
    manualSearchLoading.value = false;
  }
}

function applyManualPrice(price: number) {
  if (!manualSearchTargetItem.value) return;
  manualSearchTargetItem.value.unit_price = Number(price);
  manualSearchVisible.value = false;
}
</script>

<style scoped>
/* ── AI Panel ──────────────────────────────────────────────────────────────── */
.ai-panel {
  border: 1.5px solid #e9d5ff;
  background: white;
  box-shadow: 0 4px 24px 0 rgba(124, 58, 237, 0.08);
  margin-bottom: 4px;
}

.ai-panel-header {
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
}

.ai-check-all-btn {
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
}
.ai-check-all-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
}
.ai-check-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ai-item-btn {
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
  color: #7c3aed;
  border: 1px solid #c4b5fd;
}
.ai-item-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  color: white;
  border-color: transparent;
}
.ai-item-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Spinner */
.ai-loader {
  width: 36px;
  height: 36px;
  border: 3px solid #ede9fe;
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

/* ── Manual Search Panel ───────────────────────────────────────────────────── */
.manual-search-panel {
  border: 1.5px solid #bfdbfe;
  background: white;
  box-shadow: 0 4px 24px 0 rgba(37, 99, 235, 0.08);
  margin-bottom: 4px;
}

.manual-search-header {
  background: linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%);
}

/* ─── AI PO Advisor Panel ─── */
.advisor-panel {
  border: 1px solid #d1fae5;
  background: white;
  box-shadow: 0 8px 32px rgba(16,185,129,0.12);
}
.advisor-header {
  background: linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%);
}
</style>
