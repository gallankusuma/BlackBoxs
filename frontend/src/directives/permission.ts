import { useAuthStore } from '../stores/auth';

export const vPermission = {
  mounted(el: HTMLElement, binding: { value: string | string[] }) {
    const authStore = useAuthStore();
    const requiredRoles = Array.isArray(binding.value) ? binding.value : [binding.value];

    const userRole = authStore.user?.role;

    if (userRole && !requiredRoles.includes(userRole)) {
      el.style.display = 'none';
    }
  },
};

export default vPermission;
