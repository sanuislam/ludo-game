import React from 'react';
import {
  TRACK,
  HOME_STRETCH,
  BASES,
  DECORATIVE_BASES,
  CENTER,
  SAFE_INDICES,
  progressToCell,
} from './boardLayout.js';

const CELL = 36; // px
const SIZE = 15 * CELL;

function cellStyle(col, row) {
  return {
    left: col * CELL,
    top: row * CELL,
    width: CELL,
    height: CELL,
  };
}

function rectStyle(x0, y0, x1, y1, extra = {}) {
  return {
    left: x0 * CELL,
    top: y0 * CELL,
    width: (x1 - x0 + 1) * CELL,
    height: (y1 - y0 + 1) * CELL,
    ...extra,
  };
}

export default function Board({ state, onTokenClick, youIdx }) {
  const legal = new Set(state.legalMoves || []);
  const yourTurn = state.turn === youIdx && state.awaitingMove;

  return (
    <div className="board" style={{ width: SIZE, height: SIZE }}>
      {/* Decorative bases (green/yellow, unused in 2p) */}
      {Object.entries(DECORATIVE_BASES).map(([name, b]) => (
        <div
          key={name}
          className={`base base-${name} decorative`}
          style={rectStyle(...b.rect)}
        >
          <div className="base-inner" />
        </div>
      ))}

      {/* Active bases: red + blue */}
      {['red', 'blue'].map((c) => (
        <div key={c} className={`base base-${c}`} style={rectStyle(...BASES[c].rect)}>
          <div className="base-inner" />
          {BASES[c].tokens.map((t, i) => (
            <div
              key={i}
              className="base-slot"
              style={{
                left: (t[0] - BASES[c].rect[0]) * CELL - CELL / 2 + CELL / 2,
                top: (t[1] - BASES[c].rect[1]) * CELL - CELL / 2 + CELL / 2,
              }}
            />
          ))}
        </div>
      ))}

      {/* Main-track cells */}
      {TRACK.map(([c, r], i) => (
        <div
          key={`t-${i}`}
          className={
            'cell track ' +
            (SAFE_INDICES.has(i) ? 'safe ' : '') +
            (i === 0 ? 'entry-red ' : '') +
            (i === 26 ? 'entry-blue ' : '')
          }
          style={cellStyle(c, r)}
          title={`track ${i}${SAFE_INDICES.has(i) ? ' (safe)' : ''}`}
        >
          {SAFE_INDICES.has(i) && <span className="star">★</span>}
        </div>
      ))}

      {/* Home stretches */}
      {HOME_STRETCH.red.map(([c, r], i) => (
        <div key={`hr-${i}`} className="cell home-red" style={cellStyle(c, r)} />
      ))}
      {HOME_STRETCH.blue.map(([c, r], i) => (
        <div key={`hb-${i}`} className="cell home-blue" style={cellStyle(c, r)} />
      ))}

      {/* Center triangle (finish) */}
      <div
        className="center"
        style={{
          left: 6 * CELL,
          top: 6 * CELL,
          width: 3 * CELL,
          height: 3 * CELL,
        }}
      >
        <div className="tri tri-red" />
        <div className="tri tri-green" />
        <div className="tri tri-yellow" />
        <div className="tri tri-blue" />
      </div>

      {/* Tokens */}
      {state.players.map((p, pi) =>
        p.tokens.map((progress, ti) => {
          let cx, cy;
          const isClickable =
            yourTurn && pi === youIdx && legal.has(ti);
          if (progress === 0) {
            const [tc, tr] = BASES[p.color].tokens[ti];
            cx = tc * CELL + CELL / 2;
            cy = tr * CELL + CELL / 2;
          } else {
            const cell = progressToCell(p.entrySquare, progress);
            if (!cell) return null;
            const [c, r] = cell;
            // At centre, fan tokens out so they're visible.
            if (progress === 58) {
              const offsets = [
                [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25],
              ];
              cx = (c + 0.5 + offsets[ti][0]) * CELL;
              cy = (r + 0.5 + offsets[ti][1]) * CELL;
            } else {
              // If two tokens share a cell, nudge them slightly.
              const siblings = p.tokens.filter((x, xi) => x === progress && xi !== ti).length;
              const nudgeX = siblings > 0 ? (ti % 2 === 0 ? -4 : 4) : 0;
              const nudgeY = siblings > 0 ? (ti < 2 ? -4 : 4) : 0;
              cx = (c + 0.5) * CELL + nudgeX;
              cy = (r + 0.5) * CELL + nudgeY;
            }
          }
          return (
            <button
              key={`tok-${pi}-${ti}`}
              className={
                `token tok-${p.color}` +
                (isClickable ? ' clickable' : '') +
                (progress === 58 ? ' done' : '')
              }
              style={{ left: cx - 13, top: cy - 13 }}
              onClick={() => onTokenClick(pi, ti)}
              disabled={!isClickable}
              title={`${p.color} token ${ti + 1} (progress ${progress})`}
            >
              {ti + 1}
            </button>
          );
        }),
      )}
    </div>
  );
}
