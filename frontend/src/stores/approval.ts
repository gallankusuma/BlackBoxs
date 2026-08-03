import { defineStore } from 'pinia';
import { api } from '../lib/api';

const extract = (res: any) => res.data?.data || res.data || [];

export const useApprovalStore = defineStore('approval', {
  state: () => ({
    inbox: [] as any[],
    history: [] as any[],
    historyStats: null as any,
    rules: [] as any[],
    delegations: [] as any[],
    escalations: [] as any[],
    users: [] as any[],
    roles: [] as any[],
    loading: false,
  }),

  actions: {
    // ─── Inbox ─────────────────────────────
    async fetchInbox(params?: { module?: string; entity_type?: string }) {
      this.loading = true;
      try { this.inbox = extract(await api.get('/approval/inbox', { params })); } catch { this.inbox = []; }
      this.loading = false;
    },
    async approveRequest(id: number, comments?: string) {
      await api.put(`/approval/inbox/${id}/approve`, { comments });
      await this.fetchInbox();
    },
    async rejectRequest(id: number, comments: string) {
      await api.put(`/approval/inbox/${id}/reject`, { comments });
      await this.fetchInbox();
    },

    // ─── History ───────────────────────────
    async fetchHistory(params?: Record<string, any>) {
      this.loading = true;
      try { this.history = extract(await api.get('/approval/history', { params })); } catch { this.history = []; }
      this.loading = false;
    },
    async fetchHistoryStats() {
      try { this.historyStats = (await api.get('/approval/history/stats')).data?.data || null; } catch { this.historyStats = null; }
    },

    // ─── Rules ─────────────────────────────
    async fetchRules() {
      this.loading = true;
      try { this.rules = extract(await api.get('/approval/rules')); } catch { this.rules = []; }
      this.loading = false;
    },
    async createRule(data: any) {
      await api.post('/approval/rules', data);
      await this.fetchRules();
    },
    async updateRule(id: number, data: any) {
      await api.put(`/approval/rules/${id}`, data);
      await this.fetchRules();
    },
    async deleteRule(id: number) {
      await api.delete(`/approval/rules/${id}`);
      await this.fetchRules();
    },

    // ─── Delegations ──────────────────────
    async fetchDelegations() {
      this.loading = true;
      try { this.delegations = extract(await api.get('/approval/delegations')); } catch { this.delegations = []; }
      this.loading = false;
    },
    async createDelegation(data: any) {
      await api.post('/approval/delegations', data);
      await this.fetchDelegations();
    },
    async deactivateDelegation(id: number) {
      await api.put(`/approval/delegations/${id}/deactivate`);
      await this.fetchDelegations();
    },
    async deleteDelegation(id: number) {
      await api.delete(`/approval/delegations/${id}`);
      await this.fetchDelegations();
    },

    // ─── Escalations ──────────────────────
    async fetchEscalations() {
      this.loading = true;
      try { this.escalations = extract(await api.get('/approval/escalations')); } catch { this.escalations = []; }
      this.loading = false;
    },
    async createEscalation(data: any) {
      await api.post('/approval/escalations', data);
      await this.fetchEscalations();
    },
    async updateEscalation(id: number, data: any) {
      await api.put(`/approval/escalations/${id}`, data);
      await this.fetchEscalations();
    },
    async deleteEscalation(id: number) {
      await api.delete(`/approval/escalations/${id}`);
      await this.fetchEscalations();
    },

    // ─── Supporting data ───────────────────
    async fetchUsers() {
      try { this.users = extract(await api.get('/users')); } catch { this.users = []; }
    },
    async fetchRoles() {
      try { this.roles = extract(await api.get('/roles')); } catch { this.roles = []; }
    },
  },
});
