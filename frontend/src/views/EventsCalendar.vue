<template>
  <div class="h-screen bg-gray-50 flex flex-col">
    <!-- Compact Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <!-- Left: Title and Navigation -->
        <div class="flex items-center gap-4">
          <h1 class="text-xl font-semibold text-gray-700">Event Calendar</h1>
          <div class="flex items-center gap-2">
            <button @click="goPrev" class="p-1.5 rounded hover:bg-gray-100 text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button @click="goNext" class="p-1.5 rounded hover:bg-gray-100 text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button @click="goToday" class="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
              today
            </button>
          </div>
        </div>

        <!-- Right: Controls -->
        <div class="flex items-center gap-3">
          <select v-model="selectedEventType" class="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Event Types</option>
            <option v-for="type in eventTypes" :key="type.id" :value="type.name">
              {{ type.name }}
            </option>
          </select>

          <button class="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center gap-1">
            📊 Stats
          </button>

          <button @click="showAddEventModal = true" class="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Event
          </button>
        </div>
      </div>

      <!-- Month Label and View Tabs -->
      <div class="flex items-center justify-between mt-4">
        <h2 class="text-2xl font-semibold text-gray-800">{{ monthLabel }}</h2>
        <div class="flex gap-2">
          <button @click="viewMode = 'month'" :class="viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'" class="px-4 py-1.5 rounded text-sm font-medium">
            month
          </button>
          <button @click="viewMode = 'week'" :class="viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'" class="px-4 py-1.5 rounded text-sm font-medium">
            week
          </button>
          <button @click="viewMode = 'day'" :class="viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'" class="px-4 py-1.5 rounded text-sm font-medium">
            day
          </button>
          <button @click="viewMode = 'list'" :class="viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'" class="px-4 py-1.5 rounded text-sm font-medium">
            list
          </button>
        </div>
      </div>
    </div>

      <!-- Calendar Content - Full Width -->
      <div class="flex-1 overflow-auto bg-white">
        <!-- Month View -->
        <div v-if="viewMode === 'month'" class="h-full">
          <!-- Weekday Headers -->
          <div class="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            <div v-for="day in weekDays" :key="day" class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
              {{ day }}
            </div>
          </div>

          <!-- Calendar Grid -->
          <div class="grid grid-cols-7 auto-rows-auto min-h-[calc(100vh-180px)]">
            <div
              v-for="cell in calendarCells"
              :key="cell.key"
              class="border-r border-b border-gray-200 p-2 min-h-[120px] hover:bg-gray-50 transition-colors"
              :class="cell.isCurrentMonth ? 'bg-white' : 'bg-gray-50'"
            >
              <div class="flex items-start justify-between mb-1">
                <span class="text-sm font-medium" :class="cell.isToday ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center' : (cell.isCurrentMonth ? 'text-gray-700' : 'text-gray-400')">
                  {{ cell.day }}
                </span>
              </div>
              <div class="space-y-1">
                <button
                  v-for="ev in cell.events"
                  :key="ev.id"
                  @click="editEvent(ev)"
                  class="w-full text-left text-xs px-2 py-1 rounded font-medium truncate transition-shadow hover:shadow-md block mb-1"
                  :class="getEventColor(ev.event_type)"
                  :title="ev.title"
                >
                   {{ ev.title }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- List View -->
        <div v-else-if="viewMode === 'list'" class="h-full overflow-auto">
          <table class="w-full">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr class="border-b border-gray-200">
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Time</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Title</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Client</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Contact</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="event in filteredAndSortedEvents" :key="event.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{{ formatDate(event.event_date) }}</td>
                <td class="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{{ event.event_time || '09:00' }}</td>
                <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ event.title }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="`px-2 py-1 rounded-full text-xs font-medium ${getEventBadgeColor(event.event_type)}`">
                    {{ event.event_type }}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600">{{ event.client_name || '-' }}</td>
                <td class="px-6 py-4 text-sm text-gray-600">{{ event.contact_name || '-' }}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap space-x-3">
                  <button @click="editEvent(event)" class="text-blue-600 hover:text-blue-700 text-sm font-medium">Edit</button>
                  <button @click="deleteEvent(event.id)" class="text-red-600 hover:text-red-700 text-sm font-medium">Delete</button>
                </td>
              </tr>
              <tr v-if="filteredAndSortedEvents.length === 0">
                <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                  No events found
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Week/Day Views Placeholder -->
        <div v-else class="h-full flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p class="text-lg">{{ viewMode === 'week' ? 'Week' : 'Day' }} view coming soon...</p>
          </div>
        </div>
      </div>


    <!-- Add/Edit Event Modal -->
    <div v-if="showAddEventModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showAddEventModal = false">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div class="p-6 border-b border-gray-200">
          <h2 class="text-2xl font-bold">{{ editingEvent ? '✏️ Edit Event' : '➕ Add Event' }}</h2>
        </div>
        
        <form @submit.prevent="saveEvent" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
              <select v-model="eventForm.event_type" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
                <option value="">-- Select Event Type --</option>
                <option v-for="type in eventTypes" :key="type.id" :value="type.name">
                  {{ type.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input v-model="eventForm.event_date" type="date" required class="w-full border border-gray-300 rounded-lg px-3 py-2">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input v-model="eventForm.event_time" type="time" class="w-full border border-gray-300 rounded-lg px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select v-model="eventForm.client_id" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                <option :value="null">-- Select Client --</option>
                <option v-for="client in clients" :key="client.id" :value="client.id">
                  {{ client.name }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input v-model="eventForm.title" type="text" required class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Event title...">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="eventForm.description" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Event description..."></textarea>
          </div>

          <div class="flex gap-3 justify-end mt-6">
            <button type="button" @click="cancelEdit" class="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium">
              Cancel
            </button>
            <button type="submit" class="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
              {{ editingEvent ? '💾 Update' : '➕ Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '@/lib/api';

interface ClientEvent {
  id: number;
  client_id: number | null;
  contact_id: number | null;
  event_date: string;
  event_time: string;
  title: string;
  description: string;
  event_type: string;
  client_name?: string;
  contact_name?: string;
}

interface EventType {
  id: number;
  name: string;
  color?: string;
}

interface Client {
  id: number;
  name: string;
  code: string;
}

const events = ref<ClientEvent[]>([]);
const eventTypes = ref<EventType[]>([]);
const clients = ref<Client[]>([]);
const currentDate = ref(new Date());
const viewMode = ref<'month' | 'week' | 'day' | 'list'>('month');
const selectedEventType = ref('');
const showAddEventModal = ref(false);
const editingEvent = ref<ClientEvent | null>(null);

const eventForm = ref({
  event_type: '',
  title: '',
  description: '',
  event_date: new Date().toISOString().split('T')[0],
  event_time: '09:00',
  client_id: null as number | null
});

const loadEventTypes = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const response = await api.get('/clients/event-types/all', {
      headers: { Authorization: `Bearer ${token}` }
    });
    eventTypes.value = Array.isArray(response.data) ? response.data : (response.data?.data || []);
  } catch (error: any) {
    console.error('Failed to load event types:', error);
  }
};

const loadClients = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    // Check if response.data is the array or response.data.data
    const response = await api.get('/clients?limit=1000', {
      headers: { Authorization: `Bearer ${token}` }
    });
    // ClientsManagement says response.data.data
    const data = response.data?.data || response.data || [];
    clients.value = Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error('Failed to load clients:', error);
  }
};

const loadEvents = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const response = await api.get('/clients/events/all', {
      headers: { Authorization: `Bearer ${token}` }
    });
    let eventData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    // Normalize event dates to YYYY-MM-DD format
    eventData = eventData.map((event: any) => ({
      ...event,
      event_date: event.event_date ? event.event_date.split('T')[0] : event.event_date
    }));
    
    events.value = eventData;
  } catch (error: any) {
    console.error('Failed to load events:', error);
  }
};

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

