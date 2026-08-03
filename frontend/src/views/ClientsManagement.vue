<template>
  <div class="min-h-screen bg-[#f4f6fb] font-sans text-slate-600">
    <!-- Header -->
    <div class="bg-white border-b border-gray-100 sticky top-0 z-20">
      <div class="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-4">
            <h1 class="text-xl font-bold text-slate-800 tracking-tight">Clients</h1>
            <div class="hidden md:flex items-center text-sm text-slate-400 gap-2">
              <span>/</span>
              <span>Management</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button @click="showAddClientModal = true" class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-primary-500/30">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              Add client
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="bg-white border-b border-gray-200 shadow-sm">
      <div class="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex space-x-8 -mb-px">
          <button
            v-for="tab in ['Overview', 'Clients', 'Contacts']"
            :key="tab"
            @click="activeTab = tab.toLowerCase()"
            :class="[
              activeTab === tab.toLowerCase()
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              'whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors'
            ]"
          >
            {{ tab }}
          </button>
        </div>
      </div>
    </div>

    <div class="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      <!--OVERVIEW TAB -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
         <!-- Info Cards -->
         <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="bg-white p-6 rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 border border-slate-100 group">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                     <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <div>
                     <p class="text-sm font-medium text-slate-500">Total Clients</p>
                     <p class="text-2xl font-bold text-slate-800 mt-1">{{ dashboard.metrics?.totalClients || 0 }}</p>
                  </div>
               </div>
            </div>
            
            <div class="bg-white p-6 rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 border border-slate-100 group">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                     <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                     <p class="text-sm font-medium text-slate-500">Total Contacts</p>
                     <p class="text-2xl font-bold text-slate-800 mt-1">{{ dashboard.metrics?.totalContacts || 0 }}</p>
                  </div>
               </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 border border-slate-100 group">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-green-50 text-green-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                     <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                     <p class="text-sm font-medium text-slate-500">Active Projects</p>
                     <p class="text-2xl font-bold text-slate-800 mt-1">{{ dashboard.projects?.open || 0 }}</p>
                  </div>
               </div>
            </div>

             <div class="bg-white p-6 rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 border border-slate-100 group">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-red-50 text-red-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                     <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                     <p class="text-sm font-medium text-slate-500">Overdue Invoices</p>
                     <p class="text-2xl font-bold text-slate-800 mt-1">{{ dashboard.invoices?.overdue || 0 }}</p>
                  </div>
               </div>
            </div>
         </div>

         <!-- Statistics Grid -->
         <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Invoice Stats -->
            <div class="bg-white rounded-xl shadow-card border border-slate-100 p-6">
               <h3 class="text-lg font-semibold text-slate-800 mb-6">Invoice Status</h3>
               <div class="space-y-5">
                  <div v-for="(stat, idx) in [
                     { label: 'Unpaid', value: dashboard.invoices?.unpaid, percent: dashboard.invoices?.unpaidPercentage, color: 'bg-orange-500' },
                     { label: 'Partially Paid', value: dashboard.invoices?.partial, percent: dashboard.invoices?.partialPercentage, color: 'bg-blue-500' },
                     { label: 'Overdue', value: dashboard.invoices?.overdue, percent: dashboard.invoices?.overduePercentage, color: 'bg-red-500' }
                  ]" :key="idx">
                     <div class="flex justify-between items-end mb-1">
                        <span class="text-sm font-medium text-slate-600">{{ stat.label }}</span>
                        <div class="text-right">
                           <span class="text-lg font-bold text-slate-800 block">{{ stat.value }}</span>
                           <span class="text-xs text-slate-400">{{ stat.percent }}%</span>
                        </div>
                     </div>
                     <div class="w-full bg-slate-100 rounded-full h-2">
                        <div :class="['h-2 rounded-full transition-all duration-1000', stat.color]" :style="{ width: `${stat.percent}%` }"></div>
                     </div>
                  </div>
               </div>
            </div>

            <!-- Project Stats -->
            <div class="bg-white rounded-xl shadow-card border border-slate-100 p-6">
               <h3 class="text-lg font-semibold text-slate-800 mb-6">Project Status</h3>
               <div class="grid grid-cols-2 gap-4">
                  <div v-for="stat in [
                     { label: 'Open', value: dashboard.projects?.open, color: 'text-blue-600', bg: 'bg-blue-50' },
                     { label: 'Completed', value: dashboard.projects?.completed, color: 'text-green-600', bg: 'bg-green-50' },
                     { label: 'On Hold', value: dashboard.projects?.hold, color: 'text-amber-600', bg: 'bg-amber-50' },
                     { label: 'Canceled', value: dashboard.projects?.canceled, color: 'text-red-600', bg: 'bg-red-50' },
                  ]" :key="stat.label" class="p-4 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                     <div class="text-sm text-slate-500 mb-1">{{ stat.label }}</div>
                     <div :class="['text-2xl font-bold', stat.color]">{{ stat.value }}</div>
                  </div>
               </div>
            </div>
         </div>
      </div>

      <!-- CLIENTS TAB -->
      <div v-if="activeTab === 'clients'" class="space-y-6">
        <!-- Control Bar -->
        <div class="bg-white rounded-xl shadow-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-100">
           <div class="flex items-center gap-3 w-full sm:w-auto">
              <div class="relative group">
                 <button class="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filters
                 </button>
              </div>
              <select v-model="clientFilters.hasDue" class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow outline-none">
                 <option value="">All Clients</option>
                 <option value="true">Has Due Amount</option>
                 <option value="has_open_projects">Has Open Projects</option>
              </select>
           </div>
           
           <div class="flex items-center gap-3 w-full sm:w-auto">
              <div class="relative w-full sm:w-64">
                 <input 
                    v-model="searchClients" 
                    @input="debouncedSearchClients"
                    type="text" 
                    placeholder="Search clients..." 
                    class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                 />
                 <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <div class="flex items-center gap-1 border-l border-slate-200 pl-3">
                 <button class="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Export Excel">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                 </button>
                 <button class="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Print">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                 </button>
              </div>
           </div>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-xl shadow-card border border-slate-200 overflow-hidden">
           <table class="min-w-full divide-y divide-slate-100">
              <thead class="bg-slate-50">
                 <tr>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client / ID</th>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Primary Contact</th>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags & Groups</th>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Projects</th>
                    <th scope="col" class="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Amount</th>
                    <th scope="col" class="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                 </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                 <tr v-for="client in clients" :key="client.id" class="group hover:bg-blue-50/30 transition-colors">
                    <td class="px-6 py-4 whitespace-nowrap">
                       <div class="flex items-center">
                          <div class="flex-shrink-0 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                             {{ client.name.charAt(0) }}
                          </div>
                          <div class="ml-4">
                             <router-link :to="`/clients/${client.id}`" class="text-sm font-semibold text-slate-900 hover:text-primary-600 transition-colors">
                                {{ client.name }}
                             </router-link>
                             <div class="text-xs text-slate-500">{{ client.code }}</div>
                          </div>
                       </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                       <div v-if="client.primary_contact_name" class="flex items-center">
                          <div class="h-6 w-6 rounded-full bg-slate-200 text-[10px] flex items-center justify-center mr-2">
                             {{ client.primary_contact_name.charAt(0) }}
                          </div>
                          <div class="text-sm text-slate-600">{{ client.primary_contact_name }}</div>
                       </div>
                       <span v-else class="text-xs text-slate-400 italic">No primary contact</span>
                    </td>
                    <td class="px-6 py-4">
                       <div class="flex flex-wrap gap-2">
                          <span v-if="client.group_name" :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getGroupColorClass(client.group_color)}`">
                             {{ client.group_name }}
                          </span>
                          <span v-for="label in client.labels" :key="label.id" :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLabelColorClass(label.color)}`">
                             {{ label.name }}
                          </span>
                       </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap vertical-align-middle">
                       <div class="w-24">
                          <div class="flex justify-between mb-1">
                             <span class="text-xs font-medium text-slate-600">{{ client.projects_count || 0 }} Projects</span>
                          </div>
                          <div class="w-full bg-slate-100 rounded-full h-1.5">
                             <div class="bg-primary-500 h-1.5 rounded-full" style="width: 60%"></div> <!-- Mock Percentage for now -->
                          </div>
                       </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right">
                       <span :class="client.due_amount > 0 ? 'text-red-600 font-bold' : 'text-slate-600'">
                          {{ formatCurrency(client.due_amount) }}
                       </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button @click="viewClient(client)" class="text-slate-400 hover:text-primary-600 transition-colors p-1" title="View Details">
                             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button @click="editClient(client)" class="text-slate-400 hover:text-green-600 transition-colors p-1" title="Edit">
                             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                       </div>
                    </td>
                 </tr>
              </tbody>
           </table>
           
           <!-- Pagination -->
           <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-slate-100">
              <div class="flex-1 flex justify-between sm:hidden">
                 <button @click="changePage(clientsPagination.page - 1)" :disabled="clientsPagination.page === 1" class="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">Previous</button>
                 <button @click="changePage(clientsPagination.page + 1)" :disabled="clientsPagination.page * clientsPagination.limit >= clientsPagination.total" class="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">Next</button>
              </div>
              <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                 <div>
                    <p class="text-sm text-slate-700">
                       Showing <span class="font-medium text-slate-900">{{ ((clientsPagination.page - 1) * clientsPagination.limit) + 1 }}</span> to <span class="font-medium text-slate-900">{{ Math.min(clientsPagination.page * clientsPagination.limit, clientsPagination.total) }}</span> of <span class="font-medium text-slate-900">{{ clientsPagination.total }}</span> results
                    </p>
                 </div>
                 <div>
                    <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                       <button @click="changePage(clientsPagination.page - 1)" :disabled="clientsPagination.page === 1" class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                          <span class="sr-only">Previous</span>
                          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                       </button>
                       <button v-for="page in visiblePages" :key="page" @click="changePage(page)" :class="[page === clientsPagination.page ? 'z-10 bg-primary-50 border-primary-500 text-primary-600' : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50', 'relative inline-flex items-center px-4 py-2 border text-sm font-medium']">
                          {{ page }}
                       </button>
                       <button @click="changePage(clientsPagination.page + 1)" :disabled="clientsPagination.page * clientsPagination.limit >= clientsPagination.total" class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                          <span class="sr-only">Next</span>
                          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
                       </button>
                    </nav>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <!-- CONTACTS TAB -->
      <div v-if="activeTab === 'contacts'" class="space-y-6">
        <!-- Control Bar -->
        <div class="bg-white rounded-xl shadow-card p-4 border border-slate-100 flex justify-between items-center">
            <h2 class="text-lg font-semibold text-slate-800">All Contacts</h2>
            <div class="relative w-64">
                 <input 
                    v-model="searchContacts" 
                    @input="debouncedSearchContacts"
                    type="text" 
                    placeholder="Search contacts..." 
                    class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                 />
                 <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div v-for="contact in contacts" :key="contact.id" class="bg-white rounded-xl shadow-card hover:shadow-card-hover border border-slate-100 p-6 transition-all duration-300 group">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-600 ring-4 ring-slate-50">
                            {{ contact.name.charAt(0) }}
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800">{{ contact.name }}</h3>
                            <p class="text-sm text-slate-500">{{ contact.job_title }}</p>
                        </div>
                    </div>
                    <span v-if="contact.is_primary" class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">Primary</span>
                </div>
                
                <div class="space-y-2 mb-6">
                    <div class="flex items-center gap-2 text-sm text-slate-600">
                        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        <router-link :to="`/clients/${contact.client_id}`" class="hover:text-primary-600">{{ contact.client_name }}</router-link>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-600">
                        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        {{ contact.email }}
                    </div>
                    <div class="flex items-center gap-2 text-sm text-slate-600">
                        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        {{ contact.phone }}
                    </div>
                </div>

                <div class="pt-4 border-t border-slate-100 flex justify-end">
                    <button class="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors uppercase tracking-wider">Remove</button>
                </div>
            </div>
        </div>
      </div>
    
    </div>

    <!-- Add/Edit Client Modal with Premium Style -->
    <div v-if="showAddClientModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity" @click.self="showAddClientModal = false">
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all scale-100">
        <div class="sticky top-0 bg-white px-8 py-6 border-b border-slate-100 z-10 flex justify-between items-center">
          <div>
              <h2 class="text-2xl font-bold text-slate-800">{{ editingClientId ? 'Edit Client' : 'New Client' }}</h2>
              <p class="text-sm text-slate-500 mt-1">Fill in the information below to {{ editingClientId ? 'update' : 'create' }} a client</p>
          </div>
          <button @click="showAddClientModal = false" class="text-slate-400 hover:text-slate-600 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form @submit.prevent="saveClient" class="p-8 space-y-6">
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Client Type <span class="text-red-500">*</span></label>
              <select v-model="clientForm.client_type" required class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none">
                <option value="">-- Select Type --</option>
                <option value="buyer">Buyer (BUY)</option>
                <option value="vendor">Vendor (VND)</option>
                <option value="supplier">Supplier (SUP)</option>
                <option value="distributor">Distributor (DST)</option>
                <option value="contractor">Contractor (CTR)</option>
                <option value="partner">Partner (PTR)</option>
              </select>
              <p class="text-xs text-slate-400">Code will be auto-generated, e.g. BUY-0001</p>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Company Name <span class="text-red-500">*</span></label>
              <input v-model="clientForm.name" type="text" required class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" placeholder="Official Company Name" />
            </div>
          </div>

          <!-- More fields with same styling... -->
          <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-700">Address</label>
            <textarea v-model="clientForm.address" rows="3" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none resize-none" placeholder="Street address, City, State, Zip Code"></textarea>
          </div>

           <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Phone</label>
              <input v-model="clientForm.phone" type="tel" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" placeholder="+1 (555) 000-0000" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-semibold text-slate-700">Website</label>
              <input v-model="clientForm.website" type="url" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none" placeholder="https://example.com" />
            </div>
          </div>
          
           <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-700">Group</label>
            <select v-model="clientForm.client_group_id" class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none">
                <option :value="null">-- Select Group --</option>
                <option v-for="group in clientGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
          </div>

          <div class="pt-6 border-t border-slate-100 flex gap-4 justify-end">
             <button type="button" @click="showAddClientModal = false" class="px-6 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
             <button type="submit" class="px-6 py-2.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 shadow-lg shadow-primary-500/30 transition-all">Save Client</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const router = useRouter();
