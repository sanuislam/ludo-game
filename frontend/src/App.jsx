import React, { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import { connectSocket, disconnectSocket } from './net/socket.js';

export default function App() {
  const { user, logout, refreshMe } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      connectSocket(user.token);
      refreshMe();
    } else {
      disconnectSocket();
    }
  }, [user]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">🎲 Ludo</Link>
        <nav>
          {user ? (
            <>
              <Link to="/">Lobby</Link>
              <Link to="/history">History</Link>
              <span className="coins" title="Your virtual play-coins">
                🪙 {user.coins}
              </span>
              <span className="who">@{user.username}</span>
              <button onClick={() => { logout(); navigate('/login'); }}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/signup">Sign up</Link>
            </>
          )}
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="foot">
        Virtual play-coins only — no real money. <span>Built as a demo.</span>
      </footer>
    </div>
  );
}
