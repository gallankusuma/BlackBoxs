import { ref, watch } from 'vue';

export function useTheme() {
  const isDark = ref(false);

  // Initialize theme from localStorage
  const initTheme = () => {
    const saved = localStorage.getItem('theme-mode');
    
    if (saved === 'dark') {
      isDark.value = true;
    } else if (saved === 'light') {
      isDark.value = false;
    } else {
      // Check system preference
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  };

  // Apply theme when isDark changes
  const applyTheme = () => {
    const html = document.documentElement;
    if (isDark.value) {
      html.classList.add('dark');
      localStorage.setItem('theme-mode', 'dark');
    } else {
      html.classList.remove('dark');
      localStorage.setItem('theme-mode', 'light');
    }
  };

  // Toggle theme
  const toggleTheme = () => {
    isDark.value = !isDark.value;
  };

  // Watch isDark and apply theme whenever it changes
  watch(isDark, () => {
    applyTheme();
  }, { immediate: true });

  return {
    isDark,
    initTheme,
    toggleTheme
  };
}
