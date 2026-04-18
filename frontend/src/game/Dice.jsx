import React from 'react';

const PIPS = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

export default function Dice({ value, rolling }) {
  const v = value && !rolling ? value : null;
  return (
    <div className={'dice' + (rolling ? ' rolling' : '')}>
      {v ? (
        <div className="face">
          {PIPS[v].map(([c, r], i) => (
            <span key={i} className="pip" style={{ gridColumn: c + 1, gridRow: r + 1 }} />
          ))}
        </div>
      ) : (
        <div className="face empty">{rolling ? '🎲' : '—'}</div>
      )}
    </div>
  );
}
