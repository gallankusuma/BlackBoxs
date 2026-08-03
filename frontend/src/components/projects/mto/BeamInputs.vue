<template>
  <div class="inp-wrap">
    <BeamTypePicker :modelValue="beamType" @update:modelValue="v => { p.beam_type = v; emit('change') }" />
    <div class="inp-grid">
      <!-- BETON -->
      <template v-if="!p.beam_type || beamType==='beton'">
        <div class="inp-section">
          <div class="sub-title">A · Balok Beton Induk</div>
          <div class="fields">
            <label>Total Panjang (m)</label><input type="number" v-model.number="p.total_length" @change="emit('change')" step="1">
            <label>Lebar B (m)</label><input type="number" v-model.number="p.B" @change="emit('change')" step="0.05">
            <label>Tinggi H (m)</label><input type="number" v-model.number="p.H" @change="emit('change')" step="0.05">
            <label>Dia. Tul. Utama (mm)</label><input type="number" v-model.number="p.rebar_dia" @change="emit('change')" step="2">
            <label>Jml Tul. Tarik</label><input type="number" v-model.number="p.rebar_count" @change="emit('change')">
            <label>Dia. Sengkang (mm)</label><input type="number" v-model.number="p.stirrup_dia" @change="emit('change')" step="2">
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Ring Balok</div>
          <div class="fields">
            <label>Total Panjang (m)</label><input type="number" v-model.number="p.rb_length" @change="emit('change')" step="1">
            <label>Lebar B (m)</label><input type="number" v-model.number="p.rb_B" @change="emit('change')" step="0.05">
            <label>Tinggi H (m)</label><input type="number" v-model.number="p.rb_H" @change="emit('change')" step="0.05">
            <label>Dia. Tul. (mm)</label><input type="number" v-model.number="p.rb_rebar_dia" @change="emit('change')" step="2">
          </div>
        </div>
      </template>
      <!-- WF -->
      <template v-else-if="beamType==='wf'">
        <div class="inp-section">
          <div class="sub-title">A · Balok Profil WF / IPE</div>
          <div class="fields">
            <label>Total Panjang (m)</label><input type="number" v-model.number="p.total_length" @change="emit('change')" step="1">
            <label>Profil WF</label>
            <select v-model="p.wf_profile_beam" @change="emit('change')">
              <option value="WF150x75">WF 150×75 (14 kg/m)</option>
              <option value="WF200x100">WF 200×100 (21.3 kg/m)</option>
              <option value="WF250x125">WF 250×125 (29.6 kg/m)</option>
              <option value="WF300x150">WF 300×150 (46.8 kg/m)</option>
              <option value="WF350x175">WF 350×175 (57.4 kg/m)</option>
            </select>
            <label>Panjang Purlin (m)</label><input type="number" v-model.number="p.purlin_length" @change="emit('change')" step="1">
            <label>Profil Purlin</label>
            <select v-model="p.purlin_profile" @change="emit('change')">
              <option value="C150x65">C 150×65 (2.24 kg/m)</option>
              <option value="C200x75">C 200×75 (3.18 kg/m)</option>
              <option value="Z150x65">Z 150×65 (2.24 kg/m)</option>
            </select>
          </div>
        </div>
        <div class="inp-section">
          <div class="sub-title">B · Sambungan & Aksesori</div>
          <div class="fields">
            <label>Sambungan Baut (titik)</label><input type="number" v-model.number="p.bolt_joints" @change="emit('change')">
            <label>Baut/titik (bh)</label><input type="number" v-model.number="p.bolts_per_joint" @change="emit('change')">
            <label>Stiffener Pelat (bh)</label><input type="number" v-model.number="p.stiffener_qty" @change="emit('change')">
          </div>
        </div>
      </template>
      <!-- KANAL C/U -->
      <template v-else-if="beamType==='kanal'">
        <div class="inp-section">
          <div class="sub-title">A · Balok Kanal C / U</div>
          <div class="fields">
            <label>Total Panjang (m)</label><input type="number" v-model.number="p.total_length" @change="emit('change')" step="1">
            <label>Profil Kanal</label>
            <select v-model="p.kanal_profile" @change="emit('change')">
              <option value="UNP100">UNP 100 (10.6 kg/m)</option>
              <option value="UNP120">UNP 120 (13.4 kg/m)</option>
              <option value="UNP150">UNP 150 (18.8 kg/m)</option>
              <option value="UNP200">UNP 200 (25.3 kg/m)</option>
            </select>
            <label>Baut/sambungan (bh)</label><input type="number" v-model.number="p.kanal_bolts" @change="emit('change')">
          </div>
        </div>
      </template>
      <!-- KAYU -->
      <template v-else>
        <div class="inp-section">
          <div class="sub-title">A · Balok Kayu</div>
          <div class="fields">
            <label>Total Panjang (m)</label><input type="number" v-model.number="p.total_length" @change="emit('change')" step="1">
            <label>Lebar B (cm)</label><input type="number" v-model.number="p.kayu_b" @change="emit('change')" step="2">
            <label>Tinggi H (cm)</label><input type="number" v-model.number="p.kayu_h" @change="emit('change')" step="2">
            <label>Kelas Kayu</label>
            <select v-model="p.kayu_kelas_beam" @change="emit('change')">
              <option value="K1">Kelas I</option><option value="K2">Kelas II</option><option value="K3">Kelas III</option>
            </select>
          </div>
        </div>
      </template>
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
import BeamTypePicker from './BeamTypePicker.vue';
const props = defineProps<{ modelValue: Record<string,any> }>();
const emit = defineEmits<{ (e:'change'):void }>();
const p = props.modelValue;
const beamType = ref<string>(p.beam_type || 'beton');
watch(() => p.beam_type, v => { if(v) beamType.value = v; }, { immediate: true });
if(!p.beam_type) p.beam_type='beton';
if(!p.total_length) p.total_length=300; if(!p.B) p.B=0.25; if(!p.H) p.H=0.5;
if(!p.rebar_count) p.rebar_count=4; if(!p.rebar_dia) p.rebar_dia=16; if(!p.stirrup_dia) p.stirrup_dia=10;
if(!p.rb_length) p.rb_length=200; if(!p.rb_B) p.rb_B=0.15; if(!p.rb_H) p.rb_H=0.25; if(!p.rb_rebar_dia) p.rb_rebar_dia=13;
if(!p.wf_profile_beam) p.wf_profile_beam='WF200x100'; if(!p.purlin_length) p.purlin_length=500; if(!p.purlin_profile) p.purlin_profile='C150x65';
if(!p.bolt_joints) p.bolt_joints=20; if(!p.bolts_per_joint) p.bolts_per_joint=4; if(!p.stiffener_qty) p.stiffener_qty=10;
if(!p.kanal_profile) p.kanal_profile='UNP150'; if(!p.kanal_bolts) p.kanal_bolts=40;
if(!p.kayu_b) p.kayu_b=8; if(!p.kayu_h) p.kayu_h=15; if(!p.kayu_kelas_beam) p.kayu_kelas_beam='K2';
const WF_WEIGHT: Record<string,number> = {'WF150x75':14,'WF200x100':21.3,'WF250x125':29.6,'WF300x150':46.8,'WF350x175':57.4};
const UNP_WEIGHT: Record<string,number> = {'UNP100':10.6,'UNP120':13.4,'UNP150':18.8,'UNP200':25.3};
const PURLIN_WEIGHT: Record<string,number> = {'C150x65':2.24,'C200x75':3.18,'Z150x65':2.24};
const fmt = (v:number) => v.toLocaleString('id-ID',{maximumFractionDigits:2});
const results = computed(()=>{
  const type=beamType.value||'beton';
  if(type==='wf'){
    const wBalk=+(WF_WEIGHT[p.wf_profile_beam]||21.3*p.total_length*1.05).toFixed(0);
    const wPurlin=+(PURLIN_WEIGHT[p.purlin_profile]||2.24*p.purlin_length*1.05).toFixed(0);
    return [{icon:'⚙',l:'Baja Balok',v:fmt(wBalk),u:'kg'},{icon:'⚙',l:'Purlin',v:fmt(wPurlin),u:'kg'},{icon:'🔩',l:'Baut',v:String(p.bolt_joints*p.bolts_per_joint),u:'bh'}];
  }
  if(type==='kanal'){
    const w=+(UNP_WEIGHT[p.kanal_profile]||18.8*p.total_length*1.05).toFixed(0);
    return [{icon:'⚙',l:'Baja Kanal',v:fmt(w),u:'kg'},{icon:'🔩',l:'Baut',v:String(p.kanal_bolts),u:'bh'}];
  }
  if(type==='kayu'){
    const m3=+((p.kayu_b/100)*(p.kayu_h/100)*p.total_length*1.1).toFixed(2);
    return [{icon:'🪵',l:'Vol. Kayu',v:fmt(m3),u:'m³'}];
  }
  const vB=+(p.B*p.H*p.total_length*1.05).toFixed(2);
  const vRB=+(p.rb_B*p.rb_H*p.rb_length*1.05).toFixed(2);
  return [{icon:'🔗',l:'Beton Balok',v:fmt(vB),u:'m³'},{icon:'🪵',l:'Bekisting Balok',v:fmt(+(2*(p.B+p.H)*p.total_length).toFixed(1)),u:'m²'},{icon:'🔩',l:'Besi Balok',v:fmt(+(vB*117).toFixed(0)),u:'kg'},{icon:'🔗',l:'Beton Ring Bal.',v:fmt(vRB),u:'m³'},{icon:'🔩',l:'Besi Ring Bal.',v:fmt(+(vRB*122).toFixed(0)),u:'kg'}];
});
</script>
<style scoped>
.inp-wrap{display:flex;flex-direction:column;gap:12px;}
.inp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:640px){.inp-grid{grid-template-columns:1fr;}}
.inp-section{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0;}
.sub-title{font-size:.68rem;font-weight:700;color:#8b5cf6;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;align-items:center;}
.fields label{font-size:.68rem;color:#475569;font-weight:500;}
.fields input,.fields select{border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:.78rem;width:100%;background:white;}
.output-bar{background:#0f172a;border-radius:12px;padding:12px;}
.out-title{font-size:.68rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.out-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}
@media(max-width:640px){.out-grid{grid-template-columns:repeat(2,1fr);}}
.out-item{background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center;}
.out-icon{font-size:1rem;}.out-val{font-size:.85rem;font-weight:800;color:#38bdf8;margin:2px 0;}.out-u{font-size:.58rem;color:#64748b;}.out-l{font-size:.6rem;color:#94a3b8;margin-top:1px;}
</style>
