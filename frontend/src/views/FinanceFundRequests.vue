<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Fund Requests</h2>
          <p class="text-sm text-gray-500 mt-1">Request cash disbursement for purchase order payment schedules</p>
        </div>
        <button @click="showCreate = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ New Request</button>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-gray-500 uppercase">Total Requested</p>
          <p class="text-2xl font-bold">{{ fmt(totals.total) }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-blue-600 uppercase">Draft</p>
          <p class="text-2xl font-bold text-blue-700">{{ totals.draft }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-yellow-600 uppercase">Pending Approval</p>
          <p class="text-2xl font-bold text-yellow-700">{{ totals.pending }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4">
          <p class="text-xs text-green-600 uppercase">Approved</p>
          <p class="text-2xl font-bold text-green-700">{{ totals.approved }}</p>
        </div>
      </div>

      <!-- Filter -->
      <div class="mb-4 flex gap-2">
        <button v-for="s in ['all','draft','submitted','approved','rejected']" :key="s"
          @click="filter = s" :class="filter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'" class="px-3 py-1.5 rounded-md text-sm border">
          {{ s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1) }}
        </button>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO #</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Needed Date</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="r in filtered" :key="r.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ r.request_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ r.po_number || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ r.vendor_name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">
                {{ r.purpose }}
                <span v-if="(r.item_count || 0) > 1" class="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{{ r.item_count }} items</span>
                <span v-if="(r.pending_count || 0) > 0 && (r.approved_count || 0) > 0" class="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">{{ r.pending_count }} pending</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(r.needed_date) }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(r.amount) }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="statusBadge(r.status)" class="px-2 py-1 rounded-full text-xs font-medium">{{ r.status }}</span>
              </td>
              <td class="px-4 py-3 text-right text-sm">
                <div class="inline-flex items-center gap-1.5 flex-wrap justify-end">
                  <button v-if="r.status === 'draft'" @click="openEdit(r)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 transition">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Edit
                  </button>
                  <button v-if="r.status === 'draft'" @click="submitRequest(r.id)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 transition">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    Submit
                  </button>
                  <button v-if="(r.status === 'submitted' || r.status === 'partially_approved') && canApprove" @click="openApprove(r)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition" title="Approve all pending items">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    Approve All
                  </button>
                  <button v-if="(r.status === 'submitted' || r.status === 'partially_approved') && canApprove" @click="openReject(r)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 transition" title="Reject all pending items">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    Reject All
                  </button>
                  <button @click="openDetail(r)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 transition">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    Detail
                  </button>
                  <button @click="deleteFR(r)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100 transition" title="Hapus Fund Request">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Hapus
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="8" class="text-center py-8 text-gray-400">No fund requests</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Create/Edit Modal -->
      <div v-if="showCreate || editingRequest" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold mb-4">{{ editingRequest ? 'Edit Fund Request' : 'Create Fund Request' }}</h3>
          <form @submit.prevent="saveFundRequest" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700">Purpose / Header</label>
                <input v-model="formData.purpose" type="text" required placeholder="e.g. Pembayaran termin proyek X" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Needed Date</label>
                <input v-model="formData.needed_date" type="date" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700">Cash on Bank Account</label>
                <input v-model="formData.cash_account" type="text" placeholder="e.g. BCA - 1234567890 - PT XYZ" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Cash / Bank Note</label>
                <input v-model="formData.cash_account_note" type="text" placeholder="e.g. transfer dari rekening operasional" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>

            <div class="border-t pt-3">
              <div class="flex justify-between items-center mb-2">
                <h4 class="text-sm font-semibold text-gray-700">Transactions ({{ formData.items.length }})</h4>
                <button type="button" @click="addItem" class="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-xs hover:bg-blue-200">+ Add Transaction</button>
              </div>
              <table class="min-w-full text-sm border">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Tipe</th>
                    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Referensi</th>
                    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Keterangan</th>
                    <th class="px-2 py-1 text-right text-xs font-medium text-gray-500">Jumlah</th>
                    <th class="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(it, idx) in formData.items" :key="idx" class="border-t">
                    <!-- Tipe toggle -->
                    <td class="px-1 py-1.5">
                      <select v-model="it.type" @change="onItemTypeChange(it)" class="w-28 px-2 py-1.5 border rounded text-xs focus:ring-2 focus:ring-blue-400">
                        <option value="po">🧾 PO Termin</option>
                        <option value="expense">💸 Expense</option>
                      </select>
                    </td>
                    <!-- Referensi (PO/Termin atau Expense) -->
                    <td class="px-1 py-1.5">
                      <!-- PO mode -->
                      <template v-if="it.type === 'po'">
                        <select v-model.number="it.po_id" @change="onPoSelect(it)" class="w-44 px-2 py-1.5 border rounded text-xs focus:ring-2 focus:ring-blue-400 mb-1">
                          <option :value="null">- Pilih PO -</option>
                          <option v-for="po in procStore.purchaseOrders" :key="po.id" :value="po.id">
                            {{ po.po_number || `PO-${po.id}` }} — {{ po.vendor_name || po.vendor_id }}
                          </option>
                        </select>
                        <select v-model.number="it.po_schedule_id"
                          @change="e => onScheduleSelect(it, +(e.target as HTMLSelectElement).value)"
                          class="w-44 px-2 py-1.5 border rounded text-xs focus:ring-2 focus:ring-blue-400"
                          :disabled="!it.po_id">
                          <option :value="null">- Pilih Termin -</option>
                          <option v-for="sch in (poSchedulesCache[it.po_id!] || [])" :key="sch.id" :value="sch.id">
                            Termin {{ sch.schedule_no }} — {{ sch.label }} ({{ fmtScheduleAmt(sch) }})
                          </option>
                        </select>
                      </template>
                      <!-- Expense mode -->
                      <template v-else>
                        <select v-model.number="it.expense_id" @change="onExpenseSelect(it)" class="w-56 px-2 py-1.5 border rounded text-xs focus:ring-2 focus:ring-green-400">
                          <option :value="null">- Pilih Expense Approved -</option>
                          <option v-for="exp in approvedExpenses" :key="exp.id" :value="exp.id">
                            {{ exp.project_name || '' }} — {{ exp.description || exp.category }} ({{ fmt(exp.amount) }})
                          </option>
                        </select>
                        <p v-if="!approvedExpenses.length" class="text-xs text-gray-400 mt-0.5">Tidak ada expense approved</p>
                      </template>
                    </td>
                    <td class="px-1 py-1.5"><input v-model="it.description" type="text" placeholder="Keterangan pembayaran" class="w-full px-2 py-1.5 border rounded text-sm" /></td>
                    <td class="px-1 py-1.5">
                      <input v-model.number="it.amount" type="number" step="1" required
                        class="w-36 px-2 py-1.5 border rounded text-sm text-right font-mono font-semibold"
                        :class="it.amount > 0 ? 'border-blue-400 bg-blue-50' : ''"
                      />
                      <p v-if="it.amount > 0" class="text-xs text-blue-600 text-right">{{ fmt(it.amount) }}</p>
                    </td>
                    <td class="px-1 py-1.5 text-center">
                      <button type="button" @click="removeItem(idx)" :disabled="formData.items.length <= 1" class="text-red-600 hover:underline text-xs disabled:text-gray-300">Hapus</button>
                    </td>
                  </tr>
                </tbody>
                <tfoot class="bg-gray-50">
                  <tr>
                    <td colspan="3" class="px-2 py-1 text-right text-xs font-medium text-gray-600">Total</td>
                    <td class="px-2 py-1 text-right font-mono font-semibold">{{ fmt(itemsTotal) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <p class="mt-1 text-xs text-gray-500">Pilih tipe PO Termin untuk pembayaran vendor, atau Expense untuk expense project yang sudah approved.</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700">Notes (header)</label>
              <textarea v-model="formData.notes" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" rows="2"></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="cancelEdit" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Approve Modal -->
      <div v-if="approveTarget" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
          <h3 class="text-lg font-bold mb-4">Approve Request</h3>
          <p class="text-sm text-gray-600 mb-2">{{ approveTarget.request_number }} — {{ approveTarget.vendor_name }}</p>
          <p class="text-sm text-gray-500 mb-3">Amount: <span class="font-medium">{{ fmt(approveTarget.amount) }}</span></p>
          <p class="text-sm text-gray-500 mb-4">Purpose: {{ approveTarget.purpose }}</p>
          <div class="flex justify-end gap-3">
            <button @click="approveTarget = null" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
            <button @click="confirmApprove" class="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700">Approve</button>
          </div>
        </div>
      </div>

      <!-- Reject Modal -->
      <div v-if="rejectTarget" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
          <h3 class="text-lg font-bold mb-4">Reject Request</h3>
          <p class="text-sm text-gray-600 mb-3">{{ rejectTarget.request_number }} — {{ rejectTarget.vendor_name }}</p>
          <div>
            <label class="block text-sm font-medium text-gray-700">Rejection Reason</label>
            <textarea v-model="rejectReason" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" rows="3" required></textarea>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button @click="rejectTarget = null; rejectReason = ''" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
            <button @click="confirmReject" class="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Reject</button>
          </div>
        </div>
      </div>

      <!-- Detail Modal -->
      <div v-if="detailTarget" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold mb-4">{{ detailTarget.request_number }}</h3>
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
            <div><span class="text-gray-600">Purpose:</span> <span class="font-medium">{{ detailTarget.purpose }}</span></div>
            <div><span class="text-gray-600">Needed Date:</span> <span class="font-medium">{{ fmtDate(detailTarget.needed_date) }}</span></div>
            <div><span class="text-gray-600">Total Amount:</span> <span class="font-medium font-mono">{{ fmt(detailTarget.amount) }}</span></div>
            <div><span class="text-gray-600">Status:</span> <span :class="statusBadge(detailTarget.status)" class="px-2 py-0.5 rounded-full text-xs font-medium inline-block">{{ detailTarget.status }}</span></div>
            <div class="col-span-2"><span class="text-gray-600">Cash on Bank:</span> <span class="font-medium">{{ detailTarget.cash_account || '-' }}</span></div>
            <div v-if="detailTarget.cash_account_note" class="col-span-2"><span class="text-gray-600">Cash Note:</span> <span class="font-medium">{{ detailTarget.cash_account_note }}</span></div>
            <div v-if="detailTarget.notes" class="col-span-2"><span class="text-gray-600">Notes:</span> <span class="font-medium">{{ detailTarget.notes }}</span></div>
            <div v-if="detailTarget.rejection_reason" class="col-span-2"><span class="text-red-600">Rejection Reason:</span> <span class="text-red-700 font-medium">{{ detailTarget.rejection_reason }}</span></div>
          </div>

          <div class="border-t pt-3">
            <h4 class="text-sm font-semibold text-gray-700 mb-2">Transactions</h4>
            <table class="min-w-full text-sm border">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">PO #</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Schedule</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Vendor</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500">Description</th>
                  <th class="px-2 py-1 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th class="px-2 py-1 text-center text-xs font-medium text-gray-500">Status</th>
                  <th class="px-2 py-1 text-right text-xs font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in (detailTarget.items || [])" :key="it.id" class="border-t align-top">
                  <td class="px-2 py-1">{{ it.po_number || '-' }}</td>
                  <td class="px-2 py-1">{{ it.schedule_label ? `#${it.schedule_no} ${it.schedule_label}` : '-' }}</td>
                  <td class="px-2 py-1">{{ it.vendor_name || '-' }}</td>
                  <td class="px-2 py-1">
                    <div>{{ it.description || '-' }}</div>
                    <div v-if="it.rejection_reason" class="text-xs text-red-600 mt-0.5">Rejected: {{ it.rejection_reason }}</div>
                  </td>
                  <td class="px-2 py-1 text-right font-mono">{{ fmt(it.amount) }}</td>
                  <td class="px-2 py-1 text-center">
                    <span :class="statusBadge(it.status || 'pending')" class="px-2 py-0.5 rounded-full text-xs font-medium inline-block">{{ it.status || 'pending' }}</span>
                  </td>
                  <td class="px-2 py-1 text-right whitespace-nowrap">
                    <template v-if="canApprove && (it.status || 'pending') === 'pending' && (detailTarget.status === 'submitted' || detailTarget.status === 'partially_approved')">
                      <div class="inline-flex items-center gap-1.5 justify-end">
                        <button @click="approveItem(it.id)"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition" title="Approve this item">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                          Approve
                        </button>
                        <button @click="rejectItem(it.id)"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 transition" title="Reject this item">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                          Reject
                        </button>
                      </div>
                    </template>
                    <span v-else class="text-xs text-gray-300">—</span>
                  </td>
                </tr>
                <tr v-if="!detailTarget.items || !detailTarget.items.length"><td colspan="7" class="px-2 py-3 text-center text-gray-400">No line items</td></tr>
              </tbody>
            </table>
            <p v-if="!canApprove" class="mt-2 text-xs text-gray-500">Approval per transaksi hanya untuk admin (level &ge; 4).</p>
          </div>

          <!-- Documents Section -->
          <div class="mt-4 border-t pt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold text-gray-800 text-sm">📎 Dokumen Pendukung</h4>
              <label class="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 cursor-pointer inline-flex items-center gap-1 transition">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                Upload
                <input type="file" class="hidden" @change="uploadDocument($event)" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
              </label>
            </div>
            <div v-if="uploadingDoc" class="text-sm text-blue-600 mb-2 flex items-center gap-2">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div> Uploading...
            </div>
            <div v-if="detailDocs.length" class="space-y-1.5">
              <div v-for="doc in detailDocs" :key="doc.id" class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 group hover:bg-gray-100 transition">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-lg">{{ getFileIcon(doc.file_type) }}</span>
                  <div class="min-w-0">
                    <a :href="apiBaseUrl + doc.file_path" target="_blank" class="text-sm text-blue-700 hover:underline font-medium truncate block">{{ doc.original_name }}</a>
                    <p class="text-xs text-gray-400">{{ formatFileSize(doc.file_size) }} • {{ doc.uploaded_by_name || 'System' }} • {{ fmtDate(doc.created_at) }}</p>
                  </div>
                </div>
                <button @click="deleteDocument(doc)" class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition p-1" title="Hapus">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 italic">Belum ada dokumen</p>
          </div>

          <div class="flex justify-end pt-4">
            <button @click="detailTarget = null" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Close</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFinanceStore } from '../stores/finance';
import { useAuthStore } from '../stores/auth';
import { useProcurementStore } from '../stores/procurement';
import { api } from '../lib/api';

const store = useFinanceStore();
const auth = useAuthStore();
const procStore = useProcurementStore();
const route = useRoute();
const router = useRouter();
const filter = ref('all');
const showCreate = ref(false);
const editingRequest = ref<any>(null);
const approveTarget = ref<any>(null);
const rejectTarget = ref<any>(null);
const detailTarget = ref<any>(null);
const rejectReason = ref('');
const detailDocs = ref<any[]>([]);
const uploadingDoc = ref(false);
const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL?.replace('/api', '') || window.location.origin;

const formData = ref<{
  purpose: string;
  needed_date: string;
  notes: string;
  cash_account: string;
  cash_account_note: string;
  items: Array<{ type: 'po'|'expense'; po_id: number | null; po_schedule_id: number | null; vendor_id: number | null; expense_id: number | null; description: string; amount: number }>;
}>({
  purpose: '',
  needed_date: '',
  notes: '',
  cash_account: '',
  cash_account_note: '',
  items: [{ type: 'po', po_id: null, po_schedule_id: null, vendor_id: null, expense_id: null, description: '', amount: 0 }],
});

const poSchedulesCache = ref<Record<number, any[]>>({});
const approvedExpenses = ref<any[]>([]);

const fetchApprovedExpenses = async () => {
  try {
    // fetch across all projects — aggregate approved expenses
    const res = await api.get('/projects/expenses/approved');
    approvedExpenses.value = res.data.data || [];
  } catch {
    approvedExpenses.value = [];
  }
};

const onExpenseSelect = (item: any) => {
  const exp = approvedExpenses.value.find((e: any) => e.id === item.expense_id);
  if (exp) {
    item.amount = Number(exp.amount) || 0;
    item.description = exp.description || exp.category || '';
    item.vendor_id = null;
  }
};

const onItemTypeChange = (item: any) => {
  item.po_id = null; item.po_schedule_id = null; item.vendor_id = null;
  item.expense_id = null; item.amount = 0; item.description = '';
};

const fetchSchedules = async (poId: number) => {
  if (poSchedulesCache.value[poId]) return;
  try {
    const res = await api.get(`/procurement/purchase-orders/${poId}/payment-schedules`);
    poSchedulesCache.value[poId] = res.data.data;
  } catch (e) {
    console.error('Failed to fetch schedules', e);
  }
};

const onPoSelect = async (item: any) => {
  if (item.po_id) {
    await fetchSchedules(item.po_id);
    const po = procStore.purchaseOrders.find(p => p.id === item.po_id);
    if (po) item.vendor_id = po.vendor_id;
    item.po_schedule_id = null; // Reset schedule when PO changes
  } else {
    item.vendor_id = null;
    item.po_schedule_id = null;
  }
};

const onScheduleSelect = (item: any, scheduleId?: number) => {
  // Use scheduleId passed directly from event (avoids v-model update timing issue)
  const schId = scheduleId && scheduleId > 0 ? scheduleId : item.po_schedule_id;
  if (item.po_id && schId && poSchedulesCache.value[item.po_id]) {
    const sch = poSchedulesCache.value[item.po_id].find((s: any) => Number(s.id) === Number(schId));
    if (sch) {
      item.po_schedule_id = Number(sch.id);
      item.amount = Number(sch.amount) || 0;
      item.description = `Termin ${sch.schedule_no} - ${sch.label}`;
    }
  }
};

const fmtScheduleAmt = (sch: any) => {
  const amt = Number(sch.amount || 0);
  if (!amt) return `${sch.percentage}%`;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amt);
};

