import axios from 'axios'
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 15000 })
api.interceptors.request.use(config => {
  const token = localStorage.getItem('kontur.token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !/auth\/(login|register)/.test(error.config?.url || '')) {
    localStorage.removeItem('kontur.token')
    window.dispatchEvent(new Event('kontur:logout'))
  }
  return Promise.reject(error)
})
export const errorMessage = (error: unknown): string => axios.isAxiosError(error) ? error.response?.data?.message || 'Не удалось связаться с сервером. Попробуйте ещё раз.' : 'Не удалось выполнить действие'
