// Geometry for a 15x15 Ludo board.
// Coordinates are (col, row), 0..14 each.

// 52 main-track cells, in clockwise order starting at red's entry square.
// Index 0 = red entry (visually just below red base going right).
// Index 13 = (unused in 2-player) "green" entry.
// Index 26 = blue entry (visually just above blue base going left).
// Index 39 = (unused) "yellow" entry.
export const TRACK = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],       // 0..4
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // 5..10
  [7, 0],                                         // 11
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // 12..17 (13 = top-right entry)
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 18..23
  [14, 7],                                        // 24
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 25..30 (26 = right entry)
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 31..36
  [7, 14],                                        // 37
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 38..43
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // 44..49
  [0, 7],                                         // 50
  [0, 6],                                         // 51
];

export const HOME_STRETCH = {
  red:  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

export const CENTER = [7, 7];

// Safe squares on main track (indices).
export const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Base areas (rectangles) and token home positions inside them.
export const BASES = {
  red:  { rect: [0, 0, 5, 5],  tokens: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]] },
  blue: { rect: [9, 9, 14, 14], tokens: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]] },
};

// Unused decorative bases (green top-right, yellow bottom-left) to complete
// the classic look even in 2-player mode.
export const DECORATIVE_BASES = {
  green:  { rect: [9, 0, 14, 5],   color: '#5fb55f' },
  yellow: { rect: [0, 9, 5, 14],   color: '#e8c63a' },
};

/**
 * Given a player's entry square (0 for red, 26 for blue) and a token
 * progress (0..58), return the visual (col, row) for the token.
 * Returns null if the token is in base (caller positions it in the base area).
 */
export function progressToCell(entrySquare, progress) {
  if (progress === 0) return null;
  if (progress >= 1 && progress <= 52) {
    const idx = (entrySquare + progress - 1) % 52;
    return TRACK[idx];
  }
  if (progress >= 53 && progress <= 57) {
    const color = entrySquare === 0 ? 'red' : 'blue';
    return HOME_STRETCH[color][progress - 53];
  }
  if (progress === 58) return CENTER;
  return null;
}
