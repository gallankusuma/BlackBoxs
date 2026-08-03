<template>
  <div class="min-h-screen bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Leads</h1>
          <p class="text-gray-500 mt-1">Sales Pipeline & Lead Management</p>
        </div>
        <div class="flex gap-3">
          <button
            @click="viewMode = 'list'"
            :class="[viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300']"
            class="px-4 py-2 rounded-lg font-medium hover:shadow-sm transition-all"
          >
            📋 List
          </button>
          <button
            @click="viewMode = 'kanban'"
            :class="[viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300']"
            class="px-4 py-2 rounded-lg font-medium hover:shadow-sm transition-all"
          >
            📊 Kanban
          </button>
          <button
            @click="openAddLeadModal"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <span>+</span> Add Lead
          </button>
        </div>
      </div>

      <!-- List View -->
      <div v-if="viewMode === 'list'" class="space-y-4">
        <!-- Filters -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex gap-3">
          <select v-model="filterStage" class="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">All Stages</option>
            <option value="New">New</option>
            <option value="Qualified">Qualified</option>
            <option value="Discussion">Discussion</option>
            <option value="Negotiation">Negotiation</option>
            <option value="Won">Won</option>
            <option value="Lost">Lost</option>
          </select>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search leads..."
            class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select v-model="sortBy" class="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="created">Newest First</option>
            <option value="value-high">Highest Value</option>
            <option value="value-low">Lowest Value</option>
            <option value="updated">Recently Updated</option>
          </select>
        </div>

        <!-- List Table -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Company</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Contact</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Email</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Stage</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Value</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Probability</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="lead in filteredLeads"
                :key="lead.id"
                class="hover:bg-blue-50 transition-colors cursor-pointer"
                @click="viewLead(lead)"
              >
                <td class="px-6 py-4">
                  <p class="font-medium text-gray-900">{{ lead.company }}</p>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600">{{ lead.contact_name }}</p>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600">{{ lead.email }}</p>
                </td>
                <td class="px-6 py-4">
                  <span
                    class="px-3 py-1 rounded-full text-xs font-semibold"
                    :class="getStageColor(lead.stage)"
                  >
                    {{ lead.stage }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <p class="font-medium text-gray-900">${{ formatNumber(lead.value) }}</p>
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <div class="w-12 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all"
                        :class="getProbabilityColor(lead.probability)"
                        :style="{ width: lead.probability + '%' }"
                      ></div>
                    </div>
                    <span class="text-xs font-semibold text-gray-600">{{ lead.probability }}%</span>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <button
                    @click.stop="viewLead(lead)"
                    class="text-blue-600 hover:text-blue-800 font-medium text-sm"
                  >
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="filteredLeads.length === 0" class="text-center py-8 text-gray-500">
            No leads found
          </div>
        </div>
      </div>

      <!-- Kanban View -->
      <div v-if="viewMode === 'kanban'" class="flex overflow-x-auto gap-4 pb-4">
        <div
          v-for="stage in stages"
          :key="stage"
          class="flex-shrink-0 w-80 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col max-h-[calc(100vh-200px)]"
        >
          <!-- Stage Header -->
          <div class="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <div class="flex justify-between items-center">
              <h3 class="font-semibold text-gray-800">{{ stage }}</h3>
              <span class="text-xs font-bold bg-white px-2 py-1 rounded-full text-gray-600">
                {{ getLeadsByStage(stage).length }}
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-1">
              Total: ${{ formatNumber(getTotalValueByStage(stage)) }}
            </p>
          </div>

          <!-- Lead Cards -->
          <div class="flex-1 overflow-y-auto p-3 space-y-3">
            <div
              v-for="lead in getLeadsByStage(stage)"
              :key="lead.id"
              @click="viewLead(lead)"
              class="bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
            >
              <!-- Header Row -->
              <div class="flex justify-between items-start mb-2">
                <p class="font-semibold text-gray-800 text-sm flex-1">{{ lead.company }}</p>
                <button
                  @click.stop="deleteLead(lead.id)"
                  class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>

              <!-- Contact -->
              <p class="text-xs text-gray-600 mb-2">{{ lead.contact_name }}</p>

              <!-- Value & Probability -->
              <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                <p class="text-sm font-bold text-gray-900">${{ formatNumber(lead.value) }}</p>
                <span class="text-xs font-semibold px-2 py-0.5 rounded" :class="getProbabilityBadge(lead.probability)">
                  {{ lead.probability }}%
                </span>
              </div>

              <!-- Source Badge -->
              <div class="flex gap-1">
                <span class="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                  {{ lead.source }}
                </span>
              </div>

              <!-- Due Date -->
              <p class="text-xs text-gray-500 mt-2">
                <span>📅 </span>{{ formatDate(lead.created_at) }}
              </p>
            </div>

            <!-- Empty State -->
            <div v-if="getLeadsByStage(stage).length === 0" class="text-center py-8 text-gray-400 text-xs italic">
              No leads
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Lead Modal -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-bold text-gray-900">Add New Lead</h3>
        </div>
        <div class="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <input
                v-model="newLead.company"
                type="text"
                placeholder="Company name"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
              <input
                v-model="newLead.contact_name"
                type="text"
                placeholder="Contact name"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                v-model="newLead.email"
                type="email"
                placeholder="email@company.com"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                v-model="newLead.phone"
                type="tel"
                placeholder="Phone number"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lead Value *</label>
              <input
                v-model="newLead.value"
                type="number"
                placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select v-model="newLead.stage" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="New">New</option>
                <option value="Qualified">Qualified</option>
                <option value="Discussion">Discussion</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Won">Won</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select v-model="newLead.source" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="Website">Website</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Referral">Referral</option>
                <option value="Cold Call">Cold Call</option>
                <option value="Email">Email</option>
                <option value="Event">Event</option>
              </select>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            @click="showAddModal = false"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="addNewLead"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Lead
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

interface Lead {
  id: number;
  company: string;
  contact_name: string;
  email: string;
  phone?: string;
  stage: string;
  value: number;
  probability: number;
  source: string;
  created_at: string;
  notes?: string;
}

const viewMode = ref<'list' | 'kanban'>('kanban');
const filterStage = ref('');
const searchQuery = ref('');
const sortBy = ref('created');
const showAddModal = ref(false);

const stages = ['New', 'Qualified', 'Discussion', 'Negotiation', 'Won', 'Lost'];

const newLead = ref({
  company: '',
  contact_name: '',
  email: '',
  phone: '',
  stage: 'New',
  value: 0,
  source: 'Website'
});

// Mock leads data
const leads = ref<Lead[]>([
  {
    id: 1,
    company: 'Sarah Cole',
    contact_name: 'Sarah Cole',
    email: 'sarah@example.com',
    phone: '555-1234',
    stage: 'New',
    value: 25000,
    probability: 10,
    source: 'Website',
    created_at: '2026-02-15'
  },
  {
    id: 2,
    company: 'Louie Ziemann',
    contact_name: 'Louie Ziemann',
    email: 'louie@example.com',
    phone: '555-5678',
    stage: 'Qualified',
    value: 35000,
    probability: 50,
    source: 'LinkedIn',
    created_at: '2026-02-10',
    notes: '50% Probably'
  },
  {
    id: 3,
    company: 'Gibson PLC',
    contact_name: 'Gibson Contact',
    email: 'gibson@example.com',
    stage: 'Discussion',
    value: 45000,
    probability: 90,
    source: 'Elsewhere',
    created_at: '2026-02-08',
    notes: '90% Probably'
  },
  {
    id: 4,
    company: 'Hegmann-Muller',
    contact_name: 'Hegmann Contact',
    email: 'hegmann@example.com',
    stage: 'Negotiation',
    value: 55000,
    probability: 75,
    source: 'Twitter',
    created_at: '2026-02-05',
    notes: 'Call this week'
  },
  {
    id: 5,
    company: 'Zachery Beahan',
    contact_name: 'Zachery Beahan',
    email: 'zachery@example.com',
    stage: 'Won',
    value: 65000,
    probability: 100,
    source: 'Google',
    created_at: '2026-01-25'
  },
  {
    id: 6,
    company: 'Cleveland Feil',
    contact_name: 'Cleveland Feil',
    email: 'cleveland@example.com',
    stage: 'Lost',
    value: 20000,
    probability: 0,
    source: 'Twitter',
    created_at: '2026-02-01'
  },
  {
    id: 7,
    company: 'Geraldine Reichel',
    contact_name: 'Geraldine Reichel',
    email: 'geraldine@example.com',
    stage: 'Qualified',
    value: 30000,
    probability: 50,
    source: 'Facebook',
    created_at: '2026-02-12',
    notes: '50% Probably'
  },
  {
    id: 8,
    company: 'Jada Hierow',
    contact_name: 'Jada Hierow',
    email: 'jada@example.com',
    stage: 'Discussion',
    value: 40000,
    probability: 90,
    source: 'Google',
    created_at: '2026-02-09',
    notes: '90% Probably'
  },
  {
    id: 9,
    company: 'Percival Witting',
    contact_name: 'Percival Witting',
    email: 'percival@example.com',
    stage: 'Discussion',
    value: 50000,
    probability: 90,
    source: 'Google',
    created_at: '2026-02-07',
    notes: '90% Probably'
  }
]);

const filteredLeads = computed(() => {
  let result = leads.value;

  if (filterStage.value) {
    result = result.filter(lead => lead.stage === filterStage.value);
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      lead =>
        lead.company.toLowerCase().includes(query) ||
        lead.contact_name.toLowerCase().includes(query) ||
        lead.email.toLowerCase().includes(query)
    );
  }

  if (sortBy.value === 'created') {
    result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sortBy.value === 'value-high') {
    result = [...result].sort((a, b) => b.value - a.value);
  } else if (sortBy.value === 'value-low') {
    result = [...result].sort((a, b) => a.value - b.value);
  }

  return result;
});

