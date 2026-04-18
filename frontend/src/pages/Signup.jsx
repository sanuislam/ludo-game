import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';

export default function Signup() {
  const [username, setU] = useState('');
  const [email, setE] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const { signup } = useAuth();
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await signup({ username, email, password });
      nav('/');
    } catch (ex) { setErr(typeof ex.message === 'string' ? ex.message : 'Signup failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-card">
      <h2>Create account</h2>
      <p className="muted">You'll start with 1,000 virtual play-coins.</p>
      <form onSubmit={submit}>
        <label>Username
          <input value={username} onChange={(e) => setU(e.target.value)} minLength={3} maxLength={24} required autoFocus />
        </label>
        <label>Email
          <input type="email" value={email} onChange={(e) => setE(e.target.value)} required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setP(e.target.value)} minLength={6} required />
        </label>
        {err && <p className="err">{err}</p>}
        <button type="submit" disabled={busy}>{busy ? '...' : 'Sign up'}</button>
      </form>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