const getVendorName = (item: any) => {
  if (!item.po_id) return '-';
  const po = procStore.purchaseOrders.find((p: any) => p.id === item.po_id);
  return po?.vendor_name || po?.vendor_id || '-';
};

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const canApprove = computed(() => {
  const userLevel = (auth.user as any)?.user_level || 0;
  return userLevel >= 4;
});

const statusBadge = (s: string) => ({
  'bg-blue-100 text-blue-800': s === 'draft',
  'bg-yellow-100 text-yellow-800': s === 'submitted' || s === 'pending',
  'bg-green-100 text-green-800': s === 'approved',
  'bg-red-100 text-red-800': s === 'rejected',
  'bg-purple-100 text-purple-800': s === 'partially_approved',
});

const refreshDetail = async () => {
  if (!detailTarget.value) return;
  const full = await store.getFundRequest(detailTarget.value.id);
  if (full) detailTarget.value = full;
};

const approveItem = async (itemId: number) => {
  if (!detailTarget.value) return;
  try {
    await store.approveFundRequestItem(detailTarget.value.id, itemId);
    await refreshDetail();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Failed to approve item');
  }
};

const rejectItem = async (itemId: number) => {
  if (!detailTarget.value) return;
  const reason = window.prompt('Reason for rejecting this item?');
  if (!reason || !reason.trim()) return;
  try {
    await store.rejectFundRequestItem(detailTarget.value.id, itemId, reason.trim());
    await refreshDetail();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Failed to reject item');
  }
};

