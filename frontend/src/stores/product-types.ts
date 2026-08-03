import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface ProductType {
  id: number;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductTypeState {
  types: ProductType[];
  loading: boolean;
  error: string | null;
}

export const useProductTypeStore = defineStore('productType', {
  state: (): ProductTypeState => ({
    types: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchProductTypes() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/product-types');
        this.types = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch product types';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createProductType(typeData: { code: string; name: string; description?: string }) {
      try {
        const response = await api.post('/product-types', typeData);
        await this.fetchProductTypes();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create product type';
        throw error;
      }
    },

    async updateProductType(id: number, typeData: { code: string; name: string; description?: string; active: boolean }) {
      try {
        const response = await api.put(`/product-types/${id}`, typeData);
        await this.fetchProductTypes();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update product type';
        throw error;
      }
    },

    async deleteProductType(id: number) {
      try {
        await api.delete(`/product-types/${id}`);
        await this.fetchProductTypes();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete product type';
        throw error;
      }
    },
  },
});