const activeTab = ref('clients'); // Default to list view

// Data
const dashboard = ref<any>({});
const clients = ref<any[]>([]);
const contacts = ref<any[]>([]);

// Pagination
const clientsPagination = ref({ page: 1, limit: 10, total: 0 });
const contactsPagination = ref({ page: 1, limit: 10, total: 0 });

// Search & Filters
const searchClients = ref('');
const searchContacts = ref('');
const clientFilters = ref({ hasDue: '' });

// Modals
const showAddClientModal = ref(false);
const editingClientId = ref<number | null>(null);
const clientForm = ref({
  client_type: '',
  code: '',
  name: '',
  organization: '',
  website: '',
  phone: '',
  email: '',
  address: '',
  client_group_id: null as number | null
});

// Data for dropdowns
const clientGroups = ref<any[]>([
    { id: 1, name: 'VIP', color: 'purple' },
    { id: 2, name: 'Wholesale', color: 'blue' },
    { id: 3, name: 'Retail', color: 'green' }
]);

// API instance imported from @/lib/api

// Computed
const visiblePages = computed(() => {
  const total = Math.ceil(clientsPagination.value.total / clientsPagination.value.limit);
  const current = clientsPagination.value.page;
  const pages = [];
  
  for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 3); i++) {
    pages.push(i);
  }
  
  return pages;
});

