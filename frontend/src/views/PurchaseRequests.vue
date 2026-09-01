<template>
  <div class="min-h-screen bg-gray-50 p-6 space-y-4">
    <div class="bg-white border rounded-lg shadow-sm tilt-card">
      <div class="px-6 py-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase text-gray-500 tracking-wide">Procurement</p>
          <h1 class="text-2xl font-semibold text-gray-900">Purchase Request (PR)</h1>
          <p class="text-sm text-gray-600">PR → PO → Approval → GRN</p>
        </div>
        <div class="space-x-2">
          <button @click="fetchData" class="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            Refresh
          </button>
          <button @click="openCreateModal" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            + Create PR
          </button>
        </div>
      </div>
    </div>

    <div v-if="store.error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      {{ store.error }}
    </div>
    <div v-if="successMsg" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
      {{ successMsg }}
    </div>

    <div class="bg-white border rounded-lg shadow-sm overflow-hidden">
      <div class="px-6 py-3 border-b flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-800">PR List + Approval</h2>
        <span class="text-xs text-gray-500">PR No | Items | Date | Dept | Amount | Approval | Action</span>
      </div>
      <div v-if="store.loading" class="p-8 text-center text-gray-500">Loading...</div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PR No</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Description</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dept</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approval</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="pr in store.purchaseRequests" :key="pr.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-semibold text-gray-900">{{ pr.pr_number }}</div>
                <div class="text-xs text-gray-500">{{ pr.requester_name || '-' }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                <span v-if="pr.project_name" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{{ pr.project_number }}</span>
                <span v-else class="text-gray-400">—</span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-700 max-w-md">
                <ItemsList :items="parseNotes(pr.notes).items" :show-quantity="true" />
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ formatDate(pr.request_date) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{{ pr.department || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="approvalBadgeClass(pr)" class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ approvalLabel(pr) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <!--
                  Aksi berbentuk ikon, bukan teks: kolom ini pernah memuat lima
                  tombol berteks sekaligus ("Convert to PO ✓", "Approve",
                  "Reject", "View", "Delete") dan lebarnya mendorong kolom lain
                  keluar layar.

                  Setiap tombol WAJIB punya `title` + `aria-label`. Ikon tanpa
                  keduanya berarti aksinya hanya bisa ditebak dari bentuk — dan
                  pembaca layar tidak membacakan apa pun selain "tombol".
                -->
                <div class="flex items-center justify-end gap-1">
                  <!-- State 1: sudah ada pemenang → jadikan PO -->
                  <button
                    v-if="(pr.approval_status || 0) === 2 && getBidProgress(pr.id).has_winner"
                    @click="convertToPO(pr)"
                    :disabled="submitting"
                    title="Jadikan Purchase Order — pemenang sudah ditentukan"
                    aria-label="Jadikan Purchase Order"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-purple-600 hover:bg-purple-700"
                  >
                    <Icon name="cart" :size="15" />
                  </button>
                  <!-- State 2: ada penawaran berharga tapi belum ada pemenang.
                       Persentasenya DIPERTAHANKAN sebagai angka: ia data, bukan
                       label, dan tidak muncul di kolom lain mana pun. -->
                  <button
                    v-else-if="(pr.approval_status || 0) === 2 && getBidProgress(pr.id).percentage > 0"
                    @click="convertToPO(pr)"
                    :disabled="submitting"
                    :title="`Jadikan Purchase Order — penawaran terisi ${getBidProgress(pr.id).percentage}%`"
                    aria-label="Jadikan Purchase Order"
                    class="inline-flex items-center gap-1 h-7 px-1.5 rounded text-white text-[11px] leading-none bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-40"
                  >
                    <Icon name="cart" :size="14" />{{ getBidProgress(pr.id).percentage }}%
                  </button>
                  <!-- State 3: vendor sudah dimasukkan, harga belum ada -->
                  <button
                    v-else-if="(pr.approval_status || 0) === 2 && getBidProgress(pr.id).total_bids > 0"
                    @click="viewPR(pr)"
                    title="Penawaran berjalan — belum ada harga yang masuk"
                    aria-label="Lihat penawaran yang sedang berjalan"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-cyan-500 hover:bg-cyan-600"
                  >
                    <Icon name="clock" :size="15" />
                  </button>
                  <!-- State 4: sudah disetujui tapi penawaran belum dimulai -->
                  <button
                    v-else-if="(pr.approval_status || 0) === 2"
                    @click="viewPR(pr)"
                    title="Perlu penawaran — belum ada vendor yang dimasukkan"
                    aria-label="Perlu penawaran"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-orange-400 hover:bg-orange-500"
                  >
                    <Icon name="alert" :size="15" />
                  </button>

                  <button
                    v-if="canApprove(pr.approval_status || 0)"
                    @click="approvePR(pr.id)"
                    :disabled="submitting"
                    title="Setujui PR"
                    aria-label="Setujui PR"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-green-600 hover:bg-green-700"
                  >
                    <Icon name="check" :size="15" />
                  </button>
                  <button
                    v-if="canReject(pr.approval_status || 0)"
                    @click="rejectPR(pr.id)"
                    :disabled="submitting"
                    title="Tolak PR"
                    aria-label="Tolak PR"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-red-600 hover:bg-red-700"
                  >
                    <Icon name="x" :size="15" />
                  </button>
                  <button
                    @click="viewPR(pr)"
                    title="Lihat detail PR"
                    aria-label="Lihat detail PR"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-blue-600 hover:bg-blue-50"
                  >
                    <Icon name="eye" :size="16" />
                  </button>
                  <button
                    v-if="(pr.approval_status || 0) === 0"
                    @click="deletePR(pr.id)"
                    title="Hapus PR"
                    aria-label="Hapus PR"
                    class="inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-red-600 hover:bg-red-50"
                  >
                    <Icon name="trash" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="store.purchaseRequests.length === 0">
              <td colspan="7" class="px-6 py-8 text-center text-gray-500">Belum ada PR. Klik "Create PR" untuk mulai.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PR Form / View -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div class="bg-white h-screen overflow-y-auto flex flex-col tilt-card">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">{{ isEditing ? 'Purchase Request Detail' : 'Create Purchase Request' }}</h3>
          <div class="flex items-center space-x-2">
            <button v-if="isEditing" @click="printPR" class="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">🖨️ Print</button>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>

        <div class="px-6 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Requester</label>
              <input :value="authStore.user?.name || '-'" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100" disabled />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                :value="form.department || '—'"
                type="text"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100"
                disabled
              />
              <p class="text-xs text-gray-500 mt-1">Mengikuti department user yang login.</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Project (optional)</label>
              <select v-model="form.project_id" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing">
                <option :value="null">— Tanpa Project —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.project_number }} — {{ p.title }}</option>
              </select>
              <p class="text-xs text-gray-500 mt-1">Pilih project untuk cost control.</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Request Date</label>
              <input v-model="form.request_date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Needed By (optional)</label>
              <input v-model="form.needed_by" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Purpose / Reason</label>
            <textarea v-model="form.reason" rows="3" placeholder="Contoh: Refill bahan baku untuk batch WO-001" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing"></textarea>
          </div>

          <div class="border border-gray-200 rounded-lg">
            <div class="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-gray-800">Items (Qty, UoM, Est. Price)</p>
                <p class="text-xs text-gray-500">Pilih item dari Master Items, lalu isi qty dan harga.</p>
              </div>
              <button v-if="!isEditing" @click="addItemRow" class="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">+ Add Item</button>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 200px;">Item</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 80px;">Qty *</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 80px;">UoM</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 180px;">Specification</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 140px;">Est. Price</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 140px;">Line Total</th>
                    <th v-if="!isEditing" class="px-4 py-2" style="min-width: 100px;" />
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(item, idx) in formItems" :key="idx">
                    <td class="px-4 py-2" style="min-width: 320px;">
                      <ItemPicker
                        :modelValue="item.productId || null"
                        :disabled="isEditing"
                        @select="(product: any) => onItemSelected(idx, product)"
                      />
                    </td>
                    <td class="px-4 py-2" style="min-width: 120px;">
                      <input v-model.number="item.qty" type="number" min="1" step="1" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" :class="{ 'border-red-500': !item.qty && !isEditing }" :disabled="isEditing" placeholder="Required" />
                    </td>
                    <td class="px-4 py-2" style="min-width: 80px;">
                      <input v-model="item.uom" type="text" placeholder="KG" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" :disabled="isEditing || !!(formItemType === 'inventory' && item.productId)" />
                    </td>
                    <td class="px-4 py-2" style="min-width: 180px;">
                      <textarea v-model="item.specification" placeholder="e.g. Grade A, 100ppm, etc." rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-vertical" :disabled="isEditing"></textarea>
                    </td>
                    <td class="px-4 py-2" style="min-width: 140px;">
                      <input
                        :value="formatNumberInput(item.price)"
                        @input="onItemPriceInput(item, $event)"
                        inputmode="numeric"
                        pattern="[0-9\.]*"
                        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        :disabled="isEditing"
                        placeholder="0"
                      />
                    </td>
                    <td class="px-4 py-2 text-right text-sm text-gray-900 align-top pt-3" style="min-width: 140px;">{{ formatCurrency((item.qty || 0) * (item.price || 0)) }}</td>
                    <td v-if="!isEditing" class="px-4 py-2 text-right align-top pt-3" style="min-width: 100px;">
                      <button @click="removeItemRow(idx)" class="text-red-600 hover:text-red-800 text-sm">Remove</button>
                    </td>
                  </tr>
                  <tr v-if="formItems.length === 0">
                    <td colspan="7" class="px-4 py-4 text-center text-gray-500 text-sm">Tambah minimal 1 item.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p class="text-sm text-gray-600">Estimated Total</p>
              <p class="text-lg font-semibold text-gray-900">{{ formatCurrency(estimatedTotal) }}</p>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes (internal)</label>
            <textarea v-model="form.notes" rows="2" placeholder="Catatan tambahan" class="w-full border border-gray-300 rounded-lg px-3 py-2" :disabled="isEditing"></textarea>
          </div>

          <!-- Bid Tabulation (Vendor Price Comparison) -->
          <div class="border border-gray-200 rounded-lg">
            <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-gray-800">📊 Bid Tabulation — Vendor Price Comparison</p>
                <p class="text-xs text-gray-500">Bandingkan harga per-item dari beberapa vendor. Pilih vendor pemenang sebelum convert ke PO.</p>
              </div>
              <div v-if="currentPR" class="flex items-center space-x-2">
                <button v-if="prBids.length > 0" @click="saveBids" :disabled="savingBids"
                  class="px-3 py-1 text-sm rounded-lg disabled:opacity-50"
                  :class="bidsDirty ? 'bg-blue-600 text-white hover:bg-blue-700 animate-pulse' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'">
                  {{ savingBids ? 'Saving...' : (bidsDirty ? '💾 Save Prices *' : '💾 Save Prices') }}
                </button>
                <button @click="openAddBidModal" class="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">+ Add Vendor</button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <!-- Message for CREATE mode -->
              <div v-if="!currentPR" class="p-6 text-center">
                <p class="text-sm text-gray-500">💡 Simpan PR terlebih dahulu (<strong>Save Draft</strong>) untuk mulai menambahkan vendor bid dan membandingkan harga.</p>
              </div>
              <!-- Message for PR not yet approved -->
              <div v-else-if="currentPR && (currentPR.approval_status || 0) < 2" class="p-6 text-center bg-yellow-50 rounded-lg border border-yellow-200">
                <div class="text-3xl mb-2">🔒</div>
                <p class="text-sm font-semibold text-yellow-800">PR belum diapprove</p>
                <p class="text-xs text-yellow-600 mt-1">Bid Tabulation hanya dapat diisi setelah PR mendapat approval. Gunakan tombol centang hijau (<strong>✓</strong>) pada kolom Action di daftar PR.</p>
              </div>
              <!-- Bid table for EXISTING PR (only when approved) -->
              <template v-else-if="currentPR && (currentPR.approval_status || 0) >= 2">
                <table v-if="prBids.length > 0" class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10" style="min-width: 40px;">No</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-10 bg-gray-50 z-10" style="min-width: 200px;">Item</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 60px;">Qty</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style="min-width: 50px;">UoM</th>
                    <template v-for="bid in prBids" :key="'h-'+bid.id">
                      <th :colspan="3" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider border-l-2"
                          :class="bid.status === 'selected' ? 'bg-green-100 text-green-800 border-green-300' : 'text-gray-500 border-gray-300'">
                        <div class="flex items-center justify-center space-x-1">
                          <span v-if="bid.status === 'selected'" class="text-green-600">✓</span>
                          <span>{{ bid.vendor_name || bid.registered_vendor_name || 'Vendor' }}</span>
                          <button @click="removeBid(bid)" class="text-red-400 hover:text-red-600 ml-1" title="Hapus vendor">✕</button>
                        </div>
                        <div v-if="bid.delivery_time_days" class="text-[10px] text-gray-400 font-normal mt-0.5">Lead time: {{ bid.delivery_time_days }} hari</div>
                        <div class="mt-1">
                          <!-- Loading indicator -->
                          <div v-if="uploadingBids.has(bid.id)" class="text-center text-[10px] text-blue-500 py-1 animate-pulse">
                            ⏳ Uploading...
                          </div>
                          <template v-else>
                            <!-- Document list -->
                            <div v-if="(bidDocumentsMap[bid.id]?.length || 0) > 0" class="space-y-0.5">
                              <div v-for="doc in bidDocumentsMap[bid.id]" :key="doc.id || doc.file_path"
                                   class="flex items-center justify-between bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                <button @click="openBidDocument(bid, doc)"
                                  class="text-[10px] text-blue-600 hover:underline truncate max-w-[90px] text-left" :title="doc.file_name">
                                  📎 {{ doc.file_name }}
                                </button>
                                <button @click="deleteBidDocument(bid, doc)"
                                  class="text-red-400 hover:text-red-600 ml-1 flex-shrink-0 text-[10px] font-bold" title="Hapus">
                                  ✕
                                </button>
                              </div>
                            </div>
                            <!-- Upload button -->
                            <label class="mt-1 flex items-center justify-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer font-normal border border-dashed border-blue-300 rounded px-1 py-0.5 hover:bg-blue-50">
                              📤 {{ (bidDocumentsMap[bid.id]?.length || 0) > 0 ? '+ Tambah' : 'Upload' }}
                              <input type="file" class="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" @change="uploadBidFile(bid, $event)" />
                            </label>
                          </template>
                        </div>
                      </th>
                    </template>
                  </tr>
                  <tr>
                    <th class="sticky left-0 bg-gray-50 z-10"></th>
                    <th class="sticky left-10 bg-gray-50 z-10"></th>
                    <th></th>
                    <th></th>
                    <template v-for="bid in prBids" :key="'sh-'+bid.id">
                      <th class="px-2 py-1 text-center text-[10px] font-medium text-gray-400 uppercase border-l-2" :class="bid.status === 'selected' ? 'border-green-300 bg-green-50' : 'border-gray-300'">Ref Price</th>
                      <th class="px-2 py-1 text-center text-[10px] font-medium text-blue-600 uppercase" :class="bid.status === 'selected' ? 'bg-green-50' : ''">Actual Price</th>
                      <th class="px-2 py-1 text-center text-[10px] font-medium text-gray-400 uppercase" :class="bid.status === 'selected' ? 'bg-green-50' : ''">Line Total</th>
                    </template>
                  </tr>

                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(item, rowIdx) in bidItemRows" :key="rowIdx" class="hover:bg-gray-50">
                    <td class="px-3 py-2 text-gray-500 sticky left-0 bg-white z-10">{{ rowIdx + 1 }}</td>
                    <td class="px-3 py-2 font-medium text-gray-900 sticky left-10 bg-white z-10">{{ item.item_name }}</td>
                    <td class="px-3 py-2 text-center text-gray-700">{{ item.quantity }}</td>
                    <td class="px-3 py-2 text-center text-gray-500">{{ item.uom }}</td>
                    <template v-for="bid in prBids" :key="'c-'+bid.id+'-'+rowIdx">
                      <!-- REF PRICE (readonly) -->
                      <td class="px-2 py-1 border-l-2 min-w-[100px]" :class="bid.status === 'selected' ? 'border-green-300 bg-green-50' : 'border-gray-200'">
                        <div v-if="getBidItem(bid, rowIdx).ref_price > 0" class="text-right text-xs text-gray-500 font-mono py-1 px-2 bg-gray-50 rounded border border-gray-200">
                          {{ formatCurrency(getBidItem(bid, rowIdx).ref_price) }}
                        </div>
                        <div v-else class="text-center">
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">NEW</span>
                        </div>
                      </td>
                      <!-- ACTUAL PRICE (editable) + Delta badge -->
                      <td class="px-2 py-1 min-w-[130px]" :class="bid.status === 'selected' ? 'bg-green-50' : ''">
                        <div class="relative">
                          <input
                            v-model.number="getBidItem(bid, rowIdx).unit_price"
                            @input="onBidPriceChange(bid, rowIdx)"
                            type="number" min="0" step="1"
                            class="w-full border rounded px-2 py-1 text-right text-sm"
                            :class="[
                              getBidItem(bid, rowIdx).ref_price > 0 && getBidItem(bid, rowIdx).unit_price !== getBidItem(bid, rowIdx).ref_price
                                ? 'border-yellow-400 bg-yellow-50'
                                : getBidItem(bid, rowIdx).price_source === 'vendor_price_list'
                                  ? 'border-blue-300 bg-blue-50'
                                  : 'border-gray-300'
                            ]"
                            placeholder="0"
                          />
                          <!-- Delta badge -->
                          <span v-if="getBidItem(bid, rowIdx).ref_price > 0 && getBidItem(bid, rowIdx).unit_price > 0"
                            class="absolute -top-1.5 -right-1 text-[9px] font-bold px-1 rounded-full leading-tight"
                            :class="getBidItem(bid, rowIdx).unit_price > getBidItem(bid, rowIdx).ref_price
                              ? 'bg-red-100 text-red-700'
                              : getBidItem(bid, rowIdx).unit_price < getBidItem(bid, rowIdx).ref_price
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'"
                          >
                            {{ getPriceDelta(getBidItem(bid, rowIdx)) }}
                          </span>
                        </div>
                        <div v-if="getBidItem(bid, rowIdx).price_source === 'vendor_price_list'" class="text-[9px] text-blue-500 mt-0.5 text-center">📋 dari price list</div>
                      </td>
                      <!-- LINE TOTAL + Pilih -->
                      <td class="px-2 py-2 text-sm text-right min-w-[110px]" :class="getBidItem(bid,rowIdx).is_winner ? 'bg-green-100 text-green-800 font-bold' : (bid.status==='selected' ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700')">
                        <div>{{ formatCurrency(getBidItem(bid, rowIdx).total_price || 0) }}</div>
                        <button
                          @click="selectItemWinner(bid, rowIdx)"
                          class="mt-1 text-[10px] px-2 py-0.5 rounded-full border transition-all w-full"
                          :class="getBidItem(bid,rowIdx).is_winner ? 'border-green-500 bg-green-500 text-white font-semibold' : 'border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-600'"
                        >{{ getBidItem(bid,rowIdx).is_winner ? '✓ Pemenang' : 'Pilih' }}</button>
                      </td>
                    </template>
                  </tr>
                </tbody>
                <tfoot class="bg-gray-50 font-semibold">
                  <tr>
                    <td colspan="4" class="px-3 py-2 text-right text-gray-700 sticky left-0 bg-gray-50 z-10">Grand Total</td>
                    <template v-for="bid in prBids" :key="'t-'+bid.id">
                      <td colspan="3" class="px-3 py-2 text-right border-l-2"
                          :class="bid.status === 'selected' ? 'border-green-300 bg-green-100 text-green-800' : 'border-gray-300 text-gray-900'">
                        {{ formatCurrency(Number(bid.total_amount || 0)) }}
                      </td>
                    </template>
                  </tr>
                  <tr>
                    <td colspan="4" class="px-3 py-2 text-right text-gray-500 text-xs sticky left-0 bg-gray-50 z-10">Action</td>
                    <template v-for="bid in prBids" :key="'a-'+bid.id">
                      <td colspan="3" class="px-3 py-2 text-center border-l-2"
                          :class="countItemWins(bid) > 0 ? 'border-green-300 bg-green-50' : 'border-gray-200'">
                        <div class="flex flex-col items-center gap-1">
                          <div class="text-sm font-bold" :class="countItemWins(bid) > 0 ? 'text-green-700' : 'text-gray-400'">
                            {{ countItemWins(bid) }}/{{ bidItemRows.length }}
                          </div>
                          <div class="text-[10px]" :class="countItemWins(bid) > 0 ? 'text-green-600' : 'text-gray-400'">
                            item menang
                          </div>
                          <span v-if="countItemWins(bid) > 0"
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 mt-0.5">
                            &#10003; Pemenang
                          </span>
                        </div>
                      </td>
                    </template>
                  </tr>
                </tfoot>
              </table>
              <div v-else class="p-6 text-center text-sm text-gray-500">
                Belum ada vendor bid. Klik <strong>+ Add Vendor</strong> di atas untuk mulai membandingkan harga.
              </div>
              </template>

              <!-- Per-Item Winner Resume -->
              <div v-if="prBids.length > 0 && bidItemRows.length > 0" class="mt-3 border border-indigo-200 rounded-lg overflow-hidden">
                <div class="bg-indigo-700 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
                  📋 Resume Pemenang Per Item
                </div>
                <div class="divide-y divide-gray-100">
                  <div v-for="(item, rowIdx) in bidItemRows" :key="rowIdx"
                       class="flex items-center px-4 py-2 text-sm"
                       :class="getItemWinnerBid(rowIdx) ? 'bg-green-50' : 'bg-white'">
                    <span class="w-6 text-gray-400 text-xs flex-shrink-0">{{ rowIdx + 1 }}</span>
                    <span class="flex-1 font-medium text-gray-800">{{ item.item_name }}</span>
                    <span class="text-gray-500 text-xs mr-3">{{ item.quantity }} {{ item.uom }}</span>
                    <template v-if="getItemWinnerBid(rowIdx)">
                      <span class="text-green-700 font-semibold mr-2">{{ getItemWinnerBid(rowIdx).vendor_name }}</span>
                      <span class="text-green-600 text-xs font-mono">{{ formatCurrency(getItemWinnerPrice(rowIdx)) }}</span>
                      <span class="ml-2 text-green-500 text-xs">🏆</span>
                    </template>
                    <span v-else class="text-gray-400 italic text-xs">Belum dipilih</span>
                  </div>
                </div>
                <div v-if="winnerSubtotalByVendor.length > 0" class="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm">
                  <div class="font-semibold text-gray-700 mb-2">Subtotal per vendor pemenang:</div>
                  <div class="flex flex-wrap gap-3">
                    <div v-for="vs in winnerSubtotalByVendor" :key="vs.bid_id"
                         class="flex items-center gap-2 bg-white border border-green-300 rounded-lg px-3 py-1.5">
                      <span class="font-medium text-gray-800 text-xs">{{ vs.vendor_name }}</span>
                      <span class="text-green-700 font-bold text-xs">{{ formatCurrency(vs.subtotal) }}</span>
                      <span class="text-gray-400 text-[10px]">({{ vs.items_won }} item)</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bid Conclusion / Summary -->
              <div v-if="bidSummary && bidSummary.summary && bidSummary.summary.length > 0" class="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                <div class="bg-gray-800 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
                  📊 Bid Comparison Summary
                </div>
                <div class="p-4 space-y-3 bg-gray-50">
                  <!-- Vendor comparison cards -->
                  <div class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${bidSummary.summary.length}, 1fr)` }">
                    <div v-for="vendor in bidSummary.summary" :key="vendor.bid_id"
                         class="p-3 rounded-lg border text-sm"
                         :class="vendor.is_winner ? 'bg-green-50 border-green-400 ring-2 ring-green-300' : 'bg-white border-gray-200'">
                      <div class="font-semibold text-gray-800 flex items-center gap-1">
                        {{ vendor.vendor_name }}
                        <span v-if="vendor.is_winner" class="text-green-600 text-xs">🏆 Winner</span>
                      </div>
                      <div class="mt-1 space-y-1 text-xs text-gray-600">
                        <div>💰 Total: <span class="font-bold text-gray-900">{{ formatCurrency(vendor.total_amount) }}</span>
                          <span v-if="bidSummary.cheapest?.bid_id === vendor.bid_id" class="ml-1 text-green-600 font-bold">← Termurah</span>
                        </div>
                        <div>📦 Delivery: <span class="font-bold text-gray-900">{{ vendor.delivery_time_days || '-' }} hari</span>
                          <span v-if="bidSummary.fastest?.bid_id === vendor.bid_id && vendor.delivery_time_days" class="ml-1 text-blue-600 font-bold">← Tercepat</span>
                        </div>
                        <div>📋 Items quoted: {{ vendor.items_quoted }}/{{ vendor.total_items }}</div>
                      </div>
                    </div>
                  </div>
                  <!-- Recommendation text -->
                  <div class="text-xs text-gray-600 bg-white p-3 rounded border">
                    <div class="mb-2 pb-2 border-b">
                      <strong>Rekomendasi Total:</strong>
                      <span v-if="bidSummary.cheapest?.bid_id === bidSummary.fastest?.bid_id">
                        <span class="text-green-700 font-semibold">{{ bidSummary.cheapest?.vendor_name }}</span> adalah vendor terbaik (termurah & tercepat).
                      </span>
                      <span v-else>
                        <span class="text-green-700 font-semibold">{{ bidSummary.cheapest?.vendor_name }}</span> termurah ({{ formatCurrency(bidSummary.cheapest?.total_amount || 0) }}).
                        <span v-if="bidSummary.fastest?.delivery_time_days">
                          <span class="text-blue-700 font-semibold">{{ bidSummary.fastest?.vendor_name }}</span> tercepat ({{ bidSummary.fastest?.delivery_time_days }} hari).
                        </span>
                      </span>
                      <div class="mt-1">Pilih <strong>✓ Select Winner</strong> di tabel atas untuk menentukan pemenang utama PO.</div>
                    </div>
                    
                    <div v-if="bidSummary.item_analysis && bidSummary.item_analysis.length > 0" class="mt-2">
                      <strong class="text-indigo-700">Resume per Item (Termurah):</strong>
                      <ul class="list-disc list-inside mt-1 space-y-0.5">
                        <li v-for="item in bidSummary.item_analysis" :key="item.item_index">
                          <span class="text-gray-800">{{ item.item_name }}</span> &rarr; 
                          <span class="font-semibold text-green-700">{{ item.cheapest_vendor }}</span> 
                          <span class="text-gray-500">({{ formatCurrency(item.cheapest_price) }})</span>
                        </li>
                      </ul>
                      <div class="mt-2 text-gray-500 italic text-[11px]">
                        *Bisa pecah PO ke beberapa vendor sesuai pemenang per item.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-between items-center bg-white">
          <div class="text-xs text-gray-500">
            {{ currentPR ? 'Viewing existing PR' : 'Save Draft or Submit for Approval seperti wireframe.' }}
          </div>
          <div class="space-x-2">
            <button @click="closeModal" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              {{ isEditing ? 'Close' : 'Cancel' }}
            </button>
            
            <!-- Buttons for EXISTING PR (update mode) -->
            <button 
              v-if="currentPR && !isEditing" 
              @click="updatePR()" 
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" 
              :disabled="submitting || formItems.length === 0">
              {{ submitting ? 'Saving...' : '💾 Save Changes' }}
            </button>
            
            <!-- Buttons for NEW PR (create mode) -->
            <button 
              v-if="!currentPR && !isEditing" 
              @click="submitPR('draft')" 
              class="px-4 py-2 bg-white border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50" 
              :disabled="submitting">
              {{ submitting ? 'Saving...' : 'Save Draft' }}
            </button>
            <button 
              v-if="!currentPR && !isEditing" 
              @click="submitPR('submit')" 
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" 
              :disabled="submitting || formItems.length === 0">
              {{ submitting ? 'Submitting...' : 'Submit for Approval' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Add Vendor Bid Modal -->
  <div v-if="showAddBidModal" class="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">Add Vendor Bid</h3>
          <p v-if="prProductIds.length > 0" class="text-xs text-gray-500 mt-0.5">
            {{ vendorsForBid.filter(v => v.matched_items > 0).length }} vendor cocok dari {{ vendorsForBid.length }} total
          </p>
        </div>
        <button @click="showAddBidModal = false" class="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
          <!-- Search box -->
          <input v-model="vendorSearch" type="text" placeholder="🔍 Cari nama vendor..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1" />
          <!-- Vendor list -->
          <div class="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
            <div v-if="loadingVendorsForBid" class="px-3 py-3 text-sm text-gray-400 text-center">Loading vendors...</div>
            <template v-else>
              <!-- Matched vendors -->
              <div v-if="prProductIds.length > 0 && filteredVendorsForBid.filter(v => v.matched_items > 0).length > 0">
                <div class="px-3 py-1 text-[10px] font-semibold text-green-700 bg-green-50 uppercase tracking-wider">✅ Vendor dengan item PR ({{ filteredVendorsForBid.filter(v => v.matched_items > 0).length }})</div>
                <div
                  v-for="v in filteredVendorsForBid.filter(vv => vv.matched_items > 0)"
                  :key="v.id"
                  @click="newBidForm.vendor_id = v.id"
                  class="px-3 py-2 cursor-pointer hover:bg-green-50 flex items-center justify-between"
                  :class="newBidForm.vendor_id === v.id ? 'bg-green-100 border-l-2 border-green-500' : ''"
                >
                  <span class="text-sm font-medium text-gray-900">{{ v.name }}</span>
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{{ v.matched_items }}/{{ v.total_items }} item</span>
                </div>
              </div>
              <!-- Divider -->
              <div v-if="prProductIds.length > 0 && filteredVendorsForBid.filter(v => v.matched_items === 0).length > 0" class="px-3 py-1 text-[10px] font-semibold text-gray-400 bg-gray-50 uppercase tracking-wider">— Vendor lainnya —</div>
              <!-- Unmatched / all vendors -->
              <div
                v-for="v in filteredVendorsForBid.filter(vv => prProductIds.length === 0 || vv.matched_items === 0)"
                :key="v.id"
                @click="newBidForm.vendor_id = v.id"
                class="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                :class="newBidForm.vendor_id === v.id ? 'bg-blue-50 border-l-2 border-blue-400' : ''"
              >
                <span class="text-sm text-gray-700">{{ v.name }}</span>
              </div>
              <div v-if="filteredVendorsForBid.length === 0" class="px-3 py-4 text-center text-sm text-gray-400">Tidak ada vendor ditemukan</div>
            </template>
          </div>
          <!-- Selected vendor indicator -->
          <div v-if="newBidForm.vendor_id" class="mt-1 text-xs text-blue-600">
            ✓ <strong>{{ vendorsForBid.find(v => v.id === newBidForm.vendor_id)?.name }}</strong> dipilih ·
            <span class="text-green-700">{{ vendorsForBid.find(v => v.id === newBidForm.vendor_id)?.matched_items || 0 }} item cocok</span>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nama Vendor (manual — jika tidak ada di master)</label>
          <input v-model="newBidForm.vendor_name" type="text" placeholder="Isi jika vendor belum ada di master" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Lead Time (hari)</label>
          <input v-model.number="newBidForm.delivery_time_days" type="number" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input v-model="newBidForm.notes" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="mt-6 flex justify-end space-x-2">
        <button @click="showAddBidModal = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">Cancel</button>
        <button @click="createBid" :disabled="savingBids" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
          {{ savingBids ? 'Creating...' : 'Create Bid' }}
        </button>
      </div>
    </div>
  </div>


</template>


<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProcurementStore } from '../stores/procurement';
import { useApprovalWorkflow } from '../composables/useApprovalWorkflow';
import { useAuthStore } from '../stores/auth';
import { useProductStore } from '../stores/products';
// import { useInventoryStore } from '../stores/inventory';
import { api } from '../lib/api';
import ItemsList from '../components/ItemsList.vue';
import ItemPicker from '../components/ItemPicker.vue';
import { formatCurrency } from '../utils/format';

type PRItem = {
  productId?: number | null;
  productName?: string;
  name: string;
  qty: number | null;
  uom: string;
  specification: string;
  price: number | null;
};

const store = useProcurementStore();
const authStore = useAuthStore();
const productStore = useProductStore();
const { canApprove, canReject } = useApprovalWorkflow();
const router = useRouter();

const projects = ref<any[]>([]);
const loadProjects = async () => {
  try {
    const res = await api.get('/projects');
    projects.value = (res.data || []).filter((p: any) => p.status !== 'completed' && p.status !== 'canceled');
  } catch { projects.value = []; }
};

const showModal = ref(false);
const isEditing = ref(false);
const submitting = ref(false);
const successMsg = ref('');
const currentPR = ref<any>(null);

const vendors = ref<any[]>([]);
const vendorsForBid = ref<any[]>([]);  // vendors filtered by PR items
const loadingVendorsForBid = ref(false);
const vendorSearch = ref('');
const prProductIds = ref<number[]>([]);
const prBids = ref<any[]>([]);
const bidsDirty = ref(false);
const savingBids = ref(false);
const showAddBidModal = ref(false);
const newBidForm = ref({ vendor_id: null as number | null, vendor_name: '', delivery_time_days: null as number | null, notes: '' });
const bidSummary = ref<any>(null);

// Computed: vendors filtered by search string
const filteredVendorsForBid = computed(() => {
  const q = vendorSearch.value.toLowerCase().trim();
  if (!q) return vendorsForBid.value;
  return vendorsForBid.value.filter(v => v.name.toLowerCase().includes(q));
});

// API base URL for file downloads
const apiBaseUrl = (import.meta as any).env?.VITE_API_URL?.replace('/api', '') || window.location.origin;

// Bid progress tracking per PR
const bidProgressMap = ref<Record<number, { percentage: number; has_winner: boolean; total_bids: number; total_items: number; items_with_bids: number; items_with_winner: number }>>({});

const getBidProgress = (prId: number) => {
  return bidProgressMap.value[prId] || { percentage: 0, has_winner: false, total_bids: 0, total_items: 0, items_with_bids: 0, items_with_winner: 0 };
};

const loadBidProgress = async () => {
  const prs = store.purchaseRequests || [];
  const approvedPRs = prs.filter((pr: any) => (pr.approval_status || 0) === 2);
  for (const pr of approvedPRs) {
    try {
      const res = await api.get(`/procurement/purchase-requests/${pr.id}/bid-progress`);
      bidProgressMap.value[pr.id] = res.data;
    } catch { /* ignore */ }
  }
};


// Per-bid documents map: bid.id -> Document[]
const bidDocumentsMap = ref<Record<number, any[]>>({});

const loadBidDocuments = async (bid: any) => {
  if (!currentPR.value?.id || !bid?.id) return;
  try {
    const res = await api.get(`/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}/documents`);
    // Use spread to trigger Vue reactivity on new keys
    bidDocumentsMap.value = { ...bidDocumentsMap.value, [bid.id]: res.data.data || [] };
  } catch {
    bidDocumentsMap.value = { ...bidDocumentsMap.value, [bid.id]: [] };
  }
};


// DR-P0-05: dokumen bid tidak lagi dibuka lewat URL /uploads langsung.
//
// Jalur itu dilayani tanpa autentikasi sama sekali — siapa pun yang punya URL-nya
// bisa mengunduh penawaran vendor. Sekarang diambil lewat endpoint ber-auth,
// lalu ditampilkan dari blob object URL.
const openBidDocument = async (bid: any, doc: any) => {
  if (!currentPR.value?.id || !doc?.id) return;
  try {
    const { data } = await api.get(
      `/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}/documents/${doc.id}/download`,
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(data as Blob);
    window.open(url, '_blank');
    // Dilepas setelah tab sempat memuatnya.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal membuka dokumen');
  }
};

const uploadingBids = ref<Set<number>>(new Set());

const uploadBidFile = async (bid: any, event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) { alert('Pilih file terlebih dahulu'); return; }
  if (!currentPR.value?.id) { alert('Error: PR tidak ditemukan'); return; }
  const formData = new FormData();
  for (const f of Array.from(input.files)) {
    formData.append('file', f);
  }
  uploadingBids.value = new Set([...uploadingBids.value, bid.id]);
  try {
    await api.post(`/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await loadBidDocuments(bid);
    const docs = bidDocumentsMap.value[bid.id] || [];
    if (docs.length > 0) bid.quotation_file = docs[docs.length - 1].file_path;
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal upload file');
  } finally {
    uploadingBids.value = new Set([...uploadingBids.value].filter(id => id !== bid.id));
    input.value = '';
  }
};


const deleteBidDocument = async (bid: any, doc: any) => {
  if (!confirm(`Hapus file "${doc.file_name}"?`)) return;
  if (!currentPR.value?.id) return;
  try {
    await api.delete(`/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}/documents/${doc.id}`);
    await loadBidDocuments(bid);
    const docs = bidDocumentsMap.value[bid.id] || [];
    bid.quotation_file = docs.length > 0 ? docs[docs.length - 1].file_path : null;
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal menghapus file');
  }
};


const loadVendors = async () => {
  try {
    const res = await api.get('/procurement/vendors');
    vendors.value = res.data.data || [];
  } catch { vendors.value = []; }
};

// Load vendors filtered by PR items when Add Vendor modal opens
const loadVendorsForBid = async () => {
  if (!currentPR.value) {
    vendorsForBid.value = vendors.value.map(v => ({ ...v, matched_items: 0, total_items: 0 }));
    return;
  }
  // Extract product IDs from PR items
  try {
    const notesData = JSON.parse(currentPR.value.notes || '{}');
    const items = notesData.items || [];
    prProductIds.value = items.map((i: any) => Number(i.productId || i.product_id)).filter((id: number) => id > 0);
  } catch { prProductIds.value = []; }

  loadingVendorsForBid.value = true;
  try {
    const qs = prProductIds.value.length > 0 ? `?product_ids=${prProductIds.value.join(',')}` : '';
    const res = await api.get(`/procurement/vendors-for-items${qs}`);
    vendorsForBid.value = res.data.data || [];
  } catch {
    vendorsForBid.value = vendors.value.map(v => ({ ...v, matched_items: 0, total_items: 0 }));
  } finally {
    loadingVendorsForBid.value = false;
  }
};

// Watch showAddBidModal to load vendors
const openAddBidModal = async () => {
  newBidForm.value = { vendor_id: null, vendor_name: '', delivery_time_days: null, notes: '' };
  vendorSearch.value = '';
  showAddBidModal.value = true;
  await loadVendorsForBid();
};

// Computed: rows derived from PR items (authoritative source), NOT from first bid
const bidItemRows = computed(() => {
  // 1. Try to get items from the current PR's notes (source of truth)
  if (currentPR.value) {
    try {
      const notesData = JSON.parse(currentPR.value.notes || '{}');
      const prItems = notesData.items || [];
      if (prItems.length > 0) {
        return prItems.map((item: any, idx: number) => ({
          item_index: idx,
          item_name: item.productName || item.name || '',
          quantity: Number(item.qty || 0),
          uom: item.uom || '',
        }));
      }
    } catch { /* ignore parse error */ }
  }
  // 2. Fallback: use the bid with the most items
  if (prBids.value.length === 0) return [];
  let maxBid = prBids.value[0];
  for (const b of prBids.value) {
    if ((b.items || []).length > (maxBid.items || []).length) maxBid = b;
  }
  return maxBid.items || [];
});

const getPriceDelta = (item: any): string => {
  const ref = Number(item.ref_price || 0);
  const actual = Number(item.unit_price || 0);
  if (ref === 0) return '';
  if (actual === ref) return '=';
  const pct = Math.abs(((actual - ref) / ref) * 100).toFixed(0);
  return actual > ref ? `↑${pct}%` : `↓${pct}%`;
};

const getBidItem = (bid: any, rowIdx: number) => {
  if (!bid.items) return { unit_price: 0, total_price: 0, ref_price: 0 };
  // Match by item_index first, then by array position
  const match = bid.items.find((i: any) => i.item_index === rowIdx);
  if (match) return match;
  if (bid.items[rowIdx]) return bid.items[rowIdx];
  return { unit_price: 0, total_price: 0, ref_price: 0 };
};

const onBidPriceChange = (bid: any, rowIdx: number) => {
  const item = getBidItem(bid, rowIdx);
  item.total_price = (item.unit_price || 0) * (item.quantity || 0);
  // Recalculate bid total
  bid.total_amount = (bid.items || []).reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
  bidsDirty.value = true;
};

const loadBids = async (prId: number) => {
  try {
    const res = await api.get(`/procurement/purchase-requests/${prId}/bids`);
    prBids.value = res.data.data || [];
    bidsDirty.value = false;
    await loadBidSummary(prId);
    // Load documents for each bid
    bidDocumentsMap.value = {};
    await Promise.all(prBids.value.map((bid: any) => loadBidDocuments(bid)));
  } catch { prBids.value = []; }
};


const loadBidSummary = async (prId: number) => {
  try {
    const res = await api.get(`/procurement/purchase-requests/${prId}/bid-summary`);
    bidSummary.value = res.data;
  } catch { bidSummary.value = null; }
};

const createBid = async () => {
  if (!currentPR.value?.id) return;
  if (!newBidForm.value.vendor_id && !newBidForm.value.vendor_name) {
    alert('Pilih vendor dari master atau isi nama vendor manual.');
    return;
  }
  savingBids.value = true;
  try {
    const vendorName = newBidForm.value.vendor_id
      ? vendors.value.find(v => v.id === newBidForm.value.vendor_id)?.name || ''
      : newBidForm.value.vendor_name;
    await api.post(`/procurement/purchase-requests/${currentPR.value.id}/bids`, {
      vendor_id: newBidForm.value.vendor_id,
      vendor_name: vendorName,
      delivery_time_days: newBidForm.value.delivery_time_days,
      notes: newBidForm.value.notes,
      bid_date: new Date().toISOString().split('T')[0],
    });
    showAddBidModal.value = false;
    newBidForm.value = { vendor_id: null, vendor_name: '', delivery_time_days: null, notes: '' };
    await loadBids(currentPR.value.id);
    await loadBidProgress(); // Refresh PR list button state
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Failed to create bid');
  } finally { savingBids.value = false; }
};

const saveBids = async () => {
  if (!currentPR.value?.id) return;
  savingBids.value = true;
  try {
    for (const bid of prBids.value) {
      await api.put(`/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}`, {
        items: bid.items,
      });
    }
    bidsDirty.value = false;
    await loadBids(currentPR.value.id);
    await loadBidProgress(); // Refresh PR list button state
    alert('✓ Harga berhasil disimpan!');
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Failed to save prices');
  } finally { savingBids.value = false; }
};

// selectBidWinner removed — winner auto-determined via per-item selection

const countItemWins = (bid: any) => {
  if (!bid.items) return 0;
  return bid.items.filter((i: any) => i.is_winner).length;
};

// Returns the bid (vendor) that won a specific item row
const getItemWinnerBid = (rowIdx: number) => {
  for (const bid of prBids.value) {
    const item = bid.items?.[rowIdx];
    if (item?.is_winner) return bid;
  }
  return null;
};

// Returns the unit_price of the winner for a specific item row
const getItemWinnerPrice = (rowIdx: number) => {
  for (const bid of prBids.value) {
    const item = bid.items?.[rowIdx];
    if (item?.is_winner) return item.total_price || 0;
  }
  return 0;
};

// Subtotal grouped by winning vendor
const winnerSubtotalByVendor = computed(() => {
  const map: Record<number, { bid_id: number; vendor_name: string; subtotal: number; items_won: number }> = {};
  for (const bid of prBids.value) {
    if (!bid.items) continue;
    for (const item of bid.items) {
      if (!item.is_winner) continue;
      if (!map[bid.id]) {
        map[bid.id] = { bid_id: bid.id, vendor_name: bid.vendor_name || bid.registered_vendor_name || 'Vendor', subtotal: 0, items_won: 0 };
      }
      map[bid.id].subtotal += Number(item.total_price || 0);
      map[bid.id].items_won++;
    }
  }
  return Object.values(map).sort((a, b) => b.subtotal - a.subtotal);
});

const selectItemWinner = async (bid: any, rowIdx: number) => {
  if (!currentPR.value?.id) return;
  try {
    if (bidsDirty.value) await saveBids();
    await api.post(`/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}/select-item/${rowIdx}`);
    await loadBids(currentPR.value.id);
    await loadBidProgress();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal memilih pemenang item');
  }
};

const removeBid = async (bid: any) => {
  if (!currentPR.value?.id) return;
  if (!confirm(`Hapus bid dari "${bid.vendor_name}"?`)) return;
  try {
    await api.delete(`/procurement/purchase-requests/${currentPR.value.id}/bids/${bid.id}`);
    await loadBids(currentPR.value.id);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Failed to delete bid');
  }
};

