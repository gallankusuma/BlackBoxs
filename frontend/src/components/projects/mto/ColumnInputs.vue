<template>
  <div class="inp-wrap">
    <ColumnTypePicker :modelValue="colType" @update:modelValue="v => { p.col_type = v; emit('change') }" />

    <!-- BETON BERTULANG -->
    <template v-if="p.col_type === 'beton' || !p.col_type">
      <div class="inp-grid">
        <div class="inp-section">
          <div class="sub-title">A · Dimensi Kolom Beton</div>
          <div class="fields">
            <label>Jumlah Kolom (bh)</label><input type="number" v-model.number="p.qty_per_floor" @change="emit('change')" min="1">
            <label>Jumlah Lantai</label><input type="number" v-model.number="p.floors" @change="emit('change')" min="1">
            <label>Tinggi/Lantai (m)</label><input type="number" v-model.number="p.height_per_floor" @change="emit('change')" step="0.1">
            <label>Lebar B (m)</label><input type="number" v-model.number="p.B" @change="emit('change')" step="0.05">
            <label>Tinggi H (m)</label><input type="number" v-model.number="p.H" @change="emit('change')" step="0.05">
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Pembesian Kolom</div>
          <div class="fields">
            <label>Dia. Tul. Pokok (mm)</label><input type="number" v-model.number="p.rebar_dia" @change="emit('change')" step="2">
            <label>Jml Tul. Pokok (bh)</label><input type="number" v-model.number="p.rebar_count" @change="emit('change')">
            <label>Dia. Sengkang (mm)</label><input type="number" v-model.number="p.stirrup_dia" @change="emit('change')" step="2">
            <label>Jarak Sengkang (m)</label><input type="number" v-model.number="p.stirrup_spacing" @change="emit('change')" step="0.025">
            <label>Selimut Beton (m)</label><input type="number" v-model.number="p.cover" @change="emit('change')" step="0.005">
          </div>
        </div>
      </div>
    </template>

    <!-- PROFIL BAJA WF -->
    <template v-else-if="p.col_type === 'wf'">
      <div class="inp-grid">
        <div class="inp-section">
          <div class="sub-title">A · Profil Baja WF / H-Beam</div>
          <div class="fields">
            <label>Jumlah Kolom (bh)</label><input type="number" v-model.number="p.qty_per_floor" @change="emit('change')" min="1">
            <label>Jumlah Lantai</label><input type="number" v-model.number="p.floors" @change="emit('change')" min="1">
            <label>Tinggi/Lantai (m)</label><input type="number" v-model.number="p.height_per_floor" @change="emit('change')" step="0.1">
            <label>Profil WF</label>
            <select v-model="p.wf_profile" @change="emit('change')">
              <option value="WF150x75">WF 150×75 (14 kg/m)</option>
              <option value="WF200x100">WF 200×100 (21.3 kg/m)</option>
              <option value="WF250x125">WF 250×125 (29.6 kg/m)</option>
              <option value="WF300x150">WF 300×150 (46.8 kg/m)</option>
              <option value="WF350x175">WF 350×175 (57.4 kg/m)</option>
              <option value="WF400x200">WF 400×200 (66.0 kg/m)</option>
            </select>
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Base Plate & Sambungan</div>
          <div class="fields">
            <label>Base Plate P (mm)</label><input type="number" v-model.number="p.bp_p" @change="emit('change')" step="25">
            <label>Base Plate L (mm)</label><input type="number" v-model.number="p.bp_l" @change="emit('change')" step="25">
            <label>Tebal Base Plate (mm)</label><input type="number" v-model.number="p.bp_t" @change="emit('change')" step="2">
            <label>Baut Angkur (bh)</label><input type="number" v-model.number="p.angkur_qty" @change="emit('change')" step="2">
            <label>Dia. Angkur (mm)</label><input type="number" v-model.number="p.angkur_dia" @change="emit('change')" step="4">
          </div>
        </div>
      </div>
    </template>

    <!-- BAJA RINGAN CFS -->
    <template v-else-if="p.col_type === 'cfs'">
      <div class="inp-grid">
        <div class="inp-section">
          <div class="sub-title">A · Cold-Formed Steel</div>
          <div class="fields">
            <label>Jumlah Kolom (bh)</label><input type="number" v-model.number="p.qty_per_floor" @change="emit('change')">
            <label>Tinggi Kolom (m)</label><input type="number" v-model.number="p.height_per_floor" @change="emit('change')" step="0.1">
            <label>Profil CFS</label>
            <select v-model="p.cfs_profile" @change="emit('change')">
              <option value="C75x45">C 75×45×0.75mm</option>
              <option value="C100x50">C 100×50×1.0mm</option>
              <option value="C150x50">C 150×50×1.2mm</option>
            </select>
            <label>Berat/m (kg)</label><input type="number" v-model.number="p.cfs_weight_per_m" @change="emit('change')" step="0.1">
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Penguat & Aksesori</div>
          <div class="fields">
            <label>Jml Lapis Profil</label><input type="number" v-model.number="p.cfs_layers" @change="emit('change')" min="1" max="4">
            <label>Baut Self-Drilling/m</label><input type="number" v-model.number="p.screws_per_m" @change="emit('change')">
          </div>
        </div>
      </div>
    </template>

    <!-- KAYU -->
    <template v-else>
      <div class="inp-grid">
        <div class="inp-section">
          <div class="sub-title">A · Kolom Kayu</div>
          <div class="fields">
            <label>Jumlah Kolom (bh)</label><input type="number" v-model.number="p.qty_per_floor" @change="emit('change')">
            <label>Tinggi (m)</label><input type="number" v-model.number="p.height_per_floor" @change="emit('change')" step="0.1">
            <label>Lebar B (cm)</label><input type="number" v-model.number="p.kayu_b" @change="emit('change')" step="2">
            <label>Tinggi H (cm)</label><input type="number" v-model.number="p.kayu_h" @change="emit('change')" step="2">
            <label>Kelas Kayu</label>
            <select v-model="p.kayu_kelas" @change="emit('change')">
              <option value="K1">Kelas I (Ulin, Merbau)</option>
              <option value="K2">Kelas II (Kruing, Bangkirai)</option>
              <option value="K3">Kelas III (Kamper, Meranti)</option>
            </select>
          </div>
        </div>
      </div>
    </template>

    <!-- Sloof selalu tampil -->
    <div class="inp-section mt-2">
      <div class="sub-title">C · Sloof / Ground Beam</div>
      <div class="fields fields-4">
        <label>Total Panjang (m)</label><input type="number" v-model.number="p.sloof_length" @change="emit('change')" step="1">
        <label>Lebar B (m)</label><input type="number" v-model.number="p.sloof_w" @change="emit('change')" step="0.05">
        <label>Tinggi H (m)</label><input type="number" v-model.number="p.sloof_h" @change="emit('change')" step="0.05">
        <label>Dia. Tul. Utama (mm)</label><input type="number" v-model.number="p.sloof_rebar_dia" @change="emit('change')" step="2">
      </div>
    </div>

    <div class="output-bar">
      <div class="out-title">E · Output MTO</div>
      <div class="out-grid">
        <div class="out-item" v-for="r in results" :key="r.l">
          <div class="out-icon">{{ r.icon }}</div><div class="out-val">{{ r.v }}</div>
          <div class="out-u">{{ r.u }}</div><div class="out-l">{{ r.l }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMtoPreview, toDisplay } from '@/composables/useMtoPreview';
