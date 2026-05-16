import axios from 'axios';

const BASE = 'http://127.0.0.1:8010';
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
