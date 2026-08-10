# Moon Goons

Bad science. Worse equipment. One last trip to the ship.

Moon Goons is a browser-first cooperative space extraction game. This repository currently contains Build 021: a physical orbital hub with a walkable 3D operations deck, interactive contract/equipment/crew/maintenance stations, replayable contract profiles, persistent personal progression, recovery-safe repair invoices, destination dossiers, and equipment modules with real field effects.

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
- Material-specific bounce physics, structural ratings, and shattering cryogenic vials
- Color-coded first-impact trajectory previews and ricochet bank-shot bonuses
- A glowing ship cargo receiver that catches well-aimed airborne samples
- Persistent look sensitivity, inverted-look, and effects-volume controls
- Timed pressure vents with readable warnings, launch force, and cargo damage
- Physical pickup and transport
- A ship cargo bay and extraction target
- A three-minute departure window
- Success, failure, debrief, and immediate restart
- A shared Field Notes board for remote playtest feedback
- Temporary five-character Crew Link room codes for 1–4 players
- Distinct, color-coded remote astronauts with smooth position interpolation
- Host-authoritative scanning, drilling, cargo ownership, throwing, deposits, timer, and results
- Crew roster, round-trip latency display, location pings, and clean host-disconnect recovery
- A physics tether gun with a forgiving 16m lock range and predictable 19m cable break
- Two-scientist team lift that makes dense Platinum Cores substantially easier to haul
- Quick help, cargo, danger, and return-to-ship callouts that do not require voice chat
- Live drilling, movement, boosting, and safe-mode status for every connected teammate
- One-click crew invite links that prefill the room code for a friend
- Adjustable 150/300 ms latency and 10/20% packet-loss simulation for network testing
- Three contract profiles with distinct quotas, clocks, and career payouts
- Versioned device-local progression with credits, research, and safe legacy migration
- Four purchasable field modules for scanning, drill cooling, thrusters, and cargo handling
- Two-slot mission loadouts plus an always-free company minimum loadout
- Destination dossiers that reveal future expeditions as research accumulates
- Recovery wages after failed missions so progression can never block another launch
- A walkable third-person orbital ship interior between missions
- Four proximity-activated ship stations for contracts, equipment, Crew Link, and maintenance
- Clear in-world labels separating personal device progress from shared crew mission state
- Automatic tool and suit repair invoices deducted only from mission earnings
- A guaranteed minimum net payout so repairs can never consume savings or block another run

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
| P | Ping your position to the connected crew |
| T | Tether or release nearby loose cargo |
| 1 / 2 / 3 / 4 | Call for help / mark cargo / mark danger / call return to ship |

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

Build 021 completes the playable Hub and Progression foundation. Players now physically walk around the orbital support vessel between missions and approach lit stations to open the contract, equipment, Crew Link, and maintenance terminal. Version 2 career saves migrate the previous schema, while repair charges are capped against mission earnings and never touch banked credits. The hub explicitly labels personal device progress versus crew-shared run state. Practice Moon remains the launchable vertical-slice destination; Rust Belt and Icebox become playable during the later Content Pipeline milestone.

## Design references

- [Game Design Bible](docs/GAME_DESIGN_BIBLE.md)
- [Visual Direction](docs/VISUAL_DIRECTION.md)
