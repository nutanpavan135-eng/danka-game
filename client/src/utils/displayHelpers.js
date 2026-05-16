export function roundLabel(type, oneCardMode) {
  if (type === 'four') return 'Four-card game';
  if (type === 'two') return 'Two-card game';
  if (type === 'one') return `One-card game (${oneCardMode})`;
  return 'Three-card game';
}
