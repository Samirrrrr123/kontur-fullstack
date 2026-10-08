import { create } from 'zustand'
import { api, errorMessage } from './api'
import type { Post, User, Topic, Kind } from './types'
type AuthState = { user: User | null; ready: boolean; initialize: () => Promise<void>; login: (email: string, password: string) => Promise<void>; register: (name: string, email: string, password: string) => Promise<void>; logout: () => void }
export const useAuth = create<AuthState>((set) => ({
  user: null, ready: false,
  initialize: async () => {
    if (!localStorage.getItem('kontur.token')) { set({ ready: true }); return }
    try { const { data } = await api.get('/auth/me'); set({ user: data, ready: true }) }
    catch { localStorage.removeItem('kontur.token'); set({ user: null, ready: true }) }
  },
  login: async (email, password) => { const { data } = await api.post('/auth/login', { email, password }); localStorage.setItem('kontur.token', data.token); set({ user: data.user }) },
  register: async (name, email, password) => { const { data } = await api.post('/auth/register', { name, email, password }); localStorage.setItem('kontur.token', data.token); set({ user: data.user }) },
  logout: () => { localStorage.removeItem('kontur.token'); set({ user: null }) }
}))
type PostState = { posts: Post[]; popular: Post[]; loading: boolean; error: string; requestId: number; load: (filters?: { topic?: Topic; kind?: Kind }, mine?: boolean) => Promise<void>; save: (body: Pick<Post,'title'|'excerpt'|'content'|'topic'|'kind'>, id?: string) => Promise<Post>; remove: (id: string) => Promise<void> }
export const usePosts = create<PostState>((set, get) => ({
  posts: [], popular: [], loading: false, error: '', requestId: 0,
  load: async (filters = {}, mine = false) => {
    const requestId = get().requestId + 1
    set({ loading: true, error: '', posts: [], popular: [], requestId })
    try { const [list, popular] = await Promise.all([api.get(mine ? '/posts/mine' : '/posts', { params: filters }), !mine && !filters.topic && !filters.kind ? api.get('/posts/popular') : Promise.resolve({ data: [] })]); if (get().requestId === requestId) set({ posts: list.data, popular: popular.data, loading: false }) }
    catch (error) { if (get().requestId === requestId) set({ loading: false, error: errorMessage(error) }) }
  },
  save: async (body, id) => (id ? await api.patch(`/posts/${id}`, body) : await api.post('/posts', body)).data,
  remove: async id => { await api.delete(`/posts/${id}`); set({ posts: get().posts.filter(p => p.id !== id) }) }
}))
