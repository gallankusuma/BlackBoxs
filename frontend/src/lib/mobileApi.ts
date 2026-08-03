import axios, { AxiosError } from 'axios';

// Axios client untuk PWA mobile (karyawan lapangan).
// Terpisah dari `api` di lib/api.ts karena tokennya beda: token mobile
// diterbitkan saat login NIK / sidik jari, bukan login user admin.

const MOBILE_TOKEN_KEY = 'mobile_token';
const MOBILE_EMPLOYEE_KEY = 'mobile_employee';

export const setMobileToken = (token: string | null) => {
  if (token) localStorage.setItem(MOBILE_TOKEN_KEY, token);
  else localStorage.removeItem(MOBILE_TOKEN_KEY);
};

export const getMobileToken = () => localStorage.getItem(MOBILE_TOKEN_KEY);

export const clearMobileSession = () => {
  localStorage.removeItem(MOBILE_TOKEN_KEY);
  localStorage.removeItem(MOBILE_EMPLOYEE_KEY);
};

export const mobileApi = axios.create();

mobileApi.interceptors.request.use((config) => {
  const token = getMobileToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token kedaluwarsa / belum ada → paksa login ulang.
// Sesi lama (sebelum token diterapkan) juga jatuh ke sini.
mobileApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearMobileSession();
      if (window.location.pathname !== '/mobile') {
        window.location.href = '/mobile';
      }
    }
    return Promise.reject(error);
  }
);
