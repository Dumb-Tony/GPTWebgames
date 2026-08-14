# Moon Goons

Bad science. Worse equipment. One last trip to the ship.

Moon Goons is a browser-first cooperative space extraction game. This repository currently contains Build 032: Specialist Handoff, a physical equipment-sharing pass layered onto the Crew Signals, Rust Belt Polarity Annex, retro-NASA field test, three-tool kit, and cargo-cart logistics introduced in Builds 021–031.

## Playable build

The first prototype includes:

- Third-person low-gravity movement and moon hopping
- Two selectable destinations: the Practice Moon and metallic Rust Belt asteroid
- Destination-specific gravity, terrain, hazards, mineral mixes, lighting, and ambience
- A limited EVA micro-thruster for extending jumps and correcting bad decisions
- A real-time low-poly 3D moon, astronaut, landing ship, rover, drill, and cargo
- Dynamic lighting, shadows, emissive equipment, starfield, fog, lunar dust, and procedural surface/material textures
- Layered horizon ridges, meteor streaks, landing dust, and impact-responsive camera motion
- Hidden deposits revealed by scanner pulses
- Scanner telemetry for tracked contacts and nearest-signal distance
- A drill with heat, efficiency loss, and thermal lockout
- A selectable three-tool harvesting kit: thermal drill, percussion corer, and cryo siphon
- Three physical specialist cases that can be claimed, worn, tossed, bounced, caught, and transferred between scientists
- A 30% matched-tool extraction bonus, with reduced heat and wear for the drill specialist
- Resource-specific extraction: metals are drilled, glass/fossils are core-sampled, and pressurized cargo is siphoned
- Distinct extraction rhythms including continuous drilling, timed corer strikes, and seal-building siphon flow
- Scanner identification of the nearest material and its required harvesting tool
- Floating color-and-shape method tags above revealed deposits, with tool-specific extraction pulses
- Mechanical drill wear, visible jams, and three-strike field repairs
- Reproducible mission IDs with controlled cargo and deposit randomization
- A late-mission meteor shower with readable impact warnings and physical blast force
- Suit integrity, cargo-dropping knockdowns, and hold-to-reboot recovery
- Seven Practice Moon deposits and eight Rust Belt deposits spanning light, fragile, heavy, pressurized, archival, and magnetic cargo
- Bouncy Helium-3 Canisters and delicate Lunar Microfossils with distinct silhouettes and handling
- Cargo condition and value loss from reckless airborne or high-speed drops
- Low-gravity cargo throwing with weight-sensitive arcs and landing damage
- Material-specific bounce physics, structural ratings, and shattering cryogenic vials
- Color-coded first-impact trajectory previews and ricochet bank-shot bonuses
- A glowing ship cargo receiver that catches well-aimed airborne samples
- Persistent look sensitivity, inverted-look, and effects-volume controls
- Two rare timed pressure vents with readable warnings, launch force, and cargo damage
- Physical pickup and transport
- A towable four-slot cargo cart that slows modestly as its shared manifest fills
- Cooperative cart loading and one-action bulk deposit at the ship receiver
- A ship cargo bay and extraction target
- A three-minute departure window
- Success, failure, debrief, and immediate restart
- A shared Field Notes board for remote playtest feedback
- Temporary five-character Crew Link room codes for 1–4 players
- Distinct, color-coded remote astronauts with smooth position interpolation
- Host-authoritative scanning, drilling, cargo ownership, throwing, deposits, timer, and results
- Crew roster with link-quality, distance, live status, and clear downed-teammate warnings
- Color-coded world-space location, help, cargo, danger, and return-ship beacons
- Reliable queued guest actions that preserve fast interaction and callout bursts
- Automatic help signals and nearby teammate-assisted suit reboots
- A physics tether gun with a forgiving 16m lock range and predictable 19m cable break
- An 18m polarity manipulator that attracts or repels loose metal into dangerous low-gravity flight
- A three-relay Rust Belt facility objective that unlocks a derelict government-surplus vault
- A Rust-exclusive Prototype Flux Core and physical mag-rail cargo launcher
- Two-charge sample stabilizer foam that restores damaged carried cargo
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
- A contextual six-step first-shift guide that follows the complete extraction loop
- Standard Xbox, PlayStation, and compatible controller input in both the hub and mission
- Controller-focused menu navigation for contracts, upgrades, Crew Link, and settings
- Camera-impact reduction, scalable HUD, high-contrast instruments, and tutorial controls
- Battery Saver, Balanced, and High Detail render-quality presets

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
| Tab / mouse wheel | Cycle thermal drill, percussion corer, and cryo siphon |
| Hold F | Operate the selected harvesting tool |
| R | Repair a jammed drill |
| E | Grab, drop, deposit, launch, or hold to reboot a disabled suit |
| Shift + E | Throw carried cargo (fragile samples may lose value on impact) |
| X | Toss your specialist case to another scientist |
| P | Ping your position to the connected crew |
| T | Tether or release nearby loose cargo |
| H | Hitch or release the nearby cargo cart |
| G | Fire the polarity manipulator or align a nearby Rust Belt relay |
| V | Flip the polarity manipulator between attract and repel |
| C | Use stabilizer foam on damaged carried cargo |
| 1 / 2 / 3 / 4 | Call for help / mark cargo / mark danger / call return to ship |

### Standard controller

| Input | Action |
|---|---|
| Left stick | Move / strafe |
| Right stick | Look / turn |
| A / Cross | Hop and hold for EVA boost |
| X / Square | Interact, pick up, deposit, or reboot suit |
| Y / Triangle | Scanner pulse |
| View / Select | Cycle harvesting tool |
| Right trigger | Operate selected harvesting tool |
| Left bumper | Tether / release |
| Left stick click | Hitch / release cargo cart |
| Left trigger | Fire polarity manipulator / align relay |
| Right stick click | Stabilizer foam |
| Right bumper | Throw carried cargo, or toss your specialist case while hands are empty |
| B / Circle | Repair jammed drill / back out of menus |
| D-pad up | Flip polarity mode |
| D-pad right / down / left | Mark cargo / danger / return to ship |
| Menu / Start | Open Control Tuning |

Menus show a cyan focus outline. Use the D-pad or left stick to move, A/Cross to
activate, and B/Circle to go back.

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

Build 032 completes the first physical tool-handoff slice for Milestone 7. Three color-coded specialist cases deploy beside the lander, mount visibly on a scientist's suit, and provide a 30% bonus when matched to the active drill, corer, or siphon. Cases can be tossed through low gravity, bounce repeatedly, and transfer ownership safely through Crew Link without locking anyone out of the basic kit. Remaining cooperation work includes longer four-player soak testing and richer catch/handoff statistics; Milestone 9 still requires remappable action bindings and broader accessibility auditing.

## Design references

- [Game Design Bible](docs/GAME_DESIGN_BIBLE.md)
- [Visual Direction](docs/VISUAL_DIRECTION.md)
- [Compatibility and Performance Targets](docs/COMPATIBILITY.md)
