<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold text-gray-900">Notifications</h1>
      <div class="flex gap-2">
        <button
          @click="markAllRead"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Mark All as Read
        </button>
        <select
          v-model="filterStatus"
          class="px-3 py-2 border border-gray-300 rounded"
        >
          <option value="">All</option>
          <option value="unread">Unread Only</option>
        </select>
      </div>
    </div>

    <!-- Notifications List -->
    <div class="space-y-2">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="{
          'bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition': true,
          'border-l-4 border-blue-500': !notification.is_read,
          'opacity-75': notification.is_read,
        }"
        @click="markAsRead(notification.id)"
      >
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex gap-3 items-center">
              <div
                :class="{
                  'w-3 h-3 rounded-full mt-1.5': true,
                  'bg-blue-500': notification.type === 'approval',
                  'bg-red-500': notification.type === 'alert',
                  'bg-green-500': notification.type === 'info',
                  'bg-yellow-500': notification.type === 'warning',
                }"
              ></div>
              <div>
                <h3 class="font-semibold text-gray-900">
                  {{ notification.title || 'Notification' }}
                </h3>
                <p class="text-gray-600 text-sm mt-1">{{ notification.message }}</p>
                <div class="text-xs text-gray-500 mt-2">
                  {{ formatDateTime(notification.created_at) }}
                </div>
              </div>
            </div>
            <div v-if="notification.action_url" class="mt-3">
              <router-link
                :to="notification.action_url"
                class="text-blue-600 hover:text-blue-900 text-sm font-semibold"
              >
                View Details →
              </router-link>
            </div>
          </div>
          <button
            @click.stop="deleteNotification(notification.id)"
            class="text-gray-400 hover:text-red-600 text-xl"
          >
            ×
          </button>
        </div>
      </div>

      <div v-if="notifications.length === 0" class="bg-white rounded-lg shadow p-8 text-center">
        <div class="text-gray-500">No notifications</div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="pagination.pages > 1" class="flex justify-center gap-2">
      <button
        @click="previousPage"
        :disabled="pagination.page === 1"
        class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
      >
        Previous
      </button>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Page {{ pagination.page }} of {{ pagination.pages }}</span>
      </div>
      <button
        @click="nextPage"
        :disabled="pagination.page >= pagination.pages"
        class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '@/lib/api';
// import { useRouter } from 'vue-router';

interface Notification {
  id: number;
  title?: string;
  message: string;
  type: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
}

const { api } = useApi();
// const router = useRouter(); // unused

const notifications = ref<Notification[]>([]);
const filterStatus = ref('');

const pagination = ref({
  page: 1,
  limit: 20,
  total: 0,
  pages: 0,
});

onMounted(async () => {
  await fetchNotifications();
});

const fetchNotifications = async () => {
  try {
    const unreadOnly = filterStatus.value === 'unread' ? 'true' : 'false';
    const response = await api.get(
      `/notifications?page=${pagination.value.page}&limit=${pagination.value.limit}&unread=${unreadOnly}`
    );

    notifications.value = response.data.data;
    pagination.value = response.data.pagination;
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
  }
};

const markAsRead = async (id: number) => {
  try {
    await api.put(`/notifications/${id}/read`);
    await fetchNotifications();
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
  }
};

const markAllRead = async () => {
  try {
    await api.put('/notifications/mark-all-read');
    await fetchNotifications();
  } catch (error) {
    console.error('Failed to mark all as read:', error);
  }
};

const deleteNotification = async (id: number) => {
  try {
    await api.delete(`/notifications/${id}`);
    await fetchNotifications();
  } catch (error) {
    console.error('Failed to delete notification:', error);
  }
};

const nextPage = () => {
  if (pagination.value.page < pagination.value.pages) {
    pagination.value.page += 1;
    fetchNotifications();
  }
};

const previousPage = () => {
  if (pagination.value.page > 1) {
    pagination.value.page -= 1;
    fetchNotifications();
  }
};

const formatDateTime = (dateTime: string) => {
  const date = new Date(dateTime);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = diff / (1000 * 60 * 60);

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 48) return 'Yesterday';
  return date.toLocaleDateString();
};
</script>
