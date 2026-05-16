# Danka Game — Prototype 5.9 Final No-Cutter Flow

This version keeps the Prototype 5.8 visual direction but makes the requested rule and visibility fixes.

## What changed in 5.9

- Removed the pre-game cutter step from the whole game flow.
- After Place Cut seat selection, the dealer deals directly every time.
- No Cut Deck waiting/control step should appear after Place Cut, including after later round breaks.
- Perfect Cut is now probability-based during system dealing, not based on a manual cutter.
- Bottom/current-player profile blur/glow overlay has been removed.
- Action buttons are kept as separate simple buttons without a shared blurry background panel.

## Local run

Backend:
```bash
cd server
npm install
npm run dev
```

Frontend:
```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173
