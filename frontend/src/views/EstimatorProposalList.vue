<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">📋 Proposal & Estimation</h1>
        <p class="text-gray-600 mt-1">Manage EPC construction proposals and cost estimations</p>
      </div>
      <button @click="showCreateModal = true" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2">
        <span class="text-xl">+</span>
        <span>New Proposal</span>
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-sm text-gray-600">Total Proposals</p>
        <p class="text-2xl font-bold text-gray-800">{{ proposals.length }}</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-sm text-gray-600">Draft</p>
        <p class="text-2xl font-bold text-yellow-600">{{ proposals.filter(p => p.status === 'draft').length }}</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-sm text-gray-600">In Review</p>
        <p class="text-2xl font-bold text-blue-600">{{ proposals.filter(p => p.status === 'review').length }}</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-sm text-gray-600">Submitted</p>
        <p class="text-2xl font-bold text-purple-600">{{ proposals.filter(p => p.status === 'submitted').length }}</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-sm text-gray-600">Deal</p>
        <p class="text-2xl font-bold text-green-600">{{ proposals.filter(p => p.status === 'deal').length }}</p>
      </div>
    </div>

    <!-- Proposals Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proposal #</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lokasi</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revision</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Project</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="proposal in proposals" :key="proposal.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
              {{ proposal.proposal_number }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ proposal.project_name }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ proposal.client || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ proposal.lokasi || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ proposal.revision }}</td>
            <td class="px-6 py-4 text-sm font-semibold text-gray-900">
              {{ formatCurrency(proposal.total_project) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span :class="statusClass(proposal.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ proposal.status.toUpperCase() }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ formatDate(proposal.created_at) }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
              <button @click="openProposal(proposal.id)" class="text-blue-600 hover:text-blue-800 mr-3">
                Open
              </button>
              <button @click="openEditModal(proposal)" class="text-indigo-600 hover:text-indigo-800 mr-3">
                ✏️ Edit
              </button>
              <router-link v-if="proposal.project_id" :to="`/projects/${proposal.project_id}`" class="text-green-600 hover:text-green-800 mr-3">
                View Project
              </router-link>
              <button v-if="proposal.status !== 'deal'" @click="deleteProposal(proposal.id)" class="text-red-600 hover:text-red-800">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="proposals.length === 0" class="text-center py-12 text-gray-500">
        <p class="text-lg">No proposals yet</p>
        <p class="text-sm mt-2">Create your first proposal to get started</p>
      </div>
    </div>

    <!-- Create Proposal Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-60 flex items-stretch justify-stretch z-50">
      <div class="bg-white w-full h-full flex flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto p-6 md:p-8">
          <!-- Step indicator -->
          <div class="flex items-center gap-3 mb-5">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                :class="wizardStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'">1</span>
              <span class="text-sm font-medium" :class="wizardStep === 1 ? 'text-blue-700' : 'text-gray-500'">Jenis Pekerjaan</span>
            </div>
            <div class="h-px w-8 bg-gray-300"></div>
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                :class="wizardStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'">2</span>
              <span class="text-sm font-medium" :class="wizardStep === 2 ? 'text-blue-700' : 'text-gray-500'">Detail Proyek</span>
            </div>
          </div>

          <!-- Step 1: Template Wizard -->
          <div v-show="wizardStep === 1">
            <ProposalTemplateWizard 
              ref="templateWizardRef" 
              @type-selected="onTypeSelected"
              @ready="wizardReady = $event"
            />
          </div>

          <!-- Step 2: Project Details -->
          <div v-show="wizardStep === 2">
            <button @click="wizardStep = 1" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
              ← Kembali pilih jenis pekerjaan
            </button>
            <h2 class="text-xl font-bold mb-4">Detail Proyek</h2>
          
            <form @submit.prevent="createProposal" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                <input v-model="newProposal.project_name" type="text" required 
                  class="w-full border border-gray-300 rounded-lg px-3 py-2" 
                  placeholder="e.g., EPC Warehouse XYZ">
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <div class="relative" ref="clientDropdownRef">
                  <div 
                    @click="showClientDropdown = !showClientDropdown"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 cursor-pointer flex items-center justify-between"
                    :class="selectedClientName ? 'text-gray-900' : 'text-gray-400'"
                  >
                    <span>{{ selectedClientName || 'Select client...' }}</span>
                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                  <div v-if="showClientDropdown" 
                    class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
                    <div class="p-2 border-b border-gray-200">
                      <input 
                        v-model="clientSearch" 
                        type="text" 
                        class="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue-400" 
                        placeholder="Search client..."
                        @input="filterClients"
                        ref="clientSearchInput"
                      >
                    </div>
                    <div class="max-h-40 overflow-y-auto">
                      <button
                        v-for="client in filteredClients"
                        :key="client.id"
                        type="button"
                        @click="selectClient(client)"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
                      >
                        <span class="font-medium text-gray-800">{{ client.name }}</span>
                        <span v-if="client.code" class="text-gray-400 text-xs">{{ client.code }}</span>
                      </button>
                      <div v-if="filteredClients.length === 0" class="px-3 py-3 text-sm text-gray-500 text-center">
                        No clients found
                      </div>
                    </div>
                    <div class="border-t border-gray-200 p-2">
                      <button type="button" @click="openAddClient" class="w-full text-left px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1.5">
                        <span class="text-lg leading-none">+</span> Add New Client
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
                  <input v-model="newProposal.lokasi" type="text" 
                    class="w-full border border-gray-300 rounded-lg px-3 py-2" 
                    placeholder="e.g., Cilegon">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Revision</label>
                  <input v-model="newProposal.revision" type="text" 
                    class="w-full border border-gray-300 rounded-lg px-3 py-2" 
                    placeholder="Rev-0">
                </div>
              </div>

              <div class="flex justify-end space-x-2 pt-4 border-t">
                <button type="button" @click="showCreateModal = false" 
                  class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <!-- Dinonaktifkan selama pengiriman: dua klik cepat dulu
                     melahirkan dua proposal, dan counter nomor yang atomic
                     justru memastikan keduanya berhasil dengan nomor berbeda. -->
                <button type="submit" :disabled="membuatProposal"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {{ membuatProposal ? 'Membuat…' : 'Create & Open' }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Footer for step 1 -->
        <div v-if="wizardStep === 1" class="p-4 border-t flex justify-between">
          <button @click="showCreateModal = false" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <div class="flex gap-2">
            <button @click="skipTemplate" class="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Skip (Kosong)
            </button>
            <button 
              @click="wizardStep = 2" 
              :disabled="!templateWizardRef?.selectedType"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Lanjut →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Edit Proposal Modal ── -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="showEditModal = false">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div class="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
          <div>
            <h2 class="font-bold text-lg">✏️ Edit Proposal</h2>
            <p class="text-indigo-200 text-xs mt-0.5">{{ editForm.proposal_number }}</p>
          </div>
          <button @click="showEditModal = false" class="text-white/70 hover:text-white text-2xl">×</button>
        </div>
        <form @submit.prevent="saveEdit" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input v-model="editForm.project_name" type="text" required :disabled="!metaBisaDiubah"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              placeholder="e.g., EPC Warehouse XYZ">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <div class="relative" ref="editClientDropdownRef">
              <div
                @click="editShowClientDropdown = !editShowClientDropdown"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 cursor-pointer flex items-center justify-between"
                :class="editForm.client ? 'text-gray-900' : 'text-gray-400'"
              >
                <span>{{ editForm.client || 'Pilih client...' }}</span>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
              <div v-if="editShowClientDropdown"
                class="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
                <div class="p-2 border-b border-gray-200">
                  <input
                    v-model="editClientSearch" :disabled="!metaBisaDiubah"
                    type="text"
                    class="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="Cari client..."
                    @input="filterEditClients"
                    ref="editClientSearchInput"
                  >
                </div>
                <div class="max-h-40 overflow-y-auto">
                  <button
                    v-for="client in editFilteredClients" :key="client.id"
                    type="button"
                    @click="selectEditClient(client)"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
                  >
                    <span class="font-medium text-gray-800">{{ client.name }}</span>
                    <span v-if="client.code" class="text-gray-400 text-xs">{{ client.code }}</span>
                  </button>
                  <div v-if="editFilteredClients.length === 0" class="px-3 py-3 text-sm text-gray-500 text-center">Tidak ditemukan</div>
                </div>
                <div class="border-t border-gray-200 p-2">
                  <!-- `client_id` WAJIB ikut dikosongkan. Sebelumnya tombol ini
                       hanya mengganti namanya, sementara id client lama tetap
                       terbawa — proposal berlabel client B tapi terikat client A,
                       dan saat Deal yang dipakai adalah ID-nya. -->
                  <button type="button" @click="pakaiClientManual()"
                    class="w-full text-left px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded">
                    + Ketik manual: "{{ editClientSearch }}"
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
              <input v-model="editForm.lokasi" type="text" :disabled="!metaBisaDiubah"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                placeholder="e.g., Cilegon">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Revision</label>
              <input v-model="editForm.revision" type="text" :disabled="!metaBisaDiubah"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                placeholder="Rev-0">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <!-- Hanya status sekarang + transisi yang sah dari sana. Menawarkan
                 semua status membuat pengguna memilih sesuatu yang pasti ditolak. -->
            <select v-model="editForm.status" :disabled="pilihanStatus.length <= 1"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:bg-gray-100 disabled:text-gray-500">
              <option v-for="s in pilihanStatus" :key="s" :value="s">{{ LABEL_STATUS[s] || s }}</option>
            </select>
            <p v-if="pilihanStatus.length <= 1" class="mt-1 text-xs text-gray-500">
              Status <strong>{{ LABEL_STATUS[editAsal.status] || editAsal.status }}</strong> bersifat final —
              tidak ada transisi lanjutan.
            </p>
            <p v-else class="mt-1 text-xs text-gray-500">
              Transisi berjalan lewat endpoint workflow tersendiri, terpisah dari perubahan metadata.
            </p>
          </div>

          <p v-if="!metaBisaDiubah" class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            🔒 Proposal berstatus <strong>{{ LABEL_STATUS[editAsal.status] || editAsal.status }}</strong> —
            identitasnya terkunci dan hanya bisa dibaca. Turunkan dulu ke In Review kalau memang perlu diperbaiki.
          </p>

          <p v-if="editError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ editError }}
          </p>

          <div class="flex justify-end gap-3 pt-2 border-t">
            <button type="button" @click="showEditModal = false"
              class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Batal</button>
            <button type="submit" :disabled="editSaving"
              class="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {{ editSaving ? 'Menyimpan...' : '💾 Simpan' }}
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';
import ProposalTemplateWizard from '@/components/ProposalTemplateWizard.vue';

const router = useRouter();

interface Proposal {
  id: number;
  proposal_number: string;
  project_name: string;
  client: string;
  client_id: number | null;
  project_id: number | null;
  lokasi: string;
  revision: string;
  status: string;
  total_project: number;
  created_at: string;
  created_by_name: string;
}

interface Client {
  id: number;
  name: string;
  code?: string;
}

const proposals = ref<Proposal[]>([]);
const showCreateModal = ref(false);
const wizardStep = ref(1);
const wizardReady = ref(false);
const templateWizardRef = ref<InstanceType<typeof ProposalTemplateWizard> | null>(null);
const newProposal = ref({
  project_name: '',
  client: '',
  lokasi: '',
  revision: 'Rev-0'
});

// ── Edit modal state ──
const showEditModal        = ref(false);
const editSaving           = ref(false);
const editShowClientDropdown = ref(false);
const editClientSearch     = ref('');
const editFilteredClients  = ref<Client[]>([]);
const editClientDropdownRef  = ref<HTMLElement | null>(null);
const editClientSearchInput  = ref<HTMLInputElement | null>(null);
const editForm = ref({
  id: 0,
  proposal_number: '',
  project_name: '',
  client: '',
  client_id: null as number | null,
  lokasi: '',
  revision: '',
  status: 'draft'
});

watch(editShowClientDropdown, (open) => {
  if (open) {
    filterEditClients();
    nextTick(() => editClientSearchInput.value?.focus());
  }
});

const filterEditClients = () => {
  const q = editClientSearch.value.toLowerCase();
  editFilteredClients.value = !q
    ? clients.value.slice(0, 20)
    : clients.value.filter(c => c.name.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q))).slice(0, 20);
};

/**
 * Pakai nama client yang diketik bebas — dan LEPASKAN ikatan ke client master.
 *
 * Tanpa mengosongkan `client_id`, proposal menyandang nama client B sementara
 * relasinya masih ke client A. Label dan pihak yang mengikat jadi berbeda, dan
 * saat Deal yang dipakai adalah `client_id` — jadi project, CRM, dan penagihan
 * mengikuti client yang TIDAK tertulis di penawaran.
 */
const pakaiClientManual = () => {
  editForm.value.client = editClientSearch.value;
  editForm.value.client_id = null;
  editShowClientDropdown.value = false;
};

const selectEditClient = (client: Client) => {
  editForm.value.client    = client.name;
  editForm.value.client_id = client.id;
  editClientSearch.value   = '';
  editShowClientDropdown.value = false;
};

/**
 * Cermin dari `VALID_TRANSITIONS` di
 * [estimator.routes.ts](../../backend/src/routes/estimator.routes.ts).
 *
 * Ini hanya untuk menyusun daftar pilihan supaya pengguna tidak ditawari
 * transisi yang pasti ditolak. **Otoritasnya tetap di backend** — pemeriksaan
 * sungguhan berjalan di dalam transaction dengan baris proposal terkunci, dan
 * daftar di sini tidak boleh dianggap menggantikannya.
 */
const TRANSISI_SAH: Record<string, string[]> = {
  draft:     ['review'],
  review:    ['draft', 'submitted'],
  submitted: ['review', 'deal', 'no_deal'],
  no_deal:   ['draft'],
  deal:      [],
};

/** Cermin `isProposalEditable` di backend: hanya dua status ini yang boleh disunting. */
const STATUS_BISA_SUNTING = ['draft', 'review'];

const LABEL_STATUS: Record<string, string> = {
  draft: 'Draft', review: 'In Review', submitted: 'Submitted',
  deal: 'Deal', no_deal: 'No Deal',
};

/** Keadaan proposal saat modal dibuka — pembanding untuk tahu apa yang berubah. */
const editAsal = ref<Record<string, any>>({});
const editError = ref('');

/** Status sekarang + status yang sah dituju dari sana. */
/** Identitas hanya bisa diubah selagi proposal masih draft/review. */
const metaBisaDiubah = computed(() => STATUS_BISA_SUNTING.includes(String(editAsal.value.status)));

const pilihanStatus = computed(() => {
  const kini = editAsal.value.status;
  return [kini, ...(TRANSISI_SAH[kini] || [])].filter(Boolean);
});

const openEditModal = (p: Proposal) => {
  editForm.value = {
    id: p.id,
    proposal_number: p.proposal_number,
    project_name: p.project_name,
    client: p.client || '',
    client_id: p.client_id || null,
    lokasi: p.lokasi || '',
    revision: p.revision || 'Rev-0',
    status: p.status
  };
  editAsal.value = { ...editForm.value };
  editError.value = '';
  editClientSearch.value = '';
  editShowClientDropdown.value = false;
  showEditModal.value = true;
};

const pesanGagal = (e: any): string =>
  e?.response?.data?.error || e?.message || 'Gagal menyimpan perubahan';

/**
 * EST-MTO-R22 menutup celah "status ditulis lewat endpoint metadata", tapi layar
 * ini tidak ikut menyesuaikan: `saveEdit` tetap mengirim key `status`, dan
 * backend menolak **setiap** body yang memuat key itu — termasuk saat nilainya
 * tidak berubah. Akibatnya tombol Simpan di modal ini tidak pernah bisa
 * memperbarui apa pun sejak guard itu dipasang, dan pengguna hanya menerima
 * "Gagal menyimpan perubahan" tanpa keterangan.
 *
 * Sekarang keduanya dipisah sesuai kontrak masing-masing: metadata lewat
 * `PUT /proposals/:id`, transisi lewat `PUT /proposals/:id/status`. Guard di
 * backend tidak dikendurkan sedikit pun.
 *
 * Transisi dikerjakan lebih dulu ketika keduanya berubah: proposal submitted/deal
 * terkunci untuk perubahan metadata (`PROPOSAL_LOCKED`).
 *
 * **Urutannya sempat salah, dan salahnya berbahaya.** Versi pertama selalu
 * mengirim transisi lebih dulu. Untuk arah NAIK itu fatal: `review→submitted`
 * mengunci proposal sehingga permintaan metadata berikutnya pasti 409, dan
 * `submitted→deal` bahkan sudah membuat project dari nama/client LAMA sebelum
 * permintaan kedua ditolak. Pengguna menekan Simpan sekali dan mendapat separuh
 * hasil: kontrak final atas identitas yang keliru, plus pesan error.
 *
 * Aturan yang benar bergantung arah:
 *
 *   • Proposal masih bisa disunting (draft/review) → tulis METADATA dulu, baru
 *     transisi. Kalau transisinya gagal, metadata sudah tersimpan dan itu
 *     keadaan yang wajar serta bisa diulang.
 *   • Proposal sudah terkunci (submitted/deal) → metadata memang TIDAK BISA
 *     diubah sama sekali. Kombinasi "ubah identitas + naikkan status" karena itu
 *     ditolak di depan, sebelum apa pun dikirim — bukan dikerjakan separuh.
 *     Menurunkan status otomatis lalu menaikkannya lagi tidak dilakukan: itu
 *     akan menarik kembali penawaran yang sudah dilihat pelanggan demi
 *     kenyamanan satu klik.
 */
const saveEdit = async () => {
  editSaving.value = true;
  editError.value = '';
  try {
    const id = editForm.value.id;
    const asal = editAsal.value;
    const statusBerubah = editForm.value.status !== asal.status;
    const metaBerubah = (['project_name', 'client', 'client_id', 'lokasi', 'revision'] as const)
      .some(k => (editForm.value as any)[k] !== asal[k]);

    if (!statusBerubah && !metaBerubah) {
      showEditModal.value = false;
      return;
    }

    // Proposal yang sudah terkunci tidak bisa berubah identitasnya. Ditolak di
    // depan supaya tidak ada transisi yang terlanjur final.
    if (metaBerubah && !STATUS_BISA_SUNTING.includes(String(asal.status))) {
      editError.value =
        `Proposal berstatus "${LABEL_STATUS[asal.status] || asal.status}" — identitasnya tidak bisa diubah. ` +
        `Turunkan dulu ke In Review kalau memang perlu diperbaiki, lalu kirim ulang.`;
      return;
    }

    // Metadata dulu selagi masih boleh, baru transisinya.
    if (metaBerubah) {
      await api.put(`/estimator/proposals/${id}`, {
        project_name: editForm.value.project_name,
        client:       editForm.value.client,
        client_id:    editForm.value.client_id,
        lokasi:       editForm.value.lokasi,
        revision:     editForm.value.revision,
      });
    }
    if (statusBerubah) {
      await api.put(`/estimator/proposals/${id}/status`, { status: editForm.value.status });
    }

    showEditModal.value = false;
    await loadProposals();
  } catch (e: any) {
    // Pesan dari backend disampaikan apa adanya — ia menyebut status apa yang
    // menghalangi dan transisi apa yang sebenarnya sah.
    editError.value = pesanGagal(e);
    await loadProposals();
  } finally {
    editSaving.value = false;
  }
};

// Close edit dropdown on outside click handled by shared handleClickOutside
const handleEditClickOutside = (e: MouseEvent) => {
  if (editClientDropdownRef.value && !editClientDropdownRef.value.contains(e.target as Node)) {
    editShowClientDropdown.value = false;
  }
};

// Client search
const clients = ref<Client[]>([]);
const filteredClients = ref<Client[]>([]);
const clientSearch = ref('');
const showClientDropdown = ref(false);
const selectedClientName = ref('');
const selectedClientId = ref<number | null>(null);
const clientDropdownRef = ref<HTMLElement | null>(null);
const clientSearchInput = ref<HTMLInputElement | null>(null);

// Auto-focus search input when dropdown opens
watch(showClientDropdown, (open) => {
  if (open) {
    filterClients();
    nextTick(() => clientSearchInput.value?.focus());
  }
});

const loadClients = async () => {
  try {
    const { data } = await api.get('/clients');
    const list = Array.isArray(data) ? data : (data.data ?? []);
    clients.value = list.map((c: any) => ({ id: c.id, name: c.company_name || c.name, code: c.code }));
  } catch {
    try {
      const { data } = await api.get('/sales/customers');
      const list = Array.isArray(data) ? data : (data.data ?? []);
      clients.value = list.map((c: any) => ({ id: c.id, name: c.name, code: c.code }));
    } catch {
      clients.value = [];
    }
  }
};

const filterClients = () => {
  const q = clientSearch.value.toLowerCase();
  if (!q) {
    filteredClients.value = clients.value.slice(0, 20);
  } else {
    filteredClients.value = clients.value.filter(
      c => c.name.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q))
    ).slice(0, 20);
  }
};

