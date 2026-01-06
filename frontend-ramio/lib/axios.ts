import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (original?.url?.includes('/auth/refresh')) {
      console.log('[Axios Interceptor] Refresh endpoint error - not retrying:', error?.response?.status);
      return Promise.reject(error);
    }
    if (error?.response?.status === 401 && !original?._retry) {
      console.log('[Axios Interceptor] 401 error detected, attempting refresh...', original?.url);
      original._retry = true;

      try {
        console.log('[Axios Interceptor] Calling /auth/refresh...');
        const refreshResponse = await api.post('/auth/refresh');
        console.log('[Axios Interceptor] Refresh successful, retrying original request:', original?.url);
        const retryResponse = await api.request(original);
        console.log('[Axios Interceptor] Retry successful:', original?.url);
        return retryResponse;
      } catch (refreshErr: any) {
        console.error('[Axios Interceptor] Refresh failed:', refreshErr?.response?.status, refreshErr?.response?.data);
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);