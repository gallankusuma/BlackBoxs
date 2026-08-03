<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <div class="flex justify-between items-center mb-6">
      <h3 class="text-lg font-bold text-gray-800">Project Notes</h3>
      <button class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">+ New Note</button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Mock Note 1 -->
      <div class="p-4 border border-yellow-200 bg-yellow-50 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <h4 class="font-bold text-gray-800 mb-2">Meeting Notes - Kickoff</h4>
        <p class="text-sm text-gray-600 line-clamp-3">Discussed core requirements, timeline, and deliverables. Client emphasized the need for mobile responsiveness and offline support.</p>
        <div class="mt-3 text-xs text-gray-500 flex justify-between">
          <span>Oct 12, 2023</span>
          <span>By: Admin</span>
        </div>
      </div>

       <!-- Mock Note 2 -->
      <div class="p-4 border border-blue-200 bg-blue-50 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <h4 class="font-bold text-gray-800 mb-2">Technical Specs</h4>
        <p class="text-sm text-gray-600 line-clamp-3">Server constraints: 4GB RAM, 2 vCPUs. Database needs to be PostgreSQL 15. API rate limits: 1000 req/min.</p>
        <div class="mt-3 text-xs text-gray-500 flex justify-between">
          <span>Oct 15, 2023</span>
          <span>By: Dev Team</span>
        </div>
      </div>
      
       <!-- Add Note Placeholder -->
       <div class="p-4 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors h-32">
        <span class="text-gray-400 font-medium">+ Add Note</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
