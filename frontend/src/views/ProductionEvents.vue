<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-800">📅 Event Calendar</h1>
      <p class="text-gray-600">
        The personal calendar gives you a clear view of your schedule and helps you stay organized. You can add important events,
        view team members’ leave dates, and keep track of project and task start and end dates—all in one place. The calendar can be shared
        with team members and clients, making collaboration smoother.
      </p>
      <div class="mt-4 flex flex-wrap gap-2 text-xs">
        <span class="px-3 py-1 rounded-full bg-blue-100 text-blue-700">Important events</span>
        <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">Team leave dates</span>
        <span class="px-3 py-1 rounded-full bg-purple-100 text-purple-700">Project & task timelines</span>
        <span class="px-3 py-1 rounded-full bg-amber-100 text-amber-700">Shareable calendar</span>
      </div>
    </div>

    <!-- Calendar View -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex items-center gap-2">
          <button @click="goPrev" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">←</button>
          <button @click="goNext" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">→</button>
          <button @click="goToday" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">today</button>
        </div>
        <h2 class="text-xl font-bold text-gray-800">{{ monthLabel }}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="filterType" class="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Event type</option>
            <option value="production">Production</option>
            <option value="maintenance">Maintenance</option>
            <option value="qc">QC</option>
            <option value="shipment">Shipment</option>
            <option value="meeting">Meeting</option>
            <option value="other">Other</option>
          </select>
          <button class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Manage labels</button>
          <button @click="showAddEventModal = true" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            + Add event
          </button>
        </div>
      </div>

      <!-- Calendar Grid -->
      <div class="grid grid-cols-7 text-xs text-gray-500 mb-2">
        <div v-for="day in weekDays" :key="day" class="py-2 text-center font-semibold">{{ day }}</div>
      </div>
      <div class="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
        <div
          v-for="cell in calendarCells"
          :key="cell.key"
          class="bg-white min-h-[110px] p-2 text-sm"
          :class="cell.isCurrentMonth ? 'text-gray-800' : 'text-gray-400'"
        >
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs font-medium">{{ cell.day }}</span>
            <span v-if="cell.isToday" class="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">today</span>
          </div>
          <div class="space-y-1">
            <button
              v-for="ev in cell.events"
              :key="ev.id"
              class="w-full text-left text-xs px-2 py-1 rounded-md truncate"
              :class="eventPillClass(ev.type)"
              @click="editEvent(ev)"
              title="Click to edit"
            >
              {{ ev.title }}
            </button>
            <div v-if="cell.events.length === 0" class="text-[11px] text-gray-300">&nbsp;</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Event Modal -->
    <div v-if="showAddEventModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showAddEventModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div class="p-6">
          <h2 class="text-2xl font-bold mb-4">{{ editingEvent ? '✏️ Edit Event' : '➕ Add Event' }}</h2>
          
          <form @submit.prevent="saveEvent" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
              <select v-model="eventForm.type" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
                <option value="production">Production Schedule</option>
                <option value="maintenance">Maintenance</option>
                <option value="qc">QC Inspection</option>
                <option value="shipment">Shipment</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input v-model="eventForm.title" type="text" required class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Event title...">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea v-model="eventForm.description" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Event details..."></textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input v-model="eventForm.event_date" type="date" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input v-model="eventForm.event_time" type="time" class="w-full border border-gray-300 rounded-lg px-3 py-2">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input v-model="eventForm.location" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Event location...">
            </div>

            <div class="flex justify-end space-x-2 pt-4">
              <button type="button" @click="cancelEdit" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                💾 Save Event
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { api } from '@/lib/api';

interface Event {
  id: number;
  type: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  location: string;
}

const events = ref<Event[]>([]);
const currentDate = ref(new Date());
const filterType = ref('');
const showAddEventModal = ref(false);
const editingEvent = ref<Event | null>(null);
const eventForm = ref({
  type: 'production',
  title: '',
  description: '',
  event_date: new Date().toISOString().split('T')[0],
  event_time: '09:00',
  location: ''
});

const loadEvents = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[LOAD] No authentication token found');
      return;
    }
    
    console.log('[LOAD] Fetching events from API...');
    const response = await api.get('/production/events');
    console.log('[LOAD] API Response status:', response.status);
    console.log('[LOAD] Raw response.data:', response.data);
    
    // Handle both array and object responses
    const eventData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    // Validate and log each event
    eventData.forEach((e: any) => {
      console.log('[LOAD] Event from API:', {
        id: e.id,
        title: e.title,
        date: e.event_date,
        type: e.type,
        time: e.event_time
      });
    });
    
    events.value = eventData;
    
    console.log('[LOAD] Events assigned to ref. Total:', events.value.length);
  } catch (error: any) {
    console.error('[LOAD] Failed to load events:', error);
    const errorMessage = error.response?.data?.error || error.message;
    console.error('[LOAD] Error details:', errorMessage);
  }
};

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

const filteredEvents = computed(() => {
  console.log('[DEBUG Filter] All events:', events.value);
  console.log('[DEBUG Filter] Current filter type:', filterType.value);
  
  const result = !filterType.value 
    ? events.value 
    : events.value.filter(e => e.type === filterType.value);
  
  console.log('[DEBUG Filter] Filtered result count:', result.length);
  return result;
});