const filteredAndSortedEvents = computed(() => {
  let result = events.value;
  
  // Apply event type filter
  if (selectedEventType.value) {
    result = result.filter(e => e.event_type === selectedEventType.value);
  }
  
  // Sort by date and time
  return [...result].sort((a, b) => 
    new Date(`${a.event_date}T${a.event_time || '00:00'}`).getTime() - 
    new Date(`${b.event_date}T${b.event_time || '00:00'}`).getTime()
  );
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
    events: ClientEvent[];
  }>;

  const todayStr = new Date().toISOString().slice(0, 10);
  let filterResults = events.value;
  if (selectedEventType.value) {
    filterResults = filterResults.filter(e => e.event_type === selectedEventType.value);
  }
  
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const isoDate = cellDate.toISOString().slice(0, 10);
    const isCurrentMonth = cellDate.getMonth() === currentDate.value.getMonth();
    const isToday = isoDate === todayStr;
    const day = cellDate.getDate();
    
    const cellEvents = filterResults.filter(e => e.event_date === isoDate);

    cells.push({
      key: isoDate,
      day,
      date: isoDate,
      isCurrentMonth,
      isToday,
      events: cellEvents,
    });
  }

  return cells;
});

const getEventColor = (eventType: string) => {
  const eventTypeObj = eventTypes.value.find(t => t.name === eventType);
  if (eventTypeObj?.color) return eventTypeObj.color;
  
  const colors: Record<string, string> = {
    'Events': 'bg-blue-500 text-white shadow-sm',
    'Leave': 'bg-purple-500 text-white shadow-sm',
    'Task dates': 'bg-orange-500 text-white shadow-sm',
    'Project dates': 'bg-green-500 text-white shadow-sm',
    'Meeting': 'bg-pink-500 text-white shadow-sm',
    'Call': 'bg-red-500 text-white shadow-sm',
    'Follow-up': 'bg-cyan-500 text-white shadow-sm'
  };
  return colors[eventType] || 'bg-gray-400 text-white shadow-sm';
};

