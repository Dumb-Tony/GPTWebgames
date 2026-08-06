# Moon Goons

Bad science. Worse equipment. One last trip to the ship.

Moon Goons is a browser-first cooperative space extraction game. This repository currently contains Build 015: randomized Practice Moon contracts, escalating meteor hazards, recoverable equipment and suit failures, tunable mouse controls, skill-based cargo airmail, and a repeatable gameplay QA suite.

## Playable build

The first prototype includes:

- Third-person low-gravity movement and moon hopping
- A limited EVA micro-thruster for extending jumps and correcting bad decisions
- A real-time low-poly 3D moon, astronaut, landing ship, rover, drill, and cargo
- Dynamic lighting, shadows, emissive equipment, starfield, fog, and lunar dust
- Layered horizon ridges, meteor streaks, landing dust, and impact-responsive camera motion
- Hidden deposits revealed by scanner pulses
- Scanner telemetry for tracked contacts and nearest-signal distance
- A drill with heat, efficiency loss, and thermal lockout
- Mechanical drill wear, visible jams, and three-strike field repairs
- Reproducible mission IDs with controlled cargo and deposit randomization
- A late-mission meteor shower with readable impact warnings and physical blast force
- Suit integrity, cargo-dropping knockdowns, and hold-to-reboot recovery
- Light, fragile, and heavy cargo
- Cargo condition and value loss from reckless airborne or high-speed drops
- Low-gravity cargo throwing with weight-sensitive arcs and landing damage
- A glowing ship cargo receiver that catches well-aimed airborne samples
- Persistent look sensitivity, inverted-look, and effects-volume controls
- Timed pressure vents with readable warnings, launch force, and cargo damage
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
| Mouse | Click the game view to lock to center, then move to look and turn |
| A / D | Strafe left or right |
| Left / Right arrow | Turn when the mouse is released |
| Escape | Release the mouse |
| Space | Moon hop |
| Q | Scanner pulse |
| Hold F | Drill |
| R | Repair a jammed drill |
| E | Grab, drop, deposit, launch, or hold to reboot a disabled suit |
| Shift + E | Throw carried cargo (fragile samples may lose value on impact) |

Open **CONTROL TUNING** to adjust mouse sensitivity, invert vertical look, or change effects volume. These preferences are saved on the current device.

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
