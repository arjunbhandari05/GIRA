import axios from 'axios';

// Default to the vite dev proxy at /api -> http://127.0.0.1:8000
// (configured in ui/vite.config.js with 600s timeouts for /brief).
// Override at build time with VITE_API_BASE if hosting elsewhere.
const BASE = import.meta.env.VITE_API_BASE || '/api';
const api = axios.create({ baseURL: BASE, timeout: 300000 });

export const getPatients = () => api.get('/patients');
export const getWearable = id => api.get(`/wearable/${encodeURIComponent(id)}`);
export const getBrief = id => api.get(`/brief/${encodeURIComponent(id)}`);
export const getSafety = id => api.get(`/safety/${encodeURIComponent(id)}`);
export const uploadGenome = file => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/upload', fd);
};

export default api;