const selectClient = (client: Client) => {
  selectedClientName.value = client.name;
  selectedClientId.value = client.id;
  newProposal.value.client = client.name;
  clientSearch.value = '';
  showClientDropdown.value = false;
};

const openAddClient = () => {
  showClientDropdown.value = false;
  // Open customers page in new tab so user doesn't lose form data
  window.open('/customers', '_blank');
};

// Close dropdown on click outside (handles both create and edit dropdowns)
const handleClickOutside = (e: MouseEvent) => {
  if (clientDropdownRef.value && !clientDropdownRef.value.contains(e.target as Node)) {
    showClientDropdown.value = false;
  }
  if (editClientDropdownRef.value && !editClientDropdownRef.value.contains(e.target as Node)) {
    editShowClientDropdown.value = false;
  }
};

const loadProposals = async () => {
  try {
    const { data } = await api.get('/estimator/proposals');
    proposals.value = data;
  } catch (error) {
    console.error('Failed to load proposals:', error);
  }
};

/**
 * Buat proposal beserta zona MTO dari wizard.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Dua cacat yang diperbaiki di sini, keduanya soal batas operasi yang DILIHAT
 * PENGGUNA — bukan atomicity di dalam satu request:
 *
 * 1. **Klik ganda melahirkan dua proposal.** Tombolnya tidak punya keadaan
 *    sedang-mengirim, jadi dua klik cepat mengirim dua `POST /proposals` yang
 *    dua-duanya sah — dan counter nomor yang atomic justru MEMASTIKAN keduanya
 *    berhasil dengan nomor berbeda. Sekarang pengiriman kedua ditolak di depan
 *    dan tombolnya dinonaktifkan selama proses.
 *
 * 2. **Proposal yang sudah jadi dibuang saat zona MTO gagal.** Header dan
 *    template ditulis dalam satu transaction, tapi zonanya dikirim satu per
 *    satu SESUDAH commit. Kalau zona kedua gagal, proposalnya sudah ada di
 *    database — sementara layar berkata "Failed to create proposal" dan
 *    membuang id-nya. Menekan tombol lagi melahirkan proposal BARU, bukan
 *    melanjutkan yang tadi, dan daftar terisi draft parsial yang terlihat sah.
 *
 *    Sekarang: begitu proposalnya jadi, ia diperlakukan sebagai JADI. Zona yang
 *    gagal dilaporkan satu per satu, lalu layar tetap membuka proposal itu
 *    supaya pengguna melanjutkan di sana — tidak ada lagi jalan menuju
 *    duplikat.
 *
 * Yang BELUM dikerjakan dan sengaja tidak disamarkan: perintah create agregat
 * di backend yang menulis header + template + seluruh zona dalam SATU
 * transaction. Itu menghapus kemungkinan parsial sepenuhnya; yang di sini
 * membuat parsialnya terlihat dan tidak berlipat.
 * ───────────────────────────────────────────────────────────────────────────
 */
