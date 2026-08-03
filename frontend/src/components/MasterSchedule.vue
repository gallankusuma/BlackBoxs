<template>
  <div class="flex flex-col h-[calc(96vh-180px)]">
    <!-- Toolbar -->
    <div class="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-4 flex-shrink-0">
      <div class="flex items-center gap-3">
        <h3 class="font-semibold text-gray-800">📅 Master Schedule (Gantt Chart)</h3>
        <span class="text-xs text-gray-500">{{ items.length }} work packages</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 text-sm">
          <label class="text-gray-600">Start Date:</label>
          <input v-model="projectStart" type="date" class="border rounded px-2 py-1 text-sm">
        </div>
        <div class="flex items-center gap-2 text-sm">
          <label class="text-gray-600">Zoom:</label>
          <select v-model="zoom" class="border rounded px-2 py-1 text-sm">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
        <button @click="autoSchedule" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
          ⚡ Auto Schedule
        </button>
        <button @click="resetSchedule" class="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100">
          🔄 Reset
        </button>
      </div>
    </div>

    <!-- Gantt Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Panel: Task List -->
      <div class="w-[420px] border-r flex-shrink-0 overflow-y-auto bg-white">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th class="px-2 py-2 text-left w-8 text-xs">#</th>
              <th class="px-2 py-2 text-left text-xs">Work Package</th>
              <th class="px-2 py-2 text-center w-20 text-xs">Duration</th>
              <th class="px-2 py-2 text-center w-20 text-xs">Start</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in localItems" :key="item.id" class="border-b hover:bg-blue-50 h-[40px]"
              :class="selectedItem === i ? 'bg-blue-50' : ''"
              @click="selectedItem = i">
              <td class="px-2 py-1 text-gray-400 text-xs">{{ i + 1 }}</td>
              <td class="px-2 py-1">
                <div class="truncate max-w-[240px] text-gray-800 text-xs font-medium" :title="item.name">{{ item.name }}</div>
                <div class="text-[10px] text-gray-400">{{ item.discipline }} / {{ item.sub_discipline }}</div>
              </td>
              <td class="px-2 py-1 text-center">
                <input v-model.number="item.duration_days" type="number" min="1" max="365"
                  class="w-14 text-center border rounded px-1 py-0.5 text-xs" @change="emitUpdate">
                <span class="text-[10px] text-gray-400 ml-0.5">d</span>
              </td>
              <td class="px-2 py-1 text-center">
                <input v-model.number="item.start_offset" type="number" min="0" max="730"
                  class="w-14 text-center border rounded px-1 py-0.5 text-xs" @change="emitUpdate">
                <span class="text-[10px] text-gray-400 ml-0.5">d</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Right Panel: Gantt Canvas -->
      <div class="flex-1 overflow-auto" ref="ganttScrollRef">
        <div class="relative" :style="{ width: canvasWidth + 'px', minHeight: '100%' }">
          <!-- Timeline Header -->
          <div class="sticky top-0 z-10 bg-white border-b h-[36px] flex">
            <div v-for="col in timelineCols" :key="col.key" 
              class="border-r flex-shrink-0 flex items-center justify-center text-[10px] text-gray-500 font-medium"
              :style="{ width: colWidth + 'px' }"
              :class="col.isWeekend ? 'bg-gray-50' : ''">
              {{ col.label }}
            </div>
          </div>

          <!-- Task Bars -->
          <div v-for="(item, i) in localItems" :key="item.id" class="relative h-[40px] border-b"
            :class="selectedItem === i ? 'bg-blue-50/50' : ''">
            <!-- Weekend stripes -->
            <template v-for="col in timelineCols" :key="'bg-'+col.key">
              <div v-if="col.isWeekend" class="absolute top-0 bottom-0 bg-gray-50/70"
                :style="{ left: col.index * colWidth + 'px', width: colWidth + 'px' }"></div>
            </template>
            <!-- Bar -->
            <div class="absolute top-[8px] h-[24px] rounded-md shadow-sm cursor-pointer flex items-center px-2 text-[10px] text-white font-medium overflow-hidden whitespace-nowrap"
              :class="barColor(item)"
              :style="{ left: item.start_offset * colWidth + 'px', width: Math.max(item.duration_days * colWidth, 20) + 'px' }"
              :title="`${item.name} (${item.duration_days}d, start day ${item.start_offset})`"
              @mousedown="startDrag(i, $event)">
              {{ item.duration_days > 3 || colWidth > 15 ? item.code : '' }}
            </div>
          </div>

          <!-- Today Line -->
          <div v-if="todayOffset >= 0" class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
            :style="{ left: todayOffset * colWidth + 'px' }">
            <div class="absolute -top-0 -left-2 bg-red-500 text-white text-[9px] px-1 rounded">Today</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Summary -->
    <div class="px-4 py-2 border-t bg-gray-50 flex items-center justify-between text-sm flex-shrink-0">
      <div class="flex gap-6 text-gray-600">
        <span>Project Start: <strong>{{ projectStart }}</strong></span>
        <span>Total Duration: <strong>{{ totalDuration }} days</strong> ({{ (totalDuration / 30).toFixed(1) }} months)</span>
        <span>End Date: <strong>{{ projectEndDate }}</strong></span>
      </div>
      <div class="flex gap-2">
        <span class="inline-flex items-center gap-1 text-xs"><span class="w-3 h-3 rounded bg-blue-500 inline-block"></span> Bidang Umum</span>
        <span class="inline-flex items-center gap-1 text-xs"><span class="w-3 h-3 rounded bg-emerald-500 inline-block"></span> Mekanikal</span>
        <span class="inline-flex items-center gap-1 text-xs"><span class="w-3 h-3 rounded bg-purple-500 inline-block"></span> Elektrikal</span>
        <span class="inline-flex items-center gap-1 text-xs"><span class="w-3 h-3 rounded bg-orange-500 inline-block"></span> Other</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const props = defineProps<{
  items: any[];
  proposalName: string;
}>();

