<template>
  <div class="mto-wrap">

    <!-- Module Tab Navigation -->
    <div class="mto-tabs">
    <button v-for="mod in MODULES" :key="mod.id"
        @click="activeTab = mod.id; activeZoneIdx = 0"
        class="mto-tab" :class="{ active: activeTab === mod.id }"
        :style="`--clr:${mod.color}`">
        <span>{{ mod.icon }}</span>
        <span class="tab-label">{{ mod.label }}</span>
        <span v-if="zones[mod.id]?.length" class="tab-badge">{{ zones[mod.id].length }}</span>
      </button>
      <!-- Rekap tab -->
      <button @click="activeTab='rekap'; activeZoneIdx=0"
        class="mto-tab" :class="{active:activeTab==='rekap'}" style="--clr:#0ea5e9">
        <span>📊</span>
        <span class="tab-label">Rekap MTO</span>
      </button>
    </div>

    <!-- EST-MTO-R37: saat proposal sudah dikirim, yang berlaku adalah angka
         yang disepakati — bukan hasil hitung ulang formula sekarang. -->
    <div v-if="contractMode && !loading && hasSaved" class="mto-contract-bar">
      <span class="mcb-icon">🔒</span>
      <div>
        <div class="mcb-title">Kuantitas Kontrak</div>
        <div class="mcb-sub">
          Angka di bawah adalah kuantitas yang tersimpan saat proposal dikirim.
          Perubahan formula setelahnya tidak menggesernya.
        </div>
      </div>
    </div>

    <!-- Dimensi teknis wajib yang belum diisi (EST-MTO-R35) -->
    <div v-if="anyMissing && !loading" class="mto-warn-bar mto-warn-amber">
      <span class="mcb-icon">⚠️</span>
      <div>
        <div class="mcb-title">Dimensi teknis belum lengkap</div>
        <div class="mcb-sub">
          Sebagian zona memakai nilai asumsi kalkulator, bukan data teknis.
          Elemen yang ditandai tidak bisa disimpan ulang sebelum dilengkapi.
        </div>
      </div>
    </div>

    <div class="mto-content">
      <div v-if="loading" class="mto-loading">⏳ Memuat data...</div>
      <template v-else>
        <!-- Zone input UI — only when NOT in Rekap tab -->
        <template v-if="activeTab !== 'rekap' && activeModule">

          <!-- Header row -->
          <div class="mod-header">
            <div class="mod-title">
              <span style="font-size:1.4rem">{{ activeModule.icon }}</span>
              <div>
                <div class="mod-name">{{ activeModule.label }}</div>
                <div class="mod-sub">Input dimensi per zona → kalkulasi MTO otomatis</div>
              </div>
            </div>
            <button v-if="!readonly" @click="addZone" class="add-zone-btn">＋ Tambah Zona</button>
          </div>

          <!-- Zone tabs (horizontal pills) -->
          <div class="zone-bar" v-if="currentZones.length">
            <button v-for="(z, i) in currentZones" :key="z.zid"
              class="zone-pill" :class="{ active: activeZoneIdx === i }"
              @click="activeZoneIdx = i">
              {{ z.name || (activeModule.label + ' ' + (i+1)) }}
              <span v-if="!readonly" @click.stop="removeZone(i)" class="zone-del" title="Hapus zona">×</span>
            </button>
          </div>
          <div v-else class="zone-empty">
            <span>Belum ada zona. Klik <strong>＋ Tambah Zona</strong> untuk mulai.</span>
          </div>

          <!-- Active zone: name + component -->
          <template v-if="activeZone">
            <div class="zone-name-row">
              <input v-if="!readonly" class="zone-name-input" v-model="activeZone.name"
                :placeholder="activeModule.label + ' ' + (activeZoneIdx+1)"
                @change="markDirty" />
              <span v-else class="zone-name-input" style="background:#f8fafc;border-color:#e2e8f0;color:#0f172a">{{ activeZone.name || activeModule.label + ' ' + (activeZoneIdx+1) }}</span>
              <span class="zone-hint">{{ activeModule.label }} — Zona {{ activeZoneIdx + 1 }}</span>
            </div>

            <!-- Dimensi wajib yang kurang pada zona ini (EST-MTO-R35) -->
            <div v-if="activeZoneMissing.length" class="zone-missing">
              <strong>⚠️ Wajib diisi:</strong>
              <ul><li v-for="m in activeZoneMissing" :key="m">{{ m }}</li></ul>
              <span class="zm-note">Kuantitas di bawah memakai nilai asumsi sampai ini dilengkapi.</span>
            </div>

            <div class="mod-body">
              <component :is="activeModule.component"
                :key="activeZone.zid"
                v-model="activeZone.params"
                :disabled="readonly"
                @change="markDirty" />
            </div>
          </template>

          <!-- Save bar -->
          <template v-if="!readonly">
            <!-- Alasan gagal simpan ditampilkan APA ADANYA dari server.
                 Backend menolak dimensi teknis yang belum lengkap dengan 422
                 MISSING_REQUIRED_PARAMETERS berikut daftar persis field yang
                 kurang — dulu daftar itu dibuang dan diganti "Coba lagi", jadi
                 pengguna hanya tahu gagal tanpa pernah tahu apa yang harus
                 diisi, dan mencoba lagi tidak pernah mengubah apa pun. -->
            <div v-if="saveError" class="zone-missing" style="border-color:#fca5a5;background:#fef2f2">
              <strong style="color:#991b1b">❌ {{ saveError.message }}</strong>
              <ul v-if="saveError.problems.length">
                <li v-for="m in saveError.problems" :key="m">{{ m }}</li>
              </ul>
              <span class="zm-note">
                Lengkapi dimensi di atas lalu Simpan lagi. Selama belum lengkap,
                MTO ini <strong>tidak tersimpan</strong>.
              </span>
            </div>

            <div class="dirty-bar" :style="isDirty ? 'background:#fef3c7;border-color:#fcd34d' : 'background:#f0fdf4;border-color:#d1fae5'">
              <span v-if="isDirty" style="color:#92400e">⚠️ Ada perubahan belum disimpan</span>
              <span v-else style="color:#065f46">✓ {{ zones[activeTab]?.length || 0 }} zona {{ activeModule?.label }} tersimpan</span>
              <button @click="saveModule" :disabled="saving" class="save-btn-sm"
                :style="isDirty ? 'background:#d97706' : 'background:#059669'">
                {{ saving ? 'Menyimpan...' : '💾 Simpan' }}
              </button>
            </div>
          </template>
          <div v-else-if="readonly && zones[activeTab]?.length" class="saved-bar" style="background:#eff6ff;border-color:#bfdbfe;color:#1e40af">
            🔒 {{ zones[activeTab].length }} zona {{ activeModule?.label }} — Read-only (edit di Proposal)
          </div>

        </template><!-- zone input -->

        <!-- ── REKAP MTO VIEW ── -->
        <template v-if="activeTab==='rekap'">
        <div class="rekap-wrap">
          <div class="mod-header">
            <div class="mod-title">
              <span style="font-size:1.4rem">📊</span>
              <div>
                <div class="mod-name">Rekapitulasi MTO Proyek</div>
                <div class="mod-sub">Kebutuhan material detail per bagian, hasil kalkulasi dari semua zona yang tersimpan</div>
              </div>
            </div>
          </div>

          <!-- KPI summary cards -->
          <div class="rekap-kpi">
            <div class="rk-card" v-for="s in grandSummary" :key="s.l">
              <div class="rk-icon">{{ s.icon }}</div>
              <div class="rk-val">{{ s.v }}</div>
              <div class="rk-u">{{ s.u }}</div>
              <div class="rk-l">{{ s.l }}</div>
            </div>
          </div>

          <!-- EST-MTO-R37: formula berubah setelah proposal dikirim.
               Yang tampil di atas tetap angka kontrak; ini pembandingnya. -->
          <div v-if="anyDrift && contractComparison.length" class="drift-panel">
            <div class="dp-head">
              ⚠️ Formula kalkulator berubah setelah proposal dikirim
            </div>
            <div class="dp-sub">
              Rekap di atas memakai <strong>kuantitas kontrak</strong>. Tabel ini hanya
              memperlihatkan bedanya kalau dihitung dengan formula sekarang.
            </div>
            <table class="dp-table">
              <thead>
                <tr><th>Zona</th><th>Item</th><th>Kontrak</th><th>Formula sekarang</th><th>Selisih</th></tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in contractComparison" :key="i">
                  <td>{{ r.zone }}</td>
                  <td>{{ r.label }}</td>
                  <td class="dp-num">{{ f2(r.contract) }} {{ r.unit }}</td>
                  <td class="dp-num">{{ f2(r.current) }} {{ r.unit }}</td>
                  <td class="dp-num" :class="r.diff > 0 ? 'dp-up' : 'dp-down'">
                    {{ r.diff > 0 ? '+' : '' }}{{ f2(r.diff) }} {{ r.unit }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Empty state -->
          <div v-if="!hasSaved" class="rekap-empty">
            📝 Belum ada data MTO. Isi dimensi di tab Pondasi, Kolom, Balok, dll terlebih dahulu lalu simpan.
          </div>

          <template v-else>
            <!-- Detail per section -->
            <div v-for="sec in detailedMTO" :key="sec.id" class="rekap-section">
              <div class="rs-head" @click="sec.open=!sec.open">
                <span style="font-size:1.1rem">{{ sec.icon }}</span>
                <span style="font-weight:700;flex:1">{{ sec.label }}</span>
                <span class="rs-badge">{{ sec.zones.length }} zona</span>
                <span class="rs-toggle">{{ sec.open ? '▲' : '▼' }}</span>
              </div>
              <div v-show="sec.open">
                <div v-for="(z, zi) in sec.zones" :key="zi" class="rs-zone">
                  <div class="rs-zone-name">📌 {{ z.name }}</div>
                  <table class="rs-tbl">
                    <thead><tr><th>Material / Pekerjaan</th><th class="tc">Qty</th><th class="tc">Satuan</th></tr></thead>
                    <tbody>
                      <tr v-for="(row, ri) in z.rows" :key="ri" :class="ri%2?'rs-odd':''">
                        <td>{{ row.label }}</td>
                        <td class="tc rs-num">{{ row.qty }}</td>
                        <td class="tc rs-unit">{{ row.unit }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!-- Section subtotal -->
                <table class="rs-tbl rs-subtotal">
                  <thead><tr><th colspan="2" style="color:#1d4ed8">∑ Subtotal — {{ sec.label }}</th><th class="tc">Total</th><th class="tc">Satuan</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, ri) in sec.subtotal" :key="ri">
                      <td colspan="2" style="font-weight:600">{{ row.label }}</td>
                      <td class="tc" style="font-weight:800;color:#0f172a">{{ row.qty }}</td>
                      <td class="tc rs-unit">{{ row.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Grand Total -->
            <div class="rekap-total">
              <div class="rt-title">📦 Grand Total Kebutuhan Material</div>
              <table class="rs-tbl">
                <thead><tr><th>Material</th><th class="tc">Total Qty</th><th class="tc">Satuan</th><th>Keterangan</th></tr></thead>
                <tbody>
                  <tr v-for="(r, i) in mtoGrandTotal" :key="i" :class="i%2?'rs-odd':''">
                    <td style="font-weight:600">{{ r.icon }} {{ r.label }}</td>
                    <td class="tc" style="font-weight:800;font-size:.95rem;color:#1d4ed8">{{ r.qty }}</td>
                    <td class="tc rs-unit">{{ r.unit }}</td>
                     <td style="color:#94a3b8;font-size:.72rem">{{ r.note }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div><!-- rekap-wrap -->
      </template><!-- rekap tab -->

    </template><!-- v-else (not loading) -->
    </div><!-- mto-content -->

  </div><!-- mto-wrap -->
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { api } from '../../lib/api';
import FoundationInputs from './mto/FoundationInputs.vue';
import ColumnInputs from './mto/ColumnInputs.vue';
import BeamInputs from './mto/BeamInputs.vue';
import SlabInputs from './mto/SlabInputs.vue';
import WallInputs from './mto/WallInputs.vue';
import RoofInputs from './mto/RoofInputs.vue';

const props = defineProps<{
  projectId: number | string;
  apiBase?: string;           // default '/projects'
  readonly?: boolean;         // when true, hide all editing controls
  /**
   * EST-MTO-R37: kuantitas yang ditampilkan adalah KUANTITAS KONTRAK — baris
   * yang tersimpan saat proposal dikirim — bukan hasil hitung ulang formula
   * sekarang. Dipakai untuk proposal berstatus submitted/deal dan untuk layar
   * project, yang memang hanya ada setelah deal.
   */
  contractMode?: boolean;
}>();

const baseUrl = computed(() => `${props.apiBase || '/projects'}/${props.projectId}`);

const MODULES = [
  { id:'foundation', label:'Pondasi',     icon:'🏗', color:'#f59e0b', component: FoundationInputs },
  { id:'column',     label:'Kolom',       icon:'🏛', color:'#3b82f6', component: ColumnInputs },
  { id:'beam',       label:'Balok',       icon:'🔗', color:'#8b5cf6', component: BeamInputs },
  { id:'slab',       label:'Plat Lantai', icon:'🧱', color:'#10b981', component: SlabInputs },
  { id:'wall',       label:'Dinding',     icon:'🪟', color:'#6b7280', component: WallInputs },
  { id:'roof',       label:'Atap',        icon:'🏠', color:'#ef4444', component: RoofInputs },
];

// Default params per module type
const DEFAULTS: Record<string, () => Record<string,any>> = {
  foundation: () => ({ foundation_type:'footplate', qty:12, L:1.0, W:1.0, H:0.35, depth:1.2, working_space:0.3, tb_length:200, tb_w:0.20, tb_h:0.40, rebar_main:13, tb_rebar_main:16, tb_stirrup:10, stirrup_spacing:0.15 }),
  column:     () => ({ col_type:'beton', qty_per_floor:12, floors:1, height_per_floor:4, B:0.3, H:0.3, rebar_dia:16, rebar_count:8, stirrup_dia:10, stirrup_spacing:0.15, cover:0.04, sloof_length:200, sloof_w:0.3, sloof_h:0.5, sloof_rebar_dia:16 }),
  beam:       () => ({ beam_type:'beton', total_length:300, B:0.25, H:0.5, rebar_count:4, rebar_dia:16, stirrup_dia:10, rb_length:200, rb_B:0.15, rb_H:0.25, rb_rebar_dia:13 }),
  slab:       () => ({ slab_type:'concrete', area:1000, thickness:0.15, subbase_t:0.15, lean_t:0.05, cut_depth:0.35, rebar_type:'wiremesh', rebar_dia_x:8, spacing_x:0.15, finishing:'floor_hardener' }),
  wall:       () => ({ wall_type:'bata_ringan', area:500, height:4, opening_pct:20, thickness_cm:10, door_qty:4, door_w:0.9, door_h:2.1, window_qty:8, window_w:1.2, window_h:1.2 }),
  roof:       () => ({ roof_type:'zincalume', floor_area:1000, perimeter:160, slope_deg:10, overhang:0.8, sheet_eff_w:0.85, cladding_h:6, cladding_type:'zincalume', ridge_length:50, gutter_length:100, downspout_qty:4, purlin_spacing:1.5 }),
};

interface Zone { zid: string; name: string; element_id?: number; params: Record<string,any>; }

const activeTab     = ref('foundation');
const activeZoneIdx = ref(0);
const loading       = ref(false);
const saving        = ref(false);
const isDirty       = ref(false);

// zones[moduleId] = Zone[]
const zones = ref<Record<string, Zone[]>>({
  foundation:[], column:[], beam:[], slab:[], wall:[], roof:[]
});

const activeModule  = computed(() => MODULES.find(m => m.id === activeTab.value)!);
const currentZones  = computed(() => zones.value[activeTab.value] || []);
const activeZone    = computed(() => currentZones.value[activeZoneIdx.value] || null);
const hasSaved      = computed(() => MODULES.some(m => zones.value[m.id]?.length > 0));

// Auto-save debounce timer
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(activeTab, async (newTab, oldTab) => {
  // Auto-save previous tab data before switching
  if (isDirty.value && oldTab) {
    await autoSave(oldTab);
  }
  activeZoneIdx.value = 0;
  nextTick(() => {
    if (!zones.value[newTab]?.length) addDefaultZone();
  });
});

// Deep watch zones params — catches v-model changes that don't emit @change
let skipWatch = true; // skip initial hydration
watch(() => zones.value, () => {
  if (skipWatch || props.readonly) return;
  markDirty();
}, { deep: true });
// Enable deep watch after initial load settles
watch(loading, (v) => { if (!v) nextTick(() => { skipWatch = false; }); });

function uid() { return Math.random().toString(36).slice(2,9); }

// Add zone without marking dirty (silent, for auto-create)
function addDefaultZone() {
  const mod = activeTab.value;
  if (zones.value[mod]?.length) return; // already has zones
  const name = `${activeModule.value.label} 1`;
  zones.value[mod].push({ zid: uid(), name, params: DEFAULTS[mod]() });
  activeZoneIdx.value = 0;
  // not marking dirty — user must explicitly save
}

function addZone() {
  const mod = activeTab.value;
  const name = `${activeModule.value.label} ${(zones.value[mod]?.length || 0) + 1}`;
  zones.value[mod].push({ zid: uid(), name, params: DEFAULTS[mod]() });
  activeZoneIdx.value = zones.value[mod].length - 1;
  markDirty();
}

async function removeZone(i: number) {
  if (!confirm('Hapus zona ini?')) return;
  const mod = activeTab.value;
  const zone = zones.value[mod][i];
  // Delete from backend if it was previously saved
  if (zone.element_id) {
    try {
      await api.delete(`${baseUrl.value}/mto/${zone.element_id}`);
    } catch (e) { console.error('Failed to delete zone from backend:', e); }
  }
  zones.value[mod].splice(i, 1);
  if (activeZoneIdx.value >= zones.value[mod].length)
    activeZoneIdx.value = Math.max(0, zones.value[mod].length - 1);
  // Don't just markDirty — the deletion is already persisted
}

function markDirty() {
  if (props.readonly) return; // readonly mode — no edits allowed
  isDirty.value = true;
  // Debounced auto-save — 3 seconds after last change
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    if (isDirty.value) autoSave(activeTab.value);
  }, 3000);
}

/** Alasan gagal simpan terakhir — ditampilkan di bar simpan, bukan dibuang. */
const saveError = ref<{ message: string; problems: string[] } | null>(null);

/** Ambil pesan dan daftar masalah dari respons error backend. */
function uraikanGagal(e: any): { message: string; problems: string[] } {
  const d = e?.response?.data;
  return {
    message: d?.error || e?.message || 'Gagal menyimpan MTO.',
    problems: Array.isArray(d?.problems) ? d.problems
            : Array.isArray(d?.missing_required) ? d.missing_required
            : [],
  };
}

// Auto-save untuk satu tab modul

async function autoSave(mod: string) {
  if (!zones.value[mod]?.length) return;
  try {
    for (const z of zones.value[mod]) {
      const activeModInfo = MODULES.find(m => m.id === mod);
      const payload = {
        element_type: mod,
        element_name: z.name || activeModInfo?.label || mod,
        parameters: { ...z.params, _zone_name: z.name }
      };
      if (z.element_id) {
        await api.put(`${baseUrl.value}/mto/${z.element_id}`, payload);
      } else {
        const res = await api.post(`${baseUrl.value}/mto`, payload);
        z.element_id = res.data.id;
      }
    }
    isDirty.value = false;
    saveError.value = null;
  } catch (e: any) {
    // Auto-save TIDAK boleh gagal diam-diam. Versi lama menelan errornya
    // sepenuhnya, jadi perubahan yang ditolak server tetap terlihat di layar
    // seolah tersimpan — dan baru ketahuan hilang setelah halaman dimuat ulang.
    // Tanpa alert (ini berjalan di latar), tapi alasannya ditampilkan di bar.
    saveError.value = uraikanGagal(e);
    isDirty.value = true;
  }
}

async function saveModule() {
  saving.value = true;
  try {
    const mod = activeTab.value;
    const zoneList = zones.value[mod];
    for (const z of zoneList) {
      const payload = { element_type: mod, element_name: z.name || `${activeModule.value.label}`, parameters: { ...z.params, _zone_name: z.name } };
      if (z.element_id) {
        await api.put(`${baseUrl.value}/mto/${z.element_id}`, payload);
      } else {
        const res = await api.post(`${baseUrl.value}/mto`, payload);
        z.element_id = res.data.id;
      }
    }
    isDirty.value = false;
    saveError.value = null;
  } catch (e: any) {
    // Pesan server dipakai apa adanya — ia sudah menyebut field mana yang
    // kurang. "Coba lagi" adalah saran yang keliru: mencoba lagi dengan data
    // yang sama akan ditolak lagi.
    saveError.value = uraikanGagal(e);
  } finally { saving.value = false; }
}

async function fetchAll() {
  loading.value = true;
  // Reset all zones before loading — prevents duplication on re-mount
  for (const mod of MODULES) zones.value[mod.id] = [];
  try {
    const res = await api.get(`${baseUrl.value}/mto`);
    const elements: any[] = res.data.elements || [];
    storedByElement.value = {};
    driftByElement.value = {};
    missingByElement.value = {};
    for (const el of elements) {
      const t = el.element_type;
      if (!zones.value[t]) zones.value[t] = [];
      const params = el.parameters || {};
      zones.value[t].push({ zid: uid(), name: params._zone_name || el.element_name || t, element_id: el.id, params: { ...DEFAULTS[t]?.(), ...params } });

      // EST-MTO-R37: `mto_lines` memakai `line_code`, kalkulator memakai `code`.
      // Diseragamkan di sini supaya sisa layar tidak perlu tahu asal barisnya.
      storedByElement.value[el.id] = (el.stored_lines || []).map((l: any) => ({
        code: l.line_code,
        label: l.label,
        net_quantity: Number(l.net_quantity || 0),
        waste_percent: Number(l.waste_percent || 0),
        gross_quantity: Number(l.gross_quantity || 0),
        unit: l.unit,
      }));
      driftByElement.value[el.id] = !!el.formula_drift;
      missingByElement.value[el.id] = el.missing_required || [];
    }
  } catch(e) { console.error('MTO fetch:', e); }
  finally {
    loading.value = false;
    nextTick(() => addDefaultZone());
  }
}

// Grand summary: aggregate all saved zones
const fmt = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:1});
// EST-MTO-001: rekap tidak lagi menghitung sendiri.
//
// Sebelumnya ada TIGA perhitungan terpisah di file ini (grandSummary,
// detailedMTO, mtoGrandTotal) dengan konstanta jempol berbeda-beda untuk besi —
// 95, 160, 117, dan 85 kg/m3 tergantung elemen. Angka itulah yang tampil sebagai
// total penawaran, dan tidak satu pun cocok dengan perhitungan tulangan
// sebenarnya. Sekarang semuanya berasal dari kalkulator backend.
const backendLines = ref<Record<string, any[]>>({});
const zoneKey = (modId: string, idx: number) => `${modId}#${idx}`;

