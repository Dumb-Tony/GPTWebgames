# Moon Goons

Bad science. Worse equipment. One last trip to the ship.

Moon Goons is a browser-first cooperative space extraction game. This repository currently contains Build 001: a single-player Practice Moon mission that proves the core loop of scanning, extracting, transporting, and escaping.

## Playable build

The first prototype includes:

- Low-gravity movement and moon hopping
- Hidden deposits revealed by scanner pulses
- A drill with heat, efficiency loss, and thermal lockout
- Light, fragile, and heavy cargo
- Physical pickup and transport
- A ship cargo bay and extraction target
- A three-minute departure window
- Success, failure, debrief, and immediate restart

## Controls

| Input | Action |
|---|---|
| W, A, S, D or arrow keys | Move |
| Space | Moon hop |
| Q | Scanner pulse |
| Hold F | Drill |
| E | Grab, deposit, or launch |

## Development

Requirements:

- Node.js 22.13 or newer

Install dependencies and start the local build:

```sh
pnpm install
pnpm run dev
```

Create a production build:

```sh
pnpm run build
```

## Current milestone

This is the first-playable implementation milestone. Multiplayer, progression, additional destinations, controller support, and desktop/Steam packaging remain future milestones.
