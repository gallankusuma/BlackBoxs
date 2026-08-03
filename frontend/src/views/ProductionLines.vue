<template>
  <div class="p-6 max-w-3xl mx-auto">
    <button @click="$router.push('/assets')" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
      ← Kembali ke Asset Register
    </button>
    <h1 class="text-xl font-bold text-gray-800 mb-1">⚙️ Line Produksi</h1>
    <p class="text-sm text-gray-500 mb-5">Daftar line produksi — dipakai untuk mengelompokkan aset piping, electrical, instrumen &amp; mesin berdasarkan P&amp;ID.</p>

    <div class="bg-gray-50 border rounded-xl p-4 mb-5 grid grid-cols-3 gap-2 items-end">
      <div><label class="block text-xs font-medium text-gray-600 mb-1">Kode</label>
        <input v-model="form.code" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="LINE-01"></div>
      <div><label class="block text-xs font-medium text-gray-600 mb-1">Nama Line</label>
        <input v-model="form.name" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Line 1 - Formulation"></div>
      <button @click="addLine" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">+ Tambah Line</button>
      <div class="col-span-3"><label class="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
        <input v-model="form.description" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"></div>
    </div>

    <div class="bg-white border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-4 py-2.5">Kode</th><th class="px-4 py-2.5">Nama</th><th class="px-4 py-2.5">Deskripsi</th><th class="px-4 py-2.5"></th>
        </tr></thead>
        <tbody>
          <tr v-if="!lines.length"><td colspan="4" class="text-center py-8 text-gray-400">Belum ada line produksi.</td></tr>
          <tr v-for="l in lines" :key="l.id" @click="$router.push(`/assets/production-lines/${l.id}`)" class="border-b hover:bg-blue-50/50 cursor-pointer">
            <td class="px-4 py-2.5 font-medium">{{ l.code || '-' }}</td>
            <td class="px-4 py-2.5">{{ l.name }}</td>
            <td class="px-4 py-2.5 text-gray-500">{{ l.description || '-' }}</td>
            <td class="px-4 py-2.5 text-right"><button @click.stop="deleteLine(l)" class="text-gray-400 hover:text-red-600">🗑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/lib/api';

const lines = ref<any[]>([]);
const form = ref({ code: '', name: '', description: '' });

async function loadLines() {
  const { data } = await api.get('/assets/production-lines');
  lines.value = data.data || [];
}

async function addLine() {
  if (!form.value.name) { alert('Nama line wajib diisi'); return; }
  await api.post('/assets/production-lines', form.value);
  form.value = { code: '', name: '', description: '' };
  await loadLines();
}

async function deleteLine(l: any) {
  if (!confirm(`Hapus line "${l.name}"?`)) return;
  await api.delete(`/assets/production-lines/${l.id}`);
  await loadLines();
}

onMounted(loadLines);
</script>
