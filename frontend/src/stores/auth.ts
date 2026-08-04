import { defineStore } from 'pinia';
import { api, setAuthToken } from '../lib/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  role_id?: number | null;
  user_level?: number;
  department_name?: string;
  department?: string;
  permissions?: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: localStorage.getItem('token'),
    isAuthenticated: !!localStorage.getItem('token'),
  }),

  getters: {
    /** Check if the user has a specific permission like 'inventory.view' */
    hasPermission: (state) => (permission: string): boolean => {
      if (!state.user) return false;
      // Master admin has all permissions
      if (state.user.user_level && state.user.user_level >= 10) return true;
      return state.user.permissions?.includes(permission) || false;
    },
    /** Check if the user has any permission for a given module like 'inventory' */
    hasModuleAccess: (state) => (module: string): boolean => {
      if (!state.user) return false;
      if (state.user.user_level && state.user.user_level >= 10) return true;
      return state.user.permissions?.some(p =>
        p.startsWith(module + '.') || p.startsWith(module + '_')
      ) || false;
    },
  },

  actions: {
    async login(email: string, password: string) {
      try {
        const response = await api.post('/auth/login', { email, password });
        this.token = response.data.token;
        this.user = response.data.user;
        this.isAuthenticated = true;
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setAuthToken(response.data.token);
        return response.data;
      } catch (error: any) {
        throw error.response?.data || error;
      }
    },

    logout() {
      this.token = null;
      this.user = null;
      this.isAuthenticated = false;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setAuthToken(null);
    },

    initializeAuth() {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      if (token) {
        this.token = token;
        this.isAuthenticated = true;
        setAuthToken(token);
      }
      if (user) {
        try {
          this.user = JSON.parse(user);
        } catch (e) {
          console.warn('Failed to parse stored user');
        }
      }
    },
  },
});
