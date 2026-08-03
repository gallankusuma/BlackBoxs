import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface Role {
  id: number;
  code: string;
  name: string;
  description?: string;
  level: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface RoleState {
  roles: Role[];
  loading: boolean;
  error: string | null;
}

export const useRoleStore = defineStore('role', {
  state: (): RoleState => ({
    roles: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchRoles() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/roles');
        this.roles = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch roles';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createRole(roleData: { code: string; name: string; description?: string; level: number }) {
      try {
        const response = await api.post('/roles', roleData);
        await this.fetchRoles();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create role';
        throw error;
      }
    },

    async updateRole(id: number, roleData: { code: string; name: string; description?: string; level: number; active: boolean }) {
      try {
        const response = await api.put(`/roles/${id}`, roleData);
        await this.fetchRoles();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update role';
        throw error;
      }
    },

    async deleteRole(id: number) {
      try {
        await api.delete(`/roles/${id}`);
        await this.fetchRoles();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete role';
        throw error;
      }
    },

    async assignPermissions(roleId: number, permissionIds: number[]) {
      try {
        const response = await api.post(`/roles/${roleId}/permissions`, { permission_ids: permissionIds });
        await this.fetchRoles();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to assign permissions';
        throw error;
      }
    },
  },
});