// EST-MTO-R37: baris yang TERSIMPAN saat proposal dikirim, per zona.
//
// Sebelumnya layar ini hanya menampilkan hasil hitung ulang formula sekarang.
// Untuk proposal yang sudah dikirim itu keliru secara komersial: yang disepakati
// pelanggan adalah angka saat itu, dan formula bisa berubah setelahnya. Kalau
// formulanya membaik, angka di layar diam-diam bergeser dari isi penawaran.
//
// Dikunci ke `element_id`, BUKAN ke indeks zona. Indeks bergeser begitu ada zona
// ditambah atau dihapus, dan baris kontrak akan menempel ke zona yang salah —
// diam-diam, karena angkanya tetap terlihat wajar.
const storedByElement = ref<Record<number, any[]>>({});
const driftByElement = ref<Record<number, boolean>>({});
const missingByElement = ref<Record<number, string[]>>({});

const zoneAt = (modId: string, idx: number): any => (zones.value[modId] || [])[idx] || null;

/**
 * Baris yang dipakai sebagai angka UTAMA untuk sebuah zona.
 *
 * Mode kontrak memakai baris tersimpan. Kalau elemen itu memang belum punya
 * baris tersimpan (dibuat sebelum fitur ini ada dan belum di-backfill), jatuh ke
 * hasil hitung sekarang — lebih baik menampilkan angka disertai penanda daripada
 * mengosongkan layar.
 */
