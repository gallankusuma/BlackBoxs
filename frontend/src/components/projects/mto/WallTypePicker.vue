<template>
  <div class="tp-wrap">
    <div class="tp-label">Pilih Tipe Dinding</div>
    <div class="tp-grid">
      <button v-for="opt in OPTIONS" :key="opt.id"
        @click="$emit('update:modelValue', opt.id)"
        class="tp-card" :class="{ active: modelValue === opt.id }">
        <div class="tp-svg-area">
          <svg v-if="opt.id==='bata_ringan'" viewBox="0 0 80 90" class="tp-svg">
            <rect x="5" y="10" width="70" height="70" fill="#e2e8f0" rx="1"/>
            <rect x="8" y="13" width="30" height="12" fill="#94a3b8" rx="1"/><rect x="42" y="13" width="30" height="12" fill="#94a3b8" rx="1"/>
            <rect x="5" y="28" width="20" height="12" fill="#94a3b8" rx="1"/><rect x="28" y="28" width="30" height="12" fill="#94a3b8" rx="1"/><rect x="62" y="28" width="13" height="12" fill="#94a3b8" rx="1"/>
            <rect x="8" y="43" width="30" height="12" fill="#94a3b8" rx="1"/><rect x="42" y="43" width="30" height="12" fill="#94a3b8" rx="1"/>
            <rect x="5" y="58" width="20" height="12" fill="#94a3b8" rx="1"/><rect x="28" y="58" width="30" height="12" fill="#94a3b8" rx="1"/><rect x="62" y="58" width="13" height="12" fill="#94a3b8" rx="1"/>
            <text x="40" y="88" text-anchor="middle" font-size="6.5" fill="#475569">Bata Ringan/Hebel</text>
          </svg>
          <svg v-else-if="opt.id==='bata_merah'" viewBox="0 0 80 90" class="tp-svg">
            <rect x="5" y="10" width="70" height="70" fill="#fde8d8" rx="1"/>
            <rect x="8" y="13" width="28" height="10" fill="#dc6b3a" rx="1"/><rect x="40" y="13" width="32" height="10" fill="#dc6b3a" rx="1"/>
            <rect x="5" y="26" width="18" height="10" fill="#c2572a" rx="1"/><rect x="26" y="26" width="28" height="10" fill="#c2572a" rx="1"/><rect x="57" y="26" width="18" height="10" fill="#c2572a" rx="1"/>
            <rect x="8" y="39" width="28" height="10" fill="#dc6b3a" rx="1"/><rect x="40" y="39" width="32" height="10" fill="#dc6b3a" rx="1"/>
            <rect x="5" y="52" width="18" height="10" fill="#c2572a" rx="1"/><rect x="26" y="52" width="28" height="10" fill="#c2572a" rx="1"/><rect x="57" y="52" width="18" height="10" fill="#c2572a" rx="1"/>
            <rect x="8" y="65" width="28" height="10" fill="#dc6b3a" rx="1"/><rect x="40" y="65" width="32" height="10" fill="#dc6b3a" rx="1"/>
            <text x="40" y="88" text-anchor="middle" font-size="6.5" fill="#475569">Bata Merah</text>
          </svg>
          <svg v-else-if="opt.id==='cladding_zincalume'" viewBox="0 0 80 90" class="tp-svg">
            <rect x="5" y="10" width="70" height="70" fill="#e0f2fe" rx="1"/>
            <rect x="5" y="13" width="70" height="8" fill="#7dd3fc" rx="0"/>
            <rect x="5" y="24" width="70" height="8" fill="#38bdf8" rx="0"/>
            <rect x="5" y="35" width="70" height="8" fill="#7dd3fc" rx="0"/>
            <rect x="5" y="46" width="70" height="8" fill="#38bdf8" rx="0"/>
            <rect x="5" y="57" width="70" height="8" fill="#7dd3fc" rx="0"/>
            <rect x="5" y="68" width="70" height="8" fill="#38bdf8" rx="0"/>
            <line x1="5" y1="13" x2="5" y2="80" stroke="#0ea5e9" stroke-width="2"/>
            <line x1="75" y1="13" x2="75" y2="80" stroke="#0ea5e9" stroke-width="2"/>
            <text x="40" y="88" text-anchor="middle" font-size="6.5" fill="#475569">Cladding Zincalume</text>
          </svg>
          <svg v-else-if="opt.id==='partisi_grc'" viewBox="0 0 80 90" class="tp-svg">
            <rect x="5" y="10" width="70" height="70" fill="#f1f5f9" rx="1" stroke="#cbd5e1" stroke-width="1.5"/>
            <line x1="40" y1="10" x2="40" y2="80" stroke="#cbd5e1" stroke-width="1.5"/>
            <line x1="5" y1="45" x2="75" y2="45" stroke="#cbd5e1" stroke-width="1.5"/>
            <text x="40" y="88" text-anchor="middle" font-size="6.5" fill="#475569">Partisi GRC</text>
          </svg>
          <svg v-else viewBox="0 0 80 90" class="tp-svg">
            <rect x="5" y="10" width="70" height="70" fill="#f8fafc" rx="1" stroke="#e2e8f0" stroke-width="1.5"/>
            <rect x="10" y="15" width="60" height="60" fill="#bae6fd" rx="1" opacity="0.4"/>
            <line x1="10" y1="15" x2="70" y2="75" stroke="#7dd3fc" stroke-width="1.5"/>
            <line x1="70" y1="15" x2="10" y2="75" stroke="#7dd3fc" stroke-width="1.5"/>
            <text x="40" y="88" text-anchor="middle" font-size="6.5" fill="#475569">Dinding Kaca</text>
          </svg>
        </div>
        <div class="tp-name">{{ opt.label }}</div>
        <div class="tp-desc">{{ opt.desc }}</div>
        <div class="tp-tags"><span v-for="t in opt.tags" :key="t" class="tp-tag">{{ t }}</span></div>
        <div v-if="modelValue===opt.id" class="tp-check">✓</div>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e:'update:modelValue', v:string):void }>();
