import React, { useEffect, useState } from 'react';
import { api } from '../net/api.js';
import { useAuth } from '../store/auth.js';

export default function History() {
  const { user } = useAuth();
  const [tx, setTx] = useState([]);
  const [games, setGames] = useState([]);

  useEffect(() => {
    if (!user) return;
    api.transactions(user.token).then((r) => setTx(r.transactions || []));
    api.games(user.token).then((r) => setGames(r.games || []));
  }, [user]);

  return (
    <div className="history">
      <h2>Game history</h2>
      <table className="tbl">
        <thead>
          <tr><th>When</th><th>Opponent</th><th>Entry</th><th>Result</th><th>Payout</th></tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const youWon = g.winner_id === user.id;
            const opp = g.player0_id === user.id ? g.player1_username : g.player0_username;
            return (
              <tr key={g.id}>
                <td>{new Date(g.started_at).toLocaleString()}</td>
                <td>@{opp}</td>
                <td>🪙 {g.entry_amount}</td>
                <td>{g.winner_id ? (youWon ? 'Won' : 'Lost') : '—'}</td>
                <td>{youWon ? `+${g.payout}` : `-${g.entry_amount}`}</td>
              </tr>
            );
          })}
          {games.length === 0 && <tr><td colSpan="5" className="muted">No games yet.</td></tr>}
        </tbody>
      </table>

      <h2>Wallet transactions</h2>
      <table className="tbl">
        <thead><tr><th>When</th><th>Kind</th><th>Amount</th><th>Balance</th></tr></thead>
        <tbody>
          {tx.map((t) => (
            <tr key={t.id}>
              <td>{new Date(t.created_at).toLocaleString()}</td>
              <td>{t.kind}</td>
              <td className={t.amount >= 0 ? 'pos' : 'neg'}>
                {t.amount >= 0 ? '+' : ''}{t.amount}
              </td>
              <td>{t.balance_after}</td>
            </tr>
          ))}
          {tx.length === 0 && <tr><td colSpan="4" className="muted">No transactions.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
