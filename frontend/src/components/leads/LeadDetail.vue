<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-6 flex justify-between items-start">
        <div>
          <h2 class="text-2xl font-bold text-white">{{ lead.company }}</h2>
          <p class="text-blue-100 text-sm mt-1">{{ lead.contact_name }} • {{ lead.email }}</p>
        </div>
        <button
          @click="$emit('close')"
          class="text-blue-100 hover:text-white bg-blue-700/50 hover:bg-blue-700 rounded-lg p-2 w-10 h-10 flex items-center justify-center transition-all"
        >
          ×
        </button>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200 px-8 bg-gray-50">
        <div class="flex gap-8">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'py-4 px-1 text-sm font-semibold border-b-2 transition-all',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-8 py-6">
        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Info Card -->
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border border-blue-200">
              <h3 class="font-bold text-gray-900 mb-4">Lead Information</h3>
              <dl class="space-y-4">
                <div>
                  <dt class="text-gray-600 text-sm font-medium mb-1">Stage</dt>
                  <dd>
                    <select
                      v-model="editedLead.stage"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white font-medium text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="New">New</option>
                      <option value="Qualified">Qualified</option>
                      <option value="Discussion">Discussion</option>
                      <option value="Negotiation">Negotiation</option>
                      <option value="Won">Won</option>
                      <option value="Lost">Lost</option>
                    </select>
                  </dd>
                </div>
                <div>
                  <dt class="text-gray-600 text-sm font-medium mb-1">Lead Value</dt>
                  <dd class="text-3xl font-bold text-blue-600">${{ formatNumber(editedLead.value) }}</dd>
                </div>
                <div>
                  <dt class="text-gray-600 text-sm font-medium mb-2">Win Probability</dt>
                  <dd>
                    <div class="flex items-center gap-3">
                      <input
                        v-model.number="editedLead.probability"
                        type="range"
                        min="0"
                        max="100"
                        class="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span class="text-xl font-bold text-blue-600 w-12 text-right">{{ editedLead.probability }}%</span>
                    </div>
                  </dd>
                </div>
                <div>
                  <dt class="text-gray-600 text-sm font-medium mb-1">Source</dt>
                  <dd>
                    <span class="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-200 text-blue-900">
                      {{ editedLead.source }}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Contact Card -->
            <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-5 border border-green-200">
              <h3 class="font-bold text-gray-900 mb-4">Contact Details</h3>
              <dl class="space-y-4 text-sm">
                <div>
                  <dt class="text-gray-600 font-medium mb-1">Email</dt>
                  <dd>
                    <a :href="`mailto:${editedLead.email}`" class="text-blue-600 hover:text-blue-800 font-medium break-all">
                      {{ editedLead.email }}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt class="text-gray-600 font-medium mb-1">Phone</dt>
                  <dd>
                    <a :href="`tel:${editedLead.phone}`" class="text-gray-900 font-medium" v-if="editedLead.phone">
                      {{ editedLead.phone }}
                    </a>
                    <span v-else class="text-gray-500">Not provided</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-gray-600 font-medium mb-1">Company</dt>
                  <dd class="text-gray-900 font-medium">{{ editedLead.company }}</dd>
                </div>
                <div>
                  <dt class="text-gray-600 font-medium mb-1">Contact Person</dt>
                  <dd class="text-gray-900 font-medium">{{ editedLead.contact_name }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Expected Revenue -->
          <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
            <p class="text-blue-100 text-sm mb-2">Expected Revenue</p>
            <div class="flex items-baseline justify-between">
              <div class="text-2xl font-bold">
                ${{ formatNumber(editedLead.value) }} × {{ editedLead.probability }}% =
              </div>
              <div class="text-4xl font-bold text-blue-100">
                ${{ formatNumber(Math.round(editedLead.value * (editedLead.probability / 100))) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Activity Tab -->
        <div v-if="activeTab === 'activity'" class="space-y-4">
          <div class="space-y-4">
            <div class="flex gap-3 pb-4 border-b border-gray-200 last:border-b-0">
              <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg shrink-0 font-bold">
                🔔
              </div>
              <div>
                <p class="text-gray-900 font-medium"><span>Created</span> as new lead</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ formatDate(lead.created_at) }}</p>
              </div>
            </div>
            <div class="flex gap-3 pb-4 border-b border-gray-200 last:border-b-0">
              <div class="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 text-lg shrink-0 font-bold">
                📞
              </div>
              <div>
                <p class="text-gray-900 font-medium">Last contact attempt</p>
                <p class="text-xs text-gray-500 mt-0.5">3 days ago</p>
              </div>
            </div>
            <div class="flex gap-3">
              <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-lg shrink-0 font-bold">
                ✓
              </div>
              <div>
                <p class="text-gray-900 font-medium">Status updated to <span class="font-bold">{{ lead.stage }}</span></p>
                <p class="text-xs text-gray-500 mt-0.5">Yesterday at 10:34 AM</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Notes Tab -->
        <div v-if="activeTab === 'notes'" class="space-y-4">
          <textarea
            v-model="editedLead.notes"
            placeholder="Add notes about this lead..."
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            rows="8"
          ></textarea>
          <p class="text-xs text-gray-500">Last updated: Just now</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="border-t border-gray-200 px-8 py-4 bg-gray-50 flex justify-between items-center">
        <button
          @click="confirmDelete"
          class="px-4 py-2 text-red-600 hover:text-red-800 font-medium text-sm border border-red-300 rounded-lg hover:bg-red-50 transition-all"
        >
          Delete
        </button>
        <div class="flex gap-3">
          <button
            @click="$emit('close')"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium text-sm transition-all"
          >
            Close
          </button>
          <button
            @click="saveLead"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

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

const props = defineProps<{
  lead: Lead;
}>();

const emit = defineEmits<{
  close: [];
  update: [lead: Lead];
  delete: [id: number];
}>();

const activeTab = ref('overview');
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' }
];

const editedLead = reactive<Lead>({ ...props.lead });

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US').format(num);
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const saveLead = () => {
  emit('update', { ...editedLead });
};

const confirmDelete = () => {
  if (confirm(`Are you sure you want to delete the lead "${props.lead.company}"?`)) {
    emit('delete', props.lead.id);
  }
};
</script>