function linesFor(modId: string, idx: number): any[] {
  const zone = zoneAt(modId, idx);
  if (props.contractMode && zone?.element_id) {
    const stored = storedByElement.value[zone.element_id];
    if (stored?.length) return stored;
  }
  return backendLines.value[zoneKey(modId, idx)] || [];
}

/** Jalankan `fn` untuk tiap zona yang ada, apa pun modulnya. */
function forEachZone(fn: (modId: string, idx: number, zone: any) => void) {
  for (const mod of MODULES) {
    (zones.value[mod.id] || []).forEach((z: any, i: number) => fn(mod.id, i, z));
  }
}

const activeZoneMissing = computed(() => {
  const zone = zoneAt(activeTab.value, activeZoneIdx.value);
  return (zone?.element_id && missingByElement.value[zone.element_id]) || [];
});

const anyDrift = computed(() => {
  if (!props.contractMode) return false;
  let found = false;
  forEachZone((_m, _i, z) => { if (z?.element_id && driftByElement.value[z.element_id]) found = true; });
  return found;
});

const anyMissing = computed(() => {
  let found = false;
  forEachZone((_m, _i, z) => { if ((missingByElement.value[z?.element_id] || []).length) found = true; });
  return found;
});

/** Perbandingan kontrak vs formula sekarang — hanya baris yang benar-benar berbeda. */
const contractComparison = computed(() => {
  if (!props.contractMode) return [];
  const rows: any[] = [];
  forEachZone((modId, idx, zone) => {
    if (!zone?.element_id || !driftByElement.value[zone.element_id]) return;
    const stored = storedByElement.value[zone.element_id] || [];
    const current = backendLines.value[zoneKey(modId, idx)] || [];
    for (const sl of stored) {
      const cur = current.find((x: any) => x.code === sl.code);
      const now = cur ? Number(cur.gross_quantity || 0) : 0;
      const was = Number(sl.gross_quantity || 0);
      if (Math.abs(now - was) < 0.0001) continue;
      rows.push({ zone: zone.name, label: sl.label, unit: sl.unit, contract: was, current: now, diff: now - was });
    }
  });
  return rows;
});