const totals = computed(() => ({
  total: store.fundRequests.reduce((s, r) => s + Number(r.amount || 0), 0),
  draft: store.fundRequests.filter(r => r.status === 'draft').length,
  pending: store.fundRequests.filter(r => r.status === 'submitted').length,
  approved: store.fundRequests.filter(r => r.status === 'approved').length,
}));

const filtered = computed(() => {
  if (filter.value === 'all') return store.fundRequests;
  return store.fundRequests.filter(r => r.status === filter.value);
});

const resetForm = () => {
  formData.value = {
    purpose: '',
    needed_date: '',
    notes: '',
    cash_account: '',
    cash_account_note: '',
    items: [{ type: 'po', po_id: null, po_schedule_id: null, vendor_id: null, expense_id: null, description: '', amount: 0 }],
  };
};

const addItem = () => {
  formData.value.items.push({ type: 'po', po_id: null, po_schedule_id: null, vendor_id: null, expense_id: null, description: '', amount: 0 });
};

const removeItem = (idx: number) => {
  if (formData.value.items.length > 1) formData.value.items.splice(idx, 1);
};

const itemsTotal = computed(() =>
  formData.value.items.reduce((s, it) => s + Number(it.amount || 0), 0)
);

const openEdit = async (r: any) => {
  editingRequest.value = r;

  // Fetch full detail to get items (list API only has counts)
  const detail = await store.getFundRequest(r.id) || r;

  // Pre-fetch schedules for ALL items that have a po_id
  const poIds = new Set<number>();
  if (detail.items?.length) detail.items.forEach((it: any) => { if (it.po_id) poIds.add(Number(it.po_id)); });
  if (detail.po_id) poIds.add(Number(detail.po_id));
  await Promise.all([...poIds].map(pid => fetchSchedules(pid)));

  formData.value = {
    purpose: detail.purpose,
    needed_date: detail.needed_date ? String(detail.needed_date).slice(0, 10) : '',
    notes: detail.notes || '',
    cash_account: detail.cash_account || '',
    cash_account_note: detail.cash_account_note || '',
    items: (detail.items && detail.items.length)
      ? detail.items.map((it: any) => ({
          type: it.expense_id ? 'expense' : 'po',
          po_id: it.po_id ? Number(it.po_id) : null,
          po_schedule_id: it.po_schedule_id ? Number(it.po_schedule_id) : null,
          vendor_id: it.vendor_id ?? null,
          expense_id: it.expense_id ?? null,
          description: it.description || '',
          amount: Number(it.amount || 0),
        }))
      : [{ type: 'po', po_id: detail.po_id ?? null, po_schedule_id: detail.po_schedule_id ?? null, vendor_id: detail.vendor_id ?? null, expense_id: null, description: detail.purpose || '', amount: Number(detail.amount || 0) }],
  };
};

