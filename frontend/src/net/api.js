const API_URL = import.meta.env.VITE_API_URL || '';

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.error || res.statusText);
  return data;
}

export const api = {
  signup: (body) => req('/api/auth/signup', { method: 'POST', body }),
  login: (body) => req('/api/auth/login', { method: 'POST', body }),
  me: (token) => req('/api/auth/me', { token }),
  balance: (token) => req('/api/wallet/balance', { token }),
  transactions: (token) => req('/api/wallet/transactions', { token }),
  games: (token) => req('/api/wallet/games', { token }),
};
