import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../net/socket.js';
import { useAuth } from '../store/auth.js';

export default function Lobby() {
  const [lobby, setLobby] = useState([]);
  const [waitingRoom, setWaitingRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { user, refreshMe } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onLobby = (tiers) => setLobby(tiers);
    const onJoined = ({ room }) => setWaitingRoom(room);
    const onStarted = ({ gameId }) => { setWaitingRoom(null); nav(`/game/${gameId}`); };
    const onState = (state) => {
      // If we already have an active game on (re)connect, jump to it.
      if (state && state.id) nav(`/game/${state.id}`);
    };
    s.on('lobby:update', onLobby);
    s.on('room:joined', onJoined);
    s.on('room:started', onStarted);
    s.on('game:state', onState);
    s.emit('lobby:list', (resp) => { if (resp?.ok) setLobby(resp.tiers); });
    return () => {
      s.off('lobby:update', onLobby);
      s.off('room:joined', onJoined);
      s.off('room:started', onStarted);
      s.off('game:state', onState);
    };
  }, [nav]);

  async function join(tier) {
    setErr(null); setBusy(true);
    const s = getSocket();
    s.emit('room:join', { tier }, async (resp) => {
      setBusy(false);
      if (!resp?.ok) { setErr(resp?.error || 'join failed'); return; }
      await refreshMe();
      if (resp.started) {
        setWaitingRoom(null);
        nav(`/game/${resp.room.gameId || ''}`);
      } else {
        setWaitingRoom(resp.room);
      }
    });
  }

  async function leave() {
    if (!waitingRoom) return;
    const s = getSocket();
    s.emit('room:leave', { roomId: waitingRoom.id }, async (resp) => {
      if (resp?.ok) {
        setWaitingRoom(null);
        await refreshMe();
      } else {
        setErr(resp?.error || 'leave failed');
      }
    });
  }

  return (
    <div className="lobby">
      <h2>Choose a room</h2>
      <p className="muted">
        Winner takes the pot minus a 10% rake. Two players per room.
        You have <b>🪙 {user?.coins ?? 0}</b>.
      </p>
      {err && <p className="err">{err}</p>}
      {waitingRoom ? (
        <div className="waiting">
          <h3>Waiting for an opponent…</h3>
          <p>
            Tier <b>🪙 {waitingRoom.tier}</b> · room <code>{waitingRoom.id}</code>
          </p>
          <button onClick={leave}>Cancel & refund</button>
        </div>
      ) : (
        <div className="tiers">
          {lobby.map((t) => (
            <div key={t.tier} className="tier">
              <h3>🪙 {t.tier}</h3>
              <p>Pot: {t.tier * 2} · Payout: {Math.floor(t.tier * 2 * 0.9)}</p>
              <p className="muted">
                {t.waiting.length} waiting · {t.playing} live
              </p>
              <button
                disabled={busy || (user?.coins ?? 0) < t.tier}
                onClick={() => join(t.tier)}
              >
                {(user?.coins ?? 0) < t.tier ? 'Not enough coins' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
