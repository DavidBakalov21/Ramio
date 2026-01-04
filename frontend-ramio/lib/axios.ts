import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // ✅ send/receive HttpOnly cookies
});

// Optional: if access token expires and backend returns 401,
// try refresh once and retry the original request.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Avoid infinite loops
    if (error?.response?.status === 401 && !original?._retry) {
      original._retry = true;

      try {
        // Backend should read refresh_token cookie and set a new access_token cookie
        await api.post('/auth/refresh');
        return api(original);
      } catch (refreshErr) {
        // If refresh fails, just bubble up (UI can redirect to /login)
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);