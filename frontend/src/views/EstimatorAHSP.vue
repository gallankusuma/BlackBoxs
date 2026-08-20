<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">📐 AHSP (Analisa Harga Satuan Pekerjaan)</h1>
        <p class="text-gray-600 mt-1">Daftar Analisa Harga Satuan Pekerjaan untuk estimasi biaya konstruksi</p>
      </div>
      <div class="flex gap-3">
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          class="hidden"
          @change="handleFileSelect"
        />
        <button
          @click="downloadTemplate"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📋 Download Template
        </button>
        <button data-fitur="import-export"
          @click="fileInput?.click()"
          class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors flex items-center gap-2"
        >
          📤 Import Excel
        </button>
        <button
          @click="onAddAhsp"
          class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          + Add AHSP
        </button>
      </div>
    </div>

    <!-- Search & Category Filter -->
    <div class="flex gap-2 mb-2">
      <input
        v-model="search"
        type="text"
        placeholder="🔍 Cari kode atau nama pekerjaan..."
        class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button v-if="selectedCategory" @click="selectedCategory = ''"
        class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border">✕ Reset Filter</button>
    </div>

    <!-- Category + Table layout -->
    <div class="flex gap-4">
      <!-- Category Sidebar -->
      <div class="w-64 shrink-0">
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div class="bg-gradient-to-r from-blue-700 to-blue-600 text-white px-4 py-3">
            <h3 class="font-bold text-sm">📂 Kategori Pekerjaan</h3>
            <p class="text-xs text-blue-200 mt-0.5">{{ ahspCategories.length }} kategori · {{ ahspList.length }} item</p>
          </div>
          <div class="divide-y divide-gray-100">
            <button
              @click="selectedCategory = ''"
              class="w-full text-left px-4 py-2.5 text-sm flex justify-between items-center transition-colors"
              :class="selectedCategory === '' ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'"
            >
              <span>🗂️ Semua Kategori</span>
              <span class="text-xs px-1.5 py-0.5 rounded-full" :class="selectedCategory === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'">
                {{ ahspList.length }}
              </span>
            </button>
            <button
              v-for="cat in ahspCategories" :key="cat.work_category_code"
              @click="selectedCategory = cat.work_category"
              class="w-full text-left px-4 py-2.5 text-sm flex justify-between items-center transition-colors"
              :class="selectedCategory === cat.work_category ? 'bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-500' : 'hover:bg-gray-50 text-gray-700'"
            >
              <span class="leading-tight">{{ getCategoryIcon(cat.work_category_code) }} {{ cat.work_category }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded-full shrink-0 ml-1"
                :class="selectedCategory === cat.work_category ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'">
                {{ cat.jumlah }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- AHSP Table (Grouped) -->
      <div class="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div v-if="Object.keys(groupedAhsp).length === 0" class="p-8 text-center text-gray-500">
          Tidak ada data AHSP. Klik "Import Excel" atau "Add AHSP" untuk mulai.
        </div>
        
        <div v-else class="divide-y divide-gray-200">
          <div v-for="(items, catName) in groupedAhsp" :key="catName" class="bg-white">
            <!-- Category Group Header -->
            <div class="bg-gray-100 px-4 py-2.5 font-bold text-gray-800 flex justify-between items-center cursor-pointer" @click="toggleDiscipline(catName as string)">
              <div class="flex items-center gap-2">
                <span class="text-base">{{ getCategoryIconByName(catName as string) }}</span>
                <span class="text-sm">{{ catName === 'Uncategorized' ? 'Belum Dikategorikan' : catName }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-normal text-gray-500">{{ (items as any[]).length }} item</span>
                <span class="text-gray-400">{{ collapsedDisciplines[catName] ? '▶' : '▼' }}</span>
              </div>
            </div>
            
            <div v-if="!collapsedDisciplines[catName]">
              <!-- Items Table -->
              <table class="min-w-full divide-y divide-gray-100">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs text-gray-400 w-10">No</th>
                    <th class="px-4 py-2 text-left text-xs text-gray-400 w-28">Kode</th>
                    <th class="px-4 py-2 text-left text-xs text-gray-400">Uraian Pekerjaan</th>
                    <th class="px-4 py-2 text-center text-xs text-gray-400 w-20">Satuan</th>
                    <th class="px-4 py-2 text-right text-xs text-gray-400 w-40">Harga Satuan</th>
                    <th class="px-4 py-2 w-28"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(item, index) in (items as any[])" :key="item.id" class="hover:bg-blue-50 transition-colors">
                    <td class="px-4 py-2.5 text-center text-xs text-gray-400">{{ index + 1 }}</td>
                    <td class="px-4 py-2.5 font-mono text-xs font-medium text-blue-600">{{ item.kode }}</td>
                    <td class="px-4 py-2.5 text-sm">
                      <button class="text-gray-900 hover:text-blue-600 hover:underline text-left" @click="openDetail(item)">
                        {{ item.name }}
                      </button>
                    </td>
                    <td class="px-4 py-2.5 text-center text-sm text-gray-700">{{ item.satuan }}</td>
                    <td class="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{{ formatCurrency(item.harga_satuan) }}</td>
                    <td class="px-4 py-2.5">
                      <div class="flex items-center justify-end gap-1">
                        <button @click="openDetail(item)" title="View Detail" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Eye class="w-4 h-4" />
                        </button>
                        <button @click="onEditAhsp(item)" title="Edit" class="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors">
                          <Edit class="w-4 h-4" />
                        </button>
                        <button @click="onDeleteAhsp(item)" title="Delete" class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 class="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>



    <!-- Conflict Modal -->
    <div v-if="showConflictModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeConflictModal">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-auto">
        <div class="p-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold">⚠️ Import Conflict Detected</h2>
            <p class="text-sm text-gray-600">Found {{ conflictData.conflictCount }} conflicts out of {{ conflictData.totalRows }} records</p>
          </div>
          <button class="text-gray-500 hover:text-gray-800" @click="closeConflictModal">✕</button>
        </div>

        <div class="p-4 space-y-4">
          <!-- Conflict List -->
          <div class="border rounded-lg bg-gray-50 p-3">
            <h3 class="font-semibold mb-2">Conflicting AHSP:</h3>
            <ul class="space-y-1">
              <li v-for="conflict in conflictData.conflicts" :key="conflict.kode" class="text-sm text-gray-700">
                • <strong>{{ conflict.kode }}</strong> - {{ conflict.newName }}
              </li>
            </ul>
          </div>

          <!-- Resolution Options -->
          <div class="space-y-3">
            <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50" :class="{ 'bg-blue-50 border-blue-300': conflictResolution === 'replace-all' }">
              <input v-model="conflictResolution" type="radio" value="replace-all" name="resolution" class="mt-1" />
              <div>
                <p class="font-medium">🔄 Replace All</p>
                <p class="text-sm text-gray-600">Replace existing AHSP with new data</p>
              </div>
            </label>

            <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50" :class="{ 'bg-blue-50 border-blue-300': conflictResolution === 'skip-all' }">
              <input v-model="conflictResolution" type="radio" value="skip-all" name="resolution" class="mt-1" />
              <div>
                <p class="font-medium">⏭️ Skip All</p>
                <p class="text-sm text-gray-600">Keep existing AHSP, import new data only</p>
              </div>
            </label>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-3">
          <button class="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400" @click="closeConflictModal">Cancel</button>
          <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium" @click="executeImportWithResolution">Continue Import</button>
        </div>
      </div>
    </div>

    <div v-if="showDetail" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeDetail">
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[85vh] overflow-auto">
        <div class="p-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold">Analisa Harga Satuan Pekerjaan</h2>
            <p class="text-sm text-gray-600">{{ selectedAhsp?.kode }} - {{ selectedAhsp?.name }}</p>
          </div>
          <button class="text-gray-500 hover:text-gray-800" @click="closeDetail">✕</button>
        </div>

        <div class="p-4">
          <table class="min-w-full text-sm">
            <thead class="bg-blue-600 text-white">
              <tr>
                <th class="px-3 py-2 text-left w-14">No.</th>
                <th class="px-3 py-2 text-left">Uraian</th>
                <th class="px-3 py-2 text-left w-20">Kode</th>
                <th class="px-3 py-2 text-center w-20">Satuan</th>
                <th class="px-3 py-2 text-right w-20">Koef.</th>
                <th class="px-3 py-2 text-right w-28">Harga</th>
                <th class="px-3 py-2 text-right w-28">Jumlah</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">A</td>
                <td class="px-3 py-2 font-bold" colspan="6">Tenaga Kerja</td>
              </tr>
              <tr v-for="(row, idx) in sectionA" :key="`A-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">B</td>
                <td class="px-3 py-2 font-bold" colspan="6">Bahan</td>
              </tr>
              <tr v-for="(row, idx) in sectionB" :key="`B-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">C</td>
                <td class="px-3 py-2 font-bold" colspan="6">Peralatan</td>
              </tr>
              <tr v-for="(row, idx) in sectionC" :key="`C-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-100 font-semibold">
                <td class="px-3 py-2">D</td>
                <td class="px-3 py-2" colspan="5">Jumlah Harga Tenaga, Bahan dan Peralatan (A+B+C)</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(selectedAhsp?.harga_langsung || 0) }}</td>
              </tr>
              <tr class="bg-gray-100 font-semibold">
                <td class="px-3 py-2">E</td>
                <td class="px-3 py-2" colspan="5">Overhead + profit (10%)</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(selectedAhsp?.overhead_profit || 0) }}</td>
              </tr>
              <tr class="bg-gray-200 font-bold">
                <td class="px-3 py-2">F</td>
                <td class="px-3 py-2" colspan="5">Harga Satuan Pekerjaan (D+E)</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(selectedAhsp?.harga_satuan || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="p-4 border-t flex justify-end">
          <button class="px-4 py-2 bg-gray-700 text-white rounded" @click="closeDetail">Tutup</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="closeEditModal"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto">
        <div class="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold">Edit AHSP: {{ editForm.kode }}</h2>
          <button @click="closeEditModal" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        <div class="p-6 space-y-6">
          <!-- Header Info -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Kode AHSP</label>
              <input
                v-model="editForm.kode"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="A.1.1.1"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Satuan</label>
              <input
                v-model="editForm.satuan"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="m1, m2, m3, unit, dll"
              />
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Nama Pekerjaan</label>
              <input
                v-model="editForm.name"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Deskripsi pekerjaan"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Disiplin</label>
              <select
                v-model="editForm.discipline_id"
                @change="onDisciplineChange"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Pilih Disiplin</option>
                <option v-for="disc in disciplines" :key="disc.id" :value="disc.id">
                  {{ disc.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Sub Disiplin</label>
              <div class="flex gap-2">
                <select
                  v-model="editForm.sub_discipline_id"
                  @change="onSubDisciplineChange"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option :value="null">Tidak ada</option>
                  <option 
                    v-for="sub in filteredEditSubDisciplines" 
                    :key="sub.id" 
                    :value="sub.id"
                  >
                    {{ sub.name }}
                  </option>
                </select>
                <button
                  v-if="editForm.discipline_id"
                  type="button" 
                  @click="openAddSubDisciplineModal"
                  class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  title="Tambah Sub Disiplin Baru"
                >
                  <Plus class="w-5 h-5" />
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Version</label>
              <input
                v-model="editForm.version"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="2024"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                v-model="editForm.status"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <!-- Items Section -->
          <div class="border-t pt-4">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-semibold">Detail Items</h3>
              <button
                @click="addEditItem"
                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                + Add Item
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="px-2 py-2 text-left">Section</th>
                    <th class="px-2 py-2 text-left">Resource Name</th>
                    <th class="px-2 py-2 text-left">Satuan</th>
                    <th class="px-2 py-2 text-right">Koefisien</th>
                    <th class="px-2 py-2 text-right">Harga</th>
                    <th class="px-2 py-2 text-right">Jumlah</th>
                    <th class="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in editForm.items" :key="index" class="border-b">
                    <td class="px-2 py-2">
                      <select
                        v-model="item.section"
                        class="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="A">A - Tenaga</option>
                        <option value="B">B - Bahan</option>
                        <option value="C">C - Alat</option>
                      </select>
                    </td>
                    <td class="px-2 py-2">
                      <select
                        v-model="item.resource_id"
                        class="w-full px-2 py-1 border rounded text-sm"
                        @change="onResourceChange(item)"
                      >
                        <option :value="0" disabled>Pilih Resource</option>
                        <option 
                          v-for="opt in getResourceOptions(item.section)" 
                          :key="opt.id" 
                          :value="opt.id"
                        >
                          {{ opt.name }}
                        </option>
                      </select>
                      <div v-if="!item.resource_id && item.resource_name" class="text-xs text-red-500 mt-1">
                         Legacy: {{ item.resource_name }}
                      </div>
                    </td>
                    <td class="px-2 py-2">
                      <input
                        v-model="item.resource_satuan"
                        type="text"
                        class="w-full px-2 py-1 border rounded text-sm bg-gray-100"
                        placeholder="Satuan"
                        readonly
                      />
                    </td>
                    <td class="px-2 py-2">
                      <input
                        v-model.number="item.koefisien"
                        type="number"
                        step="0.001"
                        class="w-full px-2 py-1 border rounded text-sm text-right"
                        @input="updateItemJumlah(item)"
                      />
                    </td>
                    <td class="px-2 py-2">
                      <input
                        v-model.number="item.resource_harga"
                        type="number"
                        step="1"
                        class="w-full px-2 py-1 border rounded text-sm text-right bg-gray-100"
                        readonly
                      />
                    </td>
                    <td class="px-2 py-2 text-right">
                      {{ formatCurrency(item.jumlah_harga || 0) }}
                    </td>
                    <td class="px-2 py-2">
                      <button
                        @click="removeEditItem(index)"
                        class="text-red-600 hover:text-red-800"
                        title="Hapus"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="sticky bottom-0 bg-white border-t p-4 flex justify-end gap-3">
          <button
            @click="closeEditModal"
            class="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            :disabled="isSavingEdit"
          >
            Batal
          </button>
          <button
            @click="saveEditedAhsp"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            :disabled="isSavingEdit"
          >
            {{ isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </div>
    </div>
    <!-- Add Sub Discipline Modal -->
    <div
      v-if="showAddSubModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      @click.self="showAddSubModal = false"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div class="border-b px-6 py-4 flex justify-between items-center bg-gray-50 rounded-t-lg">
          <h3 class="text-lg font-bold">Tambah Sub Disiplin</h3>
          <button @click="showAddSubModal = false" class="text-gray-500 hover:text-gray-700">&times;</button>
        </div>
        
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kode Sub Disiplin</label>
            <input
              v-model="newSubForm.code"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: STR.01"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Sub Disiplin</label>
            <input
              v-model="newSubForm.name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: Steel Structure"
            />
          </div>
        </div>
        
        <div class="border-t px-6 py-4 flex justify-end gap-3 bg-gray-50 rounded-b-lg">
          <button
            @click="showAddSubModal = false"
            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            :disabled="isSavingSub"
          >
            Batal
          </button>
          <button
            @click="saveNewSubDiscipline"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            :disabled="isSavingSub"
          >
            {{ isSavingSub ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';
import { Eye, Edit, Trash2, Plus } from 'lucide-vue-next';

interface SubDiscipline {
  id: number;
  name: string;
}

interface AhspItem {
  id: number;
  kode: string;
  name: string;
  satuan: string;
  harga_satuan: number;
  harga_langsung?: number;
  overhead_profit?: number;
  discipline_name?: string;
  sub_discipline_name?: string;
}

interface AhspDetailItem {
  section: string;
  koefisien: number;
  resource_name: string;
  resource_satuan: string;
  resource_harga: number;
  jumlah_harga: number;
  resource_code?: string;
}

const search = ref('');
const selectedCategory = ref('');
const ahspCategories = ref<any[]>([]);
const ahspList = ref<AhspItem[]>([]);
const showDetail = ref(false);
const selectedAhsp = ref<any>(null);
const detailItems = ref<AhspDetailItem[]>([]);
const disciplines = ref<any[]>([]);
const subDisciplines = ref<SubDiscipline[]>([]);
const allSubDisciplines = ref<any[]>([]);
const selectedSubDisciplineId = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const masterLabor = ref<any[]>([]);
const masterMaterials = ref<any[]>([]);
const masterEquipment = ref<any[]>([]);

// Edit modal states
const showEditModal = ref(false);
const editingAhsp = ref<any>(null);
const editForm = ref({
  id: null as number | null,
  kode: '',
  name: '',
  satuan: '',
  version: '2024',
  status: 'active',
  discipline_id: 1,
  sub_discipline_id: null as number | null,
  items: [] as any[]
});
const isLoadingEdit = ref(false);
const isSavingEdit = ref(false);
const isEditMode = ref(true);
const collapsedDisciplines = ref<Record<string, boolean>>({});

const filteredEditSubDisciplines = computed(() => {
  if (!editForm.value.discipline_id) return [];
  return allSubDisciplines.value.filter((sub: any) => sub.discipline_id === editForm.value.discipline_id);
});

const onDisciplineChange = () => {
  // Reset sub-discipline when discipline changes
  editForm.value.sub_discipline_id = null;
};

const getCategoryIcon = (code: string) => {
  const icons: Record<string, string> = {
    'CAT-01': '🚧', 'CAT-02': '⛏️', 'CAT-03': '📀', 'CAT-04': '🏗️',
    'CAT-05': '🏠', 'CAT-06': '🌳', 'CAT-07': '⚡', 'CAT-08': '🚨',
    'CAT-09': '🛣️', 'CAT-10': '🐧', 'CAT-11': '💧', 'CAT-12': '🧩',
    'CAT-13': '🚛', 'CAT-14': '🛍️', 'CAT-15': '🚗', 'CAT-16': '🔧', 'CAT-17': '🌊',
  };
  return icons[code] || '📄';
};

const getCategoryIconByName = (name: string) => {
  const cat = ahspCategories.value.find(c => c.work_category === name);
  return cat ? getCategoryIcon(cat.work_category_code) : '📄';
};

const filteredAhsp = computed(() => {
  const q = search.value.toLowerCase();
  let list = ahspList.value;
  
  // Filter by category
  if (selectedCategory.value) {
    list = list.filter(item => (item as any).work_category === selectedCategory.value);
  }
  
  // Filter by search query
  if (q) {
    list = list.filter(item =>
      item.kode.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    );
  }
  
  return list;
});

const groupedAhsp = computed(() => {
  const groups: Record<string, any[]> = {};
  
  filteredAhsp.value.forEach(item => {
    const cat = (item as any).work_category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  
  return groups;
});

const toggleDiscipline = (discName: string) => {
  collapsedDisciplines.value[discName] = !collapsedDisciplines.value[discName];
};



const onSubDisciplineChange = async () => {
  if (!isEditMode.value && editForm.value.sub_discipline_id) {
    try {
      const { data } = await api.get('/estimator/ahsp/next-code', {
        params: { 
          sub_discipline_id: editForm.value.sub_discipline_id,
          discipline_id: editForm.value.discipline_id
        }
      });
      if (data.nextCode) {
        editForm.value.kode = data.nextCode;
      }
    } catch (error) {
      console.error('Failed to generate next code:', error);
    }
  }
};

const sectionA = computed(() => detailItems.value.filter(i => i.section === 'A'));
const sectionB = computed(() => detailItems.value.filter(i => i.section === 'B'));
const sectionC = computed(() => detailItems.value.filter(i => i.section === 'C'));

const loadSubDisciplines = async () => {
  const { data: disciplineData } = await api.get('/estimator/disciplines');
  disciplines.value = disciplineData;
  
  const list: SubDiscipline[] = [];
  for (const d of disciplineData) {
    const { data } = await api.get(`/estimator/disciplines/${d.id}/sub-disciplines`);
    list.push(...data.map((sub: any) => ({ ...sub, discipline_id: d.id })));
  }
  subDisciplines.value = list;
  allSubDisciplines.value = list;
};

const loadMasters = async () => {
  try {
    const [laborRes, materialRes, equipmentRes] = await Promise.all([
      api.get('/estimator/masters/labor'),
      api.get('/estimator/masters/materials'),
      api.get('/estimator/masters/equipment')
    ]);
    masterLabor.value = laborRes.data;
    masterMaterials.value = materialRes.data;
    masterEquipment.value = equipmentRes.data;
  } catch (error) {
    console.error('Failed to load master data:', error);
  }
};

const getResourceOptions = (section: string) => {
  if (section === 'A') return masterLabor.value;
  if (section === 'B') return masterMaterials.value;
  if (section === 'C') return masterEquipment.value;
  return [];
};

const onResourceChange = (item: any) => {
  const options = getResourceOptions(item.section);
  const selected = options.find((opt: any) => opt.id === item.resource_id);
  if (selected) {
    item.resource_name = selected.name;
    item.resource_satuan = selected.satuan;
    item.resource_harga = selected.harga;
    item.resource_type = item.section === 'A' ? 'labor' : item.section === 'B' ? 'material' : 'equipment';
    updateItemJumlah(item);
  }
};

const loadAhsp = async () => {
  const { data } = await api.get('/estimator/ahsp');
  ahspList.value = data || [];
};

const loadCategories = async () => {
  try {
    const { data } = await api.get('/estimator/ahsp-categories');
    ahspCategories.value = data || [];
  } catch { ahspCategories.value = []; }
};


const onAddAhsp = () => {
  editForm.value = {
    id: null,
    kode: '',
    name: '',
    satuan: '',
    version: '2024',
    status: 'active',
    discipline_id: 1,
    sub_discipline_id: null,
    items: []
  };
  isEditMode.value = false;
  showEditModal.value = true;
};

const downloadTemplate = async () => {
  try {
    const response = await api.get('/import/template/ahsp', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_ahsp.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    alert('Failed to download template: ' + (error.response?.data?.error || error.message));
  }
};

const showConflictModal = ref(false);
const conflictData = ref<any>(null);
const conflictResolution = ref('skip-all');
let pendingImportData: any[] = [];

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    // First, check for conflicts
    const response = await api.post('/import/check-conflicts/ahsp', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    pendingImportData = response.data.data;
    conflictData.value = response.data.preview;
    conflictResolution.value = 'skip-all';

    if (response.data.preview.conflictCount > 0) {
      // Show conflict modal
      showConflictModal.value = true;
    } else {
      // No conflicts, proceed with import
      await executeImportWithResolution();
    }
  } catch (error: any) {
    const errData = error.response?.data;
    if (errData?.validation) {
      alert(
        `❌ Import validation error:\n\n` +
        `Total rows: ${errData.validation.totalRows}\n` +
        `Valid: ${errData.validation.validRows}\n` +
        `Invalid: ${errData.validation.invalidRows?.length || 0}\n\n` +
        `First error:\n${JSON.stringify(errData.validation.firstError, null, 2)}`
      );
    } else {
      alert('Failed to check conflicts: ' + (errData?.error || error.message));
    }
  } finally {
    // Reset file input
    if (fileInput.value) {
      fileInput.value.value = '';
    }
  }
};

const closeConflictModal = () => {
  showConflictModal.value = false;
  conflictData.value = null;
  pendingImportData = [];
};

const executeImportWithResolution = async () => {
  try {
    const response = await api.post('/import/resolve-conflicts/ahsp', {
      data: pendingImportData,
      resolution: conflictResolution.value
    });

    alert(
      `✅ Import successful!\n\n` +
      `Total imported: ${response.data.importedCount} AHSP`
    );

    // Close modal and reload data
    closeConflictModal();
    await loadAhsp();
  } catch (error: any) {
    alert('Failed to import: ' + (error.response?.data?.error || error.message));
  }
};

const onEditAhsp = async (item: AhspItem) => {
  try {
    isLoadingEdit.value = true;
    isEditMode.value = true;
    editingAhsp.value = item;
    
    // Load detail
    const response = await api.get(`/estimator/ahsp/${item.id}`);
    const data = response.data;
    
    // Populate form with legacy mapping
    const items = (data.items || []).map((item: any) => {
      // If resource_id is missing/0, try to find mapping in master data
      if (!item.resource_id) {
        let masterList: any[] = [];
        if (item.section === 'A') masterList = masterLabor.value;
        else if (item.section === 'B') masterList = masterMaterials.value;
        else if (item.section === 'C') masterList = masterEquipment.value;

        // Try exact name match (trimmed)
        const found = masterList.find(m => m.name.trim().toLowerCase() === item.resource_name?.trim().toLowerCase());
        if (found) {
          item.resource_id = found.id;
          item.resource_satuan = found.satuan;
          item.resource_harga = found.harga;
        }
      }
      return item;
    });

    editForm.value = {
      id: data.id,
      kode: data.kode,
      name: data.name,
      satuan: data.satuan,
      version: data.version || '2024',
      status: data.status || 'active',
      discipline_id: data.discipline_id || 1,
      sub_discipline_id: data.sub_discipline_id || null,
      items: items
    };
    
    showEditModal.value = true;
  } catch (error) {
    console.error('Error loading AHSP detail:', error);
    alert('Gagal memuat data AHSP');
  } finally {
    isLoadingEdit.value = false;
  }
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingAhsp.value = null;
  editForm.value = {
    id: null,
    kode: '',
    name: '',
    satuan: '',
    version: '2024',
    status: 'active',
    discipline_id: 1,
    sub_discipline_id: null,
    items: []
  };
};

const saveEditedAhsp = async () => {
  try {
    isSavingEdit.value = true;
    
    if (isEditMode.value) {
      if (!editingAhsp.value) return;
      await api.put(`/estimator/ahsp/${editingAhsp.value.id}`, editForm.value);
      alert('AHSP berhasil diupdate!');
    } else {
      await api.post('/estimator/ahsp', editForm.value);
      alert('AHSP berhasil dibuat!');
    }
    
    closeEditModal();
    loadAhsp();
  } catch (error) {
    console.error('Error saving AHSP:', error);
    alert('Gagal menyimpan AHSP');
  } finally {
    isSavingEdit.value = false;
  }
};

const addEditItem = () => {
  editForm.value.items.push({
    section: 'A',
    resource_type: 'labor',
    resource_id: 0,
    resource_name: '',
    resource_satuan: '',
    koefisien: 0,
    resource_harga: 0,
    jumlah_harga: 0
  });
};

const removeEditItem = (index: number) => {
  editForm.value.items.splice(index, 1);
};

const updateItemJumlah = (item: any) => {
  item.jumlah_harga = (item.koefisien || 0) * (item.resource_harga || 0);
};

const onDeleteAhsp = async (item: AhspItem) => {
  const confirmed = confirm(`Hapus AHSP ${item.kode}?`);
  if (!confirmed) return;
  
  try {
    console.log('Deleting AHSP ID:', item.id);
    await api.delete(`/estimator/ahsp/${item.id}`);
    alert('AHSP berhasil dihapus');
    loadAhsp();
  } catch (error: any) {
    console.error('Error deleting AHSP:', error);
    alert(`Gagal menghapus AHSP: ${error.response?.data?.error || error.message}`);
  }
};

const openDetail = async (item: AhspItem) => {
  try {
    const { data } = await api.get(`/estimator/ahsp/${item.id}`);
    selectedAhsp.value = data;
    detailItems.value = (data.items || []).map((row: any) => ({
      ...row,
      jumlah_harga: row.jumlah_harga ?? (parseFloat(row.koefisien) * parseFloat(row.resource_harga))
    }));
    showDetail.value = true;
  } catch (error) {
    console.error('Failed to load AHSP detail:', error);
    alert('Gagal memuat detail AHSP');
  }
};

const closeDetail = () => {
  showDetail.value = false;
  selectedAhsp.value = null;
  detailItems.value = [];
};



const formatNumber = (value: number) => {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value || 0);
};

watch(selectedSubDisciplineId, () => {
  loadAhsp();
});

onMounted(() => {
  loadSubDisciplines();
  loadAhsp();
  loadMasters();
  loadCategories();
});

const showAddSubModal = ref(false);
const newSubForm = ref({
  code: '',
  name: ''
});
const isSavingSub = ref(false);

const openAddSubDisciplineModal = () => {
  newSubForm.value = { code: '', name: '' };
  showAddSubModal.value = true;
};

const saveNewSubDiscipline = async () => {
  if (!editForm.value.discipline_id) return;
  if (!newSubForm.value.code || !newSubForm.value.name) {
    alert('Kode dan Nama Sub Disiplin wajib diisi');
    return;
  }
  
  isSavingSub.value = true;
  try {
    const { data } = await api.post(`/estimator/disciplines/${editForm.value.discipline_id}/sub-disciplines`, newSubForm.value);
    
    // Refresh sub disciplines
    await loadSubDisciplines();
    
    // Auto select
    editForm.value.sub_discipline_id = data.id;
    
    showAddSubModal.value = false;
    alert('Sub Disiplin berhasil ditambahkan');
    
    // Trigger auto code generation
    onSubDisciplineChange();
    
  } catch(error: any) {
    console.error(error);
    alert('Gagal menambah sub disiplin: ' + (error.response?.data?.error || error.message));
  } finally {
    isSavingSub.value = false;
  }
};
</script>
