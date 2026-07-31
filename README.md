# Moon Goons

Bad science. Worse equipment. One last trip to the ship.

Moon Goons is a browser-first cooperative space extraction game. This repository currently contains Build 004: a real-time 3D Practice Moon vertical slice that proves the core loop and establishes the game’s visual language.

## Playable build

The first prototype includes:

- Third-person low-gravity movement and moon hopping
- A real-time low-poly 3D moon, astronaut, landing ship, rover, drill, and cargo
- Dynamic lighting, shadows, emissive equipment, starfield, fog, and lunar dust
- Hidden deposits revealed by scanner pulses
- A drill with heat, efficiency loss, and thermal lockout
- Light, fragile, and heavy cargo
- Physical pickup and transport
- A ship cargo bay and extraction target
- A three-minute departure window
- Success, failure, debrief, and immediate restart
- A shared Field Notes board for remote playtest feedback

## Shared playtesting

Open **FIELD NOTES** from the mission screen to record visual feedback, control issues,
bugs, gameplay observations, and new ideas. Notes are shared across devices so collaborators
using the public build can review and add to the same development log.

## Controls

| Input | Action |
|---|---|
| W / Up arrow | Move forward |
| S / Down arrow | Reverse |
| A / Left arrow | Turn left |
| D / Right arrow | Turn right |
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

This is the first-playable and visual-foundation milestone. Multiplayer, progression, additional destinations, controller support, and desktop/Steam packaging remain future milestones.

## Design references

- [Game Design Bible](docs/GAME_DESIGN_BIBLE.md)
- [Visual Direction](docs/VISUAL_DIRECTION.md)
