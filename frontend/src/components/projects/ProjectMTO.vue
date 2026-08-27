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
            <div style="display:flex;gap:8px;align-items:center">
              <!-- Tahap 1: usulan MTO dari gambar kerja. AI mengeluarkan
                   PARAMETER (dimensi), bukan kuantitas — kuantitasnya tetap
                   dihitung kalkulator yang sama dengan input manual. Tidak ada
                   yang tersimpan sebelum disetujui per zona. -->
              <!-- EST-MTO-R53: tidak lagi terkunci di tab Pondasi. Satu gambar
                   kerja memuat banyak tipe elemen sekaligus, dan asisten kini
                   mengusulkan keenamnya — usulannya masuk ke tab masing-masing
                   saat disetujui. -->
              <button v-if="!readonly" @click="pilihGambar"
                class="usul-btn" title="Baca gambar kerja pondasi dan usulkan dimensinya">
                🖼 Usulkan dari gambar
              </button>
              <input ref="inputGambar" type="file" accept="image/png,image/jpeg,image/webp"
                style="display:none" @change="unggahGambar" />
              <button v-if="!readonly" @click="addZone" class="add-zone-btn">＋ Tambah Zona</button>
            </div>
          </div>

          <!-- ══ Usulan dari gambar ══════════════════════════════════════ -->
          <div v-if="membacaGambar" class="usul-panel">
            <span>⏳ Membaca gambar… ini bisa beberapa detik.</span>
          </div>

          <div v-if="galatUsul" class="usul-panel" style="border-color:#fca5a5;background:#fef2f2;color:#991b1b">
            ❌ {{ galatUsul }}
          </div>

          <div v-if="usulan.length" class="usul-panel">
            <div class="usul-head">
              <div>
                <strong>{{ usulan.length }} usulan dari gambar</strong>
                <span v-if="sebaranTipe" class="usul-sub" style="display:inline"> — {{ sebaranTipe }}</span>
                <div class="usul-sub">
                  Belum tersimpan. <strong>Periksa dimensinya terhadap gambar</strong> — pembacaan
                  otomatis bisa keliru, terutama satuan (mm vs m). Setujui satu per satu.
                </div>
                <div v-if="catatanUsul" class="usul-sub" style="margin-top:4px">📝 {{ catatanUsul }}</div>
              </div>
              <button @click="tolakSemuaUsul" class="usul-tolak-semua">Tolak semua</button>
            </div>

            <div v-for="(u, i) in usulan" :key="i" class="usul-item">
              <div class="usul-item-head">
                <span class="usul-tipe">{{ labelModul(u.element_type) }}</span>
                <strong>{{ u.element_name }}</strong>
                <span class="usul-yakin" :class="'yakin-' + u.keyakinan">keyakinan {{ u.keyakinan }}</span>
                <span v-if="u.tipe_dikenal === false" class="usul-yakin yakin-rendah">
                  tipe belum didukung
                </span>
              </div>

              <!-- EST-MTO-R50: dimensinya BISA DISUNTING.
                   Sebelumnya usulan hanya bisa dilihat, jadi yang dimensinya
                   tidak terbaca dari gambar menjadi buntu total: penggunanya
                   melihat apa yang kurang, tapi tidak punya tempat mengisinya —
                   dan "Terima" pun ditolak karena belum lengkap. -->
              <div class="usul-form">
                <label v-for="f in fieldTampil(u)" :key="f.field" class="usul-field"
                  :class="{ 'field-kurang': kurang(u, f.field) }">
                  <span class="usul-field-label">
                    {{ f.label }}
                    <em v-if="f.wajib" class="usul-wajib">wajib</em>
                  </span>
                  <input
                    :type="f.jenis === 'angka' ? 'number' : 'text'"
                    step="any"
                    :value="u.parameters[f.field] ?? ''"
                    :placeholder="f.jenis === 'angka' ? '—' : 'mis. WF 200x100'"
                    @input="ubahParameter(i, f.field, ($event.target as HTMLInputElement).value)" />
                  <span class="usul-field-kode">{{ f.field }}</span>
                </label>
              </div>

              <div v-if="u.dasar" class="usul-sub">📖 {{ u.dasar }}</div>
              <div v-if="u.ragu?.length" class="usul-sub" style="color:#b45309">
                ⚠️ Ragu: {{ u.ragu.join('; ') }}
              </div>
              <div v-if="u.missing_required?.length" class="usul-sub" style="color:#b45309">
                ⚠️ Belum lengkap: {{ u.missing_required.join('; ') }}
              </div>
              <div v-if="menghitungUlang === i" class="usul-sub">⏳ Menghitung ulang…</div>

              <details class="usul-pratinjau">
                <summary>Pratinjau kuantitas ({{ u.pratinjau?.length || 0 }} baris)</summary>
                <ul>
                  <li v-for="l in u.pratinjau" :key="l.code">
                    {{ l.label }} — <strong>{{ l.gross_quantity }}</strong> {{ l.unit }}
                  </li>
                </ul>
              </details>

              <div class="usul-aksi">
                <!-- Tombolnya dinonaktifkan DENGAN alasan yang terbaca, bukan
                     dibiarkan aktif lalu gagal di server. -->
                <button @click="terimaUsul(i)"
                  :disabled="menyimpanUsul || (u.missing_required?.length || 0) > 0"
                  :title="(u.missing_required?.length || 0) > 0
                    ? 'Lengkapi dulu: ' + u.missing_required.join('; ')
                    : 'Simpan sebagai zona MTO'"
                  class="usul-terima">
                  ✓ Terima jadi zona
                </button>
                <button @click="tolakUsul(i)" class="usul-tolak">✗ Tolak</button>
                <span v-if="(u.missing_required?.length || 0) > 0" class="usul-sub"
                  style="color:#b45309;align-self:center">
                  Isi {{ u.missing_required.length }} dimensi di atas untuk mengaktifkan
                </span>
              </div>
            </div>

            <!-- Diskusi dua arah -->
            <div class="usul-diskusi">
              <div v-if="riwayat.length" class="usul-riwayat">
                <div v-for="(r, i) in riwayat" :key="i" class="usul-bubble" :class="'bubble-' + r.peran">
                  <strong>{{ r.peran === 'pengguna' ? 'Anda' : 'Asisten' }}:</strong> {{ r.teks }}
                </div>
              </div>
              <div class="usul-kirim">
                <input v-model="pesanDiskusi" :disabled="berdiskusi"
                  @keyup.enter="kirimDiskusi"
                  placeholder="Mis. kedalaman galian P1 1,5 m — atau tanya kalau ada yang janggal" />
                <button @click="kirimDiskusi" :disabled="berdiskusi || !pesanDiskusi.trim()"
                  class="usul-terima">
                  {{ berdiskusi ? 'Memproses…' : 'Kirim' }}
                </button>
              </div>
              <div class="usul-sub" style="margin-top:6px">
                Asisten hanya merevisi <strong>dimensi</strong>. Kuantitasnya tetap dihitung
                kalkulator yang sama dengan input manual — itu sebabnya angkanya bisa ditelusuri.
                Perlu baca ulang gambarnya? Unggah lagi lewat tombol di atas.
              </div>
            </div>
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
              <!-- Keadaan zona INI, bukan keadaan seluruh tab. Setelah simpan
                   sebagian, tab bisa berisi zona tersimpan dan zona gagal
                   sekaligus — satu label global tidak bisa mewakili keduanya. -->
              <span v-if="!readonly && zonaGagal.has(activeZone.zid)" class="zone-status zs-gagal">
                ❌ gagal disimpan
              </span>
              <span v-else-if="!readonly && !activeZone.element_id" class="zone-status zs-baru">
                ● belum disimpan
              </span>
              <span v-else-if="!readonly && isDirty" class="zone-status zs-ubah">
                ● ada perubahan
              </span>
              <span v-else-if="!readonly" class="zone-status zs-simpan">✓ tersimpan</span>
              <!-- Tombol hapus yang bisa dilihat. Sebelumnya satu-satunya jalan
                   menghapus zona adalah "×" kecil di dalam pill, yang praktis
                   tidak ketemu kalau tidak sengaja dicari. -->
              <button v-if="!readonly" @click="removeZone(activeZoneIdx)" class="zone-hapus-btn"
                title="Hapus zona ini beserta kuantitas MTO-nya">
                🗑 Hapus zona
              </button>
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
              <strong style="color:#991b1b">
                ❌ <span v-if="saveError.modul && saveError.modul !== activeTab">[{{ labelModul(saveError.modul) }}]</span>
                {{ saveError.message }}
              </strong>
              <ul v-if="saveError.problems.length">
                <li v-for="m in saveError.problems" :key="m">{{ m }}</li>
              </ul>
              <span class="zm-note">
                Lengkapi dimensi di atas lalu Simpan lagi. Selama belum lengkap,
                MTO ini <strong>tidak tersimpan</strong>.
              </span>
            </div>

            <!-- EST-MTO-R45: status persistensi TIDAK diturunkan dari satu
                 boolean. `isDirty` hanya tahu "ada yang diubah sejak terakhir
                 disimpan"; ia tidak tahu apa-apa tentang zona yang belum pernah
                 di-POST sama sekali. `addDefaultZone()` sengaja tidak menandai
                 dirty — supaya tab yang dibuka tidak otomatis mengirim zona
                 kosong — sehingga bar lama langsung hijau "✓ 1 zona tersimpan"
                 untuk zona yang cuma ada di memori. Sekarang hijau hanya kalau
                 tidak ada perubahan tertunda DAN setiap zona benar-benar punya
                 `element_id` dari server. -->
            <div class="dirty-bar" :style="semuaTersimpan ? 'background:#f0fdf4;border-color:#d1fae5' : 'background:#fef3c7;border-color:#fcd34d'">
              <span v-if="semuaTersimpan" style="color:#065f46">
                ✓ {{ zones[activeTab]?.length || 0 }} zona {{ activeModule?.label }} tersimpan
              </span>
              <span v-else-if="zonaBelumTersimpan > 0" style="color:#92400e">
                ⚠️ {{ zonaBelumTersimpan }} zona belum pernah disimpan
              </span>
              <span v-else style="color:#92400e">⚠️ Ada perubahan belum disimpan</span>
              <button @click="saveModule" :disabled="saving" class="save-btn-sm"
                :style="semuaTersimpan ? 'background:#059669' : 'background:#d97706'">
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

