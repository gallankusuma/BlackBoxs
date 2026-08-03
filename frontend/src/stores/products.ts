import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string;
  unit_of_measure?: string;
  uom?: string;
  unit_code?: string;
  category?: string;
  category_name?: string;
  unit_name?: string;
  item_type?: string;
  type_name?: string;
  type_code?: string;
  status: string;
  standard_cost?: number;
  is_active?: boolean;
  active?: number;
  created_at: string;
}

interface ProductState {
  products: Product[];
  loading: boolean;
  error: string | null;
}

export const useProductStore = defineStore('products', {
  state: (): ProductState => ({
    products: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchProducts() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/products');
        this.products = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch products';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createProduct(productData: Omit<Product, 'id' | 'created_at' | 'status'>) {
      try {
        const response = await api.post('/products', productData);
        await this.fetchProducts();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create product';
        throw error;
      }
    },

    async updateProduct(id: number, productData: Partial<Product>) {
      try {
        await api.put(`/products/${id}`, productData);
        await this.fetchProducts();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update product';
        throw error;
      }
    },

    async deleteProduct(id: number) {
      try {
        await api.delete(`/products/${id}`);
        await this.fetchProducts();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete product';
        throw error;
      }
    },
  },
});
