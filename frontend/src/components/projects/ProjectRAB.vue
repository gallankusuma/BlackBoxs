<template>
  <div class="space-y-5">

    <!-- Header: Proposal info + link button -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
            📋 Rencana Anggaran Biaya (RAB)
            <span v-if="rab.proposal" class="px-2 py-0.5 rounded-full text-xs font-semibold" :class="statusColor(rab.proposal.status)">
              {{ rab.proposal.status?.toUpperCase() }}
            </span>
          </h3>
          <p v-if="rab.proposal" class="text-sm text-gray-500 mt-0.5">
            {{ rab.proposal.proposal_number }} — {{ rab.proposal.project_name }}
            <span class="text-gray-400 ml-2">{{ rab.proposal.revision }}</span>
          </p>
          <p v-else class="text-sm text-gray-400 mt-0.5">Belum ada proposal yang terhubung ke project ini.</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button v-if="rab.proposal" @click="showUnlinkConfirm = true"
            class="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
            🔗 Lepas
          </button>
          <button @click="openLinkModal"
            class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            {{ rab.proposal ? '🔄 Ganti Proposal' : '🔗 Hubungkan Proposal' }}
          </button>
          <button v-if="rab.proposal" @click="loadRAB"
            class="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            🔃
          </button>
        </div>
      </div>

      <!-- Summary chips -->
      <div v-if="rab.proposal" class="mt-4 flex flex-wrap gap-3">
        <div class="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-center min-w-[120px]">
          <div class="text-xs text-blue-500 font-medium">Biaya Langsung (RAB)</div>
          <div class="text-sm font-bold text-blue-700 mt-0.5">{{ fmt(rab.grand_total) }}</div>
        </div>
        <div class="bg-green-50 border border-green-100 rounded-lg px-4 py-2 text-center min-w-[120px]">
          <div class="text-xs text-green-600 font-medium">Total Aktual (PO)</div>
          <div class="text-sm font-bold text-green-700 mt-0.5">{{ fmt(rab.total_actual || 0) }}</div>
        </div>
        <div :class="varClass" class="rounded-lg px-4 py-2 text-center min-w-[120px]">
          <div class="text-xs font-medium opacity-70">Varian</div>
          <div class="text-sm font-bold mt-0.5">{{ fmt(Math.abs(rab.grand_total - (rab.total_actual||0))) }}
            <span class="text-xs font-normal">{{ varian >= 0 ? '(sisa)' : '(lebih)' }}</span>
          </div>
        </div>
        <div v-if="rab.unallocated_actual > 0" class="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 text-center min-w-[130px]">
          <div class="text-xs text-amber-600 font-medium">PO Belum ter-link RAB</div>
          <div class="text-sm font-bold text-amber-700 mt-0.5">{{ fmt(rab.unallocated_actual) }}</div>
        </div>
        <div class="bg-purple-50 border border-purple-100 rounded-lg px-4 py-2 text-center min-w-[120px]">
          <div class="text-xs text-purple-600 font-medium">Total Project</div>
          <div class="text-sm font-bold text-purple-700 mt-0.5">{{ fmt(rab.proposal.total_project) }}</div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
      <div class="text-center">
        <div class="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
        <p class="text-sm text-gray-500">Memuat RAB...</p>
      </div>
    </div>

    <!-- No proposal -->
    <div v-else-if="!rab.proposal && !loading" class="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
      <div class="text-4xl mb-3">📄</div>
      <p class="text-gray-600 font-medium mb-1">Tidak ada RAB</p>
      <p class="text-sm text-gray-400 mb-4">Hubungkan proposal estimasi untuk menampilkan RAB project ini.</p>
      <button @click="openLinkModal" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        🔗 Hubungkan Proposal
      </button>
    </div>

    <!-- RAB Table -->
    <div v-else-if="rab.disciplines?.length" class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-gray-800 text-white text-xs uppercase">
              <th class="px-3 py-3 text-center font-semibold w-10">No</th>
              <th class="px-3 py-3 text-left font-semibold w-28">Kode</th>
              <th class="px-3 py-3 text-left font-semibold">Uraian Pekerjaan</th>
              <th class="px-3 py-3 text-center font-semibold w-16">Sat</th>
              <th class="px-3 py-3 text-right font-semibold w-20">Volume</th>
              <th class="px-3 py-3 text-right font-semibold w-36">Harga Satuan</th>
              <th class="px-3 py-3 text-right font-semibold w-36">Jumlah RAB</th>
              <th class="px-3 py-3 text-right font-semibold w-36 bg-gray-700">Aktual (PO)</th>
              <th class="px-3 py-3 text-center font-semibold w-20 bg-gray-700">%</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="disc in rab.disciplines" :key="disc.id || disc.code">
              <!-- Discipline Header -->
              <tr class="bg-blue-700 text-white">
                <td class="px-3 py-2.5 text-center text-xs font-bold">—</td>
                <td class="px-3 py-2.5 text-xs font-bold">{{ disc.code }}</td>
                <td class="px-3 py-2.5 text-sm font-bold uppercase tracking-wide" colspan="4">{{ disc.name }}</td>
                <td class="px-3 py-2.5 text-right text-sm font-bold">{{ fmt(disc.subtotal) }}</td>
                <td class="px-3 py-2.5 text-right text-sm font-bold bg-blue-800">{{ disc.actual_total > 0 ? fmt(disc.actual_total) : '—' }}</td>
                <td class="px-3 py-2.5 text-center bg-blue-800">
                  <span v-if="disc.actual_total > 0" class="text-xs font-bold"
                    :class="disc.actual_total > disc.subtotal ? 'text-red-300' : 'text-green-300'">
                    {{ pct(disc.actual_total, disc.subtotal) }}%
                  </span>
                </td>
              </tr>

              <template v-for="sd in disc.sub_disciplines" :key="sd.id || sd.code">
                <!-- Sub-Discipline Header -->
                <tr class="bg-blue-50 border-b border-blue-100">
                  <td class="px-3 py-2 text-center text-xs text-blue-400">—</td>
                  <td class="px-3 py-2 text-xs font-semibold text-blue-700">{{ sd.code }}</td>
                  <td class="px-3 py-2 text-sm font-semibold text-blue-800 italic" colspan="4">{{ sd.name }}</td>
                  <td class="px-3 py-2 text-right text-xs font-semibold text-blue-700">{{ fmt(sd.subtotal) }}</td>
                  <td class="px-3 py-2 text-right text-xs font-semibold bg-blue-100"
                    :class="sd.actual_subtotal > sd.subtotal ? 'text-red-700' : sd.actual_subtotal > 0 ? 'text-green-700' : 'text-gray-400'">
                    {{ sd.actual_subtotal > 0 ? fmt(sd.actual_subtotal) : '—' }}
                  </td>
                  <td class="px-3 py-2 text-center bg-blue-100">
                    <span v-if="sd.actual_subtotal > 0" class="text-xs font-semibold"
                      :class="sd.actual_subtotal > sd.subtotal ? 'text-red-600' : 'text-green-600'">
                      {{ pct(sd.actual_subtotal, sd.subtotal) }}%
                    </span>
                  </td>
                </tr>

                <!-- Items -->
                <template v-for="item in sd.items" :key="item.id">
                  <!-- Section header row -->
                  <tr v-if="item.is_section" class="bg-gray-100 border-b border-gray-200">
                    <td class="px-3 py-2 text-center text-xs text-gray-400">—</td>
                    <td class="px-3 py-2 text-xs text-gray-500">{{ item.ahsp_code }}</td>
                    <td class="px-3 py-2 text-sm font-semibold text-gray-700" colspan="7">{{ item.uraian }}</td>
                  </tr>

                  <!-- Normal item row -->
                  <tr v-else class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td class="px-3 py-2.5 text-center text-xs text-gray-400 font-mono">{{ item.no }}</td>
                    <td class="px-3 py-2.5 text-xs font-mono text-gray-500">{{ item.ahsp_code }}</td>
                    <td class="px-3 py-2.5 text-sm text-gray-800">
                      {{ item.uraian }}
                      <span v-if="item.description" class="block text-xs text-gray-400 mt-0.5">{{ item.description }}</span>
                    </td>
                    <td class="px-3 py-2.5 text-center text-xs text-gray-600">{{ item.satuan }}</td>
                    <td class="px-3 py-2.5 text-right text-sm text-gray-700 font-mono">
                      {{ item.volume > 0 ? item.volume.toLocaleString('id-ID') : '-' }}
                    </td>
                    <td class="px-3 py-2.5 text-right text-sm text-gray-700 font-mono">
                      {{ item.harga_satuan > 0 ? fmt(item.harga_satuan) : '-' }}
                    </td>
                    <td class="px-3 py-2.5 text-right text-sm font-semibold text-gray-900 font-mono">
                      {{ item.jumlah_harga > 0 ? fmt(item.jumlah_harga) : '-' }}
                    </td>
                    <!-- Aktual Biaya column -->
                    <td class="px-3 py-2.5 text-right text-sm font-semibold font-mono bg-gray-50"
                      :class="itemActualClass(item)">
                      {{ item.aktual_biaya > 0 ? fmt(item.aktual_biaya) : '—' }}
                    </td>
                    <!-- % vs RAB -->
                    <td class="px-3 py-2.5 text-center bg-gray-50">
                      <template v-if="item.aktual_biaya > 0 && item.jumlah_harga > 0">
                        <div class="flex flex-col items-center gap-0.5">
                          <span class="text-xs font-bold" :class="item.aktual_biaya > item.jumlah_harga ? 'text-red-600' : 'text-green-600'">
                            {{ pct(item.aktual_biaya, item.jumlah_harga) }}%
                          </span>
                          <div class="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all"
                              :class="item.aktual_biaya > item.jumlah_harga ? 'bg-red-500' : 'bg-green-500'"
                              :style="{ width: Math.min(pct(item.aktual_biaya, item.jumlah_harga), 100) + '%' }">
                            </div>
                          </div>
                        </div>
                      </template>
                      <span v-else class="text-gray-300 text-xs">—</span>
                    </td>
                  </tr>
                </template>

                <!-- Sub-discipline subtotal -->
                <tr class="bg-blue-50 border-b border-blue-200">
                  <td colspan="6" class="px-3 py-2 text-right text-xs font-semibold text-blue-700">Subtotal {{ sd.name }}</td>
                  <td class="px-3 py-2 text-right text-sm font-bold text-blue-800">{{ fmt(sd.subtotal) }}</td>
                  <td class="px-3 py-2 text-right text-sm font-bold bg-blue-100"
                    :class="sd.actual_subtotal > sd.subtotal ? 'text-red-700' : sd.actual_subtotal > 0 ? 'text-green-700' : 'text-gray-400'">
                    {{ sd.actual_subtotal > 0 ? fmt(sd.actual_subtotal) : '—' }}
                  </td>
                  <td class="px-3 py-2 bg-blue-100"></td>
                </tr>
              </template>

              <!-- Discipline subtotal -->
              <tr class="bg-blue-700 text-white border-b-2 border-blue-900">
                <td colspan="6" class="px-3 py-2.5 text-right text-xs font-bold uppercase">Total {{ disc.name }}</td>
                <td class="px-3 py-2.5 text-right text-sm font-bold">{{ fmt(disc.subtotal) }}</td>
                <td class="px-3 py-2.5 text-right text-sm font-bold bg-blue-800">{{ disc.actual_total > 0 ? fmt(disc.actual_total) : '—' }}</td>
                <td class="px-3 py-2.5 bg-blue-800"></td>
              </tr>
            </template>

            <!-- Grand Total -->
            <tr class="bg-gray-900 text-white">
              <td colspan="6" class="px-4 py-3 text-right text-sm font-bold uppercase tracking-wide">GRAND TOTAL BIAYA LANGSUNG</td>
              <td class="px-4 py-3 text-right text-base font-black">{{ fmt(rab.grand_total) }}</td>
              <td class="px-4 py-3 text-right text-base font-black bg-gray-800"
                :class="(rab.total_actual||0) > rab.grand_total ? 'text-red-400' : 'text-green-400'">
                {{ fmt(rab.total_actual || 0) }}
              </td>
              <td class="px-4 py-3 text-center bg-gray-800">
                <span v-if="rab.total_actual > 0" class="text-sm font-bold"
                  :class="rab.total_actual > rab.grand_total ? 'text-red-400' : 'text-green-400'">
                  {{ pct(rab.total_actual, rab.grand_total) }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Legend -->
      <div class="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-5 text-xs text-gray-500">
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span> Di bawah RAB</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span> Melebihi RAB</span>
        <span class="flex items-center gap-1.5"><span class="text-gray-400 font-bold">—</span> Belum ada PO aktual</span>
        <span class="ml-auto text-gray-400 italic">Aktual = total PO (approved/received) yang ter-link ke project ini</span>
      </div>
    </div>

    <!-- Empty items -->
    <div v-else-if="rab.proposal && !loading" class="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <div class="text-3xl mb-2">📭</div>
      <p class="text-gray-500 text-sm">Proposal terhubung tapi belum ada item pekerjaan.</p>
    </div>

    <!-- LINK PROPOSAL MODAL -->
    <div v-if="showLinkModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showLinkModal = false">
      <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-base font-bold text-gray-800">🔗 Hubungkan Proposal ke Project</h3>
          <button @click="showLinkModal = false" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div class="px-6 py-5">
          <p class="text-sm text-gray-500 mb-4">Pilih proposal estimasi yang ingin dijadikan RAB project ini.</p>
          <div v-if="loadingProposals" class="py-8 text-center text-sm text-gray-400">Memuat...</div>
          <div v-else-if="availableProposals.length === 0" class="py-6 text-center text-sm text-gray-400">
            Tidak ada proposal tersedia.
          </div>
          <div v-else class="space-y-2 max-h-72 overflow-y-auto">
            <label v-for="p in availableProposals" :key="p.id"
              class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all"
              :class="selectedProposalId === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'">
              <input type="radio" :value="p.id" v-model="selectedProposalId" class="mt-0.5 accent-blue-600" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold text-gray-800">{{ p.proposal_number }}</span>
                  <span class="px-1.5 py-0.5 rounded text-xs font-medium" :class="statusColor(p.status)">{{ p.status }}</span>
                </div>
                <p class="text-xs text-gray-600 mt-0.5 truncate">{{ p.project_name }}</p>
                <p class="text-xs text-gray-400 mt-0.5">Total: <span class="font-semibold text-gray-600">{{ fmt(p.total_project) }}</span></p>
              </div>
            </label>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button @click="showLinkModal = false" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
          <button @click="linkProposal" :disabled="!selectedProposalId || linkingProposal"
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {{ linkingProposal ? 'Menghubungkan...' : 'Hubungkan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- UNLINK CONFIRM -->
    <div v-if="showUnlinkConfirm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div class="text-4xl mb-3">⚠️</div>
        <h3 class="text-base font-bold text-gray-800 mb-2">Lepas Proposal?</h3>
        <p class="text-sm text-gray-500 mb-5">Proposal tidak akan dihapus, hanya dilepas dari project ini.</p>
        <div class="flex gap-3 justify-center">
          <button @click="showUnlinkConfirm = false" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
          <button @click="unlinkProposal" class="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Lepas</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{ projectId: number | string }>();

const rab = ref<any>({ proposal: null, disciplines: [], grand_total: 0, total_actual: 0, unallocated_actual: 0 });
const loading = ref(false);
const showLinkModal = ref(false);
const showUnlinkConfirm = ref(false);
const availableProposals = ref<any[]>([]);
const selectedProposalId = ref<number | null>(null);
const loadingProposals = ref(false);
const linkingProposal = ref(false);

const fmt = (val: number) => formatCurrency(val || 0);
const pct = (actual: number, budget: number) => budget > 0 ? Math.round((actual / budget) * 100) : 0;

const varian = computed(() => (rab.value.grand_total || 0) - (rab.value.total_actual || 0));
const varClass = computed(() =>
  varian.value >= 0
    ? 'bg-green-50 border border-green-100 text-green-700'
    : 'bg-red-50 border border-red-100 text-red-700'
);

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    deal: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    locked: 'bg-purple-100 text-purple-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const itemActualClass = (item: any) => {
  if (!item.aktual_biaya || item.aktual_biaya === 0) return 'text-gray-300';
  return item.aktual_biaya > item.jumlah_harga ? 'text-red-600' : 'text-green-700';
};

const loadRAB = async () => {
  loading.value = true;
  try {
    const res = await api.get(`/projects/${props.projectId}/rab`);
    rab.value = res.data;
  } catch (err) {
    console.error('Failed to load RAB:', err);
    rab.value = { proposal: null, disciplines: [], grand_total: 0, total_actual: 0, unallocated_actual: 0 };
  } finally {
    loading.value = false;
  }
};

const openLinkModal = async () => {
  showLinkModal.value = true;
  selectedProposalId.value = rab.value.proposal?.id || null;
  loadingProposals.value = true;
  try {
    const res = await api.get(`/projects/${props.projectId}/available-proposals`);
    availableProposals.value = res.data;
  } catch {
    availableProposals.value = [];
  } finally {
    loadingProposals.value = false;
  }
};

const linkProposal = async () => {
  if (!selectedProposalId.value) return;
  linkingProposal.value = true;
  try {
    await api.put(`/projects/${props.projectId}/link-proposal`, { proposal_id: selectedProposalId.value });
    showLinkModal.value = false;
    await loadRAB();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal menghubungkan proposal');
  } finally {
    linkingProposal.value = false;
  }
};

const unlinkProposal = async () => {
  try {
    await api.delete(`/projects/${props.projectId}/link-proposal`);
    showUnlinkConfirm.value = false;
    await loadRAB();
  } catch (err: any) {
    alert(err?.response?.data?.error || 'Gagal melepas proposal');
  }
};

onMounted(loadRAB);
</script>
