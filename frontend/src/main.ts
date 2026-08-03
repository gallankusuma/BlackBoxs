import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { api } from './lib/api';
import { vPermission } from './directives/permission';
import './style.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.directive('permission', vPermission);

// Initialize auth state from localStorage
const authStore = useAuthStore();
authStore.initializeAuth();

// Global 401 handler
api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error?.response?.status === 401) {
			authStore.logout();
			router.push('/login');
		}
		return Promise.reject(error);
	}
);

app.mount('#app');
