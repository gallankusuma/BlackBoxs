import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface User {
  id: number;
  name: string;
  email: string;
  department_id: number;
  department_name?: string;
  role_id: number;
  role_name?: string;
  user_level: number;
  phone?: string;
  address?: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

interface UserState {
  users: User[];
  currentUser: User | null;
  loading: boolean;
  error: string | null;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    users: [],
    currentUser: null,
    loading: false,
    error: null,
  }),

  actions: {
    async fetchUsers() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/users');
        this.users = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch users';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchCurrentUser() {
      try {
        const response = await api.get('/users/profile/me');
        this.currentUser = response.data.data;
        return response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch current user';
        throw error;
      }
    },

    async createUser(userData: {
      name: string;
      email: string;
      password: string;
      department_id: number;
      role_id: number;
      user_level: number;
      phone?: string;
      address?: string;
    }) {
      try {
        const response = await api.post('/users', userData);
        await this.fetchUsers();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create user';
        throw error;
      }
    },

    async updateUser(id: number, userData: {
      name: string;
      email: string;
      department_id: number;
      role_id: number;
      user_level: number;
      phone?: string;
      address?: string;
      is_active: boolean;
    }) {
      try {
        const response = await api.put(`/users/${id}`, userData);
        await this.fetchUsers();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update user';
        throw error;
      }
    },

    async deleteUser(id: number) {
      try {
        await api.delete(`/users/${id}`);
        await this.fetchUsers();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete user';
        throw error;
      }
    },

    async changePassword(oldPassword: string, newPassword: string) {
      try {
        const response = await api.post('/users/change-password', {
          old_password: oldPassword,
          new_password: newPassword,
        });
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to change password';
        throw error;
      }
    },

    async updateProfile(userData: { name: string; phone?: string; address?: string }) {
      try {
        const response = await api.put('/users/profile', userData);
        if (this.currentUser) {
          this.currentUser = { ...this.currentUser, ...userData };
        }
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update profile';
        throw error;
      }
    },
  },
});
