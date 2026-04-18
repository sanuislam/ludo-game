import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import History from './pages/History.jsx';
import { useAuth } from './store/auth.js';
import './styles.css';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<Protected><Lobby /></Protected>} />
        <Route path="game/:gameId" element={<Protected><Game /></Protected>} />
        <Route path="history" element={<Protected><History /></Protected>} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
