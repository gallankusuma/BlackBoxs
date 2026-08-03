import axios, { AxiosError } from 'axios';

const env = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env;
// Use VITE_API_URL from .env, fallback to localhost:3005 (backend port)
const baseURL = env.VITE_API_URL || 'http://localhost:3005/api';

export const api = axios.create({
  baseURL,
});

// Store error callback for use in interceptors
let errorCallback: ((error: string) => void) | null = null;

export const setErrorCallback = (callback: (error: string) => void) => {
  errorCallback = callback;
};

// Request Interceptor: Add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const data = error.response?.data as any;
    const message = data?.message || error.message || 'An error occurred';

    if (status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (status === 403) {
      // Forbidden - user doesn't have permission
      if (errorCallback) {
        errorCallback('You do not have permission to perform this action');
      }
    } else if (status === 404) {
      // Not found
      if (errorCallback) {
        errorCallback('Resource not found');
      }
    } else if (status === 500) {
      // Server error
      if (errorCallback) {
        errorCallback('Server error. Please try again later');
      }
    } else {
      // Other errors
      if (errorCallback) {
        errorCallback(message);
      }
    }

    return Promise.reject(error);
  }
);

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Export useApi composable for components that need it
export const useApi = () => {
  return { api };
};
