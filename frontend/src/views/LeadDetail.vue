<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 sticky top-0 z-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-3xl font-bold text-gray-900">{{ lead.company }}</h1>
            <p class="text-gray-500 mt-1">{{ lead.contact_name }} • {{ lead.email }}</p>
          </div>
          <button
            @click="goBack"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ← Back
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-6 border-b border-gray-200">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'pb-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <!-- Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="text-sm text-gray-600 mb-2">Lead Stage</div>
            <div class="text-2xl font-bold text-gray-900">{{ lead.stage }}</div>
          </div>
          <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="text-sm text-gray-600 mb-2">Lead Value</div>
            <div class="text-2xl font-bold text-blue-600">${{ formatNumber(lead.value) }}</div>
          </div>
          <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="text-sm text-gray-600 mb-2">Win Probability</div>
            <div class="text-2xl font-bold text-gray-900">{{ lead.probability }}%</div>
          </div>
          <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="text-sm text-gray-600 mb-2">Expected Value</div>
            <div class="text-2xl font-bold text-green-600">
              ${{ formatNumber(Math.round(lead.value * (lead.probability / 100))) }}
            </div>
          </div>
        </div>

        <!-- Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <!-- Lead Info -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="font-bold text-gray-900 mb-4">Lead Information</h3>
              <dl class="grid grid-cols-2 gap-6">
                <div>
                  <dt class="text-sm text-gray-600 mb-1">Stage</dt>
                  <dd class="text-base font-semibold text-gray-900">{{ lead.stage }}</dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-600 mb-1">Source</dt>
                  <dd>
                    <span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {{ lead.source }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-600 mb-1">Created Date</dt>
                  <dd class="text-base font-semibold text-gray-900">{{ formatDate(lead.created_at) }}</dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-600 mb-1">Lead Value</dt>
                  <dd class="text-base font-semibold text-blue-600">${{ formatNumber(lead.value) }}</dd>
                </div>
              </dl>
            </div>

            <!-- Description -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="font-bold text-gray-900 mb-4">Notes & Description</h3>
              <p class="text-gray-600 leading-relaxed">
                {{ lead.notes || 'No notes added yet. Add notes about this lead to keep track of important details and interactions.' }}
              </p>
            </div>
          </div>

          <!-- Right Sidebar -->
          <div class="space-y-6">
            <!-- Lead Details Card -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="font-bold text-gray-900 mb-4">Lead Info</h3>
              <dl class="space-y-4 text-sm">
                <div>
                  <dt class="text-gray-600 mb-1">Contact Name</dt>
                  <dd class="font-semibold text-gray-900">{{ lead.contact_name }}</dd>
                </div>
                <div>
                  <dt class="text-gray-600 mb-1">Email</dt>
                  <dd>
                    <a :href="`mailto:${lead.email}`" class="text-blue-600 hover:text-blue-800 font-semibold break-all">
                      {{ lead.email }}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt class="text-gray-600 mb-1">Phone</dt>
                  <dd>
                    <a v-if="lead.phone" :href="`tel:${lead.phone}`" class="text-gray-900 font-semibold">
                      {{ lead.phone }}
                    </a>
                    <span v-else class="text-gray-500">Not provided</span>
                  </dd>
                </div>
                <div class="pt-4 border-t border-gray-200">
                  <dt class="text-gray-600 mb-1">Company</dt>
                  <dd class="font-semibold text-gray-900">{{ lead.company }}</dd>
                </div>
              </dl>
            </div>

            <!-- Probability Card -->
            <div class="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-6">
              <h3 class="font-bold text-gray-900 mb-4">Win Probability</h3>
              <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                  <span class="text-3xl font-bold text-blue-600">{{ lead.probability }}%</span>
                </div>
                <div class="w-full bg-gray-300 rounded-full h-3">
                  <div
                    class="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                    :style="{ width: lead.probability + '%' }"
                  ></div>
                </div>
              </div>
              <p class="text-xs text-gray-600">Expected revenue: ${{ formatNumber(Math.round(lead.value * (lead.probability / 100))) }}</p>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <button
                @click="editLead"
                class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                ✏️ Edit
              </button>
              <button
                @click="deleteLead"
                class="flex-1 px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 font-medium text-sm"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Estimates Tab -->
      <div v-if="activeTab === 'estimates'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900">Estimates</h3>
          <button class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Add Estimate
          </button>
        </div>
        <div class="text-center py-8 text-gray-500">
          <span class="text-4xl block mb-2">📊</span>
          <p>No estimates created yet</p>
        </div>
      </div>

      <!-- Proposals Tab -->
      <div v-if="activeTab === 'proposals'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900">Proposals</h3>
          <button class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Create Proposal
          </button>
        </div>
        <div class="text-center py-8 text-gray-500">
          <span class="text-4xl block mb-2">📄</span>
          <p>No proposals created yet</p>
        </div>
      </div>

      <!-- Contracts Tab -->
      <div v-if="activeTab === 'contracts'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900">Contracts</h3>
          <button class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Add Contract
          </button>
        </div>
        <div class="text-center py-8 text-gray-500">
          <span class="text-4xl block mb-2">📋</span>
          <p>No contracts signed yet</p>
        </div>
      </div>

      <!-- Files Tab -->
      <div v-if="activeTab === 'files'" class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900">Files</h3>
          <button class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            + Upload File
          </button>
        </div>
        <div class="text-center py-8 text-gray-500">
          <span class="text-4xl block mb-2">📁</span>
          <p>No files uploaded yet</p>
        </div>
      </div>
    </main>

    <!-- Edit Modal -->
    <div v-if="showEditModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-bold text-gray-900">Edit Lead</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input v-model="editForm.company" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input v-model="editForm.contact_name" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input v-model="editForm.email" type="email" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input v-model="editForm.phone" type="tel" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select v-model="editForm.stage" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="New">New</option>
                <option value="Qualified">Qualified</option>
                <option value="Discussion">Discussion</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <input v-model.number="editForm.value" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Probability (%)</label>
              <input v-model.number="editForm.probability" type="number" min="0" max="100" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select v-model="editForm.source" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="Website">Website</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Referral">Referral</option>
                <option value="Cold Call">Cold Call</option>
                <option value="Email">Email</option>
                <option value="Event">Event</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea v-model="editForm.notes" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" rows="4"></textarea>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button @click="showEditModal = false" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button @click="saveEdit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';

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

const router = useRouter();
const route = useRoute();

const activeTab = ref('overview');
const showEditModal = ref(false);

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'estimates', label: 'Estimates' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'files', label: 'Files' }
];

