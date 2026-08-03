<template>
  <div class="space-y-5">

    <!-- Breadcrumb Navigation -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2 text-sm">
        <button @click="activeFolder = null" class="font-semibold text-blue-600 hover:text-blue-800">📁 Semua Folder</button>
        <template v-if="activeFolder">
          <span class="text-gray-400">/</span>
          <span class="font-semibold text-gray-800">{{ activeFolder }}</span>
        </template>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400">{{ filteredFiles.length }} dokumen</span>
        <!-- View toggle -->
        <div class="flex border border-gray-200 rounded-lg overflow-hidden">
          <button @click="viewMode = 'grid'" :class="viewMode==='grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'" class="px-3 py-1.5 text-sm transition-colors" title="Grid view">
            ⋮⋮
          </button>
          <button @click="viewMode = 'list'" :class="viewMode==='list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'" class="px-3 py-1.5 text-sm border-l border-gray-200 transition-colors" title="List view">
            ☰
          </button>
        </div>
        <!-- Select mode toggle -->
        <button @click="toggleSelectMode"
          class="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
          :class="selectMode ? 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'">
          {{ selectMode ? '✕ Batal' : '☑ Pilih' }}
        </button>
        <button @click="openAddModal" class="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-sm">
          ＋ Tambah Dokumen
        </button>
      </div>
    </div>

    <!-- Bulk action bar -->
    <div v-if="selectMode && selectedIds.size > 0"
      class="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <span class="text-sm font-semibold text-red-700">{{ selectedIds.size }} dokumen dipilih</span>
      <button @click="selectAll" class="text-xs text-blue-600 hover:underline">Pilih semua ({{ filteredFiles.length }})</button>
      <button @click="deselectAll" class="text-xs text-gray-500 hover:underline">Batalkan</button>
      <div class="ml-auto">
        <button @click="bulkDelete"
          class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 flex items-center gap-2">
          🗑 Hapus {{ selectedIds.size }} Dokumen
        </button>
      </div>
    </div>

    <!-- Folder Grid (shown when no folder selected) -->
    <div v-if="!activeFolder" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <button v-for="cat in CATEGORIES" :key="cat"
        @click="activeFolder = cat"
        class="group flex flex-col items-start p-4 bg-white border-2 border-gray-100 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-all shadow-sm hover:shadow-md text-left">
        <div class="text-4xl mb-3">{{ FOLDER_ICONS[cat] || '📁' }}</div>
        <div class="font-semibold text-gray-800 text-sm">{{ cat }}</div>
        <div class="text-xs text-gray-400 mt-1">
          {{ files.filter(f => (f.doc_category || 'Other') === cat).length }} dokumen
        </div>
        <div class="mt-2 w-full bg-gray-100 rounded-full h-1 overflow-hidden">
          <div class="h-1 rounded-full bg-blue-400 transition-all"
            :style="`width:${files.length ? Math.min(100, files.filter(f=>(f.doc_category||'Other')===cat).length/files.length*100) : 0}%`">
          </div>
        </div>
      </button>
      <!-- All Files folder -->
      <button @click="activeFolder = '__all__'"
        class="group flex flex-col items-start p-4 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm hover:shadow-md text-left">
        <div class="text-4xl mb-3">🗂</div>
        <div class="font-semibold text-gray-800 text-sm">Semua File</div>
        <div class="text-xs text-gray-400 mt-1">{{ files.length }} dokumen total</div>
      </button>
    </div>

    <!-- Drop Zone (always visible) -->
    <div class="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer"
      :class="isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'"
      @click="fileInputRef?.click()"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop">
      <input type="file" ref="fileInputRef" class="hidden" multiple @change="handleFileChange" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.zip,.dwg,.dxf">
      <div class="text-3xl mb-2">{{ isDragging ? '📥' : '📂' }}</div>
      <p class="text-sm font-medium text-gray-600">{{ isDragging ? 'Lepas untuk upload' : 'Klik atau drag & drop untuk upload cepat' }}</p>
      <p class="text-xs text-gray-400 mt-1">PDF, Word, Excel, DWG, Image (Max 50MB)</p>
    </div>

    <!-- Upload Progress -->
    <div v-if="uploading" class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      <span class="text-sm text-blue-700">Mengupload file...</span>
    </div>

    <!-- Files: Grid + Side Panel layout -->
    <div v-if="activeFolder && filteredFiles.length > 0" class="flex gap-4" style="min-height:400px">

      <!-- ── GRID VIEW ── -->
      <div v-if="viewMode === 'grid'"
        class="flex-1 grid gap-3 content-start"
        style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))">
        <div v-for="file in filteredFiles" :key="file.id"
          class="group relative rounded-xl border-2 cursor-pointer transition-all duration-150 bg-white hover:shadow-md"
          :class="selectedFile?.id === file.id
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : selectedIds.has(file.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:border-blue-200'"
          @click="selectMode ? toggleSelect(file.id) : selectFileCard(file)">
          <!-- Select checkbox overlay -->
          <div v-if="selectMode" class="absolute top-2 left-2 z-10">
            <input type="checkbox" :checked="selectedIds.has(file.id)" @click.stop @change="toggleSelect(file.id)"
              class="w-4 h-4 accent-blue-600 cursor-pointer">
          </div>
          <!-- File type icon area -->
          <div class="flex items-center justify-center py-5 text-5xl">
            <span v-if="file.file_type === 'pdf'" style="color:#ef4444">📕</span>
            <span v-else-if="file.file_type === 'image'" style="color:#3b82f6">🖼️</span>
            <span v-else-if="file.file_type === 'excel'" style="color:#22c55e">📗</span>
            <span v-else-if="file.file_type === 'word'" style="color:#3b82f6">📘</span>
            <span v-else style="color:#f59e0b">📄</span>
          </div>
          <!-- File name -->
          <div class="px-2 pb-3 text-center">
            <p class="text-xs font-semibold text-gray-800 truncate" :title="file.doc_title || file.file_name">
              {{ (file.doc_title || file.file_name).length > 22 ? (file.doc_title || file.file_name).slice(0,22)+'…' : (file.doc_title || file.file_name) }}
            </p>
            <p class="text-xs text-gray-400 mt-0.5 truncate">{{ file.file_name }}</p>
          </div>
          <!-- Status dot -->
          <span class="absolute top-2 right-2 w-2 h-2 rounded-full"
            :class="file.doc_status==='approved' ? 'bg-green-500' : file.doc_status==='issued' ? 'bg-blue-500' : file.doc_status==='superseded' ? 'bg-gray-400' : 'bg-yellow-400'"
            :title="file.doc_status || 'draft'"></span>
        </div>
      </div>

      <!-- ── LIST VIEW ── -->
      <div v-else class="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table class="min-w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th v-if="selectMode" class="px-3 py-3 w-8">
                <input type="checkbox" :checked="allSelected" @change="allSelected ? deselectAll() : selectAll()"
                  class="w-4 h-4 rounded accent-blue-600 cursor-pointer">
              </th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dokumen</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Kategori</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rev</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ukuran</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Upload</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="file in filteredFiles" :key="file.id"
              class="hover:bg-gray-50 transition-colors group"
              :class="[selectedIds.has(file.id) ? 'bg-blue-50' : '', selectedFile?.id===file.id ? 'bg-blue-50' : '']"
              @click="selectMode ? toggleSelect(file.id) : selectFileCard(file)">
              <td v-if="selectMode" class="px-3 py-3" @click.stop>
                <input type="checkbox" :checked="selectedIds.has(file.id)" @change="toggleSelect(file.id)"
                  class="w-4 h-4 rounded accent-blue-600 cursor-pointer">
              </td>
              <td class="px-4 py-3 text-2xl">{{ getIcon(file.file_type) }}</td>
              <td class="px-4 py-3 max-w-xs">
                <div class="font-medium text-gray-900 text-sm truncate" :title="file.doc_title || file.file_name">{{ file.doc_title || file.file_name }}</div>
                <div v-if="file.doc_no" class="text-xs text-gray-400 mt-0.5">{{ file.doc_no }}</div>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" :style="getCategoryStyle(file.doc_category)">{{ file.doc_category || 'Other' }}</span>
              </td>
              <td class="px-4 py-3 text-sm font-mono font-bold text-gray-700">{{ file.revision || 'A' }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" :class="statusClass(file.doc_status)">{{ file.doc_status || 'draft' }}</span>
              </td>
              <td class="px-4 py-3 text-xs text-gray-500">{{ formatSize(file.file_size) }}</td>
              <td class="px-4 py-3 text-xs text-gray-500">
                <div>{{ file.uploader_name || 'Unknown' }}</div>
                <div>{{ formatDate(file.uploaded_at) }}</div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button v-if="!selectMode" @click.stop="openPreview(file)" title="Preview" class="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center text-sm">👁</button>
                  <button v-if="!selectMode" @click.stop="openEditModal(file)" title="Edit" class="w-7 h-7 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center text-sm">✏️</button>
                  <button v-if="!selectMode" @click.stop="downloadFile(file)" title="Download" class="w-7 h-7 rounded-md bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center text-sm">⬇️</button>
                  <button @click.stop="confirmDelete(file)" title="Hapus" class="w-7 h-7 rounded-md bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm">🗑</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── SIDE PREVIEW PANEL ── -->
      <transition name="slide-panel">
        <div v-if="selectedFile" class="bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col overflow-hidden" style="width:300px;min-width:300px;max-height:600px">
          <!-- Panel header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span class="text-sm font-semibold text-gray-700 truncate">{{ selectedFile.doc_title || selectedFile.file_name }}</span>
            <button @click="selectedFile = null; sidePanelBlobUrl = null" class="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <!-- Thumbnail / Preview area -->
          <div class="flex-1 bg-gray-50 flex items-center justify-center overflow-hidden" style="min-height:220px;max-height:280px">
            <div v-if="sidePanelLoading" class="text-center text-gray-400">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <span class="text-xs">Loading...</span>
            </div>
            <iframe v-else-if="selectedFile.file_type==='pdf' && sidePanelBlobUrl"
              :src="sidePanelBlobUrl" class="w-full h-full border-0" title="Preview"></iframe>
            <img v-else-if="selectedFile.file_type==='image' && sidePanelBlobUrl"
              :src="sidePanelBlobUrl" class="max-w-full max-h-full object-contain p-2" :alt="selectedFile.file_name">
            <div v-else class="text-center">
              <div class="text-6xl mb-2">{{ getIcon(selectedFile.file_type) }}</div>
              <p class="text-xs text-gray-400">Preview tidak tersedia</p>
            </div>
          </div>
          <!-- Metadata -->
          <div class="px-4 py-3 border-t border-gray-100 space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Kategori</span>
              <span class="font-semibold text-gray-700">{{ selectedFile.doc_category || 'Other' }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Revisi</span>
              <span class="font-semibold text-gray-700">Rev {{ selectedFile.revision || 'A' }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Status</span>
              <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" :class="statusClass(selectedFile.doc_status)">{{ selectedFile.doc_status || 'draft' }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Upload</span>
              <span class="text-gray-600">{{ formatDate(selectedFile.uploaded_at) }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Oleh</span>
              <span class="text-gray-600">{{ selectedFile.uploader_name || '-' }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">Ukuran</span>
              <span class="text-gray-600">{{ formatSize(selectedFile.file_size) }}</span>
            </div>
          </div>
          <!-- Action buttons -->
          <div class="px-4 py-3 border-t border-gray-100 space-y-2">
            <div class="flex gap-2">
              <button @click="downloadFile(selectedFile)" class="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors">⬇ Download</button>
              <!-- Fullscreen btn in side panel -->
              <button @click="openInNewTab(selectedFile)" class="flex-1 bg-gray-100 text-gray-700 text-xs font-semibold py-2 rounded-lg hover:bg-gray-200 transition-colors">🔍 New Tab</button>
              <button @click="openEditModal(selectedFile)" class="w-8 flex items-center justify-center bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100">✏️</button>
              <button @click="confirmDelete(selectedFile)" class="w-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100">🗑</button>
            </div>
            <!-- AI Scan button -->
            <button @click="analyzeDrawing(selectedFile)"
              :disabled="aiAnalyzing"
              class="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all"
              :class="aiAnalyzing ? 'bg-purple-100 text-purple-400 cursor-wait' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-sm'">
              <span v-if="aiAnalyzing" class="animate-spin">⟳</span>
              <span v-else>🤖</span>
              {{ aiAnalyzing ? 'Analyzing with Gemini...' : 'AI Scan Drawing' }}
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- Empty state (inside folder) -->
    <div v-else-if="activeFolder && !uploading" class="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
      <div class="text-5xl mb-3">📁</div>
      <p class="text-gray-500 font-medium">Belum ada dokumen</p>
      <p class="text-sm text-gray-400 mt-1">Upload file atau klik "Tambah Dokumen"</p>
    </div>

    <!-- ══ ADD / EDIT MODAL ══ -->
    <div v-if="showFormModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showFormModal = false">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div class="px-6 py-4 border-b flex items-center justify-between"
          :class="editingFile ? 'bg-amber-600' : 'bg-blue-600'">
          <h3 class="font-bold text-white text-lg">{{ editingFile ? '✏️ Edit Dokumen' : '➕ Tambah Dokumen' }}</h3>
          <button @click="showFormModal = false" class="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- File upload (only for new) -->
          <div v-if="!editingFile">
            <label class="block text-sm font-medium text-gray-700 mb-1">File <span class="text-red-500">*</span></label>
            <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all" @click="modalFileInput?.click()">
              <input type="file" ref="modalFileInput" class="hidden" @change="handleModalFileSelect">
              <div v-if="formData.file" class="flex items-center gap-2 justify-center">
                <span class="text-2xl">{{ getIcon(detectType(formData.file.name)) }}</span>
                <span class="text-sm font-medium text-gray-700">{{ formData.file.name }}</span>
                <span class="text-xs text-gray-400">({{ formatSize(formData.file.size) }})</span>
              </div>
              <div v-else class="text-gray-400">
                <div class="text-2xl mb-1">📎</div>
                <p class="text-sm">Klik untuk pilih file</p>
              </div>
            </div>
          </div>

          <!-- Doc Title -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Judul Dokumen</label>
            <input v-model="formData.doc_title" type="text" placeholder="Nama dokumen yang mudah dibaca" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          </div>

          <!-- Doc No -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nomor Dokumen</label>
            <input v-model="formData.doc_no" type="text" placeholder="Contoh: GNJ-DRW-001" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- Category -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <select v-model="formData.doc_category" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <!-- Revision -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Revisi</label>
              <input v-model="formData.revision" type="text" placeholder="A" maxlength="10" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono">
            </div>
          </div>

          <!-- Status -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select v-model="formData.doc_status" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="draft">🔵 Draft</option>
              <option value="issued">🟡 Issued</option>
              <option value="approved">🟢 Approved</option>
              <option value="superseded">⚫ Superseded</option>
            </select>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
            <textarea v-model="formData.description" rows="2" placeholder="Keterangan singkat..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
          </div>
        </div>
        <div class="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
          <button @click="showFormModal = false" class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Batal</button>
          <button @click="saveDocument" :disabled="saving"
            class="px-5 py-2 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            :class="editingFile ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'">
            {{ saving ? 'Menyimpan...' : (editingFile ? 'Simpan Perubahan' : 'Upload & Simpan') }}
          </button>
        </div>
      </div>
    </div>


    <!-- ══ AI ANALYSIS MODAL ══ -->
    <div v-if="aiResult" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="aiResult = null">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        <!-- Modal Header -->
        <div class="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white shrink-0">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🤖</span>
            <div>
              <h2 class="font-bold text-lg">AI Drawing Analysis</h2>
              <p class="text-purple-200 text-xs">{{ aiResult.file_name }} · Gemini 2.0 Flash</p>
            </div>
          </div>
          <button @click="aiResult = null" class="text-white/70 hover:text-white text-2xl">×</button>
        </div>

        <!-- Summary bar -->
        <div v-if="aiResult.analysis?.summary" class="px-6 py-3 bg-purple-50 border-b border-purple-100 text-sm text-purple-800">
          <span class="font-semibold">📋 Summary: </span>{{ aiResult.analysis.summary }}
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-gray-200 bg-gray-50 shrink-0 overflow-x-auto">
          <button v-for="tab in aiTabs" :key="tab.key"
            @click="aiActiveTab = tab.key"
            :class="aiActiveTab === tab.key ? 'border-b-2 border-purple-600 text-purple-700 bg-white' : 'text-gray-500 hover:text-gray-700'"
            class="px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors">
            {{ tab.label }}
            <span v-if="tab.count > 0" class="ml-1 bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded-full">{{ tab.count }}</span>
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-y-auto p-6">

          <!-- Title Block -->
          <div v-if="aiActiveTab === 'title_block'">
            <div v-if="aiResult.analysis?.title_block" class="grid grid-cols-2 gap-3">
              <div v-for="([key, val], idx) in titleBlockEntries" :key="key" class="bg-gray-50 rounded-lg p-3">
                <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ String(key).replace(/_/g,' ') }}</div>
                <div class="font-semibold text-gray-800 text-sm">{{ val }}</div>
              </div>
            </div>
            <div v-if="aiResult.analysis?.scale_info" class="mt-3 bg-blue-50 rounded-lg p-3">
              <div class="text-xs font-semibold text-blue-700 mb-1">📐 Scale Info</div>
              <div class="text-sm text-blue-800">Scale: <b>{{ aiResult.analysis.scale_info.stated_scale }}</b> · Unit: {{ aiResult.analysis.scale_info.unit }}</div>
            </div>
            <div v-if="!aiResult.analysis?.title_block" class="text-gray-400 text-center py-8">No title block data found</div>
          </div>

          <!-- Dimensions -->
          <div v-if="aiActiveTab === 'dimensions'">
            <div v-if="aiResult.analysis?.all_dimensions?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-indigo-50">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-indigo-700">Dimension</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-indigo-700">Value</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-indigo-700">Unit</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-indigo-700">Location</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(d, i) in aiResult.analysis.all_dimensions" :key="i" class="hover:bg-gray-50">
                    <td class="px-3 py-2 font-medium">{{ d.label }}</td>
                    <td class="px-3 py-2 text-right font-mono font-bold text-indigo-700">{{ d.value }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ d.unit }}</td>
                    <td class="px-3 py-2 text-gray-400 text-xs">{{ d.location }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No dimension data found in drawing</div>
          </div>

          <!-- Quantity Takeoff -->
          <div v-if="aiActiveTab === 'qto'">
            <div v-if="aiResult.analysis?.quantity_takeoff?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-emerald-50">
                  <th class="px-2 py-2 text-left text-xs font-semibold text-emerald-700">No</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-emerald-700">Description</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-emerald-700">Spec</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-emerald-700">Size</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-emerald-700">Qty</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-emerald-700">Unit</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-emerald-700">Calculation</th>
                  <th class="px-2 py-2 text-center text-xs font-semibold text-emerald-700">Conf.</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="q in aiResult.analysis.quantity_takeoff" :key="q.item_no" class="hover:bg-gray-50">
                    <td class="px-2 py-2 text-gray-400 font-mono text-xs">{{ q.item_no }}</td>
                    <td class="px-2 py-2 font-medium">{{ q.description }}</td>
                    <td class="px-2 py-2 text-gray-500 text-xs">{{ q.specification }}</td>
                    <td class="px-2 py-2 text-gray-500 text-xs">{{ q.size }}</td>
                    <td class="px-2 py-2 text-right font-bold text-emerald-700">{{ q.qty }}</td>
                    <td class="px-2 py-2 text-gray-500">{{ q.unit }}</td>
                    <td class="px-2 py-2 text-gray-400 text-xs italic">{{ q.calculation_note }}</td>
                    <td class="px-2 py-2 text-center">
                      <span class="px-1.5 py-0.5 rounded text-xs font-semibold"
                        :class="q.confidence==='high' ? 'bg-green-100 text-green-700' : q.confidence==='medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'">
                        {{ q.confidence }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No quantity takeoff data calculated</div>
          </div>

          <!-- Reinforcement -->
          <div v-if="aiActiveTab === 'reinforcement'">
            <div v-if="aiResult.analysis?.reinforcement?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-red-50">
                  <th class="px-2 py-2 text-left text-xs font-semibold text-red-700">Mark</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-red-700">Dia</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-red-700">Spacing</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-red-700">Length</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-red-700">No. Bars</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-red-700">Total Length</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-red-700">Weight (kg)</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-red-700">Location</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="r in aiResult.analysis.reinforcement" :key="r.mark" class="hover:bg-gray-50">
                    <td class="px-2 py-2 font-bold text-red-700">{{ r.mark }}</td>
                    <td class="px-2 py-2 font-mono">{{ r.diameter }}</td>
                    <td class="px-2 py-2 text-gray-500">{{ r.spacing }}</td>
                    <td class="px-2 py-2 text-gray-500">{{ r.length }}</td>
                    <td class="px-2 py-2 text-right font-bold">{{ r.no_of_bars }}</td>
                    <td class="px-2 py-2 text-right font-bold text-red-700">{{ r.total_length }}</td>
                    <td class="px-2 py-2 text-right font-bold">{{ r.weight_kg }}</td>
                    <td class="px-2 py-2 text-gray-400 text-xs">{{ r.location }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No reinforcement data found</div>
          </div>

          <!-- Structural Elements -->
          <div v-if="aiActiveTab === 'structural'">
            <div v-if="aiResult.analysis?.structural_elements?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-slate-50">
                  <th class="px-2 py-2 text-left text-xs font-semibold text-slate-700">Type</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-slate-700">Mark</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-slate-700">Size</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-slate-700">Length</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold text-slate-700">Grade</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-slate-700">Qty</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-slate-700">Vol/ea (m³)</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold text-slate-700">Total (m³)</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="el in aiResult.analysis.structural_elements" :key="el.mark" class="hover:bg-gray-50">
                    <td class="px-2 py-2 text-xs font-medium text-slate-600">{{ el.element_type }}</td>
                    <td class="px-2 py-2 font-bold text-slate-700">{{ el.mark }}</td>
                    <td class="px-2 py-2 font-mono text-xs">{{ el.size }}</td>
                    <td class="px-2 py-2 text-gray-500">{{ el.length }}</td>
                    <td class="px-2 py-2 text-gray-500 text-xs">{{ el.concrete_grade }}</td>
                    <td class="px-2 py-2 text-right font-bold">{{ el.qty }}</td>
                    <td class="px-2 py-2 text-right text-gray-600">{{ el.volume_m3 }}</td>
                    <td class="px-2 py-2 text-right font-bold text-slate-700">{{ el.total_volume_m3 }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No structural elements found</div>
          </div>

          <!-- Equipment List -->
          <div v-if="aiActiveTab === 'equipment'">
            <div v-if="aiResult.analysis?.equipment_list?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-purple-50">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-purple-700">Tag</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-purple-700">Description</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-purple-700">Type</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-purple-700">Size</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-purple-700">Material</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="eq in aiResult.analysis.equipment_list" :key="eq.tag" class="hover:bg-gray-50">
                    <td class="px-3 py-2 font-mono font-bold text-purple-700">{{ eq.tag }}</td>
                    <td class="px-3 py-2">{{ eq.description }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ eq.type }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ eq.size }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ eq.material }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No equipment tags found</div>
          </div>

          <!-- Pipe List -->
          <div v-if="aiActiveTab === 'pipes'">
            <div v-if="aiResult.analysis?.pipe_list?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-blue-50">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-blue-700">Line No.</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-blue-700">From</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-blue-700">To</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-blue-700">Size</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-blue-700">Class</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-blue-700">Medium</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="p in aiResult.analysis.pipe_list" :key="p.line_number" class="hover:bg-gray-50">
                    <td class="px-3 py-2 font-mono font-bold text-blue-700">{{ p.line_number }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ p.from }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ p.to }}</td>
                    <td class="px-3 py-2">{{ p.size }}</td>
                    <td class="px-3 py-2">{{ p.pipe_class }}</td>
                    <td class="px-3 py-2">{{ p.medium }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No pipe lines found</div>
          </div>

          <!-- Material Schedule -->
          <div v-if="aiActiveTab === 'materials'">
            <div v-if="aiResult.analysis?.material_schedule?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-green-50">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-green-700">No.</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-green-700">Description</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-green-700">Size</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-green-700">Material</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-green-700">Qty</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-green-700">Unit</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="m in aiResult.analysis.material_schedule" :key="m.item_no" class="hover:bg-gray-50">
                    <td class="px-3 py-2 text-gray-400 font-mono">{{ m.item_no }}</td>
                    <td class="px-3 py-2 font-medium">{{ m.description }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ m.size }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ m.material }}</td>
                    <td class="px-3 py-2 text-right font-bold">{{ m.qty }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ m.unit }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No material schedule found</div>
          </div>

          <!-- Instruments -->
          <div v-if="aiActiveTab === 'instruments'">
            <div v-if="aiResult.analysis?.instrument_list?.length" class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-orange-50">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-orange-700">Tag</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-orange-700">Type</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-orange-700">Description</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-orange-700">Range</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="inst in aiResult.analysis.instrument_list" :key="inst.tag" class="hover:bg-gray-50">
                    <td class="px-3 py-2 font-mono font-bold text-orange-700">{{ inst.tag }}</td>
                    <td class="px-3 py-2">{{ inst.type }}</td>
                    <td class="px-3 py-2">{{ inst.description }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ inst.range }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-gray-400 text-center py-8">No instruments found</div>
          </div>

          <!-- Notes & Revisions -->
          <div v-if="aiActiveTab === 'notes'" class="space-y-4">
            <div v-if="aiResult.analysis?.notes?.length">
              <h4 class="font-semibold text-gray-700 mb-2">📝 General Notes</h4>
              <ul class="space-y-1">
                <li v-for="(note, i) in aiResult.analysis.notes" :key="i"
                  class="flex gap-2 text-sm text-gray-700 bg-yellow-50 rounded-lg px-3 py-2">
                  <span class="text-yellow-500 font-bold">{{ i+1 }}.</span> {{ note }}
                </li>
              </ul>
            </div>
            <div v-if="aiResult.analysis?.revision_history?.length">
              <h4 class="font-semibold text-gray-700 mb-2">📋 Revision History</h4>
              <table class="min-w-full text-sm">
                <thead><tr class="bg-gray-50">
                  <th class="px-3 py-2 text-left text-xs font-semibold">Rev</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold">Date</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold">Description</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold">By</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="r in aiResult.analysis.revision_history" :key="r.rev">
                    <td class="px-3 py-2 font-bold">{{ r.rev }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ r.date }}</td>
                    <td class="px-3 py-2">{{ r.description }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ r.by }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!aiResult.analysis?.notes?.length && !aiResult.analysis?.revision_history?.length" class="text-gray-400 text-center py-8">No notes or revision history found</div>
          </div>

          <!-- Raw (parse error fallback) -->
          <div v-if="aiResult.analysis?.parse_error" class="bg-gray-50 rounded-lg p-4">
            <p class="text-sm font-semibold text-red-600 mb-2">⚠ Raw AI response (JSON parse failed):</p>
            <pre class="text-xs text-gray-700 whitespace-pre-wrap">{{ aiResult.analysis.raw_text }}</pre>
          </div>

        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
          <span class="text-xs text-gray-400">Powered by Google Gemini 2.0 Flash · Results may need verification</span>
          <button @click="aiResult = null" class="px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700">Tutup</button>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { api } from '@/lib/api';

const props = defineProps<{ projectId: string | number; files: any[] }>();
const emit = defineEmits(['refresh']);

const CATEGORIES = ['Drawing', 'Specification', 'Report', 'Contract', 'Permit', 'Photo', 'Calculation', 'Method Statement', 'Other'];

const FOLDER_ICONS: Record<string,string> = {
  Drawing: '📐', Specification: '📋', Report: '📊', Contract: '📜',
  Permit: '🪪', Photo: '🖼️', Calculation: '🧮', 'Method Statement': '📖', Other: '📁'
};

const activeFolder    = ref<string|null>(null);
const filterStatus    = ref('');
const viewMode        = ref<'grid'|'list'>('grid');
const selectedFile    = ref<any>(null);
const sidePanelBlobUrl = ref<string|null>(null);
const sidePanelLoading = ref(false);

// ── AI Analysis ──
const aiAnalyzing  = ref(false);
const aiResult     = ref<any>(null);
const aiActiveTab  = ref('title_block');

const aiTabs = computed(() => {
  const a = aiResult.value?.analysis || {};
  return [
    { key: 'title_block',   label: '📋 Title Block',    count: 0 },
    { key: 'dimensions',    label: '📐 Dimensions',      count: a.all_dimensions?.length   || 0 },
    { key: 'qto',           label: '🔢 Qty Takeoff',     count: a.quantity_takeoff?.length || 0 },
    { key: 'reinforcement', label: '🔩 Rebar',           count: a.reinforcement?.length    || 0 },
    { key: 'structural',    label: '🏗 Structural',      count: a.structural_elements?.length || 0 },
    { key: 'equipment',     label: '⚙️ Equipment',       count: a.equipment_list?.length   || 0 },
    { key: 'pipes',         label: '🔧 Pipes',           count: a.pipe_list?.length        || 0 },
    { key: 'materials',     label: '📦 Materials',       count: a.material_schedule?.length|| 0 },
    { key: 'notes',         label: '📝 Notes & Rev',     count: (a.notes?.length||0) + (a.revision_history?.length||0) },
  ];
});

const titleBlockEntries = computed(() => {
  const titleBlock = aiResult.value?.analysis?.title_block || {};
  return Object.entries(titleBlock).filter(([, val]) => Boolean(val));
});

const analyzeDrawing = async (file: any) => {
  if (aiAnalyzing.value) return;
  aiAnalyzing.value = true;
  aiResult.value    = null;
  aiActiveTab.value = 'title_block';
  try {
    const { data } = await api.post(`/projects/files/${file.id}/analyze`);
    aiResult.value = data;
    // Auto-switch to first tab with results
    const priority = [
      ['qto',           'quantity_takeoff'],
      ['dimensions',    'all_dimensions'],
      ['reinforcement', 'reinforcement'],
      ['structural',    'structural_elements'],
      ['equipment',     'equipment_list'],
      ['pipes',         'pipe_list'],
      ['materials',     'material_schedule'],
    ];
    for (const [tab, key] of priority) {
      if (data.analysis?.[key]?.length) { aiActiveTab.value = tab; break; }
    }
  } catch (e: any) {
    alert(e?.response?.data?.error || 'AI Analysis gagal — pastikan GEMINI_API_KEY sudah dikonfigurasi di server');
  } finally {
    aiAnalyzing.value = false;
  }
};


const selectFileCard = async (file: any) => {
  if (selectedFile.value?.id === file.id) {
    // Toggle off
    if (sidePanelBlobUrl.value) URL.revokeObjectURL(sidePanelBlobUrl.value);
    sidePanelBlobUrl.value = null;
    selectedFile.value = null;
    return;
  }
  if (sidePanelBlobUrl.value) URL.revokeObjectURL(sidePanelBlobUrl.value);
  sidePanelBlobUrl.value = null;
  selectedFile.value = file;
  if (file.file_type === 'pdf' || file.file_type === 'image') {
    sidePanelLoading.value = true;
    try {
      const { data } = await api.get(`/projects/files/${file.id}/preview`, { responseType: 'blob' });
      sidePanelBlobUrl.value = URL.createObjectURL(data);
    } catch (e) { console.error('Side panel preview error', e); }
    finally { sidePanelLoading.value = false; }
  }
};


// ── Bulk Select ──
const selectMode  = ref(false);
const selectedIds = ref<Set<number>>(new Set());

const allSelected = computed(() =>
  filteredFiles.value.length > 0 && filteredFiles.value.every(f => selectedIds.value.has(f.id))
);

const toggleSelectMode = () => {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selectedIds.value = new Set();
};

const toggleSelect = (id: number) => {
  const s = new Set(selectedIds.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selectedIds.value = s;
};

const selectAll   = () => { selectedIds.value = new Set(filteredFiles.value.map(f => f.id)); };
const deselectAll = () => { selectedIds.value = new Set(); };

const bulkDelete = async () => {
  if (!selectedIds.value.size) return;
  if (!confirm(`Hapus ${selectedIds.value.size} dokumen? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await Promise.all([...selectedIds.value].map(id =>
      api.delete(`/projects/files/${id}`)
    ));
    selectedIds.value = new Set();
    selectMode.value = false;
    emit('refresh');
  } catch (e) {
    alert('Gagal menghapus sebagian dokumen');
    console.error(e);
    emit('refresh');
  }
};

const isDragging     = ref(false);
const uploading      = ref(false);
const saving         = ref(false);
const showFormModal  = ref(false);
const editingFile    = ref<any>(null);
const previewFile    = ref<any>(null);
const fileInputRef   = ref<HTMLInputElement | null>(null);
const modalFileInput = ref<HTMLInputElement | null>(null);

const formData = ref({ file: null as File | null, doc_title: '', doc_no: '', doc_category: 'Other', revision: 'A', doc_status: 'draft', description: '' });

const filteredFiles = computed(() => {
  return props.files.filter(f => {
    if (!activeFolder.value) return false;
    if (activeFolder.value !== '__all__' && (f.doc_category || 'Other') !== activeFolder.value) return false;
    if (filterStatus.value && (f.doc_status || 'draft') !== filterStatus.value) return false;
    return true;
  });
});

const getApiBase = () => {
  // Use VITE_API_URL env or fall back to current host /api
  const base = ((import.meta as any).env?.VITE_API_URL as string)
    || `${window.location.protocol}//${window.location.host}/api`;
  return `${base}/projects/files`;
};

const getPreviewUrl  = (id: number) =>
  `${getApiBase()}/${id}/preview?token=${encodeURIComponent(localStorage.getItem('token') || '')}`;

const getDownloadUrl = (id: number) =>
  `${getApiBase()}/${id}/download?token=${encodeURIComponent(localStorage.getItem('token') || '')}`;

const downloadFile = async (file: any) => {
  try {
    const { data } = await api.get(`/projects/files/${file.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name || `file_${file.id}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    alert('Gagal download file');
    console.error(e);
  }
};

const openAddModal = () => {
  editingFile.value = null;
  formData.value = { file: null, doc_title: '', doc_no: '', doc_category: 'Other', revision: 'A', doc_status: 'draft', description: '' };
  showFormModal.value = true;
};

const openEditModal = (file: any) => {
  editingFile.value = file;
  formData.value = { file: null, doc_title: file.doc_title || file.file_name, doc_no: file.doc_no || '', doc_category: file.doc_category || 'Other', revision: file.revision || 'A', doc_status: file.doc_status || 'draft', description: file.description || '' };
  showFormModal.value = true;
};

const previewBlobUrl = ref<string | null>(null);
const previewLoading = ref(false);

const openInNewTab = async (file: any) => {
  try {
    const { data, headers } = await api.get(`/projects/files/${file.id}/preview`, { responseType: 'blob' });
    const mime = String(headers['content-type'] || 'application/octet-stream');
    const blob = new Blob([data], { type: mime });
    const url  = URL.createObjectURL(blob);
    // Open as popup window centered on screen
    const w = 960, h = 720;
    const left = Math.round((screen.width  - w) / 2);
    const top  = Math.round((screen.height - h) / 2);
    const popup = window.open(
      url, 'doc_preview',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no`
    );
    if (popup) {
      popup.focus();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } else {
      // Popup blocked → download fallback
      const a = document.createElement('a');
      a.href = url; a.download = file.file_name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
  } catch (e) {
    alert('Gagal membuka file');
    console.error(e);
  }
};


const openPreview = async (file: any) => {
  openInNewTab(file);
};


const handleModalFileSelect = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) {
    formData.value.file = f;
    if (!formData.value.doc_title) formData.value.doc_title = f.name.replace(/\.[^.]+$/, '');
  }
};

const handleFileChange = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) quickUpload(Array.from(files));
};

const handleDrop = (e: DragEvent) => {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files) quickUpload(Array.from(files));
};

const quickUpload = async (fileList: File[]) => {
  uploading.value = true;
  // Determine category: use activeFolder if it's a real category
  const catForUpload = (activeFolder.value && activeFolder.value !== '__all__')
    ? activeFolder.value
    : 'Other';
  for (const file of fileList) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_category', catForUpload);
      await api.post(`/projects/${props.projectId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    } catch (e) { console.error('Upload error', e); }
  }
  uploading.value = false;
  if (fileInputRef.value) fileInputRef.value.value = '';
  // Switch to 'Semua File' view so uploaded file is visible
  if (!activeFolder.value) activeFolder.value = catForUpload;
  emit('refresh');
  // Small wait for parent to re-fetch then update our view
  await new Promise(r => setTimeout(r, 300));
};


const saveDocument = async () => {
  saving.value = true;
  try {
    if (editingFile.value) {
      // PATCH metadata only
      await api.patch(`/projects/files/${editingFile.value.id}`, {
        doc_title: formData.value.doc_title,
        doc_no: formData.value.doc_no,
        doc_category: formData.value.doc_category,
        revision: formData.value.revision,
        doc_status: formData.value.doc_status,
        description: formData.value.description,
      });
    } else {
      if (!formData.value.file) { alert('Pilih file terlebih dahulu'); saving.value = false; return; }
      const fd = new FormData();
      fd.append('file', formData.value.file);
      fd.append('doc_title', formData.value.doc_title);
      fd.append('doc_no', formData.value.doc_no);
      fd.append('doc_category', formData.value.doc_category);
      fd.append('revision', formData.value.revision);
      fd.append('doc_status', formData.value.doc_status);
      fd.append('description', formData.value.description);
      await api.post(`/projects/${props.projectId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    showFormModal.value = false;
    emit('refresh');
  } catch (e) {
    alert('Gagal menyimpan dokumen');
    console.error(e);
  } finally { saving.value = false; }
};

const confirmDelete = async (file: any) => {
  if (!confirm(`Hapus dokumen "${file.doc_title || file.file_name}"?`)) return;
  try {
    await api.delete(`/projects/files/${file.id}`);
    emit('refresh');
  } catch (e) { alert('Gagal menghapus'); }
};

const getIcon = (type: string) => ({ pdf: '📄', image: '🖼️', excel: '📊', word: '📝', dwg: '📐' }[type] || '📁');

const detectType = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['xls','xlsx'].includes(ext)) return 'excel';
  if (['doc','docx'].includes(ext)) return 'word';
  if (['dwg','dxf'].includes(ext)) return 'dwg';
  return 'other';
};

const formatSize = (bytes: number) => {
  if (!bytes || isNaN(bytes)) return '—';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
};

const statusClass = (s: string) => ({
  draft: 'bg-blue-100 text-blue-700',
  issued: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  superseded: 'bg-gray-200 text-gray-500',
}[s || 'draft'] || 'bg-gray-100 text-gray-500');

const CATEGORY_COLORS: Record<string, string> = {
  Drawing: 'background:#dbeafe;color:#1d4ed8',
  Specification: 'background:#ede9fe;color:#6d28d9',
  Report: 'background:#dcfce7;color:#166534',
  Contract: 'background:#fef9c3;color:#854d0e',
  Permit: 'background:#fee2e2;color:#991b1b',
  Photo: 'background:#fce7f3;color:#be185d',
  Calculation: 'background:#e0f2fe;color:#0369a1',
  'Method Statement': 'background:#f0fdf4;color:#15803d',
  Other: 'background:#f3f4f6;color:#4b5563',
};
const getCategoryStyle = (cat: string) => CATEGORY_COLORS[cat] || CATEGORY_COLORS['Other'];
</script>

<style scoped>
.slide-panel-enter-active, .slide-panel-leave-active { transition: all 0.2s ease; }
.slide-panel-enter-from, .slide-panel-leave-to { opacity: 0; transform: translateX(20px); }
</style>