const form = ref<{
  pr_number: string;
  department: string;
  request_date: string;
  needed_by: string;
  reason: string;
  notes: string;
  project_id: number | null;
  requester_name?: string;
  approval_status?: number;
}>({
  pr_number: '',
  department: '',
  request_date: new Date().toISOString().split('T')[0],
  needed_by: '',
  reason: '',
  notes: '',
  project_id: null
});

const formItems = ref<PRItem[]>([{ productId: null, productName: '', name: '', qty: null, uom: '', specification: '', price: null }]);
const formItemType = ref<'inventory' | 'non-inventory'>('inventory');

// Select item from ItemPicker component
const onItemSelected = (idx: number, product: any) => {
  const row = formItems.value[idx];
  row.productId = product.id;
  row.productName = product.name;
  row.name = product.name;
  row.uom = product.uom || product.unit_code || '';
  row.price = Number(product.standard_cost) || row.price;
};

const estimatedTotal = computed(() => formItems.value.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0));

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID');
};

// Strip ISO timestamps to yyyy-MM-dd for <input type="date">
const dateOnly = (v?: string | null) => v ? v.split('T')[0] : '';



const formatNumberInput = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('id-ID').format(value);
};

const parseNumberInput = (raw: string) => {
  const cleaned = raw.replace(/\./g, '').replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const onItemPriceInput = (item: PRItem, event: Event) => {
  const target = event.target as HTMLInputElement;
  const num = parseNumberInput(target.value);
  item.price = num;
  target.value = formatNumberInput(num);
};

const parseNotes = (notes: string | null | undefined) => {
  if (!notes) return { noteText: '', items: [] as PRItem[], estimatedTotal: 0, itemType: 'inventory' as 'inventory' | 'non-inventory' };
  try {
    const parsed = JSON.parse(notes);
    return {
      noteText: parsed.noteText || parsed.notes || '',
      items: parsed.items || [],
      estimatedTotal: parsed.estimatedTotal || 0,
      itemType: (parsed.itemType as 'inventory' | 'non-inventory') || 'inventory'
    };
  } catch (error) {
    return { noteText: notes, items: [] as PRItem[], estimatedTotal: 0, itemType: 'inventory' };
  }
};

// const getAmount = (pr: any) => {
//   if (typeof pr.amount === 'number') return pr.amount;
//   if (typeof pr.estimated_total === 'number') return pr.estimated_total;
//   const parsed = parseNotes(pr.notes);
//   return parsed.estimatedTotal || 0;
// };

const approvalLabel = (pr: any) => {
  const status = pr.status || 'draft';
  const approval = pr.approval_status || 0;
  if (approval === 2) return '2/2';
  if (approval === 1) return '1/2';
  return status === 'draft' ? 'Draft' : '0/2';
};

const approvalBadgeClass = (pr: any) => {
  const approval = pr.approval_status || 0;
  if (approval === 2) return 'bg-green-100 text-green-800';
  if (approval === 1) return 'bg-blue-100 text-blue-800';
  return 'bg-yellow-100 text-yellow-800';
};

const fetchData = async () => {
  await store.fetchPurchaseRequests();
};

const resetForm = () => {
  form.value = {
    pr_number: '',
    department: authStore.user?.department_name || authStore.user?.department || '',
    request_date: new Date().toISOString().split('T')[0],
    needed_by: '',
    reason: '',
    notes: '',
    project_id: null,
    requester_name: undefined,
    approval_status: undefined
  };
  formItems.value = [{ productId: null, productName: '', name: '', qty: null, uom: '', specification: '', price: null }];
  formItemType.value = 'inventory';
  prBids.value = [];
  bidsDirty.value = false;
};

const openCreateModal = async () => {
  isEditing.value = false;
  resetForm();
  // Prefetch master items for the select dropdown
  if (!productStore.products.length) await productStore.fetchProducts();
  showModal.value = true;
};

const viewPR = async (pr: any) => {
  currentPR.value = pr;
  // Editable jika status 0/2 (pending/draft), read-only jika sudah approved
  isEditing.value = (pr.approval_status || 0) > 0;
  const parsed = parseNotes(pr.notes);
  form.value = {
    pr_number: pr.pr_number || '',
    department: pr.department || '',
    request_date: dateOnly(pr.request_date),
    needed_by: dateOnly(pr.needed_by),
    reason: pr.reason || parsed.noteText || '',
    notes: parsed.noteText || '',
    project_id: pr.project_id || null,
    requester_name: pr.requester_name,
    approval_status: pr.approval_status
  };
  formItemType.value = (parsed.itemType || 'inventory') as 'inventory' | 'non-inventory';
  const parsedItems = parsed.items?.length ? parsed.items : [{ productId: null, productName: '', name: '', qty: null, uom: '', specification: '', price: null }];
  formItems.value = parsedItems.map((item: any) => ({
    productId: item.productId ?? item.product_id ?? null,
    productName: item.productName || item.name || '',
    name: item.name || item.productName || '',
    qty: item.qty ?? null,
    uom: item.uom || '',
    specification: item.specification || '',
    price: item.price ?? null,
  }));
  
  // Load bids from server
  await loadBids(pr.id);

  if (!productStore.products.length) {
    await productStore.fetchProducts();
  }
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  successMsg.value = '';
  currentPR.value = null;
  isEditing.value = false;
};

const addItemRow = () => {
  formItems.value.push({ productId: null, productName: '', name: '', qty: null, uom: '', specification: '', price: null });
};

const removeItemRow = (idx: number) => {
  formItems.value.splice(idx, 1);
};



const validateItems = () => {
  if (formItems.value.length === 0) return false;
  return formItems.value.every(item => {
    const hasName = formItemType.value === 'inventory' ? !!(item.productId || item.productName) : !!item.name;
    return hasName && item.qty !== null && item.qty > 0;
  });
};

const submitPR = async (mode: 'draft' | 'submit') => {
  if (!validateItems()) {
    alert('Lengkapi item: pastikan setiap baris punya nama item dan qty > 0.');
    return;
  }


  submitting.value = true;
  try {
    const payload = {
      pr_number: form.value.pr_number || undefined,
      department: form.value.department || undefined,
      project_id: form.value.project_id || undefined,
      request_date: form.value.request_date || undefined,
      needed_by: form.value.needed_by || undefined,
      reason: form.value.reason || undefined,
      status: mode === 'draft' ? 'draft' : 'submitted',
      notes: JSON.stringify({
        noteText: form.value.notes,
        itemType: formItemType.value,
        items: formItems.value.map(item => ({
          productId: item.productId,
          productName: item.productName,
          name: item.name,
          qty: item.qty,
          uom: item.uom,
          specification: item.specification,
          price: item.price || 0,
        })),
        estimatedTotal: estimatedTotal.value
      }),
      requester_id: authStore.user?.id
    };

    await api.post('/procurement/purchase-requests', payload);
    successMsg.value = mode === 'draft' ? 'Draft PR tersimpan.' : 'PR dikirim untuk approval.';
    closeModal();
  } catch (error: any) {
    console.error('Submit PR error:', error);
    alert(error?.response?.data?.error || 'Failed to create purchase request');
  } finally {
    submitting.value = false;
    // Always refresh data after action
    try { await store.fetchPurchaseRequests(); } catch { /* ignore refresh errors */ }
  }
};

const updatePR = async () => {
  if (!currentPR.value?.id) {
    alert('No PR to update');
    return;
  }
  
  if (!validateItems()) {
    alert('Lengkapi item: pastikan setiap baris punya nama item dan qty > 0.');
    return;
  }


  if (!confirm('Save changes to this PR?')) return;

  submitting.value = true;
  try {
    await api.put(`/procurement/purchase-requests/${currentPR.value.id}`, {
      status: currentPR.value.status || 'draft',
      project_id: form.value.project_id || undefined,
      request_date: form.value.request_date || undefined,
      department: form.value.department || undefined,
      needed_by: form.value.needed_by || undefined,
      reason: form.value.reason || undefined,
      notes: JSON.stringify({
        noteText: form.value.notes,
        itemType: formItemType.value,
        items: formItems.value.map(item => ({
          productId: item.productId,
          productName: item.productName,
          name: item.name,
          qty: item.qty,
          uom: item.uom,
          specification: item.specification,
          price: item.price || 0,
        })),
        estimatedTotal: estimatedTotal.value
      })
    });
    successMsg.value = 'PR updated successfully!';
    closeModal();
  } catch (error: any) {
    console.error('Update PR error:', error);
    alert(error?.response?.data?.error || 'Failed to update purchase request');
  } finally {
    submitting.value = false;
    try { await store.fetchPurchaseRequests(); } catch { /* ignore */ }
  }
};

const deletePR = async (id: number) => {
  if (!confirm('Delete this draft PR? This action cannot be undone.')) return;
  submitting.value = true;
  try {
    await api.delete(`/procurement/purchase-requests/${id}`);
    successMsg.value = 'PR deleted successfully.';
  } catch (error: any) {
    // PR yang sudah disetujui atau sudah punya penawaran vendor tidak dihapus
    // permanen — backend memintanya dibatalkan dengan alasan (soft delete).
    if (error?.response?.data?.code === 'REASON_REQUIRED') {
      const reason = prompt('PR ini sudah disetujui / sudah ada penawaran vendor, jadi akan dibatalkan (bukan dihapus permanen).\n\nAlasan pembatalan:');
      if (reason === null) return;
      if (!reason.trim()) { alert('Alasan wajib diisi.'); return; }
      try {
        await api.delete(`/procurement/purchase-requests/${id}`, { data: { reason: reason.trim() } });
        successMsg.value = 'PR dibatalkan.';
        return;
      } catch (e: any) {
        alert(e?.response?.data?.error || 'Gagal membatalkan purchase request');
        return;
      }
    }
    console.error('Delete PR error:', error);
    alert(error?.response?.data?.error || 'Failed to delete purchase request');
  } finally {
    submitting.value = false;
    try { await store.fetchPurchaseRequests(); } catch { /* ignore */ }
  }
};

const approvePR = async (id: number) => {
  if (!confirm('Approve PR? Pastikan semua data sudah benar.')) return;
  submitting.value = true;
  try {
    const res = await api.post(`/procurement/purchase-requests/${id}/approve`);
    successMsg.value = res.data?.message || 'PR approved.';
  } catch (error: any) {
    console.error('Approve PR error:', error);
    alert(error?.response?.data?.error || 'Failed to approve purchase request');
  } finally {
    submitting.value = false;
    try { await store.fetchPurchaseRequests(); } catch { /* ignore */ }
  }
};

const rejectPR = async (id: number) => {
  if (!confirm('Reject dan kembalikan PR ke pending?')) return;
  submitting.value = true;
  try {
    const res = await api.post(`/procurement/purchase-requests/${id}/reject`);
    successMsg.value = res.data?.message || 'PR dikembalikan ke pending.';
  } catch (error: any) {
    console.error('Reject PR error:', error);
    alert(error?.response?.data?.error || 'Failed to reject purchase request');
  } finally {
    submitting.value = false;
    try { await store.fetchPurchaseRequests(); } catch { /* ignore */ }
  }
};

const convertToPO = async (pr: any) => {
  const progress = getBidProgress(pr.id);
  if (progress.total_bids === 0) {
    alert('Belum ada vendor bid. Buka PR dan tambahkan vendor di Bid Tabulation terlebih dahulu.');
    return;
  }
  if (!progress.has_winner) {
    alert(`Belum ada pemenang per item (${progress.percentage || 0}% item sudah ada harga).\n\nBuka PR ini dan klik "Pilih" pada setiap item untuk menentukan vendor pemenang.`);
    return;
  }

  const itemsWon = progress.items_with_winner ?? 0;
  const totalItems = progress.total_items ?? 0;
  const confirm_msg = `Generate draft PO dari hasil bidding?\n\n• ${itemsWon}/${totalItems} item sudah ada pemenang\n• Setiap vendor pemenang akan mendapat 1 draft PO\n\nLanjutkan?`;
  if (!confirm(confirm_msg)) return;

  submitting.value = true;
  try {
    const res = await api.post(`/procurement/purchase-requests/${pr.id}/generate-pos`);
    const pos = res.data.data || [];
    const poList = pos.map((p: any) => `• ${p.po_number} — ${p.vendor_name} (${p.items_count} item, Rp ${p.total_amount.toLocaleString('id-ID')})`).join('\n');
    alert(`✅ ${res.data.message}:\n\n${poList}\n\nDraft PO sudah bisa dilihat di halaman Purchase Orders.`);
    await store.fetchPurchaseRequests();
    await loadBidProgress();
    // Navigate to PO page
    router.push({ name: 'ProcurementPO' });
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal generate PO');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  await fetchData();
  loadProjects();
  loadVendors();
  await loadBidProgress();
});

function printPR() {
  const notes = parseNotes(form.value.notes);
  const prItems = notes.items || [];
  
  const printContent = `
    <html>
      <head>
        <title>Purchase Request - ${form.value.pr_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #333; }
          .header p { margin: 5px 0; color: #666; }
          .details { margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 5px 0; }
          .detail-label { font-weight: bold; width: 150px; }
          .detail-value { flex: 1; }
          .divider { border-top: 1px solid #ccc; margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .total-row { font-weight: bold; }
          .total-value { text-align: right; }
          .footer { margin-top: 40px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PURCHASE REQUEST</h1>
          <p>PR No: ${form.value.pr_number}</p>
        </div>
        
        <div class="details">
          <div class="detail-row">
            <span class="detail-label">Request Date:</span>
            <span class="detail-value">${formatDate(form.value.request_date)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Needed By:</span>
            <span class="detail-value">${formatDate(form.value.needed_by) || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Department:</span>
            <span class="detail-value">${form.value.department || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Requester:</span>
            <span class="detail-value">${form.value.requester_name || authStore.user?.name || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${form.value.approval_status === 2 ? 'Approved' : form.value.approval_status === 1 ? 'Pending Approval' : 'Draft'}</span>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="details">
          <h3>Request Details</h3>
          <div class="detail-row">
            <span class="detail-label">Purpose / Reason:</span>
            <span class="detail-value">${form.value.reason || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Item Type:</span>
            <span class="detail-value">${notes.itemType || 'inventory'}</span>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <h3>Items</h3>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Item Name</th>
              <th>Qty</th>
              <th>UoM</th>
              <th>Est. Price (IDR)</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${prItems.map((item: any, idx: number) => '<tr><td>' + (idx + 1) + '</td><td>' + (item.productName || item.name || '-') + '</td><td>' + (item.qty || 0) + '</td><td>' + (item.uom || '-') + '</td><td>' + formatCurrency(item.price || 0) + '</td><td>' + formatCurrency((item.qty || 0) * (item.price || 0)) + '</td></tr>').join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 20px; text-align: right; width: 300px; margin-left: auto;">
          <div class="detail-row total-row" style="border-top: 2px solid #333; padding-top: 10px; font-size: 16px;">
            <span class="detail-label">Estimated Total:</span>
            <span class="detail-value">${formatCurrency(notes.estimatedTotal || 0)}</span>
          </div>
        </div>
        
        <div class="footer">
          <p>Notes: ${notes.noteText || '-'}</p>
          <p style="margin-top: 30px; text-align: center;">
            Printed on ${new Date().toLocaleDateString('id-ID')} at ${new Date().toLocaleTimeString('id-ID')}
          </p>
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
</script>