// Mock lead data - in real app would fetch from API
const mockLeads: { [key: number]: Lead } = {
  1: { id: 1, company: 'Sarah Cole', contact_name: 'Sarah Cole', email: 'sarah@example.com', phone: '555-1234', stage: 'New', value: 25000, probability: 10, source: 'Website', created_at: '2026-02-15', notes: 'Initial contact made' },
  2: { id: 2, company: 'Louie Ziemann', contact_name: 'Louie Ziemann', email: 'louie@example.com', phone: '555-5678', stage: 'Qualified', value: 35000, probability: 50, source: 'LinkedIn', created_at: '2026-02-10', notes: '50% Probably' },
  3: { id: 3, company: 'Gibson PLC', contact_name: 'Gibson Contact', email: 'gibson@example.com', stage: 'Discussion', value: 45000, probability: 90, source: 'Elsewhere', created_at: '2026-02-08', notes: '90% Probably' },
};

const leadId = parseInt(route.params.id as string);
const lead = ref<Lead>(mockLeads[leadId] || mockLeads[1]);
const editForm = reactive<Lead>({ ...lead.value });

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const goBack = () => router.push('/leads');
const editLead = () => {
  Object.assign(editForm, lead.value);
  showEditModal.value = true;
};
const saveEdit = () => {
  Object.assign(lead.value, editForm);
  showEditModal.value = false;
};
const deleteLead = () => {
  if (confirm(`Delete lead "${lead.value.company}"?`)) {
    router.push('/leads');
  }
};
</script>