const OPTIONS = [
  { id:'bata_ringan',      label:'Bata Ringan / Hebel',   desc:'Blok beton ringan aerasi, ringan & presisi', tags:['Ringan','Umum'] },
  { id:'bata_merah',       label:'Bata Merah',            desc:'Bata tanah liat bakar konvensional', tags:['Konvensional','Kuat'] },
  { id:'cladding_zincalume',label:'Cladding Zincalume',  desc:'Panel metal gelombang, umum untuk gudang', tags:['Metal','Cepat'] },
  { id:'partisi_grc',      label:'Partisi GRC / Drywall', desc:'GRC board atau gypsum board untuk partisi dalam', tags:['Interior','Ringan'] },
  { id:'kaca',             label:'Curtain Wall / Kaca',   desc:'Dinding kaca full untuk fasad modern', tags:['Modern','Premium'] },
];
</script>
<style scoped>
.tp-wrap{margin-bottom:14px;}
.tp-label{font-size:.72rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
.tp-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
@media(max-width:900px){.tp-grid{grid-template-columns:repeat(3,1fr);}}
@media(max-width:600px){.tp-grid{grid-template-columns:repeat(2,1fr);}}
.tp-card{position:relative;border:2px solid #e5e7eb;border-radius:10px;padding:8px;background:white;cursor:pointer;text-align:center;transition:all .2s;}
.tp-card:hover{border-color:#6b7280;transform:translateY(-2px);}
.tp-card.active{border-color:#374151;background:#f9fafb;}
.tp-svg-area{height:70px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;}
.tp-svg{width:100%;height:70px;}
.tp-name{font-size:.62rem;font-weight:700;color:#1e293b;margin-bottom:2px;line-height:1.2;}
.tp-desc{font-size:.56rem;color:#64748b;margin-bottom:4px;line-height:1.3;}
.tp-tags{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;}
.tp-tag{font-size:.54rem;background:#f9fafb;color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:1px 4px;font-weight:600;}
.tp-card.active .tp-tag{background:#f3f4f6;color:#111827;}
.tp-check{position:absolute;top:5px;right:6px;color:#111827;font-size:.8rem;font-weight:900;}
</style>
