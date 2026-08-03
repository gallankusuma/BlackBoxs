<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-[400px]">
    <h3 class="text-lg font-bold text-gray-800 mb-6">Discussion & Comments</h3>
    
    <div class="space-y-6 mb-8">
      <!-- Mock Comment 1 -->
      <div class="flex gap-4">
        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">
          JD
        </div>
        <div class="bg-gray-50 p-4 rounded-lg rounded-tl-none border border-gray-100 flex-1">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-sm">John Doe</span>
            <span class="text-xs text-gray-500">2 hours ago</span>
          </div>
          <p class="text-sm text-gray-700">Uploaded the initial wireframes to the Files tab. Please review and provide feedback by EOD.</p>
        </div>
      </div>

       <!-- Mock Comment 2 -->
      <div class="flex gap-4">
        <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold shrink-0">
          SA
        </div>
        <div class="bg-gray-50 p-4 rounded-lg rounded-tl-none border border-gray-100 flex-1">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-sm">Sarah Ann</span>
            <span class="text-xs text-gray-500">1 hour ago</span>
          </div>
          <p class="text-sm text-gray-700">Thanks John! I'll take a look shortly. Need to align this with the new requirements from the client.</p>
        </div>
      </div>
    </div>

    <!-- Comment Input -->
    <div class="flex gap-4 items-start">
      <div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold shrink-0">
        You
      </div>
      <div class="flex-1">
        <textarea 
          class="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
          rows="3" 
          placeholder="Leave a comment..."
        ></textarea>
        <div class="flex justify-end mt-2">
          <button class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">Post Comment</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