const emit = defineEmits<{
  (e: 'update', items: any[]): void;
}>();

const projectStart = ref(new Date().toISOString().split('T')[0]);
const zoom = ref('week');
const selectedItem = ref(-1);
const ganttScrollRef = ref<HTMLElement | null>(null);

const localItems = ref<any[]>([]);

onMounted(() => {
  localItems.value = props.items.map(i => ({ ...i }));
});

// Watch for prop changes
import { watch } from 'vue';
watch(() => props.items, (newItems) => {
  if (newItems.length && !localItems.value.length) {
    localItems.value = newItems.map(i => ({ ...i }));
  }
}, { deep: true });

const colWidth = computed(() => {
  if (zoom.value === 'day') return 28;
  if (zoom.value === 'week') return 16;
  return 6;
});

const totalDuration = computed(() => {
  if (!localItems.value.length) return 0;
  return Math.max(...localItems.value.map(i => (i.start_offset || 0) + (i.duration_days || 7)));
});

const timelineCols = computed(() => {
  const cols: any[] = [];
  const days = Math.max(totalDuration.value + 30, 90);
  const start = new Date(projectStart.value);
  
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dow = date.getDay();
    
    let label = '';
    if (zoom.value === 'day') {
      label = `${date.getDate()}`;
    } else if (zoom.value === 'week') {
      if (dow === 1 || d === 0) label = `${date.getDate()}/${date.getMonth() + 1}`;
    } else {
      if (date.getDate() === 1 || d === 0) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        label = months[date.getMonth()];
      }
    }
    
    cols.push({
      key: d,
      index: d,
      label,
      isWeekend: dow === 0 || dow === 6,
      date,
    });
  }
  return cols;
});

const canvasWidth = computed(() => timelineCols.value.length * colWidth.value);

const todayOffset = computed(() => {
  const start = new Date(projectStart.value);
  const today = new Date();
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : -1;
});

const projectEndDate = computed(() => {
  const start = new Date(projectStart.value);
  start.setDate(start.getDate() + totalDuration.value);
  return start.toISOString().split('T')[0];
});

const barColor = (item: any) => {
  const d = (item.discipline || '').toLowerCase();
  if (d.includes('umum') || d.includes('sipil') || d.includes('arsitektur')) return 'bg-blue-500 hover:bg-blue-600';
  if (d.includes('mekanikal') || d.includes('plumbing')) return 'bg-emerald-500 hover:bg-emerald-600';
  if (d.includes('elektrikal') || d.includes('listrik')) return 'bg-purple-500 hover:bg-purple-600';
  return 'bg-orange-500 hover:bg-orange-600';
};

const autoSchedule = () => {
  let offset = 0;
  let lastDiscipline = '';
  
  for (const item of localItems.value) {
    // Items in the same discipline run in parallel (same start offset)
    // Different discipline starts after previous batch
    if (item.discipline !== lastDiscipline && lastDiscipline !== '') {
      const prevItems = localItems.value.filter(i => i.discipline === lastDiscipline);
      const maxEnd = Math.max(...prevItems.map(i => (i.start_offset || 0) + (i.duration_days || 7)));
      offset = maxEnd;
    }
    
    // Auto-estimate duration based on qty and cost
    if (!item.duration_days || item.duration_days === 0) {
      item.duration_days = Math.max(7, Math.ceil((item.cost || 0) / 5000000) * 7);
    }
    
    item.start_offset = offset;
    lastDiscipline = item.discipline;
  }
  
  // For items in the same discipline, stagger slightly
  const disciplineGroups = new Map<string, any[]>();
  for (const item of localItems.value) {
    const key = item.discipline || 'other';
    if (!disciplineGroups.has(key)) disciplineGroups.set(key, []);
    disciplineGroups.get(key)!.push(item);
  }
  
  for (const [, group] of disciplineGroups) {
    const baseOffset = group[0].start_offset;
    group.forEach((item: any, idx: number) => {
      item.start_offset = baseOffset + idx * 3; // stagger by 3 days within discipline
    });
  }
  
  emitUpdate();
};

const resetSchedule = () => {
  localItems.value.forEach(item => {
    item.start_offset = 0;
    item.duration_days = Math.max(7, Math.ceil(item.qty / 10) * 7);
  });
  emitUpdate();
};

const emitUpdate = () => {
  emit('update', [...localItems.value]);
};

// Drag to move bars
let dragIdx = -1;
let dragStartX = 0;
let dragOrigOffset = 0;

const startDrag = (idx: number, event: MouseEvent) => {
  dragIdx = idx;
  dragStartX = event.clientX;
  dragOrigOffset = localItems.value[idx].start_offset || 0;
  selectedItem.value = idx;
  
  const onMove = (e: MouseEvent) => {
    const dx = e.clientX - dragStartX;
    const dayDelta = Math.round(dx / colWidth.value);
    localItems.value[dragIdx].start_offset = Math.max(0, dragOrigOffset + dayDelta);
  };
  
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    emitUpdate();
    dragIdx = -1;
  };
  
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};
</script>