async function refreshBackendLines() {
  const items: any[] = [];
  for (const mod of MODULES) {
    (zones.value[mod.id] || []).forEach((z: any, idx: number) => {
      items.push({ key: zoneKey(mod.id, idx), element_type: mod.id, parameters: z.params || {} });
    });
  }
  if (!items.length) { backendLines.value = {}; return; }
  try {
    const res = await api.post('/estimator/mto/preview-batch', { items });
    const map: Record<string, any[]> = {};
    for (const r of res.data?.results || []) if (r.key) map[r.key] = r.lines || [];
    backendLines.value = map;
  } catch { /* biarkan rekap kosong daripada menampilkan angka karangan */ }
}

let recapTimer: any = null;
watch(zones, () => {
  if (recapTimer) clearTimeout(recapTimer);
  recapTimer = setTimeout(refreshBackendLines, 300);
}, { deep: true, immediate: true });

/** Jumlahkan gross_quantity dari seluruh zona untuk kode yang cocok. */
function sumBy(match: (code: string) => boolean): number {
  let total = 0;
  forEachZone((modId, idx) => {
    for (const l of linesFor(modId, idx)) if (match(l.code)) total += Number(l.gross_quantity || 0);
  });
  return total;
}

const grandSummary = computed(() => [
  { icon: '🏗', l: 'Total Beton', v: fmt(sumBy(c => c.endsWith('-CONC'))), u: 'm³' },
  { icon: '🔩', l: 'Total Besi', v: fmt(sumBy(c => c.includes('REBAR') || c.includes('STIRRUP'))), u: 'kg' },
  { icon: '⛏', l: 'Total Galian', v: fmt(sumBy(c => c.includes('EXCV'))), u: 'm³' },
  { icon: '🏠', l: 'Luas Atap', v: fmt(sumBy(c => c === 'RF-AREA')), u: 'm²' },
  { icon: '🪟', l: 'Luas Dinding', v: fmt(sumBy(c => c === 'WAL-AREA')), u: 'm²' },
  { icon: '🧱', l: 'Luas Lantai', v: fmt(sumBy(c => c === 'SLB-CONC' || c === 'SLB-TILE')), u: 'm²' },
]);

