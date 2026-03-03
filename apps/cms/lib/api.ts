import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3099';

export const api = axios.create({ baseURL: API_BASE });

// リクエストにアクセストークンを自動付与
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('tlog_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → リフレッシュトークンで自動更新、失敗したらログインへ
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function flushQueue(token: string | null, error?: unknown) {
  pendingQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(error)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }
    original._retry = true;

    // 既にリフレッシュ中なら待機キューへ
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    isRefreshing = true;
    const rt = typeof window !== 'undefined' ? localStorage.getItem('tlog_refresh') : null;

    if (!rt) {
      isRefreshing = false;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tlog_token');
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }

    try {
      const res = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken: rt });
      const { accessToken, refreshToken: newRt, user } = res.data;
      localStorage.setItem('tlog_token', accessToken);
      localStorage.setItem('tlog_refresh', newRt);
      if (user) localStorage.setItem('tlog_user', JSON.stringify(user));
      flushQueue(accessToken);
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshErr) {
      flushQueue(null, refreshErr);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tlog_token');
        localStorage.removeItem('tlog_refresh');
        localStorage.removeItem('tlog_user');
        window.location.href = '/login';
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/auth/login', { username, password }),
  logout: () => {
    const rt = typeof window !== 'undefined' ? localStorage.getItem('tlog_refresh') : null;
    if (rt) api.post('/api/auth/logout', { refreshToken: rt }).catch(() => {});
  },
};
