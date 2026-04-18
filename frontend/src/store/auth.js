import { create } from 'zustand';
import { api } from '../net/api.js';

const STORAGE_KEY = 'ludo-auth';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function save(user) {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
}

export const useAuth = create((set, get) => ({
  user: load(),
  login: async ({ usernameOrEmail, password }) => {
    const { user, token } = await api.login({ usernameOrEmail, password });
    const full = { ...user, token };
    save(full);
    set({ user: full });
  },
  signup: async ({ username, email, password }) => {
    const { user, token } = await api.signup({ username, email, password });
    const full = { ...user, token };
    save(full);
    set({ user: full });
  },
  logout: () => { save(null); set({ user: null }); },
  setCoins: (coins) => {
    const u = get().user;
    if (!u) return;
    const next = { ...u, coins };
    save(next);
    set({ user: next });
  },
  refreshMe: async () => {
    const u = get().user;
    if (!u) return;
    try {
      const { user } = await api.me(u.token);
      const next = { ...u, ...user };
      save(next);
      set({ user: next });
    } catch {
      save(null);
      set({ user: null });
    }
  },
}));
