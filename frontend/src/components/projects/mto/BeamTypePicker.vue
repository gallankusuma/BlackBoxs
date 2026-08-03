<template>
  <div class="tp-wrap">
    <div class="tp-label">Pilih Tipe Balok / Struktur Horizontal</div>
    <div class="tp-grid">
      <button v-for="opt in OPTIONS" :key="opt.id"
        @click="$emit('update:modelValue', opt.id)"
        class="tp-card" :class="{ active: modelValue === opt.id }">
        <div class="tp-svg-area">
          <!-- Balok Beton -->
          <svg v-if="opt.id==='beton'" viewBox="0 0 100 60" class="tp-svg">
            <rect x="5" y="15" width="90" height="30" fill="#94a3b8" rx="2"/>
            <rect x="8" y="18" width="84" height="24" fill="#cbd5e1" rx="1"/>
            <line x1="12" y1="18" x2="12" y2="42" stroke="#475569" stroke-width="1.2"/>
            <line x1="20" y1="18" x2="20" y2="42" stroke="#475569" stroke-width="1.2"/>
            <line x1="80" y1="18" x2="80" y2="42" stroke="#475569" stroke-width="1.2"/>
            <line x1="88" y1="18" x2="88" y2="42" stroke="#475569" stroke-width="1.2"/>
            <line x1="8" y1="25" x2="92" y2="25" stroke="#64748b" stroke-width="1.5"/>
            <line x1="8" y1="35" x2="92" y2="35" stroke="#64748b" stroke-width="1.5"/>
            <text x="50" y="57" text-anchor="middle" font-size="7" fill="#475569">Balok Beton B×H</text>
          </svg>
          <!-- Balok WF -->
          <svg v-else-if="opt.id==='wf'" viewBox="0 0 100 60" class="tp-svg">
            <rect x="5" y="10" width="90" height="8" fill="#475569" rx="1"/>
            <rect x="5" y="42" width="90" height="8" fill="#475569" rx="1"/>
            <rect x="44" y="18" width="12" height="24" fill="#64748b" rx="1"/>
            <text x="50" y="57" text-anchor="middle" font-size="7" fill="#475569">Profil WF / IPE</text>
          </svg>
          <!-- Balok Kanal / C -->
          <svg v-else-if="opt.id==='kanal'" viewBox="0 0 100 60" class="tp-svg">
            <rect x="10" y="10" width="10" height="40" fill="#475569" rx="1"/>
            <rect x="10" y="10" width="50" height="8" fill="#475569" rx="1"/>
            <rect x="10" y="42" width="50" height="8" fill="#475569" rx="1"/>
            <text x="50" y="57" text-anchor="middle" font-size="7" fill="#475569">Kanal C / U</text>
          </svg>
          <!-- Balok Kayu -->
          <svg v-else viewBox="0 0 100 60" class="tp-svg">
            <rect x="5" y="15" width="90" height="28" fill="#a16207" rx="2"/>
            <line x1="5" y1="25" x2="95" y2="25" stroke="#92400e" stroke-width="1" opacity="0.5"/>
            <line x1="5" y1="33" x2="95" y2="33" stroke="#92400e" stroke-width="1" opacity="0.5"/>
            <text x="50" y="57" text-anchor="middle" font-size="7" fill="#475569">Balok Kayu</text>
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
  { id:'beton',  label:'Balok Beton Bertulang', desc:'Balok induk & ring balok beton konvensional', tags:['Beton','Konvensional'] },
  { id:'wf',     label:'Balok Profil Baja WF',  desc:'Wide Flange / IPE untuk struktur baja', tags:['Baja','Efisien'] },
  { id:'kanal',  label:'Balok Baja Kanal C/U',  desc:'Kanal C atau U untuk ring beam / purlin', tags:['Ringan','Ekonomis'] },
  { id:'kayu',   label:'Balok Kayu',            desc:'Balok kayu solid atau laminasi (LVL)', tags:['Kayu','Tradisional'] },
];
</script>
<style scoped>
.tp-wrap{margin-bottom:14px;}
.tp-label{font-size:.72rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;}
.tp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
@media(max-width:800px){.tp-grid{grid-template-columns:repeat(2,1fr);}}
.tp-card{position:relative;border:2px solid #e5e7eb;border-radius:10px;padding:8px;background:white;cursor:pointer;text-align:center;transition:all .2s;}
.tp-card:hover{border-color:#8b5cf6;transform:translateY(-2px);}
.tp-card.active{border-color:#7c3aed;background:#f5f3ff;}
.tp-svg-area{height:60px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;}
.tp-svg{width:100%;height:60px;}
.tp-name{font-size:.65rem;font-weight:700;color:#1e293b;margin-bottom:2px;line-height:1.2;}
.tp-desc{font-size:.58rem;color:#64748b;margin-bottom:4px;line-height:1.3;}
.tp-tags{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;}
.tp-tag{font-size:.55rem;background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe;border-radius:4px;padding:1px 4px;font-weight:600;}
.tp-card.active .tp-tag{background:#ede9fe;color:#7c3aed;}
.tp-check{position:absolute;top:5px;right:6px;color:#7c3aed;font-size:.8rem;font-weight:900;}
</style>
