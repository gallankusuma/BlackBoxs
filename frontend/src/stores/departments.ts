import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface Department {
  id: number;
  code: string;
  name: string;
  description?: string;
  head_user_id?: number;
  head_user_name?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DepartmentState {
  departments: Department[];
  loading: boolean;
  error: string | null;
}

export const useDepartmentStore = defineStore('department', {
  state: (): DepartmentState => ({
    departments: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchDepartments() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/departments');
        this.departments = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch departments';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createDepartment(deptData: { code: string; name: string; description?: string }) {
      try {
        const response = await api.post('/departments', deptData);
        console.log('✅ Department created:', response.data);
        
        // Get the created department data
        const newDept = response.data?.data || {
          ...deptData,
          id: undefined,
          active: true,
        };
        
        // Try to refresh the list
        try {
          await this.fetchDepartments();
        } catch (fetchError) {
          console.warn('⚠️ Failed to refresh departments list after creation, adding to local state');
          // Fallback: add the new department to the local list
          this.departments.push({
            id: newDept.id || Date.now(),
            code: newDept.code,
            name: newDept.name,
            description: newDept.description || null,
            active: newDept.active !== false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as Department);
        }
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || error.message || 'Failed to create department';
        console.error('❌ Create error:', this.error);
        throw error;
      }
    },

    async updateDepartment(id: number, deptData: { code: string; name: string; description?: string; head_user_id?: number; active: boolean }) {
      try {
        const response = await api.put(`/departments/${id}`, deptData);
        await this.fetchDepartments();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update department';
        throw error;
      }
    },

    async deleteDepartment(id: number) {
      try {
        await api.delete(`/departments/${id}`);
        await this.fetchDepartments();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete department';
        throw error;
      }
    },
  },
});
