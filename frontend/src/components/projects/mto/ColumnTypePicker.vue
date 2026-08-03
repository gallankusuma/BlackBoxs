<template>
  <div class="tp-wrap">
    <div class="tp-label">Pilih Tipe Struktur Kolom</div>
    <div class="tp-grid">
      <button v-for="opt in OPTIONS" :key="opt.id"
        @click="$emit('update:modelValue', opt.id)"
        class="tp-card" :class="{ active: modelValue === opt.id }">
        <div class="tp-svg-area">
          <!-- Kolom Beton Bertulang -->
          <svg v-if="opt.id==='beton'" viewBox="0 0 80 100" class="tp-svg">
            <rect x="20" y="5" width="40" height="90" fill="#94a3b8" rx="2"/>
            <rect x="24" y="9" width="32" height="82" fill="#cbd5e1" rx="1"/>
            <line x1="28" y1="9" x2="28" y2="91" stroke="#475569" stroke-width="1.5"/>
            <line x1="40" y1="9" x2="40" y2="91" stroke="#475569" stroke-width="1.5"/>
            <line x1="52" y1="9" x2="52" y2="91" stroke="#475569" stroke-width="1.5"/>
            <rect x="22" y="20" width="36" height="3" fill="#64748b" rx="1"/>
            <rect x="22" y="35" width="36" height="3" fill="#64748b" rx="1"/>
            <rect x="22" y="50" width="36" height="3" fill="#64748b" rx="1"/>
            <rect x="22" y="65" width="36" height="3" fill="#64748b" rx="1"/>
            <rect x="22" y="80" width="36" height="3" fill="#64748b" rx="1"/>
            <text x="40" y="98" text-anchor="middle" font-size="7" fill="#475569" font-weight="bold">B×H</text>
          </svg>
          <!-- Kolom Profil WF/H-Beam -->
          <svg v-else-if="opt.id==='wf'" viewBox="0 0 80 100" class="tp-svg">
            <rect x="15" y="5" width="50" height="8" fill="#475569" rx="1"/>
            <rect x="15" y="87" width="50" height="8" fill="#475569" rx="1"/>
            <rect x="35" y="13" width="10" height="74" fill="#64748b" rx="1"/>
            <rect x="14" y="4" width="52" height="10" fill="#6b7280" rx="1" opacity="0.3"/>
            <text x="40" y="58" text-anchor="middle" font-size="7" fill="#1e293b" font-weight="bold">WF</text>
            <text x="40" y="98" text-anchor="middle" font-size="6" fill="#475569">H-Beam</text>
          </svg>
          <!-- Kolom Baja Ringan/CFS -->
          <svg v-else-if="opt.id==='cfs'" viewBox="0 0 80 100" class="tp-svg">
            <rect x="25" y="5" width="6" height="90" fill="#64748b" rx="1"/>
            <rect x="49" y="5" width="6" height="90" fill="#64748b" rx="1"/>
            <rect x="25" y="5" width="30" height="6" fill="#94a3b8" rx="1"/>
            <rect x="25" y="89" width="30" height="6" fill="#94a3b8" rx="1"/>
            <line x1="31" y1="25" x2="49" y2="25" stroke="#94a3b8" stroke-width="4"/>
            <line x1="31" y1="50" x2="49" y2="50" stroke="#94a3b8" stroke-width="4"/>
            <line x1="31" y1="75" x2="49" y2="75" stroke="#94a3b8" stroke-width="4"/>
            <text x="40" y="98" text-anchor="middle" font-size="6" fill="#475569">Cold-Formed</text>
          </svg>
          <!-- Kolom Kayu -->
          <svg v-else viewBox="0 0 80 100" class="tp-svg">
            <rect x="25" y="5" width="30" height="90" fill="#a16207" rx="2"/>
            <line x1="30" y1="5" x2="30" y2="95" stroke="#92400e" stroke-width="1" opacity="0.5"/>
            <line x1="40" y1="5" x2="40" y2="95" stroke="#92400e" stroke-width="1" opacity="0.5"/>
            <line x1="50" y1="5" x2="50" y2="95" stroke="#92400e" stroke-width="1" opacity="0.5"/>
            <text x="40" y="98" text-anchor="middle" font-size="7" fill="#475569">Kayu</text>
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
  { id:'beton', label:'Kolom Beton Bertulang', desc:'Kolom beton dengan tulangan besi pokok & sengkang', tags:['Konvensional','Kuat'] },
  { id:'wf',    label:'Kolom Profil Baja WF',  desc:'H-Beam / Wide Flange, untuk struktur baja', tags:['Baja','Cepat'] },
  { id:'cfs',   label:'Kolom Baja Ringan',     desc:'Cold-Formed Steel, untuk beban ringan-menengah', tags:['Ringan','Ekonomis'] },
  { id:'kayu',  label:'Kolom Kayu',            desc:'Kolom kayu solid, untuk bangunan semi-permanen', tags:['Kayu','Tradisional'] },
];
</script>
<style scoped>
.tp-wrap{margin-bottom:14px;}
.tp-label{font-size:.72rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
.tp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
@media(max-width:800px){.tp-grid{grid-template-columns:repeat(2,1fr);}}
.tp-card{position:relative;border:2px solid #e5e7eb;border-radius:10px;padding:8px;background:white;cursor:pointer;text-align:center;transition:all .2s;}
.tp-card:hover{border-color:#3b82f6;transform:translateY(-2px);box-shadow:0 4px 12px rgba(59,130,246,.15);}
.tp-card.active{border-color:#1d4ed8;background:#eff6ff;}
.tp-svg-area{height:70px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;}
.tp-svg{width:100%;height:70px;}
.tp-name{font-size:.65rem;font-weight:700;color:#1e293b;margin-bottom:2px;line-height:1.2;}
.tp-desc{font-size:.58rem;color:#64748b;margin-bottom:4px;line-height:1.3;}
.tp-tags{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;}
.tp-tag{font-size:.55rem;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;border-radius:4px;padding:1px 4px;font-weight:600;}
.tp-card.active .tp-tag{background:#dbeafe;color:#1d4ed8;border-color:#93c5fd;}
.tp-check{position:absolute;top:5px;right:6px;color:#1d4ed8;font-size:.8rem;font-weight:900;}
</style>
