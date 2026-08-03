import { defineStore } from 'pinia';
import { api } from '../lib/api';

const extract = (res: any) => res.data?.data || res.data || [];

export const useAdminStore = defineStore('admin', {
  state: () => ({
    settings: [] as any[],
    auditLogs: [] as any[],
    notifications: [] as any[],
    approvalRules: [] as any[],
    loading: false,
  }),

  actions: {
    // Settings
    async fetchSettings() {
      this.loading = true;
      try { this.settings = extract(await api.get('/settings/all')); } catch { this.settings = []; }
      this.loading = false;
    },
    async updateSetting(key: string, value: string) {
      await api.put(`/settings/${key}`, { value });
      await this.fetchSettings();
    },
    async createSetting(data: { key: string; value: string; category: string }) {
      await api.post('/settings', data);
      await this.fetchSettings();
    },

    // Audit
    async fetchAuditLogs(params?: Record<string, any>) {
      this.loading = true;
      try { this.auditLogs = extract(await api.get('/audit', { params })); } catch { this.auditLogs = []; }
      this.loading = false;
    },

    // Notifications
    async fetchNotifications(params?: Record<string, any>) {
      this.loading = true;
      try { this.notifications = extract(await api.get('/notifications', { params })); } catch { this.notifications = []; }
      this.loading = false;
    },

    // Approval rules (admin config)
    async fetchApprovalRules() {
      this.loading = true;
      try { this.approvalRules = extract(await api.get('/approval/rules')); } catch { this.approvalRules = []; }
      this.loading = false;
    },
  },
});
