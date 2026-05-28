const HAPTIC_PATTERNS = {
  tap: 8,
  drawer: 10,
  action: 14,
  selection: [8, 24, 8],
  success: [18, 36, 18],
  danger: [22, 36, 20],
};

export function triggerHaptic(type = 'tap') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  const pattern = HAPTIC_PATTERNS[type] || HAPTIC_PATTERNS.tap;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptics are an optional mobile enhancement.
  }
}
