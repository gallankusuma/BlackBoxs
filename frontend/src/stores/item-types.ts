import { defineStore } from 'pinia';
import { api } from '../lib/api';

interface ItemType {
  id: number;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  created_at: string;
}

interface ItemTypeState {
  itemTypes: ItemType[];
  loading: boolean;
  error: string | null;
}

export const useItemTypeStore = defineStore('itemTypes', {
  state: (): ItemTypeState => ({
    itemTypes: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchItemTypes() {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.get('/item-types');
        this.itemTypes = response.data.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to fetch item types';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createItemType(itemTypeData: Partial<ItemType>) {
      try {
        const response = await api.post('/item-types', itemTypeData);
        await this.fetchItemTypes();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to create item type';
        throw error;
      }
    },

    async updateItemType(id: number, itemTypeData: Partial<ItemType>) {
      try {
        const response = await api.put(`/item-types/${id}`, itemTypeData);
        await this.fetchItemTypes();
        return response.data;
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to update item type';
        throw error;
      }
    },

    async deleteItemType(id: number) {
      try {
        await api.delete(`/item-types/${id}`);
        await this.fetchItemTypes();
      } catch (error: any) {
        this.error = error.response?.data?.error || 'Failed to delete item type';
        throw error;
      }
    },
  },
});