const detailedMTO = computed(() =>
  MODULES.map(mod => {
    const zoneList = zones.value[mod.id] || [];
    const zonesData = zoneList.map((z: any, idx: number) => ({
      name: z.name || mod.label,
      rows: linesFor(mod.id, idx).map((l: any) => ({
        label: l.label, qty: f2(Number(l.gross_quantity || 0)), unit: l.unit,
      })),
    }));
    const subMap = new Map<string, { qty: number; unit: string }>();
    for (const z of zonesData) {
      for (const r of z.rows) {
        const n = parseFloat(String(r.qty).replace(/\./g, '').replace(',', '.')) || 0;
        const ex = subMap.get(r.label);
        if (ex) ex.qty += n; else subMap.set(r.label, { qty: n, unit: r.unit });
      }
    }
    const subtotal = Array.from(subMap.entries()).map(([label, v]) => ({ label, qty: f2(v.qty), unit: v.unit }));
    return { id: mod.id, icon: mod.icon, label: mod.label, zones: zonesData, subtotal, open: true };
  }).filter(s => s.zones.length > 0)
);

const mtoGrandTotal = computed(() => [
  { icon: '🏗', label: 'Total Beton K-250', qty: f2(sumBy(c => c.endsWith('-CONC'))), unit: 'm³', note: 'Pondasi + Kolom + Balok + Plat' },
  { icon: '🔩', label: 'Total Besi Tulangan', qty: f0(sumBy(c => c.includes('REBAR') || c.includes('STIRRUP'))), unit: 'kg', note: 'Dihitung dari geometri tulangan, bukan rasio per m³' },
  { icon: '🪵', label: 'Total Bekisting', qty: f2(sumBy(c => c.includes('FORM'))), unit: 'm²', note: 'Pondasi + Kolom + Balok + Plat' },
  { icon: '⛏', label: 'Galian Tanah', qty: f2(sumBy(c => c.includes('EXCV'))), unit: 'm³', note: 'Termasuk ruang kerja' },
  { icon: '🧱', label: 'Luas Lantai', qty: f0(sumBy(c => c === 'SLB-CONC' || c === 'SLB-TILE')), unit: 'm²', note: 'Total area plat lantai' },
  { icon: '🏠', label: 'Luas Atap', qty: f0(sumBy(c => c === 'RF-AREA')), unit: 'm²', note: 'Sudah termasuk kemiringan' },
  { icon: '🪟', label: 'Luas Dinding Netto', qty: f0(sumBy(c => c === 'WAL-AREA')), unit: 'm²', note: 'Setelah dikurangi bukaan' },
]);


