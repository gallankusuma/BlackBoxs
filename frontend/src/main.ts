import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { api } from './lib/api';
import { vPermission } from './directives/permission';
// Font di-host sendiri, bukan dari Google Fonts: tidak ada request ke domain
// pihak ketiga, tetap bekerja offline sebagai PWA, dan tidak ada FOUT dari
// jaringan yang lambat di lapangan.
//
// Sebelumnya `Inter` ditulis di tailwind.config dan style.css tapi TIDAK PERNAH
// dimuat — jadi diam-diam jatuh ke system-ui, dan itulah tampilan generik yang
// terasa "default".
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './style.css';
import { pasangSakelarTampilan } from './lib/uiFlags';

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

pasangSakelarTampilan();
app.mount('#app');