const calendarCells = computed(() => {
  const date = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth(), 1);
  const startDay = date.getDay();
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - startDay);

  const cells = [] as Array<{
    key: string;
    day: number;
    date: string;
    isCurrentMonth: boolean;
    isToday: boolean;
    events: Event[];
  }>;

  const todayStr = new Date().toISOString().slice(0, 10);
  
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const isoDate = cellDate.toISOString().slice(0, 10);
    const isCurrentMonth = cellDate.getMonth() === currentDate.value.getMonth();
    const isToday = isoDate === todayStr;
    const day = cellDate.getDate();
    
    // Debug: log event_date values from database
    const cellEvents = filteredEvents.value.filter(e => {
      const match = e.event_date === isoDate;
      if (!match && filteredEvents.value.length > 0) {
        console.log(`[MATCH CHECK] Comparing "${e.event_date}" === "${isoDate}" => ${match}`);
      }
      return match;
    });
    
    // Log cells that have events
    if (cellEvents.length > 0) {
      console.log(`[CALENDAR] Cell ${isoDate} has ${cellEvents.length} event(s):`, cellEvents.map(e => e.title));
    }

    cells.push({
      key: isoDate,
      day,
      date: isoDate,
      isCurrentMonth,
      isToday,
      events: cellEvents,
    });
  }

  const cellsWithEvents = cells.filter(c => c.events.length > 0);
  if (cellsWithEvents.length > 0) {
    console.log(`[CALENDAR] Total cells with events: ${cellsWithEvents.length}`);
  } else if (filteredEvents.value.length > 0) {
    console.log('[CALENDAR] WARNING: Events exist but no calendar cells matched them!');
    console.log('[CALENDAR] Events:', filteredEvents.value.map(e => `${e.title} (${e.event_date})`));
  }
  
  return cells;
});

const goPrev = () => {
  const d = new Date(currentDate.value);
  d.setMonth(d.getMonth() - 1);
  currentDate.value = d;
};

const goNext = () => {
  const d = new Date(currentDate.value);
  d.setMonth(d.getMonth() + 1);
  currentDate.value = d;
};

const goToday = () => {
  currentDate.value = new Date();
};

const saveEvent = async () => {
  try {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please login first');
      return;
    }

    console.log('[SAVE] Starting to save event...');
    console.log('[SAVE] Form data:', eventForm.value);
    
    if (editingEvent.value) {
      console.log('[SAVE] Updating event ID:', editingEvent.value.id);
      const response = await api.put(`/production/events/${editingEvent.value.id}`, eventForm.value);
      console.log('[SAVE] Update response:', response.data);
      alert('✅ Event updated successfully!');
    } else {
      console.log('[SAVE] Creating new event');
      const response = await api.post('/production/events', eventForm.value);
      console.log('[SAVE] Create response:', response.data);
      alert('✅ Event created successfully!');
    }
    
    // Close modal and reset form BEFORE loading
    showAddEventModal.value = false;
    editingEvent.value = null;
    resetForm();
    
    // Wait a tiny bit to ensure backend has committed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reload events from database
    console.log('[SAVE] Reloading events from database...');
    await loadEvents();
    
    console.log('[SAVE] Complete! Current events:', events.value);
  } catch (error: any) {
    console.error('[SAVE] Error occurred:', error);
    const errorMessage = error.response?.data?.error || error.message || 'Failed to save event';
    console.error('[SAVE] Error message:', errorMessage);
    alert(`❌ Error: ${errorMessage}`);
  }
};

const editEvent = (event: Event) => {
  editingEvent.value = event;
  eventForm.value = { ...event };
  showAddEventModal.value = true;
};



const cancelEdit = () => {
  showAddEventModal.value = false;
  editingEvent.value = null;
  resetForm();
};

const resetForm = () => {
  eventForm.value = {
    type: 'production',
    title: '',
    description: '',
    event_date: new Date().toISOString().split('T')[0],
    event_time: '09:00',
    location: ''
  };
};





const eventPillClass = (type: string) => {
  const classes: Record<string, string> = {
    production: 'bg-blue-100 text-blue-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    qc: 'bg-green-100 text-green-800',
    shipment: 'bg-purple-100 text-purple-800',
    meeting: 'bg-indigo-100 text-indigo-800',
    other: 'bg-gray-100 text-gray-800'
  };
  return classes[type] || 'bg-gray-100 text-gray-800';
};



// Watch for events changes
watch(events, (newEvents) => {
  console.log('[WATCH] Events updated! New count:', newEvents.length);
  if (newEvents.length > 0) {
    newEvents.forEach((e, i) => {
      console.log(`  [${i}] ${e.title} on ${e.event_date}`);
    });
  }
});

// Watch filtered events changes
watch(filteredEvents, (newFiltered) => {
  console.log('[WATCH] Filtered events changed! New count:', newFiltered.length);
});

onMounted(() => {
  console.log('[MOUNTED] Component mounted, loading events...');
  loadEvents();
});
</script>
