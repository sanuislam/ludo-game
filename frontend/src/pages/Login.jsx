import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';

export default function Login() {
  const [usernameOrEmail, setUoE] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await login({ usernameOrEmail, password });
      nav('/');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-card">
      <h2>Log in</h2>
      <form onSubmit={submit}>
        <label>Username or email
          <input value={usernameOrEmail} onChange={(e) => setUoE(e.target.value)} autoFocus required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {err && <p className="err">{err}</p>}
        <button type="submit" disabled={busy}>{busy ? '...' : 'Log in'}</button>
      </form>
      <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
    </div>
  );
}