onMounted(fetchAll);

// ── Detailed MTO computed for Rekap tab ──────────────────────────────────────
const f2 = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:2});
const f0 = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:0});

// Rumus per elemen yang dulu ada di sini SUDAH DIHAPUS (EST-MTO-001).
//
// Isinya pendekatan kasar seperti `besi = volume × 160 kg/m³` dan faktor waste
// `× 1.05` yang tertanam di dalam angka, berbeda dari kalkulator backend maupun
// dari komponen input. Membiarkannya sebagai kode mati hanya menunggu seseorang
// memakainya lagi. Rekap kini membaca `backendLines`.






</script>

<style scoped>
.mto-wrap{display:flex;flex-direction:column;gap:14px;}

/* EST-MTO-R37 / R35 — penanda kuantitas kontrak & kelengkapan dimensi */
.mto-contract-bar,.mto-warn-bar{display:flex;gap:12px;align-items:flex-start;padding:11px 14px;border-radius:12px;border:1px solid #bfdbfe;background:#eff6ff;}
.mto-warn-amber{border-color:#fcd34d;background:#fffbeb;}
.mcb-icon{font-size:1.1rem;line-height:1.3;}
.mcb-title{font-size:.85rem;font-weight:700;color:#1e3a8a;}
.mto-warn-amber .mcb-title{color:#92400e;}
.mcb-sub{font-size:.76rem;color:#475569;margin-top:2px;line-height:1.45;}
.zone-missing{border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:10px 12px;font-size:.78rem;color:#92400e;}
.zone-missing ul{margin:5px 0 0 18px;list-style:disc;}
.zm-note{display:block;margin-top:6px;color:#78350f;font-size:.72rem;}
.drift-panel{border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;padding:13px 15px;margin-bottom:14px;}
.dp-head{font-size:.85rem;font-weight:700;color:#92400e;}
.dp-sub{font-size:.76rem;color:#78350f;margin:3px 0 10px;line-height:1.45;}
.dp-table{width:100%;border-collapse:collapse;font-size:.78rem;}
.dp-table th{text-align:left;padding:6px 8px;border-bottom:1px solid #fcd34d;color:#92400e;font-weight:600;}
.dp-table td{padding:6px 8px;border-bottom:1px solid #fef3c7;color:#0f172a;}
.dp-num{text-align:right;font-variant-numeric:tabular-nums;}
.dp-up{color:#b45309;font-weight:600;}
.dp-down{color:#0369a1;font-weight:600;}

/* Module tabs */
.mto-tabs{display:flex;flex-wrap:wrap;gap:4px;background:#f1f5f9;padding:8px;border-radius:14px;}
.mto-tab{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;border:none;background:transparent;cursor:pointer;font-size:.82rem;font-weight:600;color:#64748b;transition:all .2s;position:relative;}
.mto-tab:hover{background:white;color:#0f172a;}
.mto-tab.active{background:white;color:var(--clr);box-shadow:0 2px 8px rgba(0,0,0,.08);}
.tab-label{margin-left:2px;}
.tab-badge{position:absolute;top:-4px;right:-4px;background:#1d4ed8;color:white;font-size:.55rem;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;}

/* Content */
.mto-content{background:white;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;}
.mto-loading{padding:60px;text-align:center;color:#94a3b8;}

/* Header */
.mod-header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
.mod-title{display:flex;align-items:center;gap:10px;}
.mod-name{font-size:.92rem;font-weight:800;color:#0f172a;}
.mod-sub{font-size:.68rem;color:#64748b;margin-top:1px;}
.add-zone-btn{padding:7px 16px;background:#1d4ed8;color:white;border:none;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;transition:background .2s;}
.add-zone-btn:hover{background:#1e40af;}

/* Zone pills */
.zone-bar{display:flex;gap:6px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid #e2e8f0;background:#fafafa;}
.zone-pill{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;border:2px solid #e2e8f0;background:white;cursor:pointer;font-size:.78rem;font-weight:600;color:#475569;transition:all .2s;}
.zone-pill:hover{border-color:#3b82f6;}
.zone-pill.active{border-color:#1d4ed8;background:#eff6ff;color:#1d4ed8;}
.zone-del{font-size:.9rem;color:#94a3b8;line-height:1;cursor:pointer;margin-left:2px;}
.zone-del:hover{color:#ef4444;}
.zone-empty{padding:32px;text-align:center;color:#94a3b8;font-size:.84rem;border-bottom:1px solid #e2e8f0;}

/* Zone name row */
.zone-name-row{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #f1f5f9;}
.zone-name-input{flex:0 0 220px;border:1px solid #d1d5db;border-radius:8px;padding:5px 10px;font-size:.82rem;font-weight:600;color:#0f172a;}
.zone-hint{font-size:.7rem;color:#94a3b8;}

/* Body */
.mod-body{padding:18px;}

/* Dirty / saved bar */
.dirty-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#fef3c7;border-top:1px solid #fcd34d;font-size:.78rem;color:#92400e;font-weight:500;}
.save-btn-sm{padding:5px 14px;background:#d97706;color:white;border:none;border-radius:6px;font-size:.75rem;font-weight:700;cursor:pointer;}
.saved-bar{padding:8px 18px;background:#f0fdf4;border-top:1px solid #d1fae5;font-size:.74rem;color:#065f46;font-weight:600;}

/* Grand Summary */
.grand-summary{background:#0f172a;border-radius:16px;padding:18px;}
.gs-title{font-size:.8rem;font-weight:700;color:#38bdf8;margin-bottom:12px;}
.gs-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;}
@media(max-width:900px){.gs-grid{grid-template-columns:repeat(3,1fr);}}
.gs-card{background:rgba(255,255,255,.06);border-radius:10px;padding:12px;text-align:center;}
.gs-icon{font-size:1.2rem;}.gs-val{font-size:1.1rem;font-weight:800;color:#38bdf8;margin:4px 0;}.gs-u{font-size:.6rem;color:#64748b;}.gs-l{font-size:.64rem;color:#94a3b8;margin-top:2px;}

/* ── Rekap MTO ── */
.rekap-wrap{display:flex;flex-direction:column;gap:0;}
.rekap-kpi{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;}
@media(max-width:900px){.rekap-kpi{grid-template-columns:repeat(3,1fr);}}
.rk-card{background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.05);}
.rk-icon{font-size:1.2rem;}.rk-val{font-size:1rem;font-weight:800;color:#1d4ed8;margin:3px 0;}.rk-u{font-size:.58rem;color:#64748b;}.rk-l{font-size:.62rem;color:#94a3b8;margin-top:2px;}
.rekap-empty{padding:40px;text-align:center;color:#94a3b8;font-size:.84rem;}
.rekap-section{border-bottom:1px solid #f1f5f9;}
.rs-head{display:flex;align-items:center;gap:10px;padding:12px 18px;cursor:pointer;background:#fafafa;user-select:none;transition:background .15s;}
.rs-head:hover{background:#f1f5f9;}
.rs-badge{background:#e0e7ff;color:#3730a3;border-radius:20px;padding:2px 8px;font-size:.65rem;font-weight:700;}
.rs-toggle{color:#94a3b8;font-size:.8rem;margin-left:4px;}
.rs-zone{padding:12px 18px;border-top:1px solid #f8fafc;}
.rs-zone-name{font-size:.75rem;font-weight:700;color:#475569;margin-bottom:6px;}
.rs-tbl{width:100%;border-collapse:collapse;font-size:.78rem;}
.rs-tbl th{background:#f1f5f9;padding:6px 10px;text-align:left;font-size:.68rem;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;}
.rs-tbl td{padding:5px 10px;border-bottom:1px solid #f8fafc;color:#374151;}
.rs-odd td{background:#f8fafc;}
.rs-num{font-weight:700;color:#1d4ed8!important;font-family:monospace;}
.rs-unit{color:#94a3b8!important;font-size:.7rem;}
.rs-subtotal{margin:0;background:#eff6ff;}
.rs-subtotal th{background:#dbeafe;color:#1e40af;}
.rekap-total{padding:16px 18px;background:#0f172a;}
.rt-title{font-size:.8rem;font-weight:700;color:#38bdf8;margin-bottom:10px;}
.rekap-total .rs-tbl th{background:#1e293b;color:#94a3b8;border-bottom:1px solid #334155;}
.rekap-total .rs-tbl td{border-bottom:1px solid #1e293b;color:#e2e8f0;}
.rekap-total .rs-odd td{background:#1e293b;}
.tc{text-align:center;}
.small{font-size:.72rem;}
</style>