// Methods


const getGroupColorClass = (color: string) => {
    const map: any = {
        purple: 'bg-purple-100 text-purple-700 border-purple-200',
        blue: 'bg-blue-100 text-blue-700 border-blue-200',
        green: 'bg-green-100 text-green-700 border-green-200',
        yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    };
    return map[color] || 'bg-slate-100 text-slate-700 border-slate-200';
};

const getLabelColorClass = (color: string) => {
    return getGroupColorClass(color);
};

const fetchDashboard = async () => {
  try {
    const response = await api.get('/clients/dashboard');
    dashboard.value = response.data.data;
  } catch (error) {
    console.error('Error fetching dashboard:', error);
  }
};

const fetchClients = async () => {
  try {
    const params: any = {
      page: clientsPagination.value.page,
      limit: clientsPagination.value.limit
    };
    
    if (searchClients.value) params.search = searchClients.value;
    if (clientFilters.value.hasDue) params.has_due = clientFilters.value.hasDue;
    
    const response = await api.get('/clients', { params });
    
    clients.value = response.data.data;
    clientsPagination.value.total = response.data.pagination.total;
  } catch (error) {
    console.error('Error fetching clients:', error);
  }
};

const fetchContacts = async () => {
  try {
    const params: any = {
      page: contactsPagination.value.page,
      limit: contactsPagination.value.limit,
      search: searchContacts.value
    };
    
    await api.get('/clients', { params });
    contacts.value = []; 
  } catch (error) {
    console.error(error);
  }
};

let timeout: any;
const debouncedSearchClients = () => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    clientsPagination.value.page = 1;
    fetchClients();
  }, 300);
};

const debouncedSearchContacts = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        contactsPagination.value.page = 1;
        fetchContacts();
    }, 300);
};

const changePage = (page: number) => {
    clientsPagination.value.page = page;
    fetchClients();
};

const viewClient = (client: any) => {
    router.push(`/clients/${client.id}`);
};

const editClient = (client: any) => {
    editingClientId.value = client.id;
    clientForm.value = { ...client };
    showAddClientModal.value = true;
};

const saveClient = async () => {
  try {
    if (editingClientId.value) {
      await api.put(`/clients/${editingClientId.value}`, clientForm.value);
    } else {
      await api.post('/clients', clientForm.value);
    }
    showAddClientModal.value = false;
    editingClientId.value = null;
    clientForm.value = { client_type: '', code: '', name: '', organization: '', website: '', phone: '', email: '', address: '', client_group_id: null };
    fetchClients();
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Failed to save client';
    alert(msg);
  }
};

onMounted(() => {
  fetchDashboard();
  fetchClients();
});
</script>