const cancelEdit = () => {
  editingRequest.value = null;
  showCreate.value = false;
  resetForm();
};

const saveFundRequest = async () => {
  try {
    if (!formData.value.items.length) return;
    
    const scheduleIds = formData.value.items.map(it => it.po_schedule_id).filter(id => id);
    if (scheduleIds.length !== new Set(scheduleIds).size) {
      alert('Terdapat duplikasi Termin PO yang sama di dalam satu pengajuan. Silakan hapus baris yang dobel.');
      return;
    }

    const payload = {
      purpose: formData.value.purpose,
      needed_date: formData.value.needed_date,
      notes: formData.value.notes || null,
      cash_account: formData.value.cash_account || null,
      cash_account_note: formData.value.cash_account_note || null,
      items: formData.value.items.map(it => ({
        po_id: it.po_id || null,
        po_schedule_id: it.po_schedule_id || null,
        vendor_id: it.vendor_id || null,
        expense_id: it.expense_id || null,
        description: it.description || null,
        amount: Number(it.amount || 0),
      })),
    };
    if (editingRequest.value) {
      // Update endpoint (PUT) not yet implemented on backend
      editingRequest.value = null;
    } else {
      await store.createFundRequest(payload);
      showCreate.value = false;
    }
    resetForm();
  } catch (error) {
    console.error('Error saving fund request:', error);
  }
};