const membuatProposal = ref(false);

const createProposal = async () => {
  if (membuatProposal.value) return;   // penjaga klik ganda
  membuatProposal.value = true;

  let idBaru: number | null = null;
  try {
    const wizardData: any = templateWizardRef.value?.getResult?.() || {};

    const payload = {
      ...newProposal.value,
      client_id: selectedClientId.value || undefined,
      proposal_type: wizardData.type || null,
      design_params: wizardData.design_params || null,
      template_sections: wizardData.template_sections || [],
    };
    const { data } = await api.post('/estimator/proposals', payload);
    idBaru = data?.id ?? null;
    if (!idBaru) throw new Error('Server tidak mengembalikan id proposal');

    // Zona MTO: tiap kegagalan dicatat, tidak menghentikan sisanya, dan TIDAK
    // membatalkan proposal yang sudah terbentuk.
    const zonaGagal: string[] = [];
    for (const zone of (wizardData.warehouse_mto_zones || [])) {
      try {
        await api.post(`/estimator/proposals/${idBaru}/mto`, zone);
      } catch (e: any) {
        const d = e?.response?.data;
        const sebab = Array.isArray(d?.problems) ? d.problems.join('; ') : (d?.error || 'gagal disimpan');
        zonaGagal.push(`${zone?.element_name || zone?.element_type || 'zona'}: ${sebab}`);
      }
    }

    showCreateModal.value = false;
    wizardStep.value = 1;
    wizardReady.value = false;
    newProposal.value = { project_name: '', client: '', lokasi: '', revision: 'Rev-0' };
    clientSearch.value = '';
    selectedClientName.value = '';
    selectedClientId.value = null;

    if (zonaGagal.length) {
      alert(
        `Proposal berhasil dibuat, tetapi ${zonaGagal.length} zona MTO belum tersimpan:\n\n` +
        zonaGagal.map(z => `• ${z}`).join('\n') +
        `\n\nProposalnya dibuka sekarang — lengkapi zona tersebut di tab MTO. ` +
        `Jangan membuat proposal baru, nanti jadi duplikat.`
      );
    }
    router.push(`/estimator/proposals/${idBaru}`);
  } catch (error: any) {
    console.error('Failed to create proposal:', error);
    if (idBaru) {
      // Proposalnya SUDAH ada. Jangan sampai pengguna mengira gagal lalu
      // membuatnya lagi.
      alert(`Proposal sudah terbentuk (id ${idBaru}) meski ada kendala setelahnya. Proposal itu dibuka sekarang.`);
      showCreateModal.value = false;
      router.push(`/estimator/proposals/${idBaru}`);
    } else {
      alert(error?.response?.data?.error || 'Gagal membuat proposal. Tidak ada yang tersimpan.');
    }
  } finally {
    membuatProposal.value = false;
  }
};

const onTypeSelected = (_type: string | null) => {
  // auto-advance handled by wizard
};

const skipTemplate = () => {
  wizardStep.value = 2;
};

const openProposal = (id: number) => {
  router.push(`/estimator/proposals/${id}`);
};

const deleteProposal = async (id: number) => {
  if (!confirm('Are you sure you want to delete this proposal?')) return;
  
  try {
    await api.delete(`/estimator/proposals/${id}`);
    await loadProposals();
  } catch (error) {
    console.error('Failed to delete proposal:', error);
    alert('Failed to delete proposal');
  }
};

const statusClass = (status: string) => {
  const classes: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    review: 'bg-blue-100 text-blue-800',
    submitted: 'bg-purple-100 text-purple-800',
    deal: 'bg-green-100 text-green-800',
    no_deal: 'bg-red-100 text-red-800',
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};



const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

onMounted(() => {
  loadProposals();
  loadClients();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
