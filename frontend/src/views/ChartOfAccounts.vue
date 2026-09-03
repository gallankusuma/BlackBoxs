<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">📒 Bagan Akun</h1>
        <p class="text-gray-500 text-sm mt-1">
          Chart of Accounts — struktur akun beserta saldonya, dihitung dari jurnal
        </p>
      </div>
      <div class="flex gap-2">
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" v-model="denganSaldo" @change="muat" />
          Tampilkan saldo
        </label>
        <button @click="bukaForm()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          + Akun
        </button>
      </div>
    </div>

    <!-- Ringkasan -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-medium">Akun</p>
        <p class="text-2xl font-black text-gray-900 mt-1">{{ akun.length }}</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-medium">Bisa dijurnal</p>
        <p class="text-2xl font-black text-gray-900 mt-1">{{ bisaJurnal }}</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <p class="text-xs text-gray-500 uppercase font-medium">Akun header</p>
        <p class="text-2xl font-black text-gray-900 mt-1">{{ header }}</p>
      </div>
      <div class="bg-white rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <p class="text-xs text-blue-600 uppercase font-medium">Akun kontrol</p>
        <p class="text-2xl font-black text-blue-700 mt-1">{{ kontrol }}</p>
        <p class="text-[10px] text-blue-500">saldo dari subledger</p>
      </div>
    </div>

    <!-- Penjelasan akun kontrol: kalau tidak dikatakan, penolakan jurnal
         manual ke sana terasa seperti sistem yang rewel tanpa alasan. -->
    <div class="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
      <strong class="text-gray-800">Akun kontrol</strong> saldonya datang dari subledger — daftar AP, AR,
      persediaan, WIP, dan bank. Jurnal manual ke akun itu ditolak; kalau tidak, buku besar dan
      daftar subledger bisa berselisih tanpa bisa dijelaskan. <strong class="text-gray-800">Akun header</strong>
      hanya mengelompokkan dan tidak menerima jurnal sama sekali.
    </div>

    <!-- Daftar akun -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b">
            <tr class="text-left text-gray-600">
              <th class="px-4 py-2.5 w-24">Kode</th>
              <th class="px-4 py-2.5">Nama Akun</th>
              <th class="px-4 py-2.5 w-28">Jenis</th>
              <th class="px-4 py-2.5 w-20 text-center">Saldo Normal</th>
              <th v-if="denganSaldo" class="px-4 py-2.5 w-40 text-right">Saldo</th>
              <th class="px-4 py-2.5 w-48">Sifat</th>
              <th class="px-4 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td :colspan="denganSaldo ? 7 : 6" class="text-center py-8 text-gray-400">Memuat...</td></tr>
            <tr v-for="a in akun" :key="a.id" class="border-b" :class="a.is_header ? 'bg-gray-50 font-semibold' : ''">
              <td class="px-4 py-2 font-mono text-xs" :style="{ paddingLeft: (16 + (a.level - 1) * 18) + 'px' }">
                {{ a.account_code }}
              </td>
              <td class="px-4 py-2">{{ a.account_name }}</td>
              <td class="px-4 py-2"><span :class="kelasJenis(a.account_type)"
                class="px-2 py-0.5 rounded text-[10px] font-medium">{{ labelJenis(a.account_type) }}</span></td>
              <td class="px-4 py-2 text-center font-mono text-xs font-bold"
                :class="a.normal_balance === 'debit' ? 'text-blue-700' : 'text-amber-700'">
                {{ a.normal_balance === 'debit' ? 'D' : 'K' }}
              </td>
              <td v-if="denganSaldo" class="px-4 py-2 text-right tabular-nums"
                :class="Number(a.balance) < 0 ? 'text-red-600' : 'text-gray-800'">
                {{ a.is_header ? '' : rupiah(a.balance) }}
              </td>
              <td class="px-4 py-2">
                <span v-if="a.is_header" class="text-[10px] border rounded px-1.5 py-0.5 text-gray-500">header</span>
                <span v-if="a.is_control_account"
                  class="text-[10px] border border-blue-300 bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                  kontrol · {{ a.control_subledger }}
                </span>
                <span v-if="!a.is_active" class="text-[10px] border rounded px-1.5 py-0.5 text-gray-400">nonaktif</span>
              </td>
              <td class="px-4 py-2 text-right">
                <button @click="bukaForm(a)" class="text-gray-400 hover:text-blue-600 text-xs">Ubah</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal akun -->
    <div v-if="formBuka" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="formBuka = false">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="font-bold text-gray-800">{{ form.id ? 'Ubah Akun' : 'Akun Baru' }}</h3>
          <button @click="formBuka = false" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Kode Akun</label>
              <input v-model="form.account_code" :disabled="!!form.id" type="text"
                class="w-full border rounded-lg px-3 py-2 text-sm font-mono disabled:bg-gray-100" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Akun Induk</label>
              <select v-model="form.parent_code" :disabled="!!form.id"
                class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100">
                <option :value="null">— tanpa induk —</option>
                <option v-for="h in akunHeader" :key="h.id" :value="h.account_code">
                  {{ h.account_code }} — {{ h.account_name }}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Nama Akun</label>
            <input v-model="form.account_name" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Jenis</label>
              <select v-model="form.account_type" :disabled="!!form.id"
                class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100">
                <option v-for="(l, k) in JENIS" :key="k" :value="k">{{ l }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Saldo Normal</label>
              <select v-model="form.normal_balance" :disabled="!!form.id"
                class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100">
                <option value="debit">Debit</option>
                <option value="credit">Kredit</option>
              </select>
            </div>
          </div>
          <div v-if="!form.id">
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" v-model="form.is_header" />
              Akun header (hanya mengelompokkan, tidak menerima jurnal)
            </label>
          </div>
          <div v-if="form.id">
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" v-model="form.is_active" />
              Aktif
            </label>
          </div>
          <!-- Kode, jenis, dan saldo normal dikunci setelah akun ada: mengubahnya
               pada akun yang sudah punya jurnal akan membalik arti seluruh saldo
               historisnya tanpa satu pun baris jurnal berubah. -->
          <p v-if="form.id" class="text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
            Kode, jenis, dan saldo normal tidak bisa diubah. Mengubahnya pada akun yang sudah punya
            jurnal akan membalik arti seluruh saldo historisnya tanpa ada baris jurnal yang berubah.
          </p>
        </div>
        <div class="px-6 py-4 border-t flex justify-end gap-2">
          <button @click="formBuka = false" class="px-4 py-2 border rounded-lg text-sm">Batal</button>
          <button @click="simpan" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Simpan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

const JENIS: Record<string, string> = {
  asset: 'Aset', liability: 'Liabilitas', equity: 'Ekuitas', revenue: 'Pendapatan',
  cogs: 'Beban Pokok', expense: 'Beban', other_income: 'Lain-lain', tax: 'Pajak',
};

const akun = ref<any[]>([]);
const loading = ref(false);
const denganSaldo = ref(false);
const formBuka = ref(false);
const form = ref<any>({});

const bisaJurnal = computed(() => akun.value.filter(a => !a.is_header && a.is_postable).length);
const header = computed(() => akun.value.filter(a => a.is_header).length);
const kontrol = computed(() => akun.value.filter(a => a.is_control_account).length);
const akunHeader = computed(() => akun.value.filter(a => a.is_header));

const rupiah = (v: any) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(v) || 0);
const labelJenis = (t: string) => JENIS[t] || t;
const kelasJenis = (t: string) => ({
  asset: 'bg-blue-100 text-blue-700', liability: 'bg-amber-100 text-amber-800',
  equity: 'bg-violet-100 text-violet-700', revenue: 'bg-green-100 text-green-700',
  cogs: 'bg-orange-100 text-orange-700', expense: 'bg-rose-100 text-rose-700',
  other_income: 'bg-slate-100 text-slate-600', tax: 'bg-teal-100 text-teal-700',
} as Record<string, string>)[t] || 'bg-gray-100 text-gray-600';

async function muat() {
  loading.value = true;
  try {
    akun.value = (await api.get(`/gl/coa?include_inactive=1${denganSaldo.value ? '&with_balance=1' : ''}`)).data?.data || [];
  } catch (e) { console.error('Gagal memuat bagan akun', e); }
  finally { loading.value = false; }
}

function bukaForm(a?: any) {
  form.value = a
    ? { ...a, is_active: !!a.is_active }
    : { account_code: '', account_name: '', account_type: 'asset', normal_balance: 'debit',
        parent_code: null, is_header: false };
  formBuka.value = true;
}

async function simpan() {
  try {
    if (form.value.id) {
      await api.put(`/gl/coa/${form.value.id}`, {
        account_name: form.value.account_name,
        is_active: form.value.is_active,
      });
    } else {
      await api.post('/gl/coa', form.value);
    }
    formBuka.value = false;
    await muat();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan akun');
  }
}

onMounted(muat);
</script>