// ── Usulan MTO dari gambar kerja (Tahap 1: pondasi) ────────────────────────
//
// Yang datang dari server adalah PARAMETER (dimensi) plus pratinjau kuantitas
// yang dihitung kalkulator yang sama dengan input manual. Tidak ada yang
// tersimpan sampai pengguna menekan Terima per zona — dan penyimpanannya lewat
// endpoint MTO biasa, dengan seluruh validasi yang sudah ada.
const inputGambar = ref<HTMLInputElement | null>(null);
const membacaGambar = ref(false);
const menyimpanUsul = ref(false);
const usulan = ref<any[]>([]);
const catatanUsul = ref('');
const galatUsul = ref('');

const pilihGambar = () => {
  galatUsul.value = '';
  inputGambar.value?.click();
};

const unggahGambar = async (e: Event) => {
  const berkas = (e.target as HTMLInputElement).files?.[0];
  if (!berkas) return;

  membacaGambar.value = true;
  galatUsul.value = '';
  usulan.value = [];
  try {
    const form = new FormData();
    form.append('gambar', berkas);
    const { data } = await api.post(`${baseUrl.value}/mto/usul-dari-gambar`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    usulan.value = data?.usulan || [];
    catatanUsul.value = data?.catatan_umum || '';
    if (!usulan.value.length) {
      galatUsul.value = catatanUsul.value || 'Tidak ada pondasi yang terbaca dari gambar ini.';
    }
  } catch (err: any) {
    const d = err?.response?.data;
    galatUsul.value = (d?.error || 'Gagal membaca gambar.')
      + (d?.code === 'AI_KUOTA_HABIS'
        ? ' Zona MTO tetap bisa diisi manual seperti biasa.' : '');
  } finally {
    membacaGambar.value = false;
    // Supaya berkas yang sama bisa dipilih lagi setelah diperbaiki.
    if (inputGambar.value) inputGambar.value.value = '';
  }
};

/** Sebaran tipe elemen pada usulan — supaya sekilas terlihat apa saja yang terbaca. */
const sebaranTipe = computed(() => {
  const n: Record<string, number> = {};
  for (const u of usulan.value) n[u.element_type] = (n[u.element_type] || 0) + 1;
  return Object.entries(n).map(([t, c]) => `${c} ${labelModul(t)}`).join(', ');
});

/**
 * Terima satu usulan → tersimpan lewat endpoint MTO biasa.
 *
 * EST-MTO-R53: usulan bisa bertipe apa pun, jadi setelah tersimpan layar
 * berpindah ke tab tipe itu. Tanpa itu, menyetujui zona Kolom dari tab Pondasi
 * membuat zonanya seolah menghilang — ia tersimpan, tapi di tab yang tidak
 * sedang dibuka.
 */
const terimaUsul = async (i: number) => {
  const u = usulan.value[i];
  if (!u) return;
  menyimpanUsul.value = true;
  galatUsul.value = '';
  try {
    await api.post(`${baseUrl.value}/mto`, {
      element_type: u.element_type,
      element_name: u.element_name,
      parameters: { ...u.parameters, _zone_name: u.element_name },
    });
    if (u.element_type && u.element_type !== activeTab.value
        && MODULES.some(m => m.id === u.element_type)) {
      activeTab.value = u.element_type;
    }
    usulan.value.splice(i, 1);
    await fetchAll();
  } catch (err: any) {
    const d = err?.response?.data;
    galatUsul.value = Array.isArray(d?.problems)
      ? `${u.element_name}: ${d.problems.join('; ')}`
      : (d?.error || 'Gagal menyimpan usulan.');
  } finally {
    menyimpanUsul.value = false;
  }
};

/**
 * EST-MTO-R50 — Tahap 2: interaksi dua arah.
 *
 * Tahap 1 sengaja satu arah, dan akibatnya nyata: usulan yang sebagian
 * dimensinya tidak terbaca dari gambar menjadi buntu total. Penggunanya melihat
 * apa yang kurang, tapi tidak punya tempat mengisinya — dan "Terima" pun
 * ditolak server karena dimensinya belum lengkap.
 *
 * Dua jalan keluar sekaligus:
 *   1. dimensinya bisa disunting langsung di kartu usulan, dan
 *   2. bisa didiskusikan dengan asisten ("kedalaman P1 1,5 m").
 *
 * Yang TIDAK berubah: pratinjau kuantitas selalu datang dari `calculateMto()`
 * di server. Menghitungnya di browser akan membuat angka di layar dan angka
 * yang tersimpan berasal dari dua sumber berbeda.
 */
const menghitungUlang = ref<number | null>(null);
const pesanDiskusi = ref('');
const berdiskusi = ref(false);
const riwayat = ref<Array<{ peran: 'pengguna' | 'asisten'; teks: string }>>([]);

/** Field wajib dulu, lalu opsional — yang kurang selalu terlihat lebih dulu. */
const fieldTampil = (u: any) => {
  const wajib = u.field_wajib || [];
  const opsional = u.field_opsional || [];
  const sudah = new Set(wajib.map((f: any) => f.field));
  return [...wajib, ...opsional.filter((f: any) => !sudah.has(f.field))];
};

/** Apakah field ini termasuk yang dilaporkan server belum lengkap? */
const kurang = (u: any, field: string) =>
  (u.missing_required || []).some((m: string) => m.includes(`(${field})`));

let timerHitung: ReturnType<typeof setTimeout> | null = null;

const ubahParameter = (i: number, field: string, nilai: string) => {
  const u = usulan.value[i];
  if (!u) return;
  const teks = String(nilai).trim();
  if (teks === '') delete u.parameters[field];
  else {
    const angka = Number(teks.replace(',', '.'));
    // Field profil baja bernilai teks; sisanya angka. Nilai yang bukan angka
    // pada field angka disimpan apa adanya supaya server yang menolaknya —
    // bukan dibuang diam-diam sehingga pengguna mengira sudah terisi.
    u.parameters[field] = Number.isFinite(angka) && teks !== '' ? angka : teks;
  }
  // Debounce: mengetik "1250" tidak perlu empat kali hitung ulang.
  if (timerHitung) clearTimeout(timerHitung);
  timerHitung = setTimeout(() => hitungUlang(i), 400);
};

/** Pratinjau dihitung ULANG DI SERVER, dengan kalkulator yang sama. */
const hitungUlang = async (i: number) => {
  const u = usulan.value[i];
  if (!u) return;
  menghitungUlang.value = i;
  try {
    const { data } = await api.post(`${baseUrl.value}/mto/pratinjau`, {
      element_type: u.element_type,
      parameters: u.parameters,
    });
    u.pratinjau = data?.pratinjau || [];
    u.variant = data?.variant;
    u.missing_required = data?.missing_required || [];
    if (data?.field_wajib) u.field_wajib = data.field_wajib;
    if (data?.field_opsional) u.field_opsional = data.field_opsional;
  } catch (e: any) {
    // Parameter yang ditolak kalkulator (mis. negatif) dilaporkan apa adanya —
    // pratinjau lama TIDAK dipertahankan seolah masih berlaku.
    u.pratinjau = [];
    u.missing_required = [e?.response?.data?.error || 'Parameter tidak valid.'];
  } finally {
    menghitungUlang.value = null;
  }
};

const kirimDiskusi = async () => {
  const pesan = pesanDiskusi.value.trim();
  if (!pesan || berdiskusi.value) return;
  berdiskusi.value = true;
  riwayat.value.push({ peran: 'pengguna', teks: pesan });
  pesanDiskusi.value = '';
  galatUsul.value = '';
  try {
    const { data } = await api.post(`${baseUrl.value}/mto/diskusi`, {
      pesan,
      // Keadaan dikirim tiap giliran: endpointnya stateless dan tidak menyimpan
      // apa pun, jadi tidak ada tabel percakapan yang perlu dibersihkan.
      zona: usulan.value.map((u: any) => ({
        element_name: u.element_name,
        foundation_type: u.parameters?.foundation_type,
        parameters: u.parameters,
        dasar: u.dasar,
        ragu: u.ragu,
      })),
      riwayat: riwayat.value,
    });
    if (Array.isArray(data?.usulan) && data.usulan.length) usulan.value = data.usulan;
    riwayat.value.push({
      peran: 'asisten',
      teks: data?.balasan || 'Usulan diperbarui.',
    });
    if (data?.catatan_umum) catatanUsul.value = data.catatan_umum;
  } catch (e: any) {
    const d = e?.response?.data;
    let pesanGagal = d?.error || 'Gagal memproses diskusi.';
    // Kuota AI habis bukan jalan buntu: dimensinya tetap bisa diisi langsung di
    // kartu, dan pratinjaunya dihitung server tanpa menyentuh AI sama sekali.
    // Tanpa kalimat ini, pengguna menyimpulkan seluruh fiturnya mati.
    if (d?.code === 'AI_KUOTA_HABIS') {
      pesanGagal += ' Sementara itu, dimensinya tetap bisa Anda isi langsung di kartu '
        + 'usulan di atas — kuantitasnya tetap dihitung server.';
    }
    riwayat.value.push({ peran: 'asisten', teks: `⚠️ ${pesanGagal}` });
  } finally {
    berdiskusi.value = false;
  }
};

const tolakUsul = (i: number) => { usulan.value.splice(i, 1); };
const tolakSemuaUsul = () => { usulan.value = []; catatanUsul.value = ''; riwayat.value = []; };

function addZone() {
  const mod = activeTab.value;
  const name = `${activeModule.value.label} ${(zones.value[mod]?.length || 0) + 1}`;
  zones.value[mod].push({ zid: uid(), name, params: DEFAULTS[mod]() });
  activeZoneIdx.value = zones.value[mod].length - 1;
  markDirty();
}

/**
 * Hapus satu zona — dan JANGAN hilangkan dari layar kalau servernya menolak.
 *
 * Versi sebelumnya menelan kegagalan DELETE (`catch { console.error }`) lalu
 * tetap membuang barisnya dari layar. Zonanya lenyap di depan mata, masih ada
 * di database, dan muncul kembali saat halaman dimuat ulang — pengguna mengira
 * sudah terhapus padahal tidak.
 */
async function removeZone(i: number) {
  const mod = activeTab.value;
  const zone = zones.value[mod][i];
  const nama = zone?.name || `${activeModule.value?.label || mod} ${i + 1}`;

  if (!confirm(`Hapus zona "${nama}" beserta kuantitas MTO-nya?\n\nTindakan ini tidak bisa dibatalkan.`)) return;

  if (zone.element_id) {
    try {
      await api.delete(`${baseUrl.value}/mto/${zone.element_id}`);
    } catch (e: any) {
      // Gagal di server = tidak terhapus. Barisnya dipertahankan supaya layar
      // tidak berbohong tentang keadaan data.
      saveError.value = uraikanGagal(e);
      return;
    }
  }

  zones.value[mod].splice(i, 1);
  if (activeZoneIdx.value >= zones.value[mod].length)
    activeZoneIdx.value = Math.max(0, zones.value[mod].length - 1);
  saveError.value = null;
  // Tidak perlu markDirty — penghapusannya sudah tersimpan.
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
const saveError = ref<{ message: string; problems: string[]; modul?: string } | null>(null);

/**
 * EST-MTO-R45: keadaan persistensi per zona, bukan satu boolean untuk seluruh tab.
 *
 * `isDirty` hanya menjawab "ada yang diubah sejak terakhir disimpan". Ia tidak
 * tahu apa-apa tentang zona yang **belum pernah dikirim sama sekali** — dan
 * `addDefaultZone()` memang sengaja tidak menandai dirty, supaya membuka tab
 * kosong tidak otomatis mem-POST zona yang tidak diminta siapa pun. Akibatnya
 * bar lama langsung hijau "✓ 1 zona tersimpan" untuk zona yang cuma ada di
 * memori, dan estimator bisa meninggalkan tab dengan yakin datanya aman.
 *
 * Sumber kebenarannya sekarang `element_id`: zona hanya tersimpan kalau server
 * pernah memberinya id.
 */
const zonaGagal = ref<Set<string>>(new Set());

const zonaBelumTersimpan = computed(() =>
  (zones.value[activeTab.value] || []).filter((z: any) => !z.element_id).length);

const semuaTersimpan = computed(() =>
  !isDirty.value
  && zonaGagal.value.size === 0
  && (zones.value[activeTab.value] || []).length > 0
  && zonaBelumTersimpan.value === 0);

const labelModul = (id: string) => MODULES.find(m => m.id === id)?.label || id;

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
    const gagalAuto: string[] = [];
    for (const z of zones.value[mod]) {
      const activeModInfo = MODULES.find(m => m.id === mod);
      const nama = z.name || activeModInfo?.label || mod;
      const payload = { element_type: mod, element_name: nama, parameters: { ...z.params, _zone_name: z.name } };
      try {
        if (z.element_id) {
          await api.put(`${baseUrl.value}/mto/${z.element_id}`, payload);
        } else {
          const res = await api.post(`${baseUrl.value}/mto`, payload);
          z.element_id = res.data.id;
        }
      } catch (e: any) {
        // Satu zona bermasalah tidak boleh menghentikan penyimpanan zona lain.
        const u = uraikanGagal(e);
        for (const pr of (u.problems.length ? u.problems : [u.message])) gagalAuto.push(`${nama}: ${pr}`);
      }
    }
    if (gagalAuto.length) throw Object.assign(new Error('sebagian zona gagal'), { daftar: gagalAuto });
    isDirty.value = false;
    saveError.value = null;
    zonaGagal.value = new Set();
  } catch (e: any) {
    // Auto-save TIDAK boleh gagal diam-diam. Versi lama menelan errornya
    // sepenuhnya, jadi perubahan yang ditolak server tetap terlihat di layar
    // seolah tersimpan — dan baru ketahuan hilang setelah halaman dimuat ulang.
    // Tanpa alert (ini berjalan di latar), tapi alasannya ditampilkan di bar.
    saveError.value = e?.daftar
      ? { modul: mod, message: 'Sebagian zona belum tersimpan — dimensi teknisnya belum lengkap.', problems: e.daftar }
      : { ...uraikanGagal(e), modul: mod };
    isDirty.value = true;
  }
}