import ColumnTypePicker from './ColumnTypePicker.vue';
const props = defineProps<{ modelValue: Record<string,any> }>();
const emit  = defineEmits<{ (e:'change'):void }>();
const p = props.modelValue;
const colType = ref<string>(p.col_type || 'beton');
watch(() => p.col_type, v => { if(v) colType.value = v; }, { immediate: true });
// defaults
if(!p.col_type) p.col_type='beton';
if(!p.qty_per_floor) p.qty_per_floor=12; if(!p.floors) p.floors=1;
if(!p.height_per_floor) p.height_per_floor=4; if(!p.B) p.B=0.3; if(!p.H) p.H=0.3;
if(!p.rebar_dia) p.rebar_dia=16; if(!p.rebar_count) p.rebar_count=8;
if(!p.stirrup_dia) p.stirrup_dia=10; if(!p.stirrup_spacing) p.stirrup_spacing=0.15; if(!p.cover) p.cover=0.04;
if(!p.wf_profile) p.wf_profile='WF200x100'; if(!p.bp_p) p.bp_p=300; if(!p.bp_l) p.bp_l=300; if(!p.bp_t) p.bp_t=20; if(!p.angkur_qty) p.angkur_qty=4; if(!p.angkur_dia) p.angkur_dia=19;
if(!p.cfs_profile) p.cfs_profile='C100x50'; if(!p.cfs_weight_per_m) p.cfs_weight_per_m=1.5; if(!p.cfs_layers) p.cfs_layers=2; if(!p.screws_per_m) p.screws_per_m=4;
if(!p.kayu_b) p.kayu_b=12; if(!p.kayu_h) p.kayu_h=12; if(!p.kayu_kelas) p.kayu_kelas='K2';
if(!p.sloof_length) p.sloof_length=200; if(!p.sloof_w) p.sloof_w=0.3; if(!p.sloof_h) p.sloof_h=0.5; if(!p.sloof_rebar_dia) p.sloof_rebar_dia=16;

// EST-MTO-001: kuantitas tidak lagi dihitung di sini. Komponen ini hanya
// mengirim parameter; angkanya datang dari kalkulator backend yang sama
// dengan yang dipakai RAB dan penawaran.
const { lines, notes, loading } = useMtoPreview('column', () => p);
const results = computed(() => toDisplay(lines.value));
</script>
<style scoped>
.inp-wrap{display:flex;flex-direction:column;gap:12px;}
.inp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:640px){.inp-grid{grid-template-columns:1fr;}}
.inp-section{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0;}
.inp-section.mt-2{margin-top:0;}
.sub-title{font-size:.68rem;font-weight:700;color:#3b82f6;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;align-items:center;}
.fields-4{grid-template-columns:repeat(4,1fr);}
.fields label{font-size:.68rem;color:#475569;font-weight:500;}
.fields input,.fields select{border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:.78rem;width:100%;background:white;}
.output-bar{background:#0f172a;border-radius:12px;padding:12px;}
.out-title{font-size:.68rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.out-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}
@media(max-width:640px){.out-grid{grid-template-columns:repeat(2,1fr);}}
.out-item{background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center;}
.out-icon{font-size:1rem;}.out-val{font-size:.85rem;font-weight:800;color:#38bdf8;margin:2px 0;}.out-u{font-size:.58rem;color:#64748b;}.out-l{font-size:.6rem;color:#94a3b8;margin-top:1px;}
</style>
