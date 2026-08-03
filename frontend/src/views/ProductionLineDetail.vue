<template>
  <div class="p-6 max-w-5xl mx-auto" v-if="line">
    <button @click="$router.push('/assets/production-lines')" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
      ← Kembali ke Line Produksi
    </button>

    <div class="mb-5">
      <div class="text-xs text-gray-400 font-mono">{{ line.code }}</div>
      <h1 class="text-xl font-bold text-gray-800">⚙️ {{ line.name }}</h1>
      <p class="text-sm text-gray-500 mt-0.5">{{ line.description || 'Tidak ada deskripsi' }}</p>
    </div>

    <!-- Quick add P&ID -->
    <div class="bg-gray-50 border rounded-xl p-4 mb-5">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">+ Tambah P&amp;ID</h3>
      <div class="grid grid-cols-4 gap-2">
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Kode P&amp;ID</label>
          <input v-model="form.code" type="text" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="mis. PID-001">
        </div>
        <div class="col-span-2">
          <label class="block text-[10px] text-gray-500 mb-1">Judul</label>
          <input v-model="form.title" type="text" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="mis. Reactor & Transfer System">
        </div>
        <button @click="addPnid" :disabled="saving" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
          {{ saving ? 'Menyimpan...' : '+ Tambah P&ID' }}
        </button>
      </div>
      <div class="mt-2">
        <label class="block text-[10px] text-gray-500 mb-1">Deskripsi</label>
        <input v-model="form.description" type="text" class="w-full border rounded px-2 py-1.5 text-xs">
      </div>
    </div>

    <!-- P&ID list for this line -->
    <div class="bg-white border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-4 py-2.5">Kode P&amp;ID</th><th class="px-4 py-2.5">Judul</th><th class="px-4 py-2.5">Deskripsi</th>
          <th class="px-4 py-2.5 text-right">Jml Aset</th><th></th>
        </tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="text-center py-8 text-gray-400">Memuat...</td></tr>
          <tr v-else-if="!pnids.length"><td colspan="5" class="text-center py-8 text-gray-400">Belum ada P&amp;ID di line ini.</td></tr>
          <tr v-for="p in pnids" :key="p.id" @click="$router.push(`/assets/pnids/${p.id}`)" class="border-b hover:bg-blue-50/50 cursor-pointer">
            <td class="px-4 py-2.5 font-medium text-gray-700">{{ p.code }}</td>
            <td class="px-4 py-2.5">{{ p.title || '-' }}</td>
            <td class="px-4 py-2.5 text-gray-500">{{ p.description || '-' }}</td>
            <td class="px-4 py-2.5 text-right">
              <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">{{ p.asset_count }} aset</span>
            </td>
            <td class="px-4 py-2.5 text-right"><button @click.stop="deletePnid(p)" class="text-gray-400 hover:text-red-600">🗑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="p-10 text-center text-gray-400">Memuat...</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/lib/api';

const route = useRoute();
const lineId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;

const line = ref<any>(null);
const pnids = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const form = ref({ code: '', title: '', description: '' });

async function loadPnids() {
  const { data } = await api.get(`/assets/production-lines/${lineId}/pnids`);
  pnids.value = data.data || [];
}

async function loadAll() {
  loading.value = true;
  try {
    const { data } = await api.get(`/assets/production-lines/${lineId}`);
    line.value = data.data;
    await loadPnids();
  } finally {
    loading.value = false;
  }
}

async function addPnid() {
  if (!form.value.code) { alert('Kode P&ID wajib diisi'); return; }
  saving.value = true;
  try {
    await api.post(`/assets/production-lines/${lineId}/pnids`, form.value);
    form.value = { code: '', title: '', description: '' };
    await loadPnids();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan P&ID');
  } finally {
    saving.value = false;
  }
}

async function deletePnid(p: any) {
  if (!confirm(`Hapus P&ID "${p.code}"? Aset di dalamnya tidak ikut terhapus tapi jadi tidak terhubung ke P&ID ini.`)) return;
  await api.delete(`/assets/pnids/${p.id}`);
  await loadPnids();
}

onMounted(loadAll);
</script>