/**
 * Simpan seluruh zona pada tab modul aktif.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Dua hal yang dulu membuat MTO terasa "tidak bisa diedit sama sekali":
 *
 * 1. Loopnya berhenti pada kegagalan pertama. Satu zona yang dimensinya belum
 *    lengkap membuat SELURUH tab gagal disimpan — termasuk zona lain yang
 *    sebenarnya sudah benar. Terjadi sungguhan di produksi: tab Kolom memuat
 *    "Kolom Gudang" bertipe WF yang `wf_profile`-nya belum diisi, sehingga
 *    mengedit "Kolom 1" pun selalu berakhir gagal.
 * 2. Pesannya tidak menyebut zona mana yang bermasalah, jadi pengguna mencari
 *    kesalahan pada zona yang sedang ia buka — padahal penyebabnya zona lain
 *    yang mungkin tidak sedang terlihat.
 *
 * Sekarang tiap zona disimpan sendiri-sendiri: yang benar tetap tersimpan, yang
 * gagal dilaporkan berikut NAMA ZONA-nya.
 * ───────────────────────────────────────────────────────────────────────────
 */
async function saveModule() {
  saving.value = true;
  const gagal: { zona: string; problems: string[] }[] = [];
  const gagalZid = new Set<string>();
  try {
    const mod = activeTab.value;
    const zoneList = zones.value[mod] || [];
    for (const z of zoneList) {
      const nama = z.name || `${activeModule.value?.label || mod}`;
      const payload = { element_type: mod, element_name: nama, parameters: { ...z.params, _zone_name: z.name } };
      try {
        if (z.element_id) {
          await api.put(`${baseUrl.value}/mto/${z.element_id}`, payload);
        } else {
          const res = await api.post(`${baseUrl.value}/mto`, payload);
          z.element_id = res.data.id;
        }
      } catch (e: any) {
        const u = uraikanGagal(e);
        gagal.push({ zona: nama, problems: u.problems.length ? u.problems : [u.message] });
        gagalZid.add(z.zid);
      }
    }

    // Penyimpanan di sini memang partial per zona — itu keputusan yang sudah
    // ada dan disengaja (satu zona bermasalah tidak boleh menyandera zona lain).
    // Karena partial, layarnya WAJIB menyebut mana yang commit dan mana yang
    // tidak; pesan all-or-nothing akan menyesatkan ke dua arah sekaligus.
    zonaGagal.value = gagalZid;

    if (gagal.length === 0) {
      isDirty.value = false;
      saveError.value = null;
    } else {
      // Zona yang berhasil sudah tersimpan; yang tersisa hanya yang gagal.
      isDirty.value = true;
      saveError.value = {
        modul: mod,
        message: gagal.length === zoneList.length
          ? 'Tidak ada zona yang bisa disimpan — dimensi teknisnya belum lengkap.'
          : `${gagal.length} dari ${zoneList.length} zona gagal disimpan. Zona lain sudah tersimpan.`,
        problems: gagal.flatMap(g => g.problems.map(p => `${g.zona}: ${p}`)),
      };
    }
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
.zone-status{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;}
.zs-simpan{background:#dcfce7;color:#166534;}
.zs-baru{background:#fef3c7;color:#92400e;}
.zs-ubah{background:#e0f2fe;color:#075985;}
.zs-gagal{background:#fee2e2;color:#991b1b;}
.usul-tipe{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:#1e293b;color:#fff;border-radius:4px;padding:2px 6px;}
.usul-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0;}
.usul-field{display:flex;flex-direction:column;gap:2px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:5px 7px;}
.usul-field.field-kurang{border-color:#fbbf24;background:#fffbeb;}
.usul-field-label{font-size:10px;color:#475569;display:flex;justify-content:space-between;align-items:center;gap:4px;}
.usul-wajib{font-style:normal;font-size:9px;color:#b45309;background:#fef3c7;border-radius:3px;padding:0 4px;}
.usul-field input{border:none;background:transparent;font-size:13px;font-weight:600;color:#0f172a;width:100%;outline:none;padding:1px 0;}
.usul-field input:focus{border-bottom:1px solid #60a5fa;}
.usul-field-kode{font-size:9px;color:#94a3b8;font-family:ui-monospace,monospace;}
.usul-diskusi{margin-top:10px;padding-top:10px;border-top:1px solid #cbd5e1;}
.usul-riwayat{max-height:180px;overflow-y:auto;margin-bottom:8px;display:flex;flex-direction:column;gap:5px;}
.usul-bubble{font-size:12px;padding:6px 9px;border-radius:8px;line-height:1.45;}
.bubble-pengguna{background:#e0f2fe;color:#0c4a6e;align-self:flex-end;max-width:88%;}
.bubble-asisten{background:#fff;border:1px solid #e2e8f0;color:#334155;align-self:flex-start;max-width:92%;}
.usul-kirim{display:flex;gap:8px;}
.usul-kirim input{flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:7px 10px;font-size:13px;}
.usul-kirim input:focus{outline:none;border-color:#60a5fa;}
.usul-btn{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;}
.usul-btn:hover{background:#dbeafe;}
.usul-panel{margin:12px 18px;padding:12px 14px;border:1px solid #bfdbfe;background:#f8fafc;border-radius:10px;font-size:13px;}
.usul-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;}
.usul-sub{font-size:12px;color:#475569;margin-top:2px;}
.usul-tolak-semua{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;white-space:nowrap;}
.usul-item{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;}
.usul-item-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.usul-yakin{font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600;}
.yakin-tinggi{background:#dcfce7;color:#166534;}
.yakin-sedang{background:#fef3c7;color:#92400e;}
.yakin-rendah{background:#fee2e2;color:#991b1b;}
.usul-dim{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
.usul-chip{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;font-size:12px;font-family:ui-monospace,monospace;}
.usul-pratinjau{margin-top:6px;font-size:12px;color:#475569;}
.usul-pratinjau ul{margin:6px 0 0 18px;}
.usul-aksi{display:flex;gap:8px;margin-top:10px;}
.usul-terima{border:none;background:#059669;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;}
.usul-terima:disabled{opacity:.5;cursor:not-allowed;}
.usul-tolak{border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;}
.zone-hapus-btn{margin-left:auto;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;}
.zone-hapus-btn:hover{background:#fee2e2;}
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
