import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface Category {
  id: number;
  name: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryState {
  categories: Category[];
  loading: boolean;
  error: string | null;
}

export const useCategoryStore = defineStore('category', {
  state: (): CategoryState => ({
    categories: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchCategories() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/categories');
        this.categories = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch categories';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createCategory(categoryData: { name: string; description?: string }) {
      try {
        const response = await api.post('/categories', categoryData);
        await this.fetchCategories();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create category';
        throw error;
      }
    },

    async updateCategory(id: number, categoryData: { name: string; description?: string; active: boolean }) {
      try {
        const response = await api.put(`/categories/${id}`, categoryData);
        await this.fetchCategories();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update category';
        throw error;
      }
    },

    async deleteCategory(id: number) {
      try {
        await api.delete(`/categories/${id}`);
        await this.fetchCategories();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete category';
        throw error;
      }
    },
  },
});
