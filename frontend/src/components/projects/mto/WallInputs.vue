<template>
  <div class="inp-wrap">
    <WallTypePicker :modelValue="wallType" @update:modelValue="v => { p.wall_type = v; emit('change') }" />
    <div class="inp-grid">
      <div class="inp-section">
        <div class="sub-title">A · Dimensi Dinding</div>
        <div class="fields">
          <label>Luas Bruto (m²)</label><input type="number" v-model.number="p.area" @change="emit('change')" step="5">
          <label>Tinggi Dinding (m)</label><input type="number" v-model.number="p.height" @change="emit('change')" step="0.1">
          <label>% Bukaan (pintu+jendela)</label><input type="number" v-model.number="p.opening_pct" @change="emit('change')" min="0" max="80" step="5">
          <template v-if="wallType==='cladding_zincalume'">
            <label>Tebal Zincalume (mm)</label>
            <select v-model="p.zinc_thick" @change="emit('change')">
              <option value="0.3">0.30 mm</option><option value="0.4">0.40 mm</option><option value="0.5">0.50 mm</option>
            </select>
            <label>Lebar Efektif Sheet (m)</label><input type="number" v-model.number="p.zinc_eff_w" @change="emit('change')" step="0.01">
            <label>Panjang Sheet (m)</label><input type="number" v-model.number="p.zinc_len" @change="emit('change')" step="0.5">
          </template>
          <template v-else-if="wallType==='kaca'">
            <label>Tebal Kaca (mm)</label>
            <select v-model="p.glass_thick" @change="emit('change')">
              <option value="6">6 mm Clear</option><option value="8">8 mm Clear</option><option value="10">10 mm Tempered</option><option value="12">12 mm Tempered</option>
            </select>
            <label>Tipe Frame</label>
            <select v-model="p.glass_frame" @change="emit('change')">
              <option value="aluminium">Aluminium</option><option value="spider">Spider System</option><option value="frameless">Frameless</option>
            </select>
          </template>
          <template v-else>
            <label>Tebal Dinding (cm)</label><input type="number" v-model.number="p.thickness_cm" @change="emit('change')" step="2.5">
          </template>
        </div>
      </div>
      <div class="inp-section">
        <div class="sub-title">B · Pintu, Jendela & Finishing</div>
        <div class="fields">
          <label>Qty Pintu (bh)</label><input type="number" v-model.number="p.door_qty" @change="emit('change')">
          <label>Uk. Pintu P×T (m)</label>
          <div style="display:flex;gap:4px"><input type="number" v-model.number="p.door_w" step="0.1" @change="emit('change')" placeholder="L"><input type="number" v-model.number="p.door_h" step="0.1" @change="emit('change')" placeholder="T"></div>
          <label>Qty Jendela (bh)</label><input type="number" v-model.number="p.window_qty" @change="emit('change')">
          <label>Uk. Jendela P×T (m)</label>
          <div style="display:flex;gap:4px"><input type="number" v-model.number="p.window_w" step="0.1" @change="emit('change')" placeholder="L"><input type="number" v-model.number="p.window_h" step="0.1" @change="emit('change')" placeholder="T"></div>
          <template v-if="wallType==='bata_ringan' || wallType==='bata_merah'">
            <label>Finishing</label>
            <select v-model="p.finishing" @change="emit('change')">
              <option value="plester_acian">Plester + Acian + Cat</option>
              <option value="expose">Bata Expose</option>
              <option value="tegel">Tegel/Keramik Dinding</option>
            </select>
          </template>
        </div>
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
import WallTypePicker from './WallTypePicker.vue';
const props = defineProps<{ modelValue: Record<string,any> }>();
const emit = defineEmits<{ (e:'change'):void }>();
const p = props.modelValue;
const wallType = ref<string>(p.wall_type || 'bata_ringan');
watch(() => p.wall_type, v => { if(v) wallType.value = v; }, { immediate: true });
if(!p.wall_type) p.wall_type='bata_ringan';
if(!p.area) p.area=500; if(!p.height) p.height=4; if(!p.opening_pct) p.opening_pct=20;
if(!p.thickness_cm) p.thickness_cm=10; if(!p.door_qty) p.door_qty=4;
if(!p.door_w) p.door_w=0.9; if(!p.door_h) p.door_h=2.1;
if(!p.window_qty) p.window_qty=8; if(!p.window_w) p.window_w=1.2; if(!p.window_h) p.window_h=1.2;
if(!p.zinc_thick) p.zinc_thick='0.4'; if(!p.zinc_eff_w) p.zinc_eff_w=0.85; if(!p.zinc_len) p.zinc_len=6;
if(!p.glass_thick) p.glass_thick='8'; if(!p.glass_frame) p.glass_frame='aluminium';
if(!p.finishing) p.finishing='plester_acian';
// EST-MTO-001: kuantitas tidak lagi dihitung di sini. Komponen ini hanya
// mengirim parameter; angkanya datang dari kalkulator backend yang sama
// dengan yang dipakai RAB dan penawaran.
const { lines, notes, loading } = useMtoPreview('wall', () => p);
const results = computed(() => toDisplay(lines.value));
</script>
<style scoped>
.inp-wrap{display:flex;flex-direction:column;gap:12px;}
.inp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:640px){.inp-grid{grid-template-columns:1fr;}}
.inp-section{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0;}
.sub-title{font-size:.68rem;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;align-items:center;}
.fields label{font-size:.68rem;color:#475569;font-weight:500;}
.fields input,.fields select{border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:.78rem;width:100%;background:white;}
.output-bar{background:#0f172a;border-radius:12px;padding:12px;}
.out-title{font-size:.68rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.out-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;}
@media(max-width:640px){.out-grid{grid-template-columns:repeat(3,1fr);}}
.out-item{background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center;}
.out-icon{font-size:1rem;}.out-val{font-size:.85rem;font-weight:800;color:#38bdf8;margin:2px 0;}.out-u{font-size:.58rem;color:#64748b;}.out-l{font-size:.6rem;color:#94a3b8;margin-top:1px;}
</style>
