<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900">
    <!-- Header -->
    <div class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div class="max-w-full mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-6">
            <button @click="$router.back()" class="p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all" title="Back">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <div class="flex items-center gap-3">
                 <h1 class="text-2xl font-bold text-slate-900 tracking-tight">{{ client?.name || 'Loading...' }}</h1>
                 <span v-if="client?.status" :class="getStatusColorClass(client.status)" class="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border">
                    {{ client.status }}
                 </span>
              </div>
              <p class="text-sm text-slate-500 font-medium mt-0.5 flex items-center gap-2">
                 <span v-if="client?.code" class="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{{ client.code }}</span>
                 <span v-if="client?.organization">{{ client.organization }}</span>
                 <span v-if="client?.organization && client?.city" class="text-slate-300">•</span>
                 <span v-if="client?.city">{{ client.city }}</span>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-4">
             <button @click="editClient" class="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 text-sm font-semibold hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit
             </button>
             <button @click="showTransactionModal = true" class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 shadow-lg shadow-primary-500/30 transition-all flex items-center gap-2">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                 New Transaction
             </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar + Content -->
    <div class="max-w-full mx-auto px-6 py-8 flex items-start gap-8">
      
      <!-- Left Sidebar (Info) -->
      <div class="w-80 space-y-6 flex-shrink-0">
        <!-- Client Info Card -->
        <div class="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden">
            <div class="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                 <h3 class="font-bold text-slate-800 text-sm uppercase tracking-wider">Client Details</h3>
            </div>
          
            <div class="p-6 space-y-6">
                 <!-- Group & Tags -->
                 <div v-if="client?.group_name || (client?.labels && client.labels.length)">
                    <div class="text-xs font-semibold text-slate-400 uppercase mb-2">Classification</div>
                    <div class="flex flex-wrap gap-2">
                        <span v-if="client?.group_name" class="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                             {{ client.group_name }}
                        </span>
                        <span 
                            v-for="label in client?.labels" 
                            :key="label.id"
                            :class="getLabelColorClass(label.color)"
                            class="px-2.5 py-1 rounded-md text-xs font-semibold border"
                        >
                            {{ label.name }}
                        </span>
                    </div>
                </div>

                <!-- Contact Info -->
                <div class="space-y-4">
                     <div v-if="client?.primary_contact" class="flex gap-3 items-start">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 shadow-inner">
                            {{ client.primary_contact.name.charAt(0) }}
                        </div>
                        <div>
                            <div class="text-xs font-semibold text-slate-400 uppercase">Primary Contact</div>
                            <div class="font-medium text-slate-900 text-sm">{{ client.primary_contact.name }}</div>
                            <div class="text-xs text-slate-500">{{ client.primary_contact.job_title }}</div>
                             <div class="flex gap-2 mt-1">
                                <a v-if="client.primary_contact.email" :href="`mailto:${client.primary_contact.email}`" class="text-slate-400 hover:text-primary-600 transition-colors" title="Email"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></a>
                                <a v-if="client.primary_contact.phone" :href="`tel:${client.primary_contact.phone}`" class="text-slate-400 hover:text-green-600 transition-colors" title="Call"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg></a>
                             </div>
                        </div>
                    </div>

                    <div v-if="client?.phone" class="flex gap-3 items-start">
                        <div class="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        </div>
                        <div>
                             <div class="text-xs font-semibold text-slate-400 uppercase">Phone</div>
                             <div class="text-sm text-slate-700 font-medium">{{ client.phone }}</div>
                        </div>
                    </div>

                    <div v-if="client?.email" class="flex gap-3 items-start">
                        <div class="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        <div>
                             <div class="text-xs font-semibold text-slate-400 uppercase">Email</div>
                             <div class="text-sm text-slate-700 font-medium">{{ client.email }}</div>
                        </div>
                    </div>

                    <div v-if="client?.website" class="flex gap-3 items-start">
                        <div class="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                        </div>
                        <div>
                             <div class="text-xs font-semibold text-slate-400 uppercase">Website</div>
                             <a :href="client.website" target="_blank" class="text-sm text-primary-600 hover:text-primary-800 font-medium break-all">{{ client.website.replace(/^https?:\/\//, '') }}</a>
                        </div>
                    </div>

                    <div v-if="client?.address" class="flex gap-3 items-start">
                        <div class="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-400">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <div>
                             <div class="text-xs font-semibold text-slate-400 uppercase">Address</div>
                             <div class="text-sm text-slate-700">{{ client.address }}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="bg-slate-50 px-6 py-4 border-t border-slate-100">
                <button class="text-sm text-slate-500 font-medium hover:text-primary-600 flex items-center gap-2 w-full justify-center transition-colors">
                    Map and Directions
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
            </div>
        </div>

        <!-- Quick Stats -->
        <div class="bg-white rounded-xl shadow-card border border-slate-100 overflow-hidden">
            <div class="p-5 border-b border-slate-50 bg-slate-50/50">
                 <h3 class="font-bold text-slate-800 text-sm uppercase tracking-wider">Standing</h3>
            </div>
            <div class="p-6 grid grid-cols-1 gap-6">
                <div>
                     <div class="text-sm text-slate-500 font-medium mb-1">Total Invoiced</div>
                     <div class="text-2xl font-bold text-slate-900">{{ formatCurrency(client?.total_invoiced) }}</div>
                     <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                        <div class="bg-primary-500 h-1.5 rounded-full" style="width: 100%"></div>
                     </div>
                </div>
                <div>
                     <div class="text-sm text-slate-500 font-medium mb-1">Payments Received</div>
                     <div class="text-2xl font-bold text-green-600">{{ formatCurrency(client?.payment_received) }}</div>
                     <div class="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                        <div class="bg-green-500 h-1.5 rounded-full" :style="{ width: `${(client?.total_invoiced ? (client.payment_received / client.total_invoiced) * 100 : 0)}%` }"></div>
                     </div>
                </div>
                <div>
                     <div class="text-sm text-slate-500 font-medium mb-1">Due Amount</div>
                     <div class="text-2xl font-bold" :class="client?.due_amount > 0 ? 'text-red-500' : 'text-slate-900'">{{ formatCurrency(client?.due_amount) }}</div>
                     <div v-if="client?.due_amount > 0" class="text-xs font-medium text-red-500 mt-1 flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Payment Required
                     </div>
                </div>
            </div>
        </div>

        <!-- Widgets -->
        <div class="bg-gradient-to-br from-primary-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
            <h3 class="font-bold text-lg mb-2">Need Help?</h3>
            <p class="text-primary-100 text-sm mb-4">Contact support if you notice discrepancies in this client's profile.</p>
            <button class="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-white/20 w-full">Contact Support</button>
        </div>

      </div>

      <!-- Main Content -->
      <div class="flex-1 min-w-0">
        <!-- Tabs -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <nav class="flex overflow-x-auto no-scrollbar rounded-xl">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="activeTab === tab.id ? 'border-primary-500 text-primary-700 bg-primary-50/50' : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'"
              class="px-6 py-4 font-semibold text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0"
            >
              {{ tab.label }}
              <span v-if="tab.count !== undefined" :class="activeTab === tab.id ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'" class="ml-2 px-1.5 py-0.5 rounded-md text-xs font-bold">{{ tab.count }}</span>
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="bg-white rounded-xl shadow-card border border-slate-100 min-h-[500px]">
          
          <!-- OVERVIEW TAB -->
          <div v-if="activeTab === 'overview'" class="p-8 space-y-8">
            
            <!-- CONTACTS CARD -->
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 class="font-bold text-slate-800 flex items-center gap-2">
                        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        Contacts
                    </h3>
                    <div class="flex gap-3">
                        <button class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 opacity-50 cursor-not-allowed" title="Bulk invitation coming soon">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            Send invitation
                        </button>
                        <button @click="showAddContactModal = true" class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                            Add contact
                        </button>
                    </div>
                </div>
                <div class="p-0 divide-y divide-slate-100">
                    <div v-for="contact in client?.contacts" :key="contact.id" class="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                                {{ contact.name.charAt(0) }}
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-900 text-sm">{{ contact.name }}</h4>
                                <p class="text-xs text-slate-500">{{ contact.job_title || 'No Title' }}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-6 text-sm text-slate-500">
                            <div v-if="contact.email" class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                {{ contact.email }}
                            </div>
                            <div v-if="contact.phone" class="flex items-center gap-2">
                                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                {{ contact.phone }}
                            </div>
                            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button @click="sendInvitation(contact.email)" class="p-1 text-slate-400 hover:text-primary-600" title="Send Invitation"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></button>
                                <button @click="editContact(contact)" class="p-1 text-slate-400 hover:text-primary-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                <button @click="deleteContact(contact.id)" class="p-1 text-slate-400 hover:text-red-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- TICKETS CARD -->
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                    <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 class="font-bold text-slate-800 flex items-center gap-2">
                            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            Tickets
                        </h3>
                        <div class="flex gap-2">
                             <button @click="showAddTicketModal = true" class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add ticket
                            </button>
                        </div>
                    </div>
                    <div class="bg-white border-b border-slate-100 px-5 py-3 flex justify-between items-center gap-4">
                        <div class="flex gap-2">
                            <button @click="ticketFilter = 'open'" :class="ticketFilter === 'open' ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'" class="px-3 py-1 text-xs font-semibold rounded-md transition-colors">Open</button>
                            <button @click="ticketFilter = 'closed'" :class="ticketFilter === 'closed' ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'" class="px-3 py-1 text-xs font-semibold rounded-md text-slate-500 hover:bg-slate-50 transition-colors">Closed</button>
                            <button v-if="ticketFilter !== 'all'" @click="ticketFilter = 'all'" class="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                        </div>
                        <div class="relative w-full max-w-[180px]">
                            <input v-model="ticketSearch" type="text" placeholder="Search" class="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500">
                            <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                    <div class="flex-1 overflow-auto max-h-[400px]">
                         <div v-if="filteredTickets.length" class="divide-y divide-slate-100">
                             <div v-for="ticket in filteredTickets" :key="ticket.id" class="p-4 hover:bg-slate-50 transition-colors cursor-pointer">
                                 <div class="flex justify-between items-start mb-1">
                                     <h5 class="text-sm font-bold text-slate-800 line-clamp-1">{{ ticket.subject }}</h5>
                                     <span class="text-xs text-slate-400 whitespace-nowrap">{{ new Date(ticket.created_at).toLocaleDateString() }}</span>
                                 </div>
                                 <div class="flex justify-between items-center">
                                      <span class="text-xs px-2 py-0.5 rounded-full font-semibold border uppercase tracking-tight" 
                                        :class="ticket.status === 'open' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-100 text-slate-600 border-slate-200'">
                                          {{ ticket.status }}
                                      </span>
                                      <span class="text-xs text-slate-500">#{{ ticket.ticket_number || ticket.id }}</span>
                                 </div>
                             </div>
                         </div>
                         <div v-else class="p-10 text-center text-slate-400 text-sm">
                             No record found.
                         </div>
                    </div>
                </div>

                <!-- EVENTS CARD -->
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                    <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 class="font-bold text-slate-800 flex items-center gap-2">
                            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            Events
                        </h3>
                         <div class="flex gap-2">
                             <button @click="showAddEventModal = true" class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add event
                            </button>
                        </div>
                    </div>
                    
                    <!-- Calendar Header -->
                    <div class="p-4 flex items-center justify-between">
                         <div class="flex gap-1">
                             <button @click="changeMonth(-1)" class="p-1 hover:bg-slate-100 rounded text-slate-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg></button>
                             <button @click="changeMonth(1)" class="p-1 hover:bg-slate-100 rounded text-slate-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg></button>
                         </div>
                         <h4 class="font-bold text-slate-700 text-sm">{{ currentMonthLabel }}</h4>
                         <button @click="goToToday" class="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600">today</button>
                    </div>

                    <!-- Calendar Grid -->
                    <div class="border-t border-slate-100">
                        <div class="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
                             <div v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="day" class="py-2 text-center text-xs font-bold text-slate-500 uppercase">
                                 {{ day }}
                             </div>
                        </div>
                        <div class="grid grid-cols-7 auto-rows-fr h-[300px]">
                            <div v-for="cell in calendarCells" :key="cell.key" class="border-b border-r border-slate-100 p-1 relative hover:bg-slate-50 transition-colors" :class="{'bg-slate-50/30': !cell.isCurrentMonth}">
                                <div class="text-right mb-1">
                                    <span class="text-xs font-medium inline-flex w-5 h-5 items-center justify-center rounded-full" :class="cell.isToday ? 'bg-primary-500 text-white' : (cell.isCurrentMonth ? 'text-slate-700' : 'text-slate-300')">
                                        {{ cell.day }}
                                    </span>
                                </div>
                                <div class="space-y-0.5">
                                    <div v-for="ev in cell.events" :key="ev.id" class="w-full h-1.5 rounded-sm bg-primary-400" :title="ev.title"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modals -->
            <!-- Add Contact Modal -->
            <div v-if="showAddContactModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 class="font-bold text-slate-800">Add New Contact</h3>
                        <button @click="showAddContactModal = false" class="text-slate-400 hover:text-slate-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    <div class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                            <input v-model="contactForm.name" type="text" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
                            <input v-model="contactForm.job_title" type="text" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <input v-model="contactForm.email" type="email" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                <input v-model="contactForm.phone" type="text" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Mobile</label>
                                <input v-model="contactForm.mobile" type="text" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <input v-model="contactForm.is_primary" type="checkbox" id="is_primary" class="rounded border-slate-300 text-primary-600 focus:ring-primary-500">
                            <label htmlFor="is_primary" class="text-sm text-slate-700">Set as Primary Contact</label>
                        </div>
                    </div>
                    <div class="px-6 py-4 bg-slate-50 flex justify-end gap-3">
                        <button @click="showAddContactModal = false" class="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-800">Cancel</button>
                        <button @click="saveContact" class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 shadow-sm">Save Contact</button>
                    </div>
                </div>
            </div>

            <!-- Add Ticket Modal -->
            <div v-if="showAddTicketModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 class="font-bold text-slate-800">Create New Ticket</h3>
                        <button @click="showAddTicketModal = false" class="text-slate-400 hover:text-slate-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    <div class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Subject *</label>
                            <input v-model="ticketForm.subject" type="text" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Description</label>
                            <textarea v-model="ticketForm.description" rows="3" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border"></textarea>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                                <select v-model="ticketForm.priority" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                <select v-model="ticketForm.status" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                                    <option value="open">Open</option>
                                    <option value="pending">Pending</option>
                                    <option value="closed">Closed</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Contact (Optional)</label>
                            <select v-model="ticketForm.contact_id" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                                <option value="">Select Contact</option>
                                <option v-for="contact in client?.contacts" :key="contact.id" :value="contact.id">{{ contact.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="px-6 py-4 bg-slate-50 flex justify-end gap-3">
                        <button @click="showAddTicketModal = false" class="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-800">Cancel</button>
                        <button @click="saveTicket" class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 shadow-sm">Create Ticket</button>
                    </div>
                </div>
            </div>

            <!-- Add Event Modal -->
            <div v-if="showAddEventModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 class="font-bold text-slate-800">Add New Event</h3>
                        <button @click="showAddEventModal = false" class="text-slate-400 hover:text-slate-600"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    <div class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                            <input v-model="eventForm.title" type="text" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                                <input v-model="eventForm.event_date" type="date" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Time</label>
                                <input v-model="eventForm.event_time" type="time" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Type</label>
                            <select v-model="eventForm.event_type" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                                <option>Meeting</option>
                                <option>Call</option>
                                <option>Email</option>
                                <option>Task</option>
                            </select>
                        </div>
                         <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Contact (Optional)</label>
                            <select v-model="eventForm.contact_id" class="w-full border-slate-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border">
                                <option value="">Select Contact</option>
                                <option v-for="contact in client?.contacts" :key="contact.id" :value="contact.id">{{ contact.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="px-6 py-4 bg-slate-50 flex justify-end gap-3">
                        <button @click="showAddEventModal = false" class="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-800">Cancel</button>
                        <button @click="saveEvent" class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 shadow-sm">Save Event</button>
                    </div>
                </div>
            </div>

            <!-- Existing Invoice Breakdown (Moved down) -->
            <div>
                 <h4 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span class="w-1 h-6 bg-primary-500 rounded-full"></span>
                    Invoice Breakdown
                 </h4>
                 <div class="grid grid-cols-3 gap-6">
                      <div class="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:shadow-md transition-shadow">
                           <div class="flex items-center gap-3 mb-2">
                               <div class="w-2 h-2 rounded-full bg-red-500"></div>
                               <span class="text-sm font-medium text-slate-500">Overdue</span>
                           </div>
                           <div class="text-2xl font-bold text-slate-800">{{ formatCurrency(calculateInvoiceStatus('overdue')) }}</div>
                      </div>
                      <div class="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:shadow-md transition-shadow">
                           <div class="flex items-center gap-3 mb-2">
                               <div class="w-2 h-2 rounded-full bg-yellow-500"></div>
                               <span class="text-sm font-medium text-slate-500">Unpaid</span>
                           </div>
                           <div class="text-2xl font-bold text-slate-800">{{ formatCurrency(calculateInvoiceStatus('sent')) }}</div>
                      </div>
                      <div class="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:shadow-md transition-shadow">
                           <div class="flex items-center gap-3 mb-2">
                               <div class="w-2 h-2 rounded-full bg-green-500"></div>
                               <span class="text-sm font-medium text-slate-500">Paid</span>
                           </div>
                           <div class="text-2xl font-bold text-slate-800">{{ formatCurrency(calculateInvoiceStatus('paid')) }}</div>
                      </div>
                 </div>
            </div>

            <!-- Existing Projects (Moved down) -->
            <div>
                 <div class="flex items-center justify-between mb-4">
                     <h4 class="font-bold text-slate-800 flex items-center gap-2">
                        <span class="w-1 h-6 bg-primary-500 rounded-full"></span>
                        Active Projects
                     </h4>
                     <button class="text-sm font-medium text-primary-600 hover:text-primary-700">View All</button>
                 </div>
                 
                 <div v-if="client?.projects && client.projects.length" class="space-y-4">
                    <div v-for="project in client.projects.slice(0, 3)" :key="project.id" class="p-4 rounded-xl border border-slate-100 hover:border-primary-200 hover:shadow-md transition-all group cursor-pointer bg-white">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h5 class="font-bold text-slate-800 group-hover:text-primary-600 transition-colors">{{ project.project_name }}</h5>
                                <p class="text-xs text-slate-500 font-mono mt-1">{{ project.project_number }}</p>
                            </div>
                            <span :class="getProjectStatusColor(project.status)" class="px-2.5 py-1 rounded-full text-xs font-semibold border">
                                {{ project.status }}
                            </span>
                        </div>
                        <div class="flex items-center gap-4 text-sm text-slate-600 mb-3">
                             <div class="flex items-center gap-1.5">
                                 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                 <span>Due: {{ new Date().toLocaleDateString() }}</span>
                            </div>
                             <div class="flex items-center gap-1.5">
                                 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                 <span>24h logged</span>
                            </div>
                        </div>
                        <div class="space-y-1.5">
                            <div class="flex justify-between text-xs font-semibold text-slate-500">
                                <span>Progress</span>
                                <span>{{ project.progress_percentage }}%</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div class="bg-primary-500 h-2 rounded-full transition-all duration-500" :style="{ width: `${project.progress_percentage}%` }"></div>
                            </div>
                        </div>
                    </div>
                 </div>
                 <div v-else class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p class="text-slate-500">No active projects</p>
                      <button class="mt-2 text-primary-600 font-semibold text-sm hover:underline">Create Project</button>
                 </div>
            </div>
            
          </div>

          <!-- LIST TABS (Projects, Invoices, etc) -->
          <div v-else class="p-0">
             <!-- Generic List Layout -->
             <div class="overflow-x-auto">


                <!-- INVOICES -->
                 <div v-if="activeTab === 'invoices'">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-slate-800">Invoices</h3>
                        <div class="flex gap-2">
                             <button @click="notImplemented" class="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Filter</button>
                             <button @click="openTransactionModal('invoice')" class="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">New Invoice</button>
                        </div>
                    </div>
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice #</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Project</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Dates</th>
                                <th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                <th class="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 bg-white">
                            <tr v-for="invoice in client?.invoices" :key="invoice.id" class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="text-primary-600 font-bold hover:underline cursor-pointer">{{ invoice.invoice_number }}</span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                    {{ invoice.project_name || '-' }}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                    <div class="flex flex-col">
                                        <span>Issued: {{ invoice.invoice_date }}</span>
                                        <span class="text-xs text-slate-400">Due: {{ invoice.due_date || '-' }}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 text-right">{{ formatCurrency(invoice.total_amount) }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-center">
                                    <span :class="getInvoiceStatusColor(invoice.status)" class="px-2.5 py-1 text-xs font-semibold rounded-md border capitalize">
                                        {{ invoice.status }}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                                    <button @click="viewInvoice(invoice.id)" class="text-slate-400 hover:text-primary-600 mr-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                </td>
                            </tr>
                            <tr v-if="!client?.invoices?.length">
                                <td colspan="6" class="px-6 py-8 text-center text-slate-500">No invoices found.</td>
                            </tr>
                        </tbody>
                    </table>
                 </div>

                 <!-- PROJECTS TAB -->
                 <div v-if="activeTab === 'projects'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Projects</h3>
                            <button @click="showAddProjectModal = true" class="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add Project
                            </button>
                        </div>
                        <div class="p-4 border-b border-slate-200 flex gap-4">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search projects..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">ID</th>
                                        <th class="px-6 py-3">Title</th>
                                        <th class="px-6 py-3 text-right">Price</th>
                                        <th class="px-6 py-3">Dates</th>
                                        <th class="px-6 py-3">Progress</th>
                                        <th class="px-6 py-3">Status</th>
                                        <th class="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-if="!client?.projects?.length">
                                        <td colspan="7" class="px-6 py-8 text-center text-slate-500">
                                            No projects found.
                                        </td>
                                    </tr>
                                    <tr v-for="project in client?.projects" :key="project.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-primary-600">{{ project.project_number }}</td>
                                        <td class="px-6 py-4">
                                            <div class="font-medium text-slate-900">{{ project.name }}</div>
                                            <div v-if="project.priority" :class="{'bg-green-100 text-green-700': project.priority === 'low', 'bg-amber-100 text-amber-700': project.priority === 'medium', 'bg-red-100 text-red-700': project.priority === 'high'}" class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1">
                                                {{ project.priority }} Priority
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 text-right font-medium text-slate-700">
                                            {{ project.price ? formatCurrency(project.price) : '-' }}
                                        </td>
                                        <td class="px-6 py-4 text-slate-600 text-xs">
                                            <div class="flex flex-col gap-1">
                                                <div class="flex items-center gap-2"><span class="w-10 text-slate-400">Start:</span> {{ project.start_date || '-' }}</div>
                                                <div class="flex items-center gap-2"><span class="w-10 text-slate-400">End:</span> <span :class="{'text-red-600 font-bold': isOverdue(project.end_date)}">{{ project.end_date || '-' }}</span></div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 align-middle">
                                            <div class="w-32">
                                                <div class="flex justify-between text-xs mb-1">
                                                    <span class="text-slate-600 font-medium">{{ project.progress || 0 }}%</span>
                                                </div>
                                                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div class="h-full bg-primary-500 rounded-full" :style="{ width: `${project.progress || 0}%` }"></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="px-2.5 py-1 text-xs font-semibold rounded-md capitalize" :class="getProjectStatusColor(project.status)">
                                                {{ project.status?.replace('_', ' ') }}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4 text-right">
                                            <div class="flex justify-end gap-2">
                                                <button @click="viewProject(project.id)" class="text-slate-400 hover:text-primary-600 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                                                <button @click="deleteProject(project.id)" class="text-slate-400 hover:text-red-600 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>

                 <!-- SUBSCRIPTIONS TAB -->
                 <div v-if="activeTab === 'subscriptions'">
                     <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-slate-800">Subscriptions</h3>
                        <button @click="showAddSubscriptionModal = true" class="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                             Add Subscription
                        </button>
                    </div>
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Title</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Billing Date</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Repeat</th>
                                <th class="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 bg-white">
                             <tr v-if="!client?.subscriptions?.length">
                                <td colspan="6" class="px-6 py-8 text-center text-slate-500">
                                    No subscriptions found.
                                </td>
                            </tr>
                            <tr v-for="sub in client?.subscriptions" :key="sub.id" class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600 font-bold uppercase">{{ sub.code }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{{ sub.title }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                    <div class="flex flex-col">
                                        <span>Next: {{ sub.next_billing_date }}</span>
                                        <span class="text-xs text-slate-400">Last: {{ sub.last_billing_date || '-' }}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ sub.repeat_every }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-center">
                                    <span class="px-2.5 py-1 text-xs font-bold text-white bg-primary-600 rounded-md uppercase tracking-wide">
                                        {{ sub.status }}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 text-right">{{ formatCurrency(sub.amount) }}</td>
                            </tr>
                        </tbody>
                    </table>
                 </div>

                 <!-- PAYMENTS TAB -->
                 <div v-if="activeTab === 'payments'">
                     <div class="flex justify-between items-center mb-4">
                         <h3 class="text-lg font-bold text-slate-800">Payments</h3>
                        <button @click="showAddPaymentModal = true" class="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                             Add Payment
                        </button>
                    </div>
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Method</th>
                                <th class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Note</th>
                                <th class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 bg-white">
                            <tr v-if="!client?.payments?.length">
                                <td colspan="5" class="px-6 py-8 text-center text-slate-500">
                                    No payments found.
                                </td>
                            </tr>
                            <tr v-for="payment in client?.payments" :key="payment.id" class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600 font-bold uppercase">{{ payment.code }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ payment.date }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ payment.method }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 italic truncate max-w-xs">{{ payment.note || '-' }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 text-right">{{ formatCurrency(payment.amount) }}</td>
                            </tr>
                        </tbody>
                    </table>
                 </div>

                 <!-- STATEMENT TAB -->
                 <div v-if="activeTab === 'statement'">
                     <div class="bg-white rounded-lg border border-slate-200 p-8 max-w-4xl mx-auto shadow-sm">
                        <div class="flex justify-between items-start mb-8">
                            <div>
                                <h2 class="text-2xl font-bold text-slate-900 uppercase tracking-tight">Account Statement</h2>
                                <p class="text-sm text-slate-500 mt-1">Period: {{ new Date().getFullYear() }}-01-01 to {{ new Date().getFullYear() }}-12-31</p>
                            </div>
                            <div class="text-right">
                                <div class="text-3xl font-bold text-slate-800 font-mono tracking-tighter mb-1">RISE</div>
                                <div class="text-xs text-slate-400 uppercase tracking-widest">Enterprise ERP</div>
                            </div>
                        </div>

                        <div class="flex justify-between mb-8 text-sm">
                             <div>
                                <h4 class="font-bold text-slate-700 mb-1">To:</h4>
                                <div class="text-slate-600">{{ client?.name }}</div>
                                <div class="text-slate-600">{{ client?.address || 'Address not provided' }}</div>
                                <div class="text-slate-600">{{ client?.phone }}</div>
                             </div>
                             <div class="text-right">
                                <div class="mb-2"><span class="font-bold text-slate-700 w-32 inline-block">Opening Balance:</span> <span class="text-slate-600">Rp 0</span></div>
                                <div class="mb-2"><span class="font-bold text-slate-700 w-32 inline-block">Invoiced:</span> <span class="text-slate-600">{{ formatCurrency(client?.total_invoiced) }}</span></div>
                                <div class="mb-2"><span class="font-bold text-slate-700 w-32 inline-block">Paid:</span> <span class="text-slate-600">{{ formatCurrency(client?.total_paid) }}</span></div>
                                <div class="mb-2"><span class="font-bold text-red-600 w-32 inline-block">Balance Due:</span> <span class="text-red-600 font-bold">{{ formatCurrency(client?.due_amount) }}</span></div>
                             </div>
                        </div>

                        <table class="min-w-full text-sm">
                            <thead class="bg-slate-900 text-white">
                                <tr>
                                    <th class="px-4 py-2 text-left">Date</th>
                                    <th class="px-4 py-2 text-left">Description</th>
                                    <th class="px-4 py-2 text-right">Invoiced</th>
                                    <th class="px-4 py-2 text-right">Paid</th>
                                    <th class="px-4 py-2 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr class="bg-slate-100 font-medium">
                                    <td class="px-4 py-2">2026-01-01</td>
                                    <td class="px-4 py-2">Opening Balance</td>
                                    <td class="px-4 py-2 text-right">-</td>
                                    <td class="px-4 py-2 text-right">-</td>
                                    <td class="px-4 py-2 text-right">Rp 0</td>
                                </tr>
                                <!-- Mock Statement Rows -->
                                <tr v-for="inv in client?.invoices?.slice(0,5)" :key="'st-'+inv.id">
                                    <td class="px-4 py-2 text-slate-600">{{ inv.invoice_date }}</td>
                                    <td class="px-4 py-2 text-slate-900">{{ inv.invoice_number }}</td>
                                    <td class="px-4 py-2 text-right text-slate-900">{{ formatCurrency(inv.total_amount) }}</td>
                                    <td class="px-4 py-2 text-right text-slate-400">-</td>
                                    <td class="px-4 py-2 text-right font-medium text-slate-900">{{ formatCurrency(inv.total_amount) }}</td>
                                </tr>
                            </tbody>
                             <tfoot class="bg-slate-50 font-bold">
                                <tr>
                                    <td colspan="4" class="px-4 py-3 text-right uppercase text-xs tracking-wider text-slate-500">Total Balance Due</td>
                                    <td class="px-4 py-3 text-right text-base text-slate-900 bg-slate-200">{{ formatCurrency(client?.due_amount) }}</td>
                                </tr>
                            </tfoot>
                        </table>

                        <div class="mt-8 text-center">
                            <button @click="downloadStatement" class="px-6 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors flex items-center gap-2 mx-auto">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Download PDF
                            </button>
                        </div>
                     </div>
                 </div>
                 
                 <!-- PROPOSALS TAB -->
                 <div v-if="activeTab === 'proposals'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Proposals</h3>
                            <button @click="notImplemented" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add proposal
                            </button>
                        </div>
                        <div class="p-4 border-b border-slate-200 flex gap-4">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">Proposal</th>
                                        <th class="px-6 py-3">Proposal date</th>
                                        <th class="px-6 py-3">Valid until</th>
                                        <th class="px-6 py-3">Last email seen</th>
                                        <th class="px-6 py-3">Last preview seen</th>
                                        <th class="px-6 py-3 text-right">Amount</th>
                                        <th class="px-6 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-for="prop in client?.proposals" :key="prop.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-primary-600 cursor-pointer hover:underline">{{ prop.proposal_number }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ prop.date }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ prop.valid_until }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ prop.email_seen }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ prop.preview_seen }}</td>
                                        <td class="px-6 py-4 text-right font-medium text-slate-700">{{ formatCurrency(prop.amount) }}</td>
                                        <td class="px-6 py-4 text-center">
                                            <span class="px-2 py-1 rounded text-xs font-semibold" :class="prop.status === 'Accepted' ? 'bg-primary-600 text-white' : 'bg-blue-500 text-white'">{{ prop.status }}</span>
                                        </td>
                                    </tr>
                                    <tr v-if="!client?.proposals?.length" class="text-center text-slate-500">
                                        <td colspan="7" class="py-8">No proposals found.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>

                 <!-- CONTRACTS TAB -->
                 <div v-if="activeTab === 'contracts'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Contracts</h3>
                            <button @click="notImplemented" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add contract
                            </button>
                        </div>
                         <div class="p-4 border-b border-slate-200 flex gap-4">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">ID</th>
                                        <th class="px-6 py-3">Title</th>
                                        <th class="px-6 py-3">Project</th>
                                        <th class="px-6 py-3">Contract date</th>
                                        <th class="px-6 py-3">Valid until</th>
                                        <th class="px-6 py-3 text-right">Amount</th>
                                        <th class="px-6 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-for="contract in client?.contracts" :key="contract.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-primary-600 hover:underline cursor-pointer">CONTRACT #{{ contract.id }}</td>
                                        <td class="px-6 py-4 text-slate-600 font-medium">{{ contract.title }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ contract.project }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ contract.start_date }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ contract.end_date }}</td>
                                        <td class="px-6 py-4 text-right font-medium text-slate-700">${{ Number(contract.amount).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-center">
                                            <span class="px-2 py-1 rounded text-xs font-semibold bg-primary-600 text-white">{{ contract.status }}</span>
                                        </td>
                                    </tr>
                                     <tr v-if="!client?.contracts?.length" class="text-center text-slate-500">
                                        <td colspan="7" class="py-8">No contracts found.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>

                 <!-- FILES TAB -->
                 <div v-if="activeTab === 'files'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
                            <div class="flex gap-4 items-center">
                                 <h3 class="text-lg font-bold text-slate-800">Files</h3>
                                 <div class="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200 ml-4">
                                    <button @click="filesViewMode = 'list'" :class="filesViewMode === 'list' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-700'" class="px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                                        List
                                    </button>
                                    <button @click="filesViewMode = 'folders'" :class="filesViewMode === 'folders' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-700'" class="px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-2">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                        Folders
                                    </button>
                                </div>
                            </div>
                            <button class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                Upload File
                            </button>
                        </div>
                        
                        <!-- List View Controls -->
                        <div v-if="filesViewMode === 'list'" class="p-4 border-b border-slate-200 flex gap-2 items-center">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                            <div class="ml-auto flex gap-2">
                                <div class="relative">
                                    <input type="text" placeholder="Search files..." class="pl-8 pr-4 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-48" />
                                    <svg class="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                            </div>
                        </div>

                        <!-- List View Table -->
                        <div v-if="filesViewMode === 'list'" class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">File</th>
                                        <th class="px-6 py-3">Type</th>
                                        <th class="px-6 py-3">Size</th>
                                        <th class="px-6 py-3">Uploaded by</th>
                                        <th class="px-6 py-3">Date</th>
                                        <th class="px-6 py-3 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-if="!client?.files?.length" class="text-center text-slate-500">
                                        <td colspan="6" class="py-8">No files found.</td>
                                    </tr>
                                    <tr v-for="file in client?.files" :key="file.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-slate-700 flex items-center gap-2">
                                            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                            {{ file.name }}
                                        </td>
                                        <td class="px-6 py-4 text-slate-600">{{ file.type }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ file.size }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Folders View -->
                        <div v-if="filesViewMode === 'folders'" class="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50">
                             <!-- Mock Folders -->
                             <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group">
                                <div class="p-3 bg-indigo-50 rounded-full group-hover:bg-indigo-100 transition-colors">
                                    <svg class="w-10 h-10 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                                </div>
                                <div class="text-center">
                                    <h4 class="font-bold text-slate-700 group-hover:text-primary-700">Contracts</h4>
                                    <p class="text-xs text-slate-500 mt-1">3 files</p>
                                </div>
                             </div>
                             <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group">
                                <div class="p-3 bg-indigo-50 rounded-full group-hover:bg-indigo-100 transition-colors">
                                     <svg class="w-10 h-10 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                                </div>
                                <div class="text-center">
                                    <h4 class="font-bold text-slate-700 group-hover:text-primary-700">Proposals</h4>
                                    <p class="text-xs text-slate-500 mt-1">5 files</p>
                                </div>
                             </div>
                             <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group">
                                <div class="p-3 bg-indigo-50 rounded-full group-hover:bg-indigo-100 transition-colors">
                                     <svg class="w-10 h-10 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                                </div>
                                <div class="text-center">
                                    <h4 class="font-bold text-slate-700 group-hover:text-primary-700">Invoices</h4>
                                    <p class="text-xs text-slate-500 mt-1">12 files</p>
                                </div>
                             </div>
                              <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group">
                                <div class="p-3 bg-indigo-50 rounded-full group-hover:bg-indigo-100 transition-colors">
                                     <svg class="w-10 h-10 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                                </div>
                                <div class="text-center">
                                    <h4 class="font-bold text-slate-700 group-hover:text-primary-700">Design Assets</h4>
                                    <p class="text-xs text-slate-500 mt-1">8 files</p>
                                </div>
                             </div>
                        </div>
                     </div>
                 </div>

                 <!-- EXPENSES TAB -->
                 <div v-if="activeTab === 'expenses'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Expenses</h3>
                            <button @click="notImplemented" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add expense
                            </button>
                        </div>
                         <div class="p-4 border-b border-slate-200 flex gap-4">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">Date</th>
                                        <th class="px-6 py-3">Category</th>
                                        <th class="px-6 py-3">Title</th>
                                        <th class="px-6 py-3">Description</th>
                                        <th class="px-6 py-3">Files</th>
                                        <th class="px-6 py-3 text-right">Amount</th>
                                        <th class="px-6 py-3 text-right">TAX</th>
                                        <th class="px-6 py-3 text-right">Second TAX</th>
                                        <th class="px-6 py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                     <tr v-if="!client?.expenses?.length" class="text-center text-slate-500">
                                        <td colspan="9" class="py-8">No record found.</td>
                                    </tr>
                                    <tr v-for="expense in client?.expenses" :key="expense.id" @click="openExpenseDetail(expense)" class="hover:bg-slate-50/50 transition-colors cursor-pointer">
                                        <td class="px-6 py-4 text-slate-600">{{ expense.date }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ expense.category }}</td>
                                        <td class="px-6 py-4 text-slate-800 font-medium">{{ expense.title }}</td>
                                        <td class="px-6 py-4 text-slate-500">{{ expense.description }}</td>
                                        <td class="px-6 py-4 text-slate-500">{{ expense.files_count }}</td>
                                        <td class="px-6 py-4 text-right text-slate-600">${{ Number(expense.amount).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-right text-slate-600">${{ Number(expense.tax).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-right text-slate-600">${{ Number(expense.second_tax).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-right font-bold text-slate-800">${{ Number(expense.total).toLocaleString() }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>
                 
                 <!-- ESTIMATES TAB -->
                 <div v-if="activeTab === 'estimates'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Estimates</h3>
                            <button @click="openTransactionModal('quote')" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Create Estimate
                            </button>
                        </div>
                        <div class="p-4 border-b border-slate-200 flex gap-4">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search estimates..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">Estimate #</th>
                                        <th class="px-6 py-3">Date</th>
                                        <th class="px-6 py-3">Valid Until</th>
                                        <th class="px-6 py-3 text-right">Amount</th>
                                        <th class="px-6 py-3 text-center">Status</th>
                                        <th class="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-if="!client?.estimates?.length" class="text-center text-slate-500">
                                        <td colspan="6" class="py-8">No estimates found.</td>
                                    </tr>
                                    <tr v-for="est in client?.estimates" :key="est.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-primary-600 hover:underline cursor-pointer">{{ est.estimate_number }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ est.date }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ est.valid_until }}</td>
                                        <td class="px-6 py-4 text-right font-medium text-slate-700">${{ Number(est.amount).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-center">
                                            <span :class="getInvoiceStatusColor(est.status)" class="px-2.5 py-1 rounded-md text-xs font-semibold border capitalize">{{ est.status }}</span>
                                        </td>
                                        <td class="px-6 py-4 text-right flex gap-3 justify-end">
                                            <button @click="router.push({ name: 'EstimatorProposalEditor', params: { id: est.id } })" class="text-slate-400 hover:text-primary-600" title="Edit Estimate">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                            <button @click="deleteTransaction(est.id, 'estimate')" class="text-slate-400 hover:text-red-600" title="Delete Estimate">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>

                 <!-- ORDERS TAB -->
                 <div v-if="activeTab === 'orders'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Orders</h3>
                            <button @click="openTransactionModal('order')" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Create Order
                            </button>
                        </div>
                        <div class="p-4 border-b border-slate-200 flex gap-4">
                            <button class="p-2 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search orders..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">Order #</th>
                                        <th class="px-6 py-3">Date</th>
                                        <th class="px-6 py-3">To</th>
                                        <th class="px-6 py-3 text-center">Status</th>
                                        <th class="px-6 py-3 text-right">Amount</th>
                                        <th class="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-if="!client?.orders?.length" class="text-center text-slate-500">
                                        <td colspan="6" class="py-8">No orders found.</td>
                                    </tr>
                                    <tr v-for="order in client?.orders" :key="order.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-primary-600 hover:underline cursor-pointer">{{ order.order_number }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ order.date }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ order.to }}</td>
                                        <td class="px-6 py-4 text-center">
                                            <span :class="getInvoiceStatusColor(order.status)" class="px-2.5 py-1 rounded-md text-xs font-semibold border capitalize">{{ order.status }}</span>
                                        </td>
                                        <td class="px-6 py-4 text-right font-medium text-slate-700">${{ Number(order.amount).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-right flex gap-3 justify-end">
                                            <button @click="notImplemented" class="text-slate-400 hover:text-primary-600" title="Edit Order">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                            <button @click="deleteTransaction(order.id, 'order')" class="text-slate-400 hover:text-red-600" title="Delete Order">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>

                 <!-- EXPENSES TAB -->
                 <div v-if="activeTab === 'expenses'">
                     <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Expenses</h3>
                            <button @click="selectedExpense = {}; showExpenseDetailModal = true" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                                Add Expense
                            </button>
                        </div>
                        <div class="p-4 border-b border-slate-200 flex gap-4">
                             <div class="relative flex-1 max-w-sm ml-auto">
                                <input type="text" placeholder="Search expenses..." class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" />
                                <svg class="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">Date</th>
                                        <th class="px-6 py-3">Number</th>
                                        <th class="px-6 py-3">Category</th>
                                        <th class="px-6 py-3">Description</th>
                                        <th class="px-6 py-3 text-right">Amount</th>
                                        <th class="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-if="!client?.expenses?.length" class="text-center text-slate-500">
                                        <td colspan="6" class="py-8">No expenses found.</td>
                                    </tr>
                                    <tr v-for="expense in client?.expenses" :key="expense.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 text-slate-600">{{ expense.date }}</td>
                                        <td class="px-6 py-4 font-medium text-primary-600 hover:underline cursor-pointer" @click="selectedExpense = expense; showExpenseDetailModal = true">{{ expense.expense_number }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ expense.category }}</td>
                                        <td class="px-6 py-4 text-slate-600 truncate max-w-xs">{{ expense.title }}</td>
                                        <td class="px-6 py-4 text-right font-medium text-slate-700">${{ Number(expense.amount).toLocaleString() }}</td>
                                        <td class="px-6 py-4 text-right flex gap-3 justify-end">
                                            <button @click="selectedExpense = expense; showExpenseDetailModal = true" class="text-slate-400 hover:text-primary-600" title="View/Edit">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            </button>
                                            <button @click="deleteTransaction(expense.id, 'expense')" class="text-slate-400 hover:text-red-600" title="Delete">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>

                 <!-- FILES TAB -->
                 <div v-if="activeTab === 'files'">
                    <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                            <h3 class="text-lg font-bold text-slate-800">Files</h3>
                            <div class="flex gap-2">
                                <div class="bg-white border border-slate-200 rounded-lg p-1 flex">
                                    <button @click="filesViewMode = 'list'" :class="filesViewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'" class="p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                                    <button @click="filesViewMode = 'grid'" :class="filesViewMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'" class="p-1.5 rounded transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg></button>
                                </div>
                                <button @click="notImplemented" class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 shadow-sm">
                                    <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    Upload File
                                </button>
                            </div>
                        </div>
                        
                         <!-- LIST VIEW -->
                         <div v-if="filesViewMode === 'list'" class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3">Variable</th>
                                        <th class="px-6 py-3">Size</th>
                                        <th class="px-6 py-3">Uploaded By</th>
                                        <th class="px-6 py-3">Created At</th>
                                        <th class="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr v-if="!client?.files?.length" class="text-center text-slate-500">
                                        <td colspan="5" class="py-8">No files found.</td>
                                    </tr>
                                    <tr v-for="file in client?.files" :key="file.id" class="hover:bg-slate-50/50 transition-colors">
                                        <td class="px-6 py-4 font-medium text-slate-800 flex items-center gap-2">
                                            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                            {{ file.name }}
                                        </td>
                                        <td class="px-6 py-4 text-slate-600">{{ file.size }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ file.user }}</td>
                                        <td class="px-6 py-4 text-slate-600">{{ file.date }}</td>
                                        <td class="px-6 py-4 text-right flex gap-3 justify-end">
                                            <button @click="notImplemented" class="text-slate-400 hover:text-primary-600" title="Download">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            </button>
                                            <button @click="deleteTransaction(file.id, 'file')" class="text-slate-400 hover:text-red-600" title="Delete">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                         </div>

                         <!-- GRID VIEW -->
                         <div v-else class="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                             <div v-for="file in client?.files" :key="file.id" class="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow relative group">
                                 <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                     <button @click="notImplemented" class="p-1 rounded bg-white shadow text-slate-500 hover:text-primary-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                                     <button @click="deleteTransaction(file.id, 'file')" class="p-1 rounded bg-white shadow text-slate-500 hover:text-red-600"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                 </div>
                                 <div class="flex flex-col items-center text-center">
                                     <div class="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 mb-3">
                                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                     </div>
                                     <h4 class="font-medium text-slate-800 text-sm truncate w-full" :title="file.name">{{ file.name }}</h4>
                                     <p class="text-xs text-slate-500 mt-1">{{ file.size }}</p>
                                 </div>
                             </div>
                             <div v-if="!client?.files?.length" class="col-span-full text-center py-8 text-slate-500">No files found.</div>
                         </div>
                    </div>
                 </div>

             </div>
          </div>
        </div>
      </div>
    </div>
  </div>


    <!-- Edit Client Modal -->
    <div v-if="showEditClientModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showEditClientModal = false">
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all scale-100">
        <div class="sticky top-0 bg-white px-8 py-6 border-b border-slate-100 z-10 flex justify-between items-center">
            <h2 class="text-2xl font-bold text-slate-800">Edit Client</h2>
            <button @click="showEditClientModal = false" class="text-slate-400 hover:text-slate-600 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        <form @submit.prevent="saveClient" class="p-8 space-y-6">
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Client Code</label>
              <input v-model="clientForm.code" type="text" required class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Company Name</label>
              <input v-model="clientForm.name" type="text" required class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-700">Address</label>
            <textarea v-model="clientForm.address" rows="3" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none"></textarea>
          </div>

           <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Phone</label>
              <input v-model="clientForm.phone" type="tel" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Website</label>
              <input v-model="clientForm.website" type="url" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" />
            </div>
          </div>

          <div class="pt-6 border-t border-slate-100 flex gap-4 justify-end">
             <button type="button" @click="showEditClientModal = false" class="px-6 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
             <button type="submit" class="px-6 py-2.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 shadow-lg shadow-primary-500/30 transition-all">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    <!-- New Transaction Modal -->
    <div v-if="showTransactionModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showTransactionModal = false">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden transform transition-all scale-100">
            <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-800">New Transaction</h3>
                <button @click="showTransactionModal = false" class="text-slate-400 hover:text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <form @submit.prevent="saveTransaction" class="p-6 space-y-4">
                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Transaction Type</label>
                    <select v-model="transactionForm.type" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                        <option value="invoice">Invoice</option>
                        <option value="quote">Quote / Estimate</option>
                        <option value="order">Sales Order</option>
                    </select>
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Date</label>
                    <input v-model="transactionForm.date" type="date" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Due Date / Valid Until</label>
                    <input v-model="transactionForm.due_date" type="date" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Total Amount</label>
                    <div class="relative">
                        <span class="absolute left-3 top-2 text-slate-400">$</span>
                        <input v-model.number="transactionForm.total_amount" type="number" min="0" step="0.01" required class="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Notes</label>
                    <textarea v-model="transactionForm.notes" rows="2" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"></textarea>
                </div>

                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" @click="showTransactionModal = false" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-lg shadow-primary-500/30 transition-all">Create</button>
                </div>
            </form>
        </div>
    </div>


    <!-- New Project Modal -->
    <div v-if="showAddProjectModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showAddProjectModal = false">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden transform transition-all scale-100">
            <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-800">New Project</h3>
                <button @click="showAddProjectModal = false" class="text-slate-400 hover:text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <form @submit.prevent="saveProject" class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Project Number</label>
                        <input v-model="projectForm.project_number" type="text" placeholder="Auto-generated" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                    </div>
                     <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Price</label>
                        <div class="relative">
                            <span class="absolute left-3 top-2 text-slate-400">$</span>
                            <input v-model.number="projectForm.price" type="number" step="0.01" class="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                        </div>
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Project Name</label>
                    <input v-model="projectForm.name" type="text" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Start Date</label>
                        <input v-model="projectForm.start_date" type="date" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Due Date</label>
                        <input v-model="projectForm.end_date" type="date" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Priority</label>
                        <select v-model="projectForm.priority" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                     <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Status</label>
                        <select v-model="projectForm.status" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="hold">Hold</option>
                        </select>
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Description</label>
                    <textarea v-model="projectForm.description" rows="3" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"></textarea>
                </div>

                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" @click="showAddProjectModal = false" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-lg shadow-primary-500/30 transition-all">Create Project</button>
                </div>
            </form>
        </div>
    </div>

    <!-- New Subscription Modal -->
    <div v-if="showAddSubscriptionModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showAddSubscriptionModal = false">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden transform transition-all scale-100">
            <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-800">New Subscription</h3>
                <button @click="showAddSubscriptionModal = false" class="text-slate-400 hover:text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <form @submit.prevent="saveSubscription" class="p-6 space-y-4">
                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Plan / Title</label>
                    <input v-model="subscriptionForm.title" type="text" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>
                
                 <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Amount</label>
                        <div class="relative">
                            <span class="absolute left-3 top-2 text-slate-400">$</span>
                            <input v-model.number="subscriptionForm.amount" type="number" step="0.01" required class="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                        </div>
                    </div>
                     <div class="space-y-2">
                        <label class="text-sm font-semibold text-slate-700">Billing Cycle</label>
                         <select v-model="subscriptionForm.repeat_every" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                            <option value="1 Month">Monthly</option>
                            <option value="1 Year">Yearly</option>
                            <option value="3 Months">Quarterly</option>
                        </select>
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Next Billing Date</label>
                    <input v-model="subscriptionForm.next_billing_date" type="date" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>

                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" @click="showAddSubscriptionModal = false" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-lg shadow-primary-500/30 transition-all">Start Subscription</button>
                </div>
            </form>
        </div>
    </div>

    <!-- New Payment Modal -->
    <div v-if="showAddPaymentModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showAddPaymentModal = false">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden transform transition-all scale-100">
            <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-800">Record Payment</h3>
                <button @click="showAddPaymentModal = false" class="text-slate-400 hover:text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <form @submit.prevent="savePayment" class="p-6 space-y-4">
                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Payment Date</label>
                    <input v-model="paymentForm.date" type="date" required class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Amount Received</label>
                    <div class="relative">
                        <span class="absolute left-3 top-2 text-slate-400">$</span>
                        <input v-model.number="paymentForm.amount" type="number" step="0.01" required class="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                    </div>
                </div>

                 <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Payment Method</label>
                    <select v-model="paymentForm.method" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Credit Card">Credit Card</option>
                        <option value="Cash">Cash</option>
                        <option value="Check">Check</option>
                        <option value="PayPal">PayPal</option>
                    </select>
                </div>

                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700">Note / Reference</label>
                    <textarea v-model="paymentForm.note" rows="2" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"></textarea>
                </div>

                <div class="pt-4 flex justify-end gap-3">
                    <button type="button" @click="showAddPaymentModal = false" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" class="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-lg shadow-primary-500/30 transition-all">Save Payment</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Expense Detail Modal -->
    <div v-if="showExpenseDetailModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showExpenseDetailModal = false">
        <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden transform transition-all scale-100 min-h-[600px] flex flex-col">
            <div class="bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-800">Expense details</h3>
                <button @click="showExpenseDetailModal = false" class="text-slate-400 hover:text-slate-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div class="p-6 bg-slate-50 border-b border-slate-200">
                <div class="bg-white rounded-lg p-1 inline-flex shadow-sm">
                    <button @click="activeExpenseTab = 'details'" :class="activeExpenseTab === 'details' ? 'bg-white shadow text-slate-800 font-bold' : 'text-slate-500 hover:text-slate-700'" class="px-6 py-2 rounded-md text-sm transition-all">Details</button>
                    <button @click="activeExpenseTab = 'tasks'" :class="activeExpenseTab === 'tasks' ? 'bg-white shadow text-slate-800 font-bold' : 'text-slate-500 hover:text-slate-700'" class="px-6 py-2 rounded-md text-sm transition-all">Tasks</button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-6">
                <!-- DETAILS TAB -->
                <div v-if="activeExpenseTab === 'details'" class="space-y-6">
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">Expense # {{ selectedExpense?.expense_number }}</h2>
                        <div class="text-lg text-slate-600 mt-1">${{ Number(selectedExpense?.amount).toLocaleString(undefined, {minimumFractionDigits: 2}) }}</div>
                    </div>

                    <div class="grid grid-cols-1 gap-6">
                         <div>
                            <div class="text-sm font-bold text-primary-900 uppercase tracking-wide mb-1">ADV</div>
                            <div class="text-slate-500">-</div>
                         </div>
                         
                         <div>
                            <div class="text-sm font-bold text-slate-700 mb-1">Category: <span class="font-normal">{{ selectedExpense?.category }}</span></div>
                         </div>
                    </div>
                </div>

                <!-- TASKS TAB -->
                <div v-if="activeExpenseTab === 'tasks'" class="space-y-4">
                     <div class="flex justify-between items-center">
                        <h3 class="font-bold text-slate-800">Tasks</h3>
                        <button class="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                             <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                             Add task
                        </button>
                     </div>

                     <div class="flex justify-between items-center gap-4">
                        <button class="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                         <div class="relative flex-1">
                             <input type="text" placeholder="Search" class="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none transition-all">
                             <svg class="w-4 h-4 absolute right-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                         </div>
                     </div>

                     <div class="border-t border-slate-100 pt-4">
                        <table class="min-w-full text-sm text-left">
                            <thead class="text-slate-500 font-bold border-b border-slate-100">
                                <tr>
                                    <th class="py-3 px-2">ID</th>
                                    <th class="py-3 px-2">Title</th>
                                    <th class="py-3 px-2">Start date</th>
                                    <th class="py-3 px-2">Deadline</th>
                                    <th class="py-3 px-2">Assigned to</th>
                                    <th class="py-3 px-2">Status</th>
                                    <th class="py-3 px-2 text-right"><svg class="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="!selectedExpense?.tasks?.length">
                                    <td colspan="7" class="py-8 text-center text-slate-500">No record found.</td>
                                </tr>
                                <tr v-for="task in selectedExpense?.tasks" :key="task.id" class="border-b border-slate-50 hover:bg-slate-50">
                                     <td class="py-3 px-2">{{ task.id }}</td>
                                     <td class="py-3 px-2 font-medium text-slate-800">{{ task.title }}</td>
                                     <td class="py-3 px-2 text-slate-500">{{ task.start_date }}</td>
                                     <td class="py-3 px-2 text-slate-500">{{ task.deadline }}</td>
                                     <td class="py-3 px-2 text-slate-500">{{ task.assigned_to }}</td>
                                      <td class="py-3 px-2">
                                          <span class="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">{{ task.status }}</span>
                                      </td>
                                      <td class="py-3 px-2"></td>
                                </tr>
                            </tbody>
                        </table>
                        
                        <div class="mt-4 flex items-center justify-between text-sm text-slate-500">
                             <div class="flex items-center gap-2">
                                <select class="border border-slate-200 rounded px-2 py-1 bg-white focus:ring-primary-500 focus:border-primary-500">
                                    <option>10</option>
                                    <option>25</option>
                                    <option>50</option>
                                </select>
                                <span>0-0 / 0</span>
                             </div>
                             <div class="flex gap-1">
                                 <button class="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-50" disabled><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg></button>
                                 <button class="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-50" disabled><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg></button>
                             </div>
                        </div>
                     </div>
                </div>
            </div>

            <div class="bg-white px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                 <button @click="cloneExpense" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg flex items-center gap-2 hover:bg-slate-50">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                    Clone expense
                 </button>
                 <button @click="notImplemented" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg flex items-center gap-2 hover:bg-slate-50">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    Edit expense
                 </button>
                 <button @click="showExpenseDetailModal = false" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg flex items-center gap-2 hover:bg-slate-50">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    Close
                 </button>
            </div>
        </div>
    </div>

    <!-- Project Detail Modal -->
    <div v-if="showProjectDetailModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 h-[90vh] flex flex-col">
            <!-- Modal Header -->
            <div class="bg-white px-8 py-6 border-b border-slate-200 flex justify-between items-start">
                <div class="flex-1">
                    <h2 class="text-2xl font-bold text-slate-900">{{ selectedProject?.name }}</h2>
                    <p class="text-sm text-slate-500 mt-2 font-mono">{{ selectedProject?.project_number }}</p>
                    <div class="flex gap-3 mt-3">
                        <span :class="getProjectStatusColor(selectedProject?.status)" class="px-3 py-1 rounded-full text-xs font-semibold border">
                            {{ selectedProject?.status?.replace('_', ' ') }}
                        </span>
                        <span v-if="selectedProject?.priority" :class="{'bg-green-100 text-green-700 border-green-200': selectedProject.priority === 'low', 'bg-amber-100 text-amber-700 border-amber-200': selectedProject.priority === 'medium', 'bg-red-100 text-red-700 border-red-200': selectedProject.priority === 'high'}" class="border px-3 py-1 rounded-full text-xs font-semibold">
                            {{ selectedProject?.priority }} Priority
                        </span>
                    </div>
                </div>
                <button @click="showProjectDetailModal = false" class="text-slate-400 hover:text-slate-600 transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <!-- Project Tabs -->
            <div class="bg-slate-50 border-b border-slate-200 flex">
                <button 
                    @click="activeProjectTab = 'overview'"
                    :class="activeProjectTab === 'overview' ? 'bg-white border-b-2 border-primary-500 text-primary-700' : 'text-slate-500 hover:text-slate-700'"
                    class="flex-1 px-6 py-3 font-medium text-sm transition-colors"
                >
                    Overview
                </button>
                <button 
                    @click="activeProjectTab = 'tasks'"
                    :class="activeProjectTab === 'tasks' ? 'bg-white border-b-2 border-primary-500 text-primary-700' : 'text-slate-500 hover:text-slate-700'"
                    class="flex-1 px-6 py-3 font-medium text-sm transition-colors"
                >
                    Tasks
                </button>
                <button 
                    @click="activeProjectTab = 'files'"
                    :class="activeProjectTab === 'files' ? 'bg-white border-b-2 border-primary-500 text-primary-700' : 'text-slate-500 hover:text-slate-700'"
                    class="flex-1 px-6 py-3 font-medium text-sm transition-colors"
                >
                    Files
                </button>
                <button 
                    @click="activeProjectTab = 'details'"
                    :class="activeProjectTab === 'details' ? 'bg-white border-b-2 border-primary-500 text-primary-700' : 'text-slate-500 hover:text-slate-700'"
                    class="flex-1 px-6 py-3 font-medium text-sm transition-colors"
                >
                    Details
                </button>
            </div>

            <!-- Project Tab Content -->
            <div class="flex-1 overflow-y-auto p-8">
                <!-- OVERVIEW TAB -->
                <div v-if="activeProjectTab === 'overview'" class="space-y-6">
                    <div class="grid grid-cols-2 gap-6">
                        <div class="bg-slate-50 rounded-lg p-6">
                            <div class="text-sm text-slate-500 font-medium mb-2">Progress</div>
                            <div class="text-3xl font-bold text-slate-900 mb-3">{{ selectedProject?.progress || 0 }}%</div>
                            <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div class="bg-primary-500 h-2 rounded-full" :style="{ width: `${selectedProject?.progress || 0}%` }"></div>
                            </div>
                        </div>
                        
                        <div class="bg-slate-50 rounded-lg p-6">
                            <div class="text-sm text-slate-500 font-medium mb-2">Budget</div>
                            <div class="text-3xl font-bold text-slate-900">{{ selectedProject?.price ? '$' + Number(selectedProject.price).toLocaleString() : '-' }}</div>
                        </div>
                    </div>

                    <div class="bg-white border border-slate-200 rounded-lg p-6">
                        <h3 class="font-bold text-slate-800 mb-4">Key Information</h3>
                        <div class="grid grid-cols-2 gap-6">
                            <div>
                                <div class="text-sm text-slate-500 mb-1">Start Date</div>
                                <div class="font-medium text-slate-800">{{ selectedProject?.start_date }}</div>
                            </div>
                            <div>
                                <div class="text-sm text-slate-500 mb-1">End Date</div>
                                <div class="font-medium text-slate-800">{{ selectedProject?.end_date }}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TASKS TAB -->
                <div v-if="activeProjectTab === 'tasks'" class="space-y-4">
                    <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div class="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 class="font-bold text-slate-800">Project Tasks</h3>
                            <button class="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium">Add Task</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3 font-bold text-slate-600">Task</th>
                                        <th class="px-6 py-3 font-bold text-slate-600">Status</th>
                                        <th class="px-6 py-3 font-bold text-slate-600">Assigned</th>
                                        <th class="px-6 py-3 font-bold text-slate-600">Due Date</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr class="hover:bg-slate-50">
                                        <td class="px-6 py-4 font-medium text-slate-700">Setup project infrastructure</td>
                                        <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-700">In Progress</span></td>
                                        <td class="px-6 py-4 text-slate-600">John Doe</td>
                                        <td class="px-6 py-4 text-slate-600">2026-02-20</td>
                                    </tr>
                                    <tr class="hover:bg-slate-50">
                                        <td class="px-6 py-4 font-medium text-slate-700">Design mockups</td>
                                        <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">Pending</span></td>
                                        <td class="px-6 py-4 text-slate-600">Jane Smith</td>
                                        <td class="px-6 py-4 text-slate-600">2026-02-25</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- FILES TAB -->
                <div v-if="activeProjectTab === 'files'" class="space-y-4">
                    <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <div class="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 class="font-bold text-slate-800">Project Files</h3>
                            <button class="px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Upload File</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm text-left">
                                <thead class="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th class="px-6 py-3 font-bold text-slate-600">File Name</th>
                                        <th class="px-6 py-3 font-bold text-slate-600">Size</th>
                                        <th class="px-6 py-3 font-bold text-slate-600">Uploaded By</th>
                                        <th class="px-6 py-3 font-bold text-slate-600">Date</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <tr class="hover:bg-slate-50">
                                        <td class="px-6 py-4 font-medium text-slate-700 flex items-center gap-2">
                                            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                            Project_Specification.pdf
                                        </td>
                                        <td class="px-6 py-4 text-slate-600">2.4 MB</td>
                                        <td class="px-6 py-4 text-slate-600">Admin</td>
                                        <td class="px-6 py-4 text-slate-600">2026-02-10</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- DETAILS TAB -->
                <div v-if="activeProjectTab === 'details'" class="space-y-6">
                    <div class="bg-white border border-slate-200 rounded-lg p-6">
                        <h3 class="font-bold text-slate-800 mb-4">Project Details</h3>
                        <dl class="space-y-4">
                            <div class="flex justify-between py-3 border-b border-slate-100">
                                <dt class="text-slate-600 font-medium">Project ID</dt>
                                <dd class="text-slate-800 font-medium">{{ selectedProject?.project_number }}</dd>
                            </div>
                            <div class="flex justify-between py-3 border-b border-slate-100">
                                <dt class="text-slate-600 font-medium">Status</dt>
                                <dd class="text-slate-800 font-medium">{{ selectedProject?.status?.replace('_', ' ') }}</dd>
                            </div>
                            <div class="flex justify-between py-3 border-b border-slate-100">
                                <dt class="text-slate-600 font-medium">Priority</dt>
                                <dd class="text-slate-800 font-medium">{{ selectedProject?.priority }}</dd>
                            </div>
                            <div class="flex justify-between py-3 border-b border-slate-100">
                                <dt class="text-slate-600 font-medium">Budget</dt>
                                <dd class="text-slate-800 font-medium">{{ selectedProject?.price ? '$' + Number(selectedProject.price).toLocaleString() : '-' }}</dd>
                            </div>
                            <div class="flex justify-between py-3 border-b border-slate-100">
                                <dt class="text-slate-600 font-medium">Progress</dt>
                                <dd class="text-slate-800 font-medium">{{ selectedProject?.progress || 0 }}%</dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </div>

            <!-- Modal Footer -->
            <div class="bg-slate-50 px-8 py-4 border-t border-slate-200 flex justify-end gap-3">
                <button @click="showProjectDetailModal = false" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white border border-slate-200 rounded-lg transition-colors">
                    Close
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const router = useRouter();

const activeTab = ref('overview');

const client = ref<any>(null);

const tabs = computed(() => {
    return [
        { id: 'overview', label: 'Overview' },
        { id: 'projects', label: 'Projects', count: client.value?.projects?.length },
        { id: 'subscriptions', label: 'Subscriptions', count: client.value?.subscriptions?.length },
        { id: 'invoices', label: 'Invoices', count: client.value?.invoices?.length },
        { id: 'payments', label: 'Payments', count: client.value?.payments?.length },
        { id: 'statement', label: 'Statement' },
        { id: 'orders', label: 'Orders', count: client.value?.orders?.length },
        { id: 'estimates', label: 'Estimates', count: client.value?.estimates?.length },
        { id: 'proposals', label: 'Proposals', count: client.value?.proposals?.length },
        { id: 'contracts', label: 'Contracts', count: client.value?.contracts?.length },
        { id: 'files', label: 'Files', count: client.value?.files?.length },
        { id: 'expenses', label: 'Expenses', count: client.value?.expenses?.length },
    ];
});

// Helper for status colors
const getStatusColorClass = (status: string) => {
    switch((status || '').toLowerCase()) {
        case 'active': return 'bg-green-50 text-green-700 border-green-200';
        case 'inactive': return 'bg-slate-50 text-slate-700 border-slate-200';
        default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
}

const fetchClient = async () => {
  try {
    const response = await api.get(`/clients/${route.params.id}`);
    client.value = response.data.data;

    // --- MOCK DATA FOR UI DEMO ---
    // Populate missing data if not provided by backend
    if (!client.value.projects || client.value.projects.length === 0) {
        client.value.projects = [
            { id: 25, project_number: 'P-101', name: 'Data Analysis and Insights', priority: 'medium', price: 0, start_date: '2026-01-17', end_date: '2026-02-14', progress: 15, status: 'open' },
            { id: 12, project_number: 'P-102', name: 'Product Photography and Cataloging', priority: 'low', price: 4000, start_date: '2026-01-25', end_date: '2026-03-15', progress: 45, status: 'open' },
            { id: 11, project_number: 'P-103', name: 'Event Planning and Management', priority: 'high', price: 0, start_date: '2026-02-04', end_date: '2026-03-04', progress: 70, status: 'open' },
            { id: 1,  project_number: 'P-104', name: 'Mobile App Development', priority: 'high', price: 15000, start_date: '2026-01-10', end_date: '2026-01-17', progress: 30, status: 'overdue' },
        ];
    }
    
    // Mock subscriptions
    client.value.subscriptions = [
        { id: 1, code: 'SUB #2', title: 'Monthly subscription of 10 GB Hosting', next_billing_date: '2026-02-14', last_billing_date: '2026-01-14', repeat_every: '1 Month(s)', status: 'active', amount: 100 },
        { id: 2, code: 'SUB #1', title: 'Yearly subscription of example.com domain', next_billing_date: '2026-02-15', last_billing_date: '2025-02-15', repeat_every: '1 Year(s)', status: 'active', amount: 11 }
    ];

    // Mock payments
    client.value.payments = [
        { id: 101, code: 'INV #16', date: '2026-01-19', method: 'Cash', note: 'Dignissimos accusantium sunt enim expedita...', amount: 9000 }
    ];

    // Mock proposals
    if (!client.value.proposals || client.value.proposals.length === 0) {
        client.value.proposals = [
             { id: 6, proposal_number: 'PROPOSAL #6', date: '2026-01-21', valid_until: '2026-02-24', email_seen: '-', preview_seen: '2026-01-21 03:54:57 pm', amount: 1000.00, status: 'Accepted' },
             { id: 15, proposal_number: 'PROPOSAL #15', date: '2025-01-15', valid_until: '2026-03-15', email_seen: '-', preview_seen: 'Today at 08:05:13 am', amount: 20.00, status: 'Sent' }
        ];
    }

    // Mock contracts
    client.value.contracts = [
        { id: 20, title: 'Training and Workshop Services Contract', project: '-', start_date: '2026-01-08', end_date: '2026-03-11', amount: 150.00, status: 'Accepted' }
    ];

    // Mock files
    if (!client.value.files || client.value.files.length === 0) {
        client.value.files = [
            { id: 1, name: 'Project_Requirements.pdf', size: '2.4 MB', type: 'pdf', user: 'John Doe', date: '2026-02-10 10:00 AM' },
            { id: 2, name: 'Logo_Assets.zip', size: '15.6 MB', type: 'zip', user: 'Jane Smith', date: '2026-02-11 02:30 PM' },
            { id: 3, name: 'Contract_Signed.docx', size: '1.1 MB', type: 'doc', user: 'Admin', date: '2026-02-12 09:15 AM' }
        ];
    }

    // Mock expenses
    client.value.expenses = [
        { 
            id: 1, 
            expense_number: '12-02-2026', 
            date: '2026-02-12', 
            category: 'Advertising', 
            title: 'Google Ads Campaign', 
            description: 'Monthly marketing budget', 
            files_count: 2, 
            amount: 25000.00, 
            tax: 0, 
            second_tax: 0, 
            total: 25000.00,
            tasks: [
                { id: 10, title: 'Design ad creatives', start_date: '2026-02-12', deadline: '2026-02-14', assigned_to: 'John Doe', status: 'In Progress' },
                { id: 11, title: 'Setup campaign settings', start_date: '2026-02-13', deadline: '2026-02-15', assigned_to: 'Jane Smith', status: 'Pending' }
            ]
        },
        { 
            id: 2, 
            expense_number: '10-02-2026', 
            date: '2026-02-10', 
            category: 'Software', 
            title: 'Adobe CC Subscription', 
            description: 'Yearly license for design team', 
            files_count: 1, 
            amount: 1200.00, 
            tax: 120.00, 
            second_tax: 0, 
            total: 1320.00,
            tasks: []
        }
    ];
    
    // Mock orders
     if (!client.value.orders || client.value.orders.length === 0) {
        client.value.orders = [
            { id: 101, order_number: 'ORD-2026-001', date: '2026-02-10', to: 'Acme Corp', status: 'completed', amount: 1500.00 },
            { id: 102, order_number: 'ORD-2026-002', date: '2026-02-12', to: 'Global Tech', status: 'open', amount: 2350.50 },
            { id: 103, order_number: 'ORD-2026-003', date: '2026-02-15', to: 'InnoSystems', status: 'in_progress', amount: 4500.00 }
        ];
    }
     // Mock estimates
     if (!client.value.estimates || client.value.estimates.length === 0) {
        client.value.estimates = [
            { id: 201, estimate_number: 'EST-2026-001', date: '2026-02-01', valid_until: '2026-03-01', amount: 1200.00, status: 'sent' },
            { id: 202, estimate_number: 'EST-2026-002', date: '2026-02-05', valid_until: '2026-03-05', amount: 3500.00, status: 'draft' },
            { id: 203, estimate_number: 'EST-2026-003', date: '2026-02-10', valid_until: '2026-03-10', amount: 800.00, status: 'accepted' }
        ];
    }

    // ----------------------------

  } catch (error) {
    console.error('Error fetching client:', error);
  }
};

const isOverdue = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
};

const calculateInvoiceStatus = (status: string) => {
  if (!client.value?.invoices) return 0;
  return client.value.invoices
    .filter((inv: any) => inv.status === status)
    .reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0);
};

const getLabelColorClass = (color: string) => {
  const colors: any = {
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return colors[color] || 'bg-slate-50 text-slate-700 border-slate-200';
};

const getProjectStatusColor = (status: string) => {
  const colors: any = {
    open: 'bg-blue-50 text-blue-700 border-blue-200',
    in_progress: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    hold: 'bg-orange-50 text-orange-700 border-orange-200',
    canceled: 'bg-red-50 text-red-700 border-red-200'
  };
  return colors[status] || 'bg-slate-50 text-slate-700 border-slate-200';
};

const getInvoiceStatusColor = (status: string) => {
  const colors: any = {
    draft: 'bg-slate-50 text-slate-600 border-slate-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    partial: 'bg-orange-50 text-orange-700 border-orange-200',
    paid: 'bg-green-50 text-green-700 border-green-200',
    overdue: 'bg-red-50 text-red-700 border-red-200',
    canceled: 'bg-gray-100 text-gray-500 border-gray-200'
  };
  return colors[status] || 'bg-slate-50 text-slate-700 border-slate-200';
};

// State for Modals
const showAddContactModal = ref(false);
const showAddTicketModal = ref(false);
const showAddEventModal = ref(false);
const showEditClientModal = ref(false);
const showTransactionModal = ref(false);
const showAddProjectModal = ref(false);
const showAddSubscriptionModal = ref(false);
const showAddPaymentModal = ref(false);
const showExpenseDetailModal = ref(false);
const showProjectDetailModal = ref(false);

const activeExpenseTab = ref('details');
const selectedExpense = ref<any>(null);
const selectedProject = ref<any>(null);
const activeProjectTab = ref('overview');
const filesViewMode = ref('list');

const editingContactId = ref<string | null>(null);

// Forms
const contactForm = ref({
  name: '',
  job_title: '',
  email: '',
  phone: '',
  mobile: '',
  is_primary: false
});

const clientForm = ref({
  code: '',
  name: '',
  organization: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
  phone: '',
  website: '',
  client_group_id: null as number | null
});

const transactionForm = ref({
  type: 'invoice', // invoice, quote, order
  date: new Date().toISOString().split('T')[0],
  due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], // +30 days
  total_amount: 0,
  notes: ''
});

const ticketForm = ref({
  subject: '',
  priority: 'medium',
  status: 'open',
  description: '',
  contact_id: ''
});

const eventForm = ref({
  title: '',
  event_type: 'Meeting',
  event_date: new Date().toISOString().split('T')[0],
  event_time: '09:00',
  description: '',
  contact_id: ''
});

const projectForm = ref({
    name: '',
    project_number: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    priority: 'medium',
    status: 'open',
    price: 0,
    description: ''
});

const subscriptionForm = ref({
    title: '',
    amount: 0,
    next_billing_date: new Date().toISOString().split('T')[0],
    repeat_every: '1 Month',
    status: 'active'
});

const paymentForm = ref({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    method: 'Bank Transfer',
    note: '',
    invoice_id: null
});

// Ticket filtering
const ticketFilter = ref('all');
const ticketSearch = ref('');
const filteredTickets = computed(() => {
  let tickets = client.value?.tickets || [];
  
  if (ticketFilter.value !== 'all') {
    tickets = tickets.filter((t: any) => t.status === ticketFilter.value);
  }
  
  if (ticketSearch.value) {
    const search = ticketSearch.value.toLowerCase();
    tickets = tickets.filter((t: any) => 
      t.subject.toLowerCase().includes(search) || 
      (t.ticket_number && t.ticket_number.toLowerCase().includes(search))
    );
  }
  
  return tickets;
});

// Methods
const openExpenseDetail = (expense: any) => {
    selectedExpense.value = expense;
    activeExpenseTab.value = 'details';
    showExpenseDetailModal.value = true;
};

const editContact = (contact: any) => {
    editingContactId.value = contact.id;
    contactForm.value = {
        name: contact.name,
        job_title: contact.job_title,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        is_primary: !!contact.is_primary
    };
    showAddContactModal.value = true;
};

const deleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    try {
        await api.delete(`/clients/${route.params.id}/contacts/${contactId}`);
        fetchClient();
    } catch (error) {
        console.error('Error deleting contact:', error);
        alert('Failed to delete contact');
    }
};

const editClient = () => {
    if (!client.value) return;
    clientForm.value = {
        code: client.value.code,
        name: client.value.name,
        organization: client.value.organization,
        address: client.value.address,
        city: client.value.city,
        province: client.value.province,
        postal_code: client.value.postal_code,
        phone: client.value.phone,
        website: client.value.website,
        client_group_id: client.value.client_group_id
    };
    showEditClientModal.value = true;
};

const saveClient = async () => {
    try {
        await api.put(`/clients/${route.params.id}`, clientForm.value);
        showEditClientModal.value = false;
        fetchClient();
    } catch (error) {
        console.error('Error updating client:', error);
        alert('Failed to update client');
    }
};

const saveTransaction = async () => {
    try {
        const payload = { ...transactionForm.value } as any;
        
        if (payload.type === 'invoice') {
            payload.invoice_date = payload.date;
            delete payload.date;
             await api.post(`/clients/${route.params.id}/invoices`, payload);
             alert('Invoice created successfully!');
             fetchClient();

        } else if (payload.type === 'quote') {
            // Mock Estimate Creation and Navigation
            const mockId = Math.floor(Math.random() * 1000);
            
            // In a real app, we'd POST to backend and get the ID back
            // await axios.post(endpoint, payload, ...);
            
             // Create a mock estimate object to add to the list immediately (optimistic update)
            const newEstimate = {
                id: mockId,
                estimate_number: 'EST-' + mockId,
                date: payload.date,
                valid_until: payload.due_date,
                amount: payload.total_amount,
                status: 'draft'
            };
            
            if (!client.value.estimates) client.value.estimates = [];
            client.value.estimates.unshift(newEstimate);

            showTransactionModal.value = false;
            
            // Navigate to the Estimate/Proposal Editor
            router.push({ name: 'EstimatorProposalEditor', params: { id: mockId } });
            return;

        } else {
             alert('Order creation not implemented yet');
             return;
        }
        
        showTransactionModal.value = false;
    } catch (error) {
         console.error('Error creating transaction:', error);
         alert('Failed to create transaction');
    }
};

const deleteTransaction = async (id: number, type: string) => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

    try {
        // const token = localStorage.getItem('token');
        // await axios.delete(..., { headers: ... });
        
        // Mock deletion
        if (type === 'estimate' && client.value.estimates) {
            client.value.estimates = client.value.estimates.filter((e: any) => e.id !== id);
        } else if (type === 'order' && client.value.orders) {
            client.value.orders = client.value.orders.filter((o: any) => o.id !== id);
        } else if (type === 'expense' && client.value.expenses) {
            client.value.expenses = client.value.expenses.filter((e: any) => e.id !== id);
        }

        alert(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting ${type}:`, error);
        alert(`Failed to delete ${type}`);
    }
};

const cloneExpense = () => {
    if (!selectedExpense.value) return;
    const newExpense = { ...selectedExpense.value, id: Math.floor(Math.random() * 1000), expense_number: selectedExpense.value.expense_number + ' (Copy)' };
    if (!client.value.expenses) client.value.expenses = [];
    client.value.expenses.unshift(newExpense);
    alert('Expense cloned successfully');
    showExpenseDetailModal.value = false;
};



const saveContact = async () => {
    try {
        if (editingContactId.value) {
             await api.put(`/clients/${route.params.id}/contacts/${editingContactId.value}`, contactForm.value);
        } else {
            await api.post(`/clients/${route.params.id}/contacts`, contactForm.value);
        }
        
        showAddContactModal.value = false;
        editingContactId.value = null;
        // Reset form
        contactForm.value = { name: '', job_title: '', email: '', phone: '', mobile: '', is_primary: false };
        fetchClient(); // Refresh data
    } catch (error) {
        console.error('Error saving contact:', error);
        alert('Failed to save contact');
    }
};

const saveTicket = async () => {
    try {
        await api.post(`/clients/${route.params.id}/tickets`, ticketForm.value);
        showAddTicketModal.value = false;
        ticketForm.value = { subject: '', priority: 'medium', status: 'open', description: '', contact_id: '' };
        fetchClient();
    } catch (error) {
        console.error('Error saving ticket:', error);
        alert('Failed to save ticket');
    }
};

const saveEvent = async () => {
    try {
        await api.post(`/clients/events`, {
            ...eventForm.value,
            client_id: route.params.id
        });
        showAddEventModal.value = false;
        eventForm.value = { title: '', event_type: 'Meeting', event_date: new Date().toISOString().split('T')[0], event_time: '09:00', description: '', contact_id: '' };
        fetchClient();
    } catch (error) {
        console.error('Error saving event:', error);
        alert('Failed to save event');
    }
};

const saveProject = async () => {
    try {
        await api.post(`/projects`, {
            ...projectForm.value,
            client_id: route.params.id
        });
        
        showAddProjectModal.value = false;
        alert('Project created successfully!');
        fetchClient(); 
    } catch (error) {
        console.error('Error saving project:', error);
        alert('Failed to save project');
    }
};

const saveSubscription = async () => {
    try {
        // Mock update
        const newSub = {
            id: Math.floor(Math.random() * 1000),
            code: 'SUB-NEW',
            ...subscriptionForm.value,
            last_billing_date: '-'
        };
        if (!client.value.subscriptions) client.value.subscriptions = [];
        client.value.subscriptions.unshift(newSub);

        showAddSubscriptionModal.value = false;
        alert('Subscription created successfully!');
    } catch (error) {
        console.error('Error saving subscription:', error);
        alert('Failed to save subscription');
    }
};

const savePayment = async () => {
    try {
        // Mock update
        const newPayment = {
            id: Math.floor(Math.random() * 1000),
            code: 'PAY-NEW',
            ...paymentForm.value
        };
        if (!client.value.payments) client.value.payments = [];
        client.value.payments.unshift(newPayment);

        showAddPaymentModal.value = false;
        alert('Payment recorded successfully!');
    } catch (error) {
        console.error('Error saving payment:', error);
        alert('Failed to save payment');
    }
};

const openTransactionModal = (type: string = 'invoice') => {
    transactionForm.value.type = type;
    showTransactionModal.value = true;
};

const downloadStatement = () => {
    window.print();
};

const viewProject = (id: number) => {
    const project = client.value?.projects?.find((p: any) => p.id === id);
    if (project) {
        selectedProject.value = project;
        activeProjectTab.value = 'overview';
        showProjectDetailModal.value = true;
    }
};

const viewInvoice = (id: number) => {
    alert(`Navigating to Invoice #${id} details...`);
    // router.push(`/invoices/${id}`);
};

const deleteProject = (id: number) => {
     if (!confirm('Are you sure you want to delete this project?')) return;
     client.value.projects = client.value.projects.filter((p: any) => p.id !== id);
};

const notImplemented = () => {
    alert('This feature is coming soon!');
};

const sendInvitation = (email: string) => {
    if (!email) {
        alert('This contact has no email address.');
        return;
    }
    alert(`Invitation sent to ${email}`);
};

const currentDate = ref(new Date());

const currentMonthLabel = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

const changeMonth = (delta: number) => {
  const d = new Date(currentDate.value);
  d.setMonth(d.getMonth() + delta);
  currentDate.value = d;
};

const goToToday = () => {
  currentDate.value = new Date();
};

const calendarCells = computed(() => {
  const date = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth(), 1);
  const startDay = date.getDay();
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - startDay);

  const cells = [];
  const events = client.value?.events || [];

  for (let i = 0; i < 42; i++) { // 6 weeks
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const isoDate = cellDate.toISOString().slice(0, 10);
    const isCurrentMonth = cellDate.getMonth() === currentDate.value.getMonth();
    const isToday = isoDate === new Date().toISOString().slice(0, 10);
    const day = cellDate.getDate();
    
    // Filter events for this day
    const cellEvents = events.filter((e: any) => {
        const eDate = e.event_date ? (e.event_date.toString().includes('T') ? e.event_date.split('T')[0] : e.event_date) : '';
        return eDate === isoDate;
    });

    cells.push({
      key: isoDate,
      day,
      date: isoDate,
      isCurrentMonth,
      isToday,
      events: cellEvents
    });
  }

  return cells;
});

onMounted(() => {
  fetchClient();
});
</script>