const submitRequest = async (id: number) => {
  try {
    await store.submitFundRequest(id);
  } catch (error) {
    console.error('Error submitting request:', error);
  }
};

const deleteFR = async (r: any) => {
  if (!confirm(`Hapus Fund Request ${r.request_number}? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await api.delete(`/finance/fund-requests/${r.id}`);
    await store.fetchFundRequests();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal menghapus Fund Request');
  }
};

const openApprove = (r: any) => {
  approveTarget.value = r;
};

const confirmApprove = async () => {
  if (approveTarget.value) {
    try {
      await store.approveFundRequest(approveTarget.value.id);
      approveTarget.value = null;
    } catch (error) {
      console.error('Error approving request:', error);
    }
  }
};

const openReject = (r: any) => {
  rejectTarget.value = r;
  rejectReason.value = '';
};

const confirmReject = async () => {
  if (rejectTarget.value && rejectReason.value) {
    try {
      await store.rejectFundRequest(rejectTarget.value.id, rejectReason.value);
      rejectTarget.value = null;
      rejectReason.value = '';
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  }
};

const openDetail = async (r: any) => {
  detailTarget.value = r;
  detailDocs.value = [];
  try {
    const full = await store.getFundRequest(r.id);
    if (full) detailTarget.value = full;
    // Load documents
    const docRes = await api.get(`/finance/fund-requests/${r.id}/documents`);
    detailDocs.value = docRes.data.data || [];
  } catch (e) {
    console.error('Failed to load fund request detail', e);
  }
};

const uploadDocument = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length || !detailTarget.value?.id) return;
  uploadingDoc.value = true;
  try {
    for (const file of Array.from(input.files)) {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/finance/fund-requests/${detailTarget.value.id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    // Refresh documents
    const docRes = await api.get(`/finance/fund-requests/${detailTarget.value.id}/documents`);
    detailDocs.value = docRes.data.data || [];
  } catch (e) {
    console.error('Failed to upload document:', e);
    alert('Gagal upload dokumen');
  }
  uploadingDoc.value = false;
  input.value = '';
};

const deleteDocument = async (doc: any) => {
  if (!confirm(`Hapus "${doc.original_name}"?`)) return;
  try {
    await api.delete(`/finance/fund-requests/${detailTarget.value.id}/documents/${doc.id}`);
    detailDocs.value = detailDocs.value.filter((d: any) => d.id !== doc.id);
  } catch (e) {
    console.error('Failed to delete document:', e);
    alert('Gagal menghapus dokumen');
  }
};

const getFileIcon = (mimeType: string) => {
  if (!mimeType) return '📄';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('xlsx')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('doc')) return '📘';
  return '📄';
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

onMounted(async () => {
  await store.fetchFundRequests();
  await procStore.fetchPurchaseOrders();
  await fetchApprovedExpenses();
  const openId = Number(route.query.openId);
  if (openId && Number.isFinite(openId)) {
    const target = store.fundRequests.find(r => r.id === openId);
    if (target) {
      await openDetail(target);
    } else {
      const full = await store.getFundRequest(openId);
      if (full) detailTarget.value = full;
    }
    router.replace({ query: {} });
  }
});
</script>