const getLeadsByStage = (stage: string) => {
  return leads.value.filter(lead => lead.stage === stage);
};

const getTotalValueByStage = (stage: string) => {
  return getLeadsByStage(stage).reduce((sum, lead) => sum + lead.value, 0);
};

const getStageColor = (stage: string) => {
  const colors: { [key: string]: string } = {
    New: 'bg-gray-100 text-gray-800',
    Qualified: 'bg-blue-100 text-blue-800',
    Discussion: 'bg-cyan-100 text-cyan-800',
    Negotiation: 'bg-purple-100 text-purple-800',
    Won: 'bg-green-100 text-green-800',
    Lost: 'bg-red-100 text-red-800'
  };
  return colors[stage] || 'bg-gray-100 text-gray-800';
};

const getProbabilityColor = (probability: number) => {
  if (probability >= 80) return 'bg-green-500';
  if (probability >= 50) return 'bg-yellow-500';
  if (probability >= 20) return 'bg-orange-500';
  return 'bg-red-500';
};

const getProbabilityBadge = (probability: number) => {
  if (probability >= 80) return 'bg-green-100 text-green-800';
  if (probability >= 50) return 'bg-yellow-100 text-yellow-800';
  if (probability >= 20) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US').format(num);
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const viewLead = (lead: Lead) => {
  router.push(`/leads/${lead.id}`);
};

const openAddLeadModal = () => {
  showAddModal.value = true;
};

const addNewLead = () => {
  const newId = Math.max(...leads.value.map(l => l.id), 0) + 1;
  leads.value.push({
    id: newId,
    ...newLead.value,
    value: Number(newLead.value.value),
    probability: newLead.value.stage === 'Won' ? 100 : newLead.value.stage === 'Lost' ? 0 : 50,
    created_at: new Date().toISOString().split('T')[0]
  });
  showAddModal.value = false;
  newLead.value = {
    company: '',
    contact_name: '',
    email: '',
    phone: '',
    stage: 'New',
    value: 0,
    source: 'Website'
  };
};

const deleteLead = (id: number) => {
  leads.value = leads.value.filter(l => l.id !== id);
};
</script>

<style scoped>
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