const getEventBadgeColor = (eventType: string) => {
  const eventTypeObj = eventTypes.value.find(t => t.name === eventType);
  if (eventTypeObj?.color) return eventTypeObj.color;
  
  const colors: Record<string, string> = {
    'Events': 'bg-blue-100 text-blue-700',
    'Leave': 'bg-purple-100 text-purple-700',
    'Task dates': 'bg-orange-100 text-orange-700',
    'Project dates': 'bg-green-100 text-green-700',
    'Meeting': 'bg-pink-100 text-pink-700',
    'Call': 'bg-red-100 text-red-700',
    'Follow-up': 'bg-cyan-100 text-cyan-700'
  };
  return colors[eventType] || 'bg-gray-100 text-gray-700';
};

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
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please login first');
      return;
    }
    
    const payload = {
      client_id: eventForm.value.client_id,
      event_type: eventForm.value.event_type,
      event_date: eventForm.value.event_date,
      event_time: eventForm.value.event_time,
      title: eventForm.value.title,
      description: eventForm.value.description
    };
    
    if (editingEvent.value) {
      await api.put(`/clients/events/${editingEvent.value.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('✅ Event updated successfully!');
    } else {
      await api.post('/clients/events', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('✅ Event created successfully!');
    }
    
    showAddEventModal.value = false;
    editingEvent.value = null;
    resetForm();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await loadEvents();
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || error.message || 'Failed to save event';
    alert(`❌ Error: ${errorMessage}`);
  }
};

const editEvent = (event: ClientEvent) => {
  editingEvent.value = event;
  eventForm.value = {
    event_type: event.event_type,
    title: event.title,
    description: event.description,
    event_date: event.event_date,
    event_time: event.event_time || '09:00',
    client_id: event.client_id || null
  };
  showAddEventModal.value = true;
};

const deleteEvent = async (id: number) => {
  if (confirm('Delete this event?')) {
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/clients/events/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadEvents();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  }
};

const cancelEdit = () => {
  showAddEventModal.value = false;
  editingEvent.value = null;
  resetForm();
};

const resetForm = () => {
  eventForm.value = {
    event_type: '',
    title: '',
    description: '',
    event_date: new Date().toISOString().split('T')[0],
    event_time: '09:00',
    client_id: null
  };
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
};

onMounted(() => {
  loadEventTypes();
  loadClients();
  loadEvents();
});
</script>
