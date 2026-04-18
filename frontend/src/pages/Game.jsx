import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSocket } from '../net/socket.js';
import { useAuth } from '../store/auth.js';
import Board from '../game/Board.jsx';
import Dice from '../game/Dice.jsx';

export default function Game() {
  const { gameId } = useParams();
  const [state, setState] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [err, setErr] = useState(null);
  const { user, refreshMe } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onState = (gs) => { if (gs?.id === gameId) setState(gs); };
    const onOver = (gs) => { if (gs?.id === gameId) { setState(gs); refreshMe(); } };
    s.on('game:state', onState);
    s.on('game:over', onOver);
    return () => { s.off('game:state', onState); s.off('game:over', onOver); };
  }, [gameId, refreshMe]);

  if (!state) return <div className="game"><p>Loading game…</p></div>;

  const youIdx = state.players.findIndex((p) => p.userId === user.id);
  const you = state.players[youIdx];
  const opp = state.players[1 - youIdx];
  const yourTurn = state.turn === youIdx && state.winner == null;
  const awaitingMove = state.awaitingMove && yourTurn;

  async function roll() {
    setErr(null);
    setRolling(true);
    const s = getSocket();
    s.emit('game:roll', { gameId }, (resp) => {
      setRolling(false);
      if (!resp?.ok) setErr(resp?.error || 'roll failed');
    });
  }

  function move(tokenIdx) {
    setErr(null);
    const s = getSocket();
    s.emit('game:move', { gameId, tokenIdx }, (resp) => {
      if (!resp?.ok) setErr(resp?.error || 'move failed');
    });
  }

  return (
    <div className="game">
      <div className="game-header">
        <div className="player-chip" data-me={youIdx === 0}>
          <span className="dot red" />
          <div>
            <div className="p-name">{state.players[0].username}{state.players[0].userId === user.id ? ' (you)' : ''}</div>
            <div className="p-sub">Red · {state.players[0].tokens.filter((p) => p === 58).length}/4 home</div>
          </div>
        </div>
        <div className="vs">
          {state.winner != null ? (
            <div className="winner">
              🏆 {state.players[state.winner].username} wins
              {state.finalized && (
                <div className="payout">+{state.finalized.payout} 🪙 (rake {state.finalized.rake})</div>
              )}
              <button onClick={() => nav('/')}>Back to lobby</button>
            </div>
          ) : (
            <div className="turn">
              {yourTurn ? "Your turn" : `${state.players[state.turn].username}'s turn`}
              <div className="muted">Pot 🪙 {state.entryAmount * 2}</div>
            </div>
          )}
        </div>
        <div className="player-chip blue" data-me={youIdx === 1}>
          <span className="dot blue" />
          <div>
            <div className="p-name">{state.players[1].username}{state.players[1].userId === user.id ? ' (you)' : ''}</div>
            <div className="p-sub">Blue · {state.players[1].tokens.filter((p) => p === 58).length}/4 home</div>
          </div>
        </div>
      </div>

      <div className="game-main">
        <Board
          state={state}
          onTokenClick={(playerIdx, tokenIdx) => {
            if (!awaitingMove) return;
            if (playerIdx !== youIdx) return;
            if (!state.legalMoves?.includes(tokenIdx)) return;
            move(tokenIdx);
          }}
          youIdx={youIdx}
        />
        <aside className="sidebar">
          <Dice value={state.lastRoll} rolling={rolling} />
          <button
            className="roll-btn"
            disabled={!yourTurn || state.awaitingMove || rolling || state.winner != null}
            onClick={roll}
          >
            {yourTurn && !state.awaitingMove ? 'Roll' : 'Waiting…'}
          </button>
          {awaitingMove && (
            <p className="hint">
              Pick a {you.color} token to move.
              {state.legalMoves?.length === 0 && ' (no legal moves)'}
            </p>
          )}
          {state.consecutiveSixes > 0 && (
            <p className="muted">Consecutive 6s: {state.consecutiveSixes}/3</p>
          )}
          {err && <p className="err">{err}</p>}
          <div className="opp-info">
            <h4>Opponent</h4>
            <p>@{opp.username}</p>
            <p className="muted">
              Tokens home: {opp.tokens.filter((p) => p === 58).length}/4
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
