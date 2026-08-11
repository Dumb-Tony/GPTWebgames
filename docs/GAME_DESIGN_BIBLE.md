# MOON GOONS
## Game Design Bible

**Working title:** *Moon Goons*  
**Tagline:** Bad science. Worse equipment. One last trip to the ship.  
**Genre:** Cooperative physics-comedy extraction game  
**Players:** 1–4  
**Initial platform:** Modern desktop web browsers  
**Target platform:** Windows via a desktop wrapper and Steam  
**Business model:** Premium game; no pay-to-win systems  
**Document status:** Pre-production reference, version 1.0  

> **Core promise:** Every useful action has at least one way it can go hilariously wrong.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision and Product Goals](#2-vision-and-product-goals)
3. [Design Pillars](#3-design-pillars)
4. [Target Audience and Market Position](#4-target-audience-and-market-position)
5. [Player Experience](#5-player-experience)
6. [Core Gameplay Loop](#6-core-gameplay-loop)
7. [Controls and Camera](#7-controls-and-camera)
8. [Player Movement and Physics](#8-player-movement-and-physics)
9. [Interaction and Carrying](#9-interaction-and-carrying)
10. [Tools and Equipment](#10-tools-and-equipment)
11. [Failure, Damage, and Recovery](#11-failure-damage-and-recovery)
12. [Resources and Cargo](#12-resources-and-cargo)
13. [Mission Structure](#13-mission-structure)
14. [Destinations and Planet Design](#14-destinations-and-planet-design)
15. [Progression and Economy](#15-progression-and-economy)
16. [Ship Hub](#16-ship-hub)
17. [Contracts, Objectives, and Events](#17-contracts-objectives-and-events)
18. [Multiplayer and Social Design](#18-multiplayer-and-social-design)
19. [UI and UX](#19-ui-and-ux)
20. [Accessibility](#20-accessibility)
21. [Art Direction](#21-art-direction)
22. [Animation and VFX](#22-animation-and-vfx)
23. [Audio Direction](#23-audio-direction)
24. [Narrative and Worldbuilding](#24-narrative-and-worldbuilding)
25. [Technical Architecture](#25-technical-architecture)
26. [Content and Data Architecture](#26-content-and-data-architecture)
27. [Analytics and Playtesting](#27-analytics-and-playtesting)
28. [Monetization Philosophy](#28-monetization-philosophy)
29. [Production Roadmap](#29-production-roadmap)
30. [Implementation Milestone Plan](#30-implementation-milestone-plan)
31. [Claude Development Guidelines](#31-claude-development-guidelines)
32. [Risks and Mitigations](#32-risks-and-mitigations)
33. [Future Content](#33-future-content)
34. [Open Questions](#34-open-questions)
35. [Glossary](#35-glossary)

---

# 1. Executive Summary

*Moon Goons* is a 1–4 player cooperative extraction game about underqualified field scientists collecting valuable samples from unstable celestial bodies. Players choose a destination, select unreliable equipment, land with a strict departure window, locate and extract resources, and physically return cargo to their ship before conditions become catastrophic.

The objective is intentionally simple: **find valuable things, dig them up, and get them home**. Depth comes from physics, changing gravity, cargo properties, unreliable tools, limited time, and the conflicting priorities of a group under pressure. A routine mining job can turn into a rescue operation when a cart rolls downhill, a drill overheats, a volatile sample cracks, and the person holding the tether is pulled toward a crater.

The game is browser-first so the earliest prototype can be played and tested with minimal friction. The codebase should be designed from the beginning for eventual desktop packaging and Steam distribution. The first release target is a focused premium game with a polished core loop, a small but replayable selection of destinations, online co-op, and progression built around new possibilities rather than simple numerical power.

## 1.1 Product Snapshot

| Attribute | Direction |
|---|---|
| Perspective | Third-person 3D |
| Session length | 10–20 minutes per mission |
| Group size | 1–4 players |
| Tone | Friendly chaos, workplace satire, optimistic low-budget science fiction |
| Mechanical focus | Movement, carrying, extraction, tool management, time pressure |
| Combat | Not a core system; hazards and creatures create pressure without conventional gunplay |
| World structure | Ship hub plus discrete mission destinations |
| Replayability | Variable deposits, hazards, contracts, events, upgrades, and group behavior |
| Initial input | Keyboard and mouse, with controller support before public release |
| Initial distribution | Hosted web build for private testing |
| Commercial release | Premium Windows game on Steam |

## 1.2 The Intended Story of a Mission

Every successful mission should naturally produce a story that players retell:

> “We found a rare crystal beneath the ice. The drill jammed, the geyser launched the cart, Sam tethered himself to it, and we dragged both of them into the ship with three seconds left.”

The systems should generate these stories without requiring scripted comedy.

## 1.3 Scope Guardrail

The project succeeds if movement, extraction, cargo transport, and the final return to the ship are enjoyable on one small map. Procedural planets, extensive lore, complex enemies, large skill trees, public matchmaking, and Steam integrations do not belong in the first playable prototype.

---

# 2. Vision and Product Goals

## 2.1 Vision Statement

Create the most approachable cooperative game about doing a simple scientific job with terrible equipment in an environment where momentum, gravity, and friendship are all unreliable.

## 2.2 Player Fantasy

Players are part astronaut, part field scientist, part warehouse worker, and part liability. They should feel clever when a plan works, responsible when it fails, and delighted when physics transforms either outcome into slapstick.

## 2.3 Product Goals

1. **Immediate readability:** A new player should understand the main objective in under one minute.
2. **Cooperative interdependence:** Friends are helpful without rigid classes or mandatory role assignments.
3. **Systemic comedy:** Humor emerges from mechanics, timing, and consequences rather than constant jokes.
4. **Recoverable disaster:** Mistakes create new problems and decisions instead of abruptly ending play.
5. **Short-session satisfaction:** A complete emotional arc fits into a 10–20 minute mission.
6. **Expandable foundation:** New planets, tools, resources, and events can be added primarily through data and modular components.
7. **Browser-first iteration:** Builds are easy to run, share, profile, and playtest during development.

## 2.4 Non-Goals

*Moon Goons* is not intended to be:

- A precision platformer.
- A hardcore survival simulator.
- A conventional shooter.
- A competitive esport.
- A realistic orbital mechanics simulation.
- A massive seamless universe.
- A content treadmill driven by daily chores.
- A game whose humor depends on griefing strangers.

---

# 3. Design Pillars

## 3.1 Simple Jobs, Complicated Consequences

The verbs are easy to understand: scan, drill, grab, carry, repair, tether, and run. Complexity emerges when systems overlap. A heavy sample changes momentum; a steep slope changes the route; an overheating tool changes who must help; a closing launch window changes every priority.

**Design test:** Can the mechanic be explained in one sentence, and can it interact with at least two existing systems?

## 3.2 Physics That Help Tell Stories

Physics should feel tactile, readable, and slightly exaggerated. It should permit accidents without making basic control frustrating. The game uses authored constraints and assists where pure simulation would undermine fun.

**Design test:** Does the physics response make the consequence understandable, funny, and recoverable?

## 3.3 Cooperation Without Classes

Players bring tools, not permanent character classes. The person carrying the scanner becomes the scout; the person holding the repair tool becomes the engineer. Equipment can be dropped, lost, exchanged, or improvised with.

**Design test:** Can another player take over this responsibility during the mission?

## 3.4 Failure Creates Gameplay

A damaged system should usually degrade, misbehave, or demand cooperation before it stops functioning completely. The best failures change the task:

- A broken cart becomes a sled.
- A leaking oxygen tank becomes an unwanted thruster.
- A cracked container must remain upright.
- A jammed drill must be held while another player clears it.

**Design test:** Does failure create a new choice or action rather than merely impose waiting?

## 3.5 Pressure With a Punchline

The mission clock creates momentum and forces imperfect decisions. Escalation should remain legible and theatrical: warning lights, worsening conditions, corporate announcements, loose cargo, and the ship beginning its launch sequence.

**Design test:** Does the pressure sharpen the group’s decisions without making early play feel pointless?

---

# 4. Target Audience and Market Position

## 4.1 Primary Audience

- Friend groups who enjoy cooperative comedy and emergent stories.
- Players comfortable with light 3D movement but not necessarily expert gamers.
- Streamers and viewers who enjoy legible mishaps and group reactions.
- Players who prefer teamwork and environmental pressure over combat.
- Ages 13+ as a provisional content target, subject to final ratings review.

## 4.2 Secondary Audience

- Solo players who enjoy score chasing, optimization, and physics sandboxes.
- Couples or smaller groups looking for short cooperative sessions.
- Players attracted to charming science-fiction art and collection-driven progression.

## 4.3 Experience Profile

The ideal player enjoys games where the plan matters, but the story of how the plan failed matters more. The game should be approachable enough for a less experienced friend to contribute immediately while offering experienced groups meaningful optimization through loadouts, routes, risk selection, and cargo triage.

## 4.4 Market Differentiation

The game’s identity should come from the combination of:

- Planet-specific gravity and traversal.
- Physical cargo with distinct handling requirements.
- Science-extraction fantasy rather than scavenging or combat.
- Malfunctioning tools that invite cooperative repair.
- A colorful, non-horror tone.
- A clear departure deadline and theatrical escape.

Comparisons may help communicate genre expectations internally, but the game must develop its own visual language, terminology, mechanics, and humor.

---

# 5. Player Experience

## 5.1 Emotional Arc

| Mission phase | Desired feeling |
|---|---|
| Briefing | Curiosity and overconfidence |
| Deployment | Freedom and playful experimentation |
| Search | Discovery and mild uncertainty |
| Extraction | Coordination and growing complication |
| Escalation | Urgency, shouting, and triage |
| Escape | Relief or spectacular failure |
| Debrief | Laughter, blame, rewards, and a desire for one more run |

## 5.2 Player Verbs

Core verbs:

- Move
- Jump
- Sprint
- Boost
- Look
- Ping
- Scan
- Grab
- Carry
- Throw
- Drill
- Repair
- Tether
- Deposit

Supporting verbs:

- Crouch or brace
- Ragdoll
- Revive
- Calibrate
- Cool
- Recharge
- Inspect
- Buy
- Equip
- Vote

## 5.3 Moment-to-Moment Decision Types

- Which deposit is worth pursuing?
- Which tool should be carried?
- Is the cargo valuable enough for its weight and danger?
- Should the team repair equipment or improvise?
- When should the group turn back?
- Who carries, who stabilizes, and who scouts?
- Is saving a teammate worth abandoning cargo?
- Is one final extraction worth missing the launch?

---

# 6. Core Gameplay Loop

## 6.1 Macro Loop

1. Return to the ship hub.
2. Review contracts and destination conditions.
3. Select a destination.
4. Buy repairs, consumables, and upgrades.
5. Choose a shared loadout.
6. Deploy and complete the extraction mission.
7. Recover cargo and surviving crew.
8. Receive credits, research, discoveries, and performance statistics.
9. Unlock new options and prepare for another mission.

## 6.2 Mission Loop

1. **Orient:** Exit the ship, identify landmarks, and establish a route.
2. **Search:** Use scanners and environmental clues to locate deposits.
3. **Extract:** Apply the correct tool while managing heat, stability, and hazards.
4. **Transport:** Carry, drag, tether, or cart the sample back.
5. **Deposit:** Secure cargo in the ship’s collection zone.
6. **Reassess:** Choose whether to pursue another target or evacuate.
7. **Escape:** Return before final departure.

## 6.3 Thirty-Second Loop

At least one meaningful event should occur roughly every 20–40 seconds:

- A new target is identified.
- A traversal challenge is solved.
- A tool state changes.
- Cargo behavior creates a correction.
- A hazard demands a response.
- A teammate requests assistance.
- A value-versus-risk choice appears.

This is a pacing guideline, not a requirement for constant spectacle.

## 6.4 Success Conditions

A mission is successful when:

- The team meets any mandatory contract requirement.
- At least one eligible crew member reaches the ship, unless the contract says otherwise.
- The ship launches before the terminal environmental event.

Cargo and crew survival modify rewards. Exceptional success may require optional objectives, rare discoveries, or zero-loss extraction.

## 6.5 Failure Conditions

A mission fails when:

- All players become unrecoverable.
- The ship is unable to depart.
- A mandatory contract objective becomes impossible.
- The departure window closes with no crew aboard.

Failure still grants limited research credit for scanned discoveries and may preserve newly revealed destination information. Rewards should never make intentional failure the optimal strategy.

---

# 7. Controls and Camera

## 7.1 Default Keyboard and Mouse

| Action | Default input |
|---|---|
| Move | W, A, S, D |
| Look | Mouse |
| Jump / push off | Space |
| Sprint | Left Shift |
| Crouch / brace | Left Ctrl |
| Primary tool action | Left mouse button |
| Secondary tool action | Right mouse button |
| Interact / grab | E |
| Drop | G |
| Throw | Hold and release G, or context-sensitive primary action |
| Quick ping | Middle mouse button |
| Tool slot 1–4 | Number keys |
| Emergency boost | Q |
| Ragdoll / recover | R |
| Map / mission display | Tab |
| Pause / settings | Escape |

Final bindings are subject to playtesting and must be fully remappable.

## 7.2 Controller

The controller scheme should use:

- Left stick for movement.
- Right stick for camera.
- South face button for jump.
- West face button for interact/grab.
- Triggers for primary and secondary tool actions.
- Bumpers for tool cycling and emergency boost.
- D-pad for pings and tool shortcuts.

Controller support should be implemented before public demo distribution, not deferred until launch.

## 7.3 Interaction Rules

- Context prompts display the action and target, such as “E — Grab Crystal.”
- The selected target receives a subtle outline.
- Prompts prioritize usable objects over decorative physics objects.
- Holding an input is reserved for risky, irreversible, or sustained actions.
- Common actions should respond on press.
- Input buffering should make jumping and grabbing forgiving.

## 7.4 Third-Person Camera

The camera should:

- Use a slightly elevated over-the-shoulder perspective.
- Expand its distance while sprinting or carrying large cargo.
- Avoid rapid horizon rotation, even on rotating destinations.
- Fade or reposition when colliding with nearby geometry.
- Preserve awareness of held objects and nearby teammates.
- Provide optional camera shake and motion reduction settings.

In extreme low gravity, a softened orientation assist should keep the character’s local “down” readable. Full six-degree freedom should be reserved for specific environments and introduced carefully.

---

# 8. Player Movement and Physics

## 8.1 Movement Goals

Movement must be:

- Floaty enough to communicate low gravity.
- Responsive enough for a new player to correct mistakes.
- Physical enough for momentum and cargo to matter.
- Consistent enough for players to learn.
- Funny without routinely becoming uncontrollable.

## 8.2 Core States

- Grounded
- Airborne
- Sliding
- Braced
- Carrying
- Tethered
- Boosting
- Ragdolled
- Downed
- Recovering

Transitions between states must be explicit in code and visible through animation, audio, or UI.

## 8.3 Gravity Profiles

Each destination defines a gravity profile rather than changing scattered movement constants.

```ts
type GravityProfile = {
  gravityVector: [number, number, number];
  gravityStrength: number;
  jumpImpulseMultiplier: number;
  airControlMultiplier: number;
  terminalVelocity: number;
  cargoMassMultiplier: number;
  orientationMode: "worldDown" | "localSurface" | "dynamic";
};
```

Values are illustrative and should be tuned through playtests.

| Profile | Feel | Primary challenge |
|---|---|---|
| Training Moon | Long, readable arcs | Landing and cargo momentum |
| Microgravity asteroid | Very long drift | Anchoring and braking |
| High-gravity planet | Heavy and deliberate | Stamina and teamwork |
| Ice comet | Low gravity plus low friction | Steering and stopping |
| Rotating station | Changing local down | Orientation and timing |

## 8.4 Jumping and Air Control

- Jump height scales with destination gravity but is capped for map integrity.
- “Coyote time” and jump input buffering improve accessibility.
- Air control remains available but weaker than grounded acceleration.
- Carrying heavy cargo reduces jump impulse and turning.
- Landing severity depends on relative velocity, cargo mass, and suit condition.
- Hard landings may stagger or ragdoll rather than directly kill.

## 8.5 Emergency Thruster

Every suit includes a small emergency boost:

- Limited charge that regenerates slowly or uses a battery.
- Strong enough to correct a bad jump, not replace traversal.
- Applies visible force and can affect held light cargo.
- Malfunctions when suit integrity is low.
- Has a clear audio and UI recharge cue.

## 8.6 Ragdoll

Ragdolling is a comedy and consequence tool, not the default movement mode.

- Triggered by sufficiently strong impacts, unstable tools, or specific hazards.
- Recovery begins automatically after a short readable delay.
- Players may voluntarily ragdoll for playful or tactical reasons.
- A ragdolled player can still be grabbed or tethered.
- Repeated impacts should not create indefinite stun-lock.

---

# 9. Interaction and Carrying

## 9.1 Interaction Model

All gameplay objects implement a common interaction contract:

```ts
interface Interactable {
  id: string;
  prompt: string;
  canInteract(actorId: string): boolean;
  beginInteraction(actorId: string): void;
  updateInteraction(actorId: string, deltaSeconds: number): void;
  endInteraction(actorId: string, reason: string): void;
}
```

This contract supports grabbing, repairing, depositing, operating consoles, and other contextual actions without hard-coding each one into the player controller.

## 9.2 Carrying Categories

| Category | Handling |
|---|---|
| Pocket | Stored in limited inventory; no physical burden |
| One-hand | Carried while retaining limited tool use |
| Two-hand | Occupies both hands and changes locomotion |
| Bulky | Obstructs view and strongly changes balance |
| Team lift | Requires two or more coordinated grab points |
| Tow-only | Must be dragged, tethered, or placed on a cart |

## 9.3 Assisted Carry Physics

Pure physics joints often create instability. Carried items should use an assisted system:

- The item follows a target pose through capped forces.
- Collision remains active but is filtered against the carrier when needed.
- Excessive force breaks the carry connection.
- Mass modifies movement and follow lag.
- Network ownership is explicit.
- Large items expose multiple grab anchors.

## 9.4 Throwing

Throwing is useful, risky, and visually readable:

- Charge time determines impulse.
- Cargo mass limits throw strength.
- Fragile cargo predicts danger with a warning color or sound.
- Low gravity makes even modest throws consequential.
- Throwing toward the ship is permitted but not always wise.

## 9.5 Inventory

The personal inventory should remain intentionally small:

- Four configurable equipment slots.
- A limited number of pocket sample slots.
- One carried physical object independent of tool slots.
- Suit battery, oxygen, and condition displayed as equipment states rather than inventory items.

Avoid grid-based inventory management during missions.

---

# 10. Tools and Equipment

## 10.1 Shared Tool Principles

Every tool has:

- A clear primary job.
- One dominant resource or constraint.
- Readable visual and audio feedback.
- At least one recoverable malfunction.
- A reason another player may help.
- A distinct silhouette and color language.

Common states:

```text
Stored → Equipped → Active → Stressed → Malfunctioning → Disabled
                              ↘ Cooling / Repairing ↗
```

## 10.2 Drill

**Purpose:** Extract ore and break designated rock shells.  
**Constraint:** Heat.  
**Skill:** Maintaining contact while managing recoil and cooling.

Behavior:

- Generates heat while active.
- Extraction speed varies by material hardness.
- Pushes the operator backward in low gravity.
- Loses efficiency near the heat limit.
- Can be vented early, producing a forceful burst.

Failures:

- Jam: another player clears debris or the operator performs a short input sequence.
- Overheat: sparks, reduced control, and potential shutdown.
- Damaged bit: slower extraction and increased sample breakage.

## 10.3 Scanner

**Purpose:** Locate and identify deposits.  
**Constraint:** Battery and calibration.  
**Skill:** Interpreting direction, depth, and confidence.

Behavior:

- Sends a cone or pulse through nearby terrain.
- Reveals signal strength rather than exact item locations at first.
- Higher-grade scanners identify cargo properties.
- Environmental interference can produce noisy readings.

Failures:

- False positives.
- Temporary misidentification.
- Calibration drift.
- Loud pulses that activate certain environmental responses.

Humor should not make the tool useless. Incorrect information must have detectable tells or limited duration.

## 10.4 Sample Extractor

**Purpose:** Remove delicate fossils, biological specimens, and artifacts.  
**Constraint:** Stability and contamination.  
**Skill:** Holding position and selecting the correct attachment.

Failures:

- Clog.
- Contamination.
- Seal failure.
- Specimen agitation.

## 10.5 Mining Laser

**Purpose:** Fast extraction and precision cutting.  
**Constraint:** Heat and line-of-fire safety.  
**Skill:** Careful aiming and controlled bursts.

Failures:

- Reflection from crystalline surfaces.
- Rapid overheat.
- Accidental equipment damage.
- Ignition of volatile cargo.

This tool belongs after the core drill is stable.

## 10.6 Gravity Cart

**Purpose:** Move multiple or heavy cargo items.  
**Constraint:** Power, stability, and momentum.  
**Skill:** Loading and route control.

Behavior:

- Reduces effective cargo friction or weight.
- Has physical tie-down points.
- Becomes unstable when overloaded or unevenly loaded.
- Can be pushed, pulled, ridden, or tethered.

Failures:

- Power loss.
- Wheel or stabilizer damage.
- Unwanted drift.
- Load ejection after impact.

## 10.7 Tether Gun

**Purpose:** Connect players, cargo, tools, and anchor points.  
**Constraint:** Line length and tension.  
**Skill:** Choosing safe anchors and managing force.

Rules:

- Tethers have a maximum length and breaking tension.
- Players can reel in or pay out line.
- Color identifies tether ownership.
- Crossed tethers are allowed but visually simplified.
- Tethers must not form unbounded physics chains.

## 10.8 Repair Tool

**Purpose:** Restore damaged equipment and suit systems.  
**Constraint:** Charge and repair materials.  
**Skill:** Completing a short context-specific action under pressure.

Repair interactions should be short and tactile:

- Reconnect highlighted wires.
- Hold a loose component while another player operates the device.
- Replace a battery.
- Seal a leak.
- Strike a marked panel with the approved wrench.

Minigames should not obscure the world or require lengthy modal screens.

## 10.9 Experimental Tools

Late progression introduces strong tools with explicit drawbacks:

| Tool | Advantage | Drawback |
|---|---|---|
| Prototype Turbo Drill | Double extraction speed | No active cooling |
| Pocket Gravity Inverter | Moves extremely heavy cargo | Periodically reverses nearby loose objects |
| Duplication Probe | Chance to copy a sample | Chance to produce unstable waste |
| Short-Range Teleporter | Rapid cargo movement | Destination drift under interference |
| Universal Analyzer | Identifies any sample | Broadcasts a strong local signal |

---

# 11. Failure, Damage, and Recovery

## 11.1 Design Intent

Damage should reduce certainty before it removes agency. Warning states provide time for a heroic repair, a tactical retreat, or a terrible decision.

## 11.2 Damage Channels

- **Suit integrity:** Impact and environmental protection.
- **Oxygen:** Mission-specific life support pressure.
- **Battery:** Thruster and electronics power.
- **Temperature:** Heat or cold exposure.
- **Tool condition:** Reliability and efficiency.
- **Cargo condition:** Value, stability, and containment.

Not every destination uses every channel. Limit the active pressures so players can read the mission.

## 11.3 Player Downing

At zero suit integrity, a player becomes downed:

- Movement becomes limited or the body enters ragdoll.
- A suit beacon activates.
- Teammates can stabilize, drag, or carry the player.
- A recovery timer is shown to the team.
- The downed player may operate a low-power suit light, ping, or small drone.

Permanent mission loss should require failed recovery, severe environmental removal, or departure without the player.

## 11.4 Rescue Tradeoffs

Rescue creates explicit cost:

- Time spent returning.
- Cargo abandoned to free hands.
- Repair charge consumed.
- A safer route taken.
- Launch rewards reduced by medical fees.

The game should celebrate rescues, not punish them so heavily that leaving friends behind becomes routine.

## 11.5 Friendly Interference

Players can collide, push, tether, and strike one another because physical interaction drives comedy. Safeguards include:

- Reduced direct friendly damage by default.
- Diminishing impact stun.
- Host options for friendly collision strength.
- Fast recovery from minor accidents.
- Reporting and kick tools for public play.

---

# 12. Resources and Cargo

## 12.1 Cargo Properties

```ts
type CargoDefinition = {
  id: string;
  displayName: string;
  baseValue: number;
  mass: number;
  volume: number;
  fragility: number;
  scientificValue: number;
  temperatureRange?: [number, number];
  volatility?: number;
  containmentType?: string;
  tags: string[];
};
```

Runtime condition modifies final value:

```text
Final Value =
Base Value
× Condition Multiplier
× Contract Multiplier
× Rarity Multiplier
− Contamination Penalty
− Handling Fees
```

## 12.2 Resource Categories

- Metals and ores
- Crystals and geological structures
- Fossils
- Biological specimens
- Frozen organisms
- Volatile gases and liquids
- Alien artifacts
- Corporate salvage
- Deceptive junk

## 12.3 Example Cargo

| Resource | Value | Handling | Complication |
|---|---:|---|---|
| Ferric Nodules | Low | One-hand | Common and dense |
| Platinum Meteor Core | Very high | Team lift | Extremely heavy |
| Lunar Glass Cluster | Medium | Two-hand | Loses value on impact |
| Cryogenic Organism | High research | Bulky container | Must remain cold |
| Volatile Gas Sac | Very high | Two-hand | Ruptures when dropped |
| Resonant Crystal | High | One-hand | Vibrates near scanner pulses |
| Unknown Alien Cube | Unknown | One-hand | Applies a random mission modifier |
| Suspiciously Shiny Rock | Very low | Bulky | Scanner confidence appears unusually high |

## 12.4 Cargo Storage

The ship’s cargo bay has:

- A clearly marked deposit volume.
- A capacity measured by both volume and restraint points.
- Tie-down locations for unstable objects.
- A manifest showing secured and unsecured cargo.
- Physical doors that can become obstructed.

Cargo must cross the deposit boundary and settle briefly to count as loaded. The game should prevent edge cases where an item visually aboard is rejected without explanation.

## 12.5 Value Readability

Players should estimate value without opening menus:

- Material color and surface treatment suggest rarity.
- Scanner tiers reveal increasingly precise estimates.
- Cargo labels show special handling icons.
- The ship announces exceptionally valuable deposits.
- Unknown items remain an intentional gamble.

---

# 13. Mission Structure

## 13.1 Mission Length

Target mission duration is 10–20 minutes:

- 1–2 minutes for deployment and orientation.
- 6–12 minutes for searching and extraction.
- 2–4 minutes of escalating return pressure.
- Under 90 seconds for debrief and reward presentation.

The prototype may use a five-minute timer to accelerate iteration.

## 13.2 Mission Phases

### Phase A: Landing

- Ship establishes a safe zone.
- Mission clock starts after doors open.
- Nearby low-value resources teach current conditions.

### Phase B: Operation

- Hazards are stable and readable.
- Players explore, extract, and build confidence.
- Optional objectives become visible.

### Phase C: Warning

- Environmental cues intensify.
- The ship issues a clear return recommendation.
- Rare resources may become temporarily accessible.

### Phase D: Final Departure

- The return clock is large and unmistakable.
- Environmental pressure escalates.
- Ship doors and engines begin a visible sequence.
- Players aboard can delay departure only within strict limits, if that feature is enabled.

### Phase E: Debrief

- Cargo is appraised.
- Crew status and repair fees are calculated.
- Comedic statistics and progression rewards are shown.

## 13.3 Time Pressure

The timer should represent a destination-specific event:

- Solar storm arrival.
- Launch window closure.
- Rising surface temperature.
- Asteroid breakup.
- Meteor shower.
- Creature awakening.
- Employer-enforced overtime limit.

The fiction changes, but the UX remains consistent.

## 13.4 Difficulty

Difficulty is expressed through selectable destination tiers and contract modifiers rather than invisible scaling.

Variables include:

- Mission duration.
- Deposit depth and distribution.
- Hazard severity.
- Tool wear.
- Navigation uncertainty.
- Cargo instability.
- Rescue conditions.
- Optional objective count.

Player count scaling should affect workload and resource density more than raw hazard damage.

---

# 14. Destinations and Planet Design

## 14.1 Destination Framework

Each destination is defined by:

- A movement identity.
- A signature hazard.
- A resource identity.
- A traversal rhythm.
- A late-mission escalation.
- One memorable toy or environmental interaction.

## 14.2 The Practice Moon

**Role:** Tutorial and first complete environment.  
**Movement:** Low gravity with forgiving terrain.  
**Resources:** Basic ore, lunar glass, abandoned equipment.  
**Hazards:** Small craters, weak meteor impacts, cart momentum.  
**Escalation:** Approaching debris shower.  
**Toy:** A barely functional rover.

Design notes:

- The ship remains visible from most of the map.
- Landmark silhouettes prevent players from getting lost.
- Initial deposits demonstrate light, heavy, and fragile cargo.
- Safe and risky routes should both be obvious.

## 14.3 The Rust Belt

**Movement:** Extremely low gravity and strong momentum.  
**Resources:** Dense metals, magnetic crystals, salvage.  
**Hazards:** Magnetic storms and rotating debris.  
**Escalation:** Tether anchors begin failing.  
**Toy:** Surface magnets that pull metal cargo and equipment.

## 14.4 Icebox Comet

**Movement:** Low friction, low gravity, long slides.  
**Resources:** Frozen organisms, gases, ice crystals.  
**Hazards:** Geysers, cracking ice, thermal exposure.  
**Escalation:** Sun-facing areas begin to melt and vent.  
**Toy:** Geysers used for rapid travel or accidental launch.

## 14.5 Soup Moon

**Movement:** Sticky shallows and bouncy biological terrain.  
**Resources:** Living samples and reproductive spores.  
**Hazards:** Adhesive pools and equipment-stealing creatures.  
**Escalation:** Local organisms become active.  
**Toy:** Samples that split, hatch, or crawl away.

## 14.6 The Crusher

**Movement:** High gravity, short jumps, rapid fatigue.  
**Resources:** Extremely dense minerals.  
**Hazards:** Pressure storms and accelerated tool wear.  
**Escalation:** A severe atmospheric front crosses the map.  
**Toy:** Powered cargo launchers necessary for vertical movement.

## 14.7 Shatterstone

**Movement:** Low gravity across separated fragments.  
**Resources:** Rare material near unstable edges.  
**Hazards:** Expanding cracks and detached terrain.  
**Escalation:** The playable space breaks into drifting islands.  
**Toy:** Tether bridges and movable anchor points.

## 14.8 The Unlicensed Research Station

**Movement:** Intermittent artificial gravity.  
**Resources:** Prototypes, research data, contained specimens.  
**Hazards:** Moving machinery, locked chambers, electrical faults.  
**Escalation:** Station power cycles unpredictably.  
**Toy:** Gravity controls that affect entire rooms.

## 14.9 Level Construction

Early environments should be handcrafted from modular pieces. Use controlled randomization for:

- Deposit locations.
- Resource quality.
- Minor hazards.
- Locked routes.
- Contract props.
- Weather and event timing.

Do not attempt fully procedural terrain until handcrafted missions prove the required spatial grammar.

## 14.10 Spatial Grammar

Each map should contain:

- A visible, safe landing zone.
- A low-risk resource ring near the ship.
- Two or three recognizable regions.
- At least one route suited to carts.
- At least one risky shortcut.
- One distant high-value zone.
- Landmarks visible from multiple angles.
- Recovery points that prevent a single bad jump from always ending a run.

---

# 15. Progression and Economy

## 15.1 Progression Goals

Progression should:

- Unlock choices, not invalidate early content.
- Encourage experimentation.
- Support group goals without making guests feel useless.
- Provide recovery after failure.
- Avoid excessive grinding.

## 15.2 Currencies

Use no more than three persistent currencies:

1. **Credits:** Repairs, consumables, and equipment purchases.
2. **Research:** Permanent unlocks and destination access.
3. **Reputation:** Contract tier and narrative status; not directly spent.

Avoid premium currency.

## 15.3 Reward Sources

- Secured cargo value.
- Scientific significance.
- Contract completion.
- Optional objectives.
- First-time discoveries.
- Crew recovery.
- Equipment returned.
- Safety or efficiency bonuses.

## 15.4 Costs

- Tool repair.
- Lost equipment replacement.
- Consumables.
- Medical recovery fees.
- Destination travel fees.
- Optional insurance.

Costs should create texture without causing a downward failure spiral. The company always provides a minimally viable free loadout.

## 15.5 Research Branches

### Mining

Drills, ore analysis, reinforced carts, controlled explosives.

### Biology

Containment, specimen tools, portable refrigeration, sedatives.

### Mobility

Thrusters, grappling systems, boots, tethers, landing protection.

### Engineering

Repairs, batteries, generators, tool modifications, ship systems.

### Questionable Science

Gravity manipulation, teleportation, duplication, and unstable prototypes.

## 15.6 Upgrade Philosophy

Prefer sidegrades and tradeoffs:

- Faster drill, faster heat.
- Stronger thruster, less battery efficiency.
- Larger scanner radius, noisier pulse.
- Bigger cart, poorer handling.

Simple reliability upgrades are useful early, but late progression should introduce new play patterns rather than only larger numbers.

## 15.7 Shared and Personal Progress

- Destination unlocks and major ship modules are tied to the host’s campaign.
- Cosmetic unlocks and personal records belong to individual profiles.
- Visiting players can use the host’s shared tools during the session.
- Mission rewards should meaningfully advance every participant.
- Save data must clearly state what belongs to the host and what follows the player.

---

# 16. Ship Hub

## 16.1 Functions

The ship serves as:

- Multiplayer lobby.
- Destination selector.
- Equipment shop and repair area.
- Loadout room.
- Research interface.
- Trophy and discovery display.
- Tutorial sandbox.
- Physical social space.

## 16.2 Hub Layout

Keep essential stations close:

- Navigation console.
- Contract board.
- Tool rack.
- Repair bench.
- Cargo appraisal area.
- Airlock.

Optional rooms unlock over time but should not turn preparation into a commute.

## 16.3 Physical Preparation

Players can physically place chosen tools into launch racks. A ready-up summary prevents accidental omission. Preparation should feel playful but offer a quick-load option after the novelty wears off.

## 16.4 Readiness

Departure requires:

- A destination selected.
- A contract confirmed.
- At least one viable extraction tool.
- Each connected player ready, or a host override after a countdown.

---

# 17. Contracts, Objectives, and Events

## 17.1 Contract Types

- Reach a minimum cargo value.
- Recover a specific resource.
- Retrieve a scientific specimen intact.
- Repair and return abandoned equipment.
- Map a set of scan points.
- Recover a lost company beacon.
- Test a prototype under field conditions.
- Extract with a restrictive loadout.

## 17.2 Optional Objectives

Optional objectives create risk without invalidating the core mission:

- Recover all crew.
- Return before the warning phase.
- Avoid sample damage.
- Retrieve a black box.
- Keep an experimental device active.
- Bring back a useless corporate mascot.

## 17.3 Dynamic Events

Events should remix established systems:

- Gravity fluctuation.
- Tool recall notice.
- Temporary resource bloom.
- Cargo contamination alert.
- Solar interference.
- Rover malfunction.
- Unauthorized creature boarding.

Events require clear telegraphing and should not randomly erase secured progress.

## 17.4 Event Director

A lightweight director chooses events based on:

- Mission phase.
- Recent player pressure.
- Current cargo value.
- Team distance from ship.
- Previous event recency.
- Destination compatibility.

The director should enforce cooldowns and pressure budgets. It should not maximize chaos continuously.

---

# 18. Multiplayer and Social Design

## 18.1 Cooperative Model

- 1–4 players.
- Drop-in permitted in the hub.
- Mid-mission joining may use a drop pod or remain disabled for early versions.
- No permanent classes.
- Shared mission result and individual comedic statistics.
- Host-authoritative simulation for the first multiplayer implementation.

## 18.2 Communication

Support:

- Platform or third-party voice chat initially if native voice is out of scope.
- Context pings for target, danger, help, return, and ship.
- Character emotes and suit-display icons.
- Visible player colors and names.
- Spatial audio cues for nearby players.

The game should remain playable without voice, though voice enhances the experience.

## 18.3 Networking Model

Recommended initial model:

- Host owns the authoritative mission state.
- Clients send input intent.
- Host simulates mission-critical physics.
- Clients predict local character motion.
- Transform snapshots are interpolated for remote entities.
- Ownership of held objects transfers through explicit server-approved rules.
- Cargo deposit, rewards, tool condition, and timers are host validated.

## 18.4 Networked Physics Priorities

Synchronize accurately:

- Player transforms and states.
- Currently held or tethered objects.
- High-value cargo.
- Tool activation and condition.
- Mission timer and phase.
- Deposit and reward state.

Synchronize approximately or locally:

- Small debris.
- Cosmetic particles.
- Nonessential ragdoll bones.
- Minor impact sounds.

## 18.5 Host Migration

Host migration is desirable but not required for the first public demo. Before commercial release:

- Preserve mission state snapshots on peers where feasible.
- Gracefully return the group to the hub if migration fails.
- Avoid losing persistent rewards already committed.

## 18.6 Matchmaking

Development order:

1. Local single-player.
2. Direct invitation or room code.
3. Friend invites.
4. Optional public lobbies.

Public matchmaking requires moderation tools, region selection, lobby tags, and anti-griefing settings.

## 18.7 Anti-Griefing

- Host kick and ban-for-session.
- Configurable friendly collision.
- Tool and cargo permissions in public lobbies.
- Protected cargo bay after deposit, as an optional setting.
- A short grace period before a player can eject secured cargo.
- Clear reporting pathways for Steam release.

---

# 19. UI and UX

## 19.1 UX Principles

- Show world information in the world whenever practical.
- Keep the center of the screen clear.
- Use consistent colors and shapes for heat, power, oxygen, danger, and value.
- Make the mission clock readable at a glance.
- Prioritize team state during emergencies.
- Avoid modal screens during active missions.

## 19.2 Mission HUD

Always visible or immediately accessible:

- Mission timer and current phase.
- Primary contract progress.
- Equipped tool and its dominant resource.
- Suit condition relevant to the current destination.
- Teammate status and downed state.
- Carrying or tether state.

Contextual:

- Interaction prompt.
- Cargo identity and condition.
- Scanner readout.
- Repair sequence.
- Return-to-ship warning.

## 19.3 Diegetic UI

Use suit, tool, and ship displays for flavor:

- Drill heat bar on the drill housing.
- Scanner direction on its screen.
- Cargo handling symbols on containers.
- Ship departure timer above the airlock.

Critical information should also have accessible HUD alternatives. Diegetic presentation must not reduce clarity.

## 19.4 Navigation

- The ship has a persistent directional marker with distance.
- Player pings appear in the world and on the compass.
- Major landmarks have recognizable silhouettes.
- A simple map may unlock through scanning.
- Breadcrumbs or suit footprints can assist return routes.

## 19.5 Debrief Screen

Show information in this order:

1. Mission outcome.
2. Crew recovered.
3. Cargo value and notable discoveries.
4. Costs and net reward.
5. Research and unlock progress.
6. Comedic statistics.

Example statistics:

- Longest uncontrolled tumble.
- Most distance traveled airborne.
- Most expensive object dropped.
- Tools overheated.
- Teammates struck.
- Cargo saved in the final ten seconds.
- Safety violations.
- Person most statistically responsible.

## 19.6 Onboarding

Teach through a short Practice Moon assignment:

1. Move and jump to the airlock.
2. Grab and deposit a loose object.
3. Scan a nearby signal.
4. Drill a shallow deposit.
5. Carry a heavy sample, with an optional helper.
6. Respond to an overheat.
7. Return during a short departure countdown.

Instructions should disappear quickly and remain available in a manual.

---

# 20. Accessibility

Accessibility is a production requirement, not a post-launch feature.

## 20.1 Visual

- Scalable UI and text.
- High-contrast HUD option.
- Colorblind-safe palettes plus shape/icon redundancy.
- Adjustable bloom, flashes, particles, and screen shake.
- Clear subtitles with speaker labels.
- Optional outlines for interactable objects and teammates.

## 20.2 Motor

- Full input remapping.
- Toggle alternatives for hold actions.
- Adjustable mouse and controller sensitivity.
- Separate camera axis inversion.
- Reduced rapid-input requirements.
- Aim and interaction targeting assistance.
- Optional simplified repair interactions.

## 20.3 Cognitive

- Consistent icons and terminology.
- Adjustable tutorial frequency.
- Objective history.
- Simplified HUD mode and expanded HUD mode.
- Clear audio and visual countdown redundancy.

## 20.4 Motion Sensitivity

- Camera shake slider.
- Head bob toggle.
- Motion blur toggle.
- Stable-horizon option.
- Reduced field-of-view changes.
- Ragdoll camera smoothing or snap-to-safe-view.

---

# 21. Art Direction

## 21.1 Visual Thesis

Bright, chunky, low-budget corporate science fiction: capable enough to reach another world, too cheap to provide matching screws.

## 21.2 Style

- Low-poly 3D forms with bold silhouettes.
- Saturated spacesuits against quieter environmental palettes.
- Oversized tool parts and readable moving components.
- Slightly worn surfaces without grim realism.
- Large labels, hazard stripes, status lights, and improvised repairs.
- Expressive posing rather than detailed facial animation.

## 21.3 Character Design

Spacesuits should feature:

- Large reflective or transparent helmets.
- Short, sturdy proportions readable at distance.
- Strong team colors.
- Backpack modules that communicate suit state.
- Customizable helmet displays, patches, and accessories.
- Hands large enough to sell grabbing and carrying.

Character cosmetics must preserve silhouette and hazard readability.

## 21.4 Environment Palette

Each destination receives:

- One dominant neutral.
- One resource accent.
- One hazard color.
- One atmospheric or sky color.

The ship uses consistent warm safety lighting so it always feels like home.

## 21.5 Corporate Identity

The employer is:

**S.P.A.C.E. — Scientific Procurement and Collection Enterprise**

Brand qualities:

- Cheerful blue and yellow.
- Overconfident safety messaging.
- Outdated diagrams.
- Excessively reassuring slogans.
- Forms, serial numbers, and warning labels everywhere.

## 21.6 Readability Rules

- Gameplay tools have unique silhouettes.
- Interactable resources contrast with terrain.
- Red is reserved primarily for immediate danger.
- Secured cargo uses green plus a lock icon.
- Rare objects may be visually strange but cannot rely on particle noise alone.

---

# 22. Animation and VFX

## 22.1 Animation Style

- Slightly exaggerated anticipation and follow-through.
- Procedural leaning under cargo weight.
- Layered locomotion so upper-body tool actions remain readable.
- Controlled ragdolls blended back into animation.
- Tool vibration and recoil communicated through the whole body.

## 22.2 Priority Animation Set

For the first playable:

- Idle, walk, sprint.
- Jump, airborne loop, land, hard land.
- One-hand and two-hand carry.
- Grab and release.
- Drill operate and overheat reactions.
- Ragdoll entry and recovery.
- Downed and assisted recovery.

## 22.3 VFX Language

- Heat: orange glow, distortion, and upward sparks.
- Electrical damage: blue-white arcs and irregular blinking.
- Oxygen leak: pale directional vapor.
- Valuable scan return: clean cyan pulse.
- Unstable cargo: magenta warning flicker plus icon.
- Secured cargo: green sweep and latch effect.

VFX should indicate state before adding spectacle.

---

# 23. Audio Direction

## 23.1 Audio Goals

- Make tool condition understandable without watching a meter.
- Give impacts satisfying weight.
- Communicate distance and direction.
- Build tension during the return phase.
- Support comedy through timing, not novelty sounds alone.

## 23.2 Sound Categories

- Suit movement and breathing.
- Surface-specific footsteps and landings.
- Tool loops, strain, warning, failure, and repair.
- Cargo scrape, roll, crack, leak, and secure sounds.
- Environmental ambience and hazards.
- Ship announcements and alarms.
- UI confirmations.
- Music.

## 23.3 Tool Audio

Every sustained tool has layered audio:

1. Startup.
2. Stable operation.
3. Load or resistance.
4. Stress warning.
5. Malfunction.
6. Cooldown or shutdown.

Players should recognize an overheating drill from across the worksite.

## 23.4 Music

- Hub: upbeat, slightly cheap corporate lounge music.
- Exploration: sparse, curious, and spacious.
- Warning phase: rhythmic layers enter gradually.
- Final departure: strong pulse synchronized with countdown events.
- Debrief: short stings that reflect success, failure, or absurd loss.

## 23.5 Voice

The company dispatcher delivers:

- Mission briefing.
- Time warnings.
- Tool and safety notices.
- Dry debrief commentary.

Lines should remain concise and not overlap urgent player communication. Subtitle priority rules are required.

---

# 24. Narrative and Worldbuilding

## 24.1 Premise

S.P.A.C.E. recruits crews to acquire samples for scientific development, corporate contracts, and experiments that have not completed ethical review. Its technology is impressive, unreliable, and visibly reused.

## 24.2 Tone

- The universe is dangerous but not hopeless.
- The company is irresponsible, not relentlessly cruel.
- Scientists are enthusiastic and underprepared.
- Discoveries can inspire genuine wonder.
- Comedy comes from institutional absurdity and physical outcomes.

## 24.3 Narrative Delivery

- Destination briefings.
- Cargo descriptions.
- Ship upgrades and environmental details.
- Corporate notices.
- Recovered logs.
- Research milestones.
- Rare multi-mission discoveries.

Avoid long mandatory cutscenes. Narrative should decorate and motivate the loop.

## 24.4 Player Identity

Players create a field scientist through:

- Suit color.
- Helmet display or face.
- Voice style or emote set.
- Patch and accessory.
- Call sign.

No gameplay statistics are tied to body type or cosmetic identity.

---

# 25. Technical Architecture

## 25.1 Technical Goals

- Run in current Chromium, Firefox, and Safari-class desktop browsers where practical.
- Maintain a stable 60 FPS target on recommended desktop hardware.
- Separate simulation, rendering, UI, data, and platform services.
- Support rapid local iteration and automated builds.
- Avoid browser-specific architecture that blocks desktop packaging.
- Treat multiplayer authority and persistence as explicit systems.

## 25.2 Recommended Stack

Final library choices require a technical spike. A sensible baseline:

| Layer | Recommendation |
|---|---|
| Language | TypeScript with strict mode |
| Build tooling | Vite or equivalent fast bundler |
| Rendering | Three.js or Babylon.js |
| Physics | Rapier WASM or another actively maintained deterministic-enough engine |
| UI | Lightweight component framework or a structured DOM UI layer |
| State | Explicit game-state services; avoid putting frame state in general UI stores |
| Networking | WebSockets/WebRTC abstraction; authoritative relay or listen-server model |
| Tests | Unit tests plus browser automation and deterministic simulation tests |
| Formatting/linting | Automated and enforced in continuous integration |
| Desktop wrapper | Electron first for lower integration risk; evaluate Tauri if requirements fit |

Choose the renderer and physics engine after small prototypes measure:

- Character controller quality.
- Physics-joint stability.
- Network integration cost.
- Asset pipeline.
- Debugging tools.
- Browser and wrapper support.

## 25.3 Layered Architecture

```text
Platform Adapters
  ├─ Browser storage and invites
  ├─ Desktop filesystem
  └─ Steamworks services

Application
  ├─ Session flow
  ├─ Save/load
  ├─ Contracts and rewards
  └─ Menus and settings

Game Simulation
  ├─ Players
  ├─ Tools
  ├─ Cargo
  ├─ Missions
  ├─ Hazards
  └─ Interaction rules

Infrastructure
  ├─ Rendering
  ├─ Physics
  ├─ Networking
  ├─ Audio
  └─ Input
```

Game rules should depend on interfaces, not directly on browser globals or Steam APIs.

## 25.4 Project Structure

```text
src/
  app/
  assets/
  audio/
  data/
    cargo/
    destinations/
    tools/
    contracts/
  game/
    actors/
    cargo/
    interaction/
    missions/
    movement/
    tools/
  infrastructure/
    audio/
    input/
    networking/
    physics/
    rendering/
  platform/
    browser/
    desktop/
    steam/
  ui/
  shared/
tests/
public/
tools/
```

## 25.5 Simulation Loop

- Use a fixed timestep for gameplay and physics.
- Interpolate render transforms between simulation ticks.
- Never base gameplay outcomes on render frame rate.
- Keep mission timer authority with the host.
- Seed randomized content and record the seed for reproduction.
- Cap accumulated frame time to avoid runaway simulation after a pause.

## 25.6 Character Controller

A custom physics-assisted character controller is likely preferable to a fully dynamic rigid body:

- Ground detection through shape casts.
- Controlled acceleration.
- Slope and step handling.
- External impulse accumulation.
- Gravity-profile support.
- Explicit transition to ragdoll.

Prototype this before committing to a physics engine.

## 25.7 Persistence

Save data includes:

- Version number.
- Progression and unlocks.
- Currency.
- Cosmetics.
- Settings and bindings.
- Discovery log.
- Statistics.

Requirements:

- Local browser storage for prototypes.
- Export/import save option during development.
- Versioned migrations.
- Desktop filesystem storage later.
- Steam Cloud adapter for release.
- Atomic writes and backup recovery in desktop builds.

## 25.8 Steam Path

1. Build and validate the complete loop in browser.
2. Package the existing web build in a desktop wrapper.
3. Replace platform services through adapters.
4. Add Steam authentication and friend invites.
5. Add achievements and cloud saves.
6. Test overlay, focus, controller, display modes, and offline behavior.
7. Produce signed builds and configure depots.

Steam-specific work should not leak into core simulation code.

## 25.9 Performance Budgets

Provisional targets for the first polished map:

- 60 FPS at 1080p on recommended hardware.
- No long main-thread tasks during active play.
- Bounded active rigid-body count.
- Object pooling for repeated effects and debris.
- Level-of-detail or simplified simulation at distance.
- Compressed textures and audio.
- Fast hub-to-mission transition after initial load.

Exact budgets should be established after the vertical slice hardware survey.

## 25.10 Security and Trust

For network play:

- Treat client reward claims as untrusted.
- Validate inventory, tool, cargo, and deposit transitions on the host.
- Rate-limit messages and pings.
- Sanitize player names and user-generated text.
- Never expose service secrets in the browser bundle.
- Use secure transport for hosted services.

---

# 26. Content and Data Architecture

## 26.1 Data-Driven Definitions

Tools, cargo, destinations, hazards, contracts, and upgrades should be defined in validated data files. Code supplies behaviors; data composes and tunes them.

## 26.2 Stable IDs

Every persistent definition receives a stable string ID:

```text
cargo.lunar_glass
tool.drill.standard
destination.practice_moon
contract.minimum_value
upgrade.mobility.thruster_capacity_1
```

Display names can change without breaking saves.

## 26.3 Validation

At load time, validate:

- Required fields.
- Value ranges.
- Referenced IDs.
- Duplicate IDs.
- Missing assets.
- Impossible contract requirements.
- Unsupported destination combinations.

Development builds fail loudly; release builds log and fall back safely.

## 26.4 Feature Flags

Experimental systems should be enabled through explicit flags:

- Multiplayer.
- Dynamic gravity.
- Tool malfunctions.
- Event director.
- Experimental cargo behaviors.

Flags must not become permanent architectural branches.

---

# 27. Analytics and Playtesting

## 27.1 Key Questions

- Do players understand the objective without explanation?
- Is movement enjoyable before objectives are added?
- How often does physics produce laughter versus frustration?
- When do teams decide to return?
- Which failures generate cooperation?
- Which cargo types create meaningful tradeoffs?
- Are new players able to contribute?
- Does the final countdown create urgency without feeling unfair?

## 27.2 Useful Metrics

With consent and privacy review:

- Mission completion rate.
- Average mission duration.
- Time of first cargo deposit.
- Cargo value attempted versus secured.
- Player down and recovery rate.
- Departure misses by time interval.
- Tool usage and malfunction frequency.
- Cargo damage causes.
- Destination and contract selection.
- Disconnect and crash rate.

Metrics explain what happened; observation and interviews explain why.

## 27.3 Playtest Cadence

- Weekly internal tests once movement is playable.
- Small external tests at first-playable and vertical-slice milestones.
- Structured tests for onboarding and accessibility.
- Network tests under artificial latency and packet loss.
- Hardware coverage before public distribution.

## 27.4 Success Signals

Prototype success requires:

- Players voluntarily restart after a mission.
- Teams recount specific unscripted events.
- Players can distinguish avoidable mistakes from unclear controls.
- Carrying and extraction remain fun after novelty fades.
- The group debates risk and return timing.

---

# 28. Monetization Philosophy

## 28.1 Base Model

The intended commercial model is a one-time premium purchase.

## 28.2 Commitments

- No pay-to-win purchases.
- No paid power, resources, or progression acceleration.
- No loot boxes.
- No artificial daily obligation.
- No paid repair currency.
- Core accessibility features are always free.

## 28.3 Post-Launch Sales

Acceptable possibilities:

- Substantial expansion packs with new destinations and mechanics.
- Optional cosmetic packs that do not reduce readability.
- A soundtrack.
- Supporter cosmetics with transparent contents.

Free updates should maintain stability, balance, accessibility, and essential multiplayer compatibility.

## 28.4 Early Access

Early Access is appropriate only if:

- The core loop is already fun and technically stable.
- Multiplayer is dependable.
- The current content justifies the price.
- The roadmap is framed as intent, not a promise.
- Save compatibility and reset policy are clearly communicated.

---

# 29. Production Roadmap

## 29.1 Phase 0: Pre-Production

Goals:

- Lock product pillars and prototype scope.
- Select renderer and physics stack through technical spikes.
- Establish coding conventions, data formats, and build pipeline.
- Build graybox character, cargo, and drill tests.

Exit criteria:

- Movement stack selected.
- A player can move, jump, grab, and carry in a test space.
- Performance and browser compatibility risks are documented.

## 29.2 Phase 1: First Playable

Goals:

- Prove the four core actions: jump, extract, transport, escape.
- One Practice Moon map.
- One ship landing area.
- Drill, scanner, and three resource types.
- Tool heat.
- Cargo deposit.
- Five-minute mission timer.
- Results and restart.

Exit criteria:

- A complete single-player mission can be played repeatedly.
- No blocking defects in the happy path.
- External testers understand the goal.

## 29.3 Phase 2: Cooperative Prototype

Goals:

- Two-to-four-player room-based sessions.
- Host authority.
- Player, tool, and cargo synchronization.
- Tether and repair tool.
- Downing and rescue.
- Basic lobby and reconnect behavior.

Exit criteria:

- Four players complete ten consecutive test missions under normal network conditions.
- Cargo and rewards remain authoritative.
- Common disconnect cases recover gracefully.

## 29.4 Phase 3: Vertical Slice

Goals:

- Final-quality visual target for the Practice Moon.
- Polished audio and VFX.
- Ship hub.
- Contracts and first progression branch.
- Controller support.
- Accessibility baseline.
- Save system.
- Representative final countdown.

Exit criteria:

- The slice communicates intended launch quality.
- New players can complete onboarding without developer help.
- Performance target is met on selected hardware.

## 29.5 Phase 4: Content Production

Goals:

- Three to five launch destinations.
- Expanded tool and cargo roster.
- Research branches.
- Events, contracts, and destination modifiers.
- Cosmetic system.
- Narrative content.

Exit criteria:

- Content tools and data validation support reliable expansion.
- Each destination has a distinct movement and hazard identity.
- Progression supports the target playtime without grind.

## 29.6 Phase 5: Alpha

Goals:

- Feature complete.
- Desktop wrapper.
- Friend invites.
- Full settings and remapping.
- Broad balance and stability pass.
- Save migration tests.

Exit criteria:

- No planned core systems are missing.
- End-to-end campaigns are completable.
- Major technical and UX risks are closed.

## 29.7 Phase 6: Beta and Steam Preparation

Goals:

- Steamworks integration.
- Achievements and cloud saves.
- Public demo or closed beta.
- Localization pipeline.
- Compliance, ratings, privacy, and store assets.
- Performance and compatibility testing.

Exit criteria:

- Release candidate passes platform and internal checklists.
- Crash, disconnect, and save-corruption rates meet targets.
- Launch content and price are finalized.

## 29.8 Phase 7: Launch and Support

Goals:

- Monitor stability and player feedback.
- Patch critical issues rapidly.
- Publish transparent known issues.
- Balance using observation and data.
- Begin post-launch content only after core stability.

---

# 30. Implementation Milestone Plan

This plan is written so an AI coding assistant such as Claude can implement one bounded milestone at a time. Estimates depend on team size and are relative rather than contractual.

## Milestone 0: Repository Foundation

**Deliverables**

- TypeScript project with strict checks.
- Local development and production builds.
- Automated formatting, linting, and unit tests.
- Basic scene boot and debug overlay.
- Architecture decision records for rendering and physics.

**Acceptance criteria**

- A clean checkout installs and runs from documented commands.
- Production build loads without console errors.
- Tests and static checks run in one command.
- No gameplay system imports browser globals directly.

## Milestone 1: Movement Sandbox

**Deliverables**

- Third-person camera.
- Keyboard/mouse input abstraction.
- Ground movement, sprint, jump, air control, and landing.
- Configurable gravity profile.
- Debug geometry and runtime tuning panel.

**Acceptance criteria**

- Movement is frame-rate independent.
- The player remains stable on slopes and small steps.
- Gravity can change through data without controller code edits.
- Camera collision does not obscure the player for long.

## Milestone 2: Physics Interaction and Cargo

**Deliverables**

- Interactable interface.
- Highlight and prompt selection.
- One-hand, two-hand, and heavy cargo.
- Assisted carrying, dropping, and throwing.
- Cargo deposit zone with manifest.

**Acceptance criteria**

- Objects cannot be duplicated through repeated grabbing.
- Carry connections break predictably under excessive force.
- Deposited cargo is counted once.
- Heavy cargo visibly and mechanically changes movement.

## Milestone 3: Extraction Tools

**Deliverables**

- Tool base architecture.
- Drill with heat, extraction progress, recoil, and overheat.
- Scanner with signal strength and identification.
- Three cargo definitions: common, heavy, fragile.
- Data validation.

**Acceptance criteria**

- Tool behavior is configured through definitions.
- Overheating creates a recoverable interruption.
- Scan and extraction progress are legible without opening a menu.
- Fragile cargo loses condition only from defined impacts.

## Milestone 4: Mission Loop

**Deliverables**

- Practice Moon graybox.
- Ship and cargo bay.
- Mission timer and phase transitions.
- Success, failure, departure, and debrief.
- Restart flow.

**Acceptance criteria**

- The entire mission can be completed without developer controls.
- Timer, cargo value, and outcome remain correct across restart.
- Departure warnings use visual and audio redundancy.
- The map supports at least two viable resource routes.

## Milestone 5: Failure and Recovery

**Deliverables**

- Tool jam and repair.
- Player impact damage, downing, rescue, and dragging.
- Cargo damage and containment state.
- Ragdoll blend and anti-stun-lock protection.

**Acceptance criteria**

- At least three failures produce additional actions rather than dead time.
- Downed players retain a limited form of communication.
- A complete team wipe resolves cleanly.
- Repeated impacts cannot trap a player indefinitely.

## Milestone 6: Multiplayer Core

**Deliverables**

- Room creation and joining.
- Host-authoritative mission state.
- Predicted local movement and interpolated remote movement.
- Networked grabbing, cargo, tools, deposit, timer, and results.
- Latency and packet-loss simulation.

**Acceptance criteria**

- Two clients cannot own the same object simultaneously.
- Cargo rewards cannot be claimed by client-only state.
- Four players complete repeated missions under target latency.
- Disconnects produce a clear, recoverable outcome.

**Prototype status — Build 018**

- Implemented the browser-first transport spike with temporary five-character rooms,
  four-player rosters, predicted local movement, interpolated remote astronauts, a shared
  mission seed, and host-authored mission snapshots.
- Guest scan, drill, grab, drop, throw, ping, and deposit intent is relayed to the host;
  cargo ownership and rewards are resolved only by the mission lead simulation.
- Includes artificial 150/300 ms delay and 10/20% packet-loss controls for playtests.
- Host departure or heartbeat expiry returns guests to a recoverable solo briefing.
- The prototype currently uses short-interval HTTP synchronization on the browser-first
  hosting platform. Before Milestone 6 exits, place the same transport interface over
  WebSockets or WebRTC, add automated four-client soak tests, validate adverse-network
  object ownership, and decide whether host migration belongs before or after the demo.

## Milestone 7: Cooperation Systems

**Deliverables**

- Team-lift cargo.
- Tether gun.
- Repair tool.
- Ping wheel.
- Teammate status UI.

**Acceptance criteria**

- Team lift supports small synchronization errors.
- Tethers have bounded complexity and stable break rules.
- A player without voice can request help and identify a target.
- Tools can exchange ownership safely.

**Prototype status — Build 019**

- Added a host-authoritative tether gun with a 16m acquisition radius, a 19m clean
  break boundary, capped cargo velocity, and a maximum of two cables per sample.
- A second tether activates team lift, raises cargo clear of the surface, and offsets
  the dense Platinum Core's solo hauling penalty. Each player can own only one tether.
- Added four immediate voice-free callouts for help, cargo, danger, and ship return,
  while retaining a generic location ping.
- Crew status now reports ready, moving, boosting, drilling, or suit safe mode, and
  host invite links prefill the temporary room code for collaborators.
- Milestone 7 is not complete: teammate repair/rescue, a radial ping presentation,
  physical tool ownership transfer, and repeated adverse-network cooperation tests
  remain required before exit.

## Milestone 8: Hub and Progression

**Deliverables**

- Physical ship hub.
- Contract and destination selection.
- Credits, research, repairs, and upgrades.
- Versioned save data.
- Minimum free loadout.

**Acceptance criteria**

- Failure cannot permanently prevent another mission.
- Visiting players understand shared versus personal progress.
- Save migration test covers the previous schema.
- All persistent references use stable IDs.

**Prototype status — Build 020**

- Added an orbital operations console with three contract profiles that vary quota,
  launch window, base pay, and research yield. In crews, the mission lead owns the
  authoritative contract while every player retains a personal career record.
- Added versioned device-local progression with safe normalization and migration from
  legacy money, science, mission, owned-upgrade, and equipped-upgrade fields.
- Successful missions award contract pay, salvage value, remaining-time bonuses, and
  research. Failed missions always pay at least 25 recovery credits, preserving the
  minimum free drill, scanner, tether, and EVA loadout.
- Added four stable-ID equipment modules and a two-slot loadout. Scanner range/recharge,
  drill heat/cooling, EVA fuel, and cargo movement are modified in the live simulation.
- Added Practice Moon, Rust Belt, and Icebox Comet destination dossiers. Research can
  reveal later dossiers, but Practice Moon is intentionally the only launchable map in
  this slice.
- Milestone 8 is not complete: the console must become a walkable ship interior, repair
  expenses need a recovery-safe economy pass, and surveyed destinations must connect to
  playable missions as their content ships.

**Prototype status — Build 021**

- Replaced the full-screen starting console with a walkable third-person orbital ship
  interior. Contract Control, the Equipment Cage, Crew Link, and Maintenance are physical,
  color-coded stations activated by proximity, with a direct terminal button retained as
  an accessibility fallback.
- Added explicit in-world ownership labels: credits, research, career history, and modules
  are personal to the current device; the contract, timer, cargo, world state, and score are
  shared for the active crew run. Visiting players never spend the mission lead's credits.
- Upgraded career persistence to schema version 2 and added a direct migration test from
  the previous version. The save records lifetime maintenance spending while preserving all
  stable contract and equipment identifiers.
- Added maintenance invoices to mission settlement. Each drill repair costs 12 credits and
  each emergency suit reboot costs 30, but charges are deducted only from the current run's
  gross pay and are capped so every mission still deposits at least 25 credits. Banked
  savings can never be consumed and the minimum free loadout remains available.
- The core Milestone 8 acceptance criteria are now met. Rust Belt and Icebox remain surveyed
  dossiers rather than fake destination variants; their playable maps belong to Milestone 10's
  content pipeline, after the Practice Moon vertical slice receives Milestone 9 polish.

## Milestone 9: Vertical Slice Polish

**Deliverables**

- Representative art, animation, VFX, music, and sound.
- Controller support.
- Accessibility baseline.
- Tutorial.
- Performance optimization and compatibility matrix.

**Acceptance criteria**

- New players complete a mission without verbal instruction.
- Critical tool states are identifiable visually and audibly.
- All gameplay inputs are remappable.
- Target hardware holds the established performance budget.

**Prototype status — Build 022**

- Added a contextual six-step First Shift Guide covering movement, scanning, drilling,
  cargo pickup, delivery, quota completion, and final extraction. The guide advances from
  real simulation actions and automatically shows controller-specific prompts when a
  standard gamepad is connected.
- Added standard controller input across the walkable ship hub and Practice Moon mission:
  dual-stick movement/look, jump and EVA boost, scan, drill, interact, throw, repair,
  tether, Crew Link callouts, and settings access. Controller menu navigation supplies a
  visible focus treatment and supports sliders, selectors, checkboxes, and back actions.
- Expanded Control Tuning with camera-impact strength, HUD scale, high-contrast instruments,
  First Shift Guide visibility, and Battery Saver/Balanced/High Detail rendering presets.
  Settings remain device-local and migrate safely when older preference objects are loaded.
- Added explicit pixel-density caps to both 3D renderers so lower-quality presets reduce
  GPU fill cost rather than merely hiding visual decoration. Initial browser and controller
  targets are documented in the compatibility matrix.
- Milestone 9 remains in progress. Complete action rebinding, screen-reader and non-color
  cue audits, representative music/environmental audio, and measured compatibility results
  are required before the milestone exits.

**Prototype status — Build 023 hotfix**

- Corrected the orbital hub's yaw basis so mouse and right-stick turns rotate the visible
  astronaut, camera-relative forward vector, and strafe vector in the same direction.
  A regression test now locks the expected forward/right vectors at neutral and a
  ninety-degree right turn.

**Prototype status — Build 024 salvage kit**

- Expanded every Practice Moon seed from five to seven deposits by adding pressurized
  Helium-3 Canisters and delicate Lunar Microfossils. Each sample has its own value,
  carry-speed modifier, impact response, bounce profile, structural floor, silhouette,
  emissive treatment, and procedural material pattern.
- Added a magnetic retriever that launches nearby loose magnetic cargo toward its operator
  with a 6.5-second recharge, plus two-charge sample stabilizer foam that restores condition
  to damaged carried cargo. Solo, host, guest, keyboard, and standard-controller paths use
  the same host-authoritative action model.
- Added procedural regolith speckle/crater detail and sample-specific stripe or archival
  patterns without external texture downloads, preserving the low-poly browser budget.
- Reduced the Practice Moon from three pressure vents to two, moved both away from the
  central extraction route, and lengthened their cycle from nine to 14.5 seconds so an
  eruption reads as a special event instead of constant map clutter.
- Added an isolated production-worker integration test that creates a host and guest,
  launches a shared mission, synchronizes remote movement, relays and acknowledges a
  magnetic-retriever action, distributes authoritative state, and verifies clean room
  closure when the host leaves.

## Milestone 10: Content Pipeline

**Deliverables**

- Second and third destinations.
- Modular hazard and event systems.
- Expanded cargo and contract libraries.
- Content authoring documentation.
- Automated content validation.

**Acceptance criteria**

- A new cargo type with existing behaviors requires no core code change.
- A new contract can be composed from validated objective modules.
- Each destination produces a distinct return-phase experience.
- Invalid data produces actionable build errors.

## Milestone 11: Desktop and Steam Candidate

**Deliverables**

- Desktop packaging.
- Platform service adapters.
- Steam invites, achievements, and cloud save.
- Release settings, crash logging, and offline handling.

**Acceptance criteria**

- Core simulation is unchanged between browser and desktop builds.
- The game starts, saves, and completes missions offline where supported.
- Cloud conflicts present a safe choice.
- Overlay, controllers, display modes, and invites pass test plans.

---

# 31. Claude Development Guidelines

This section is the operating brief for AI-assisted implementation.

## 31.1 General Rules

When asking Claude to implement work:

1. Provide only one milestone or bounded feature at a time.
2. Include existing file structure and relevant interfaces.
3. Ask it to inspect current code before changing anything.
4. Require a short implementation plan before edits for high-risk systems.
5. Require tests and acceptance criteria with every feature.
6. Prohibit unrelated refactors.
7. Preserve working behavior unless the task explicitly replaces it.
8. Ask it to state assumptions and unresolved risks.
9. Require documentation updates when public interfaces change.
10. Run the project and tests after implementation.

## 31.2 Architecture Constraints

Claude should preserve these boundaries:

- Simulation logic does not depend on the renderer.
- Platform APIs are accessed through adapters.
- UI reads state through defined services or view models.
- Definitions use stable IDs and schema validation.
- Physics state is advanced on a fixed timestep.
- Mission-critical multiplayer state is host authoritative.
- Cosmetic effects never determine gameplay outcomes.

## 31.3 Definition of Done for a Coding Task

A task is complete only when:

- The requested behavior works in the target environment.
- Acceptance criteria are demonstrably met.
- Tests cover important rules and regression risks.
- Static checks pass.
- No unexplained console errors occur.
- Debug-only shortcuts are identified or removed.
- Changed configuration and controls are documented.
- The response lists files changed and remaining limitations.

## 31.4 Example Feature Prompt

```text
Implement Milestone 3A: drill heat and overheat.

Before editing:
1. Inspect the current tool, interaction, physics, and UI code.
2. Summarize the relevant architecture and propose the smallest compatible change.

Requirements:
- The drill gains heat only while actively contacting an extractable target.
- Heat, cooling rate, warning threshold, and shutdown threshold come from validated tool data.
- Above the warning threshold, extraction efficiency decreases and audiovisual events are emitted.
- At shutdown, the drill becomes unavailable until it cools below the recovery threshold.
- Gameplay logic must not depend directly on rendering or DOM code.
- State must be serializable for future multiplayer replication.

Tests:
- Heat is frame-rate independent.
- The drill cools when inactive.
- It cannot activate during shutdown.
- It recovers at the configured threshold.
- Missing or invalid heat configuration fails data validation.

Acceptance:
- Demonstrate the behavior in the existing sandbox.
- Run all tests and static checks.
- Report changed files, design decisions, and known limitations.
```

## 31.5 Recommended Prompt Sequence

Do not ask Claude to “build the whole game.” Use a sequence:

1. Repository and build foundation.
2. Character controller spike.
3. Camera and input.
4. Interactable contract.
5. Carrying prototype.
6. Cargo definitions and deposit.
7. Drill.
8. Scanner.
9. Mission state machine.
10. Practice Moon graybox.
11. Failure and repair.
12. Multiplayer transport spike.
13. Authoritative object ownership.
14. Cooperative tools.
15. Hub and progression.
16. Vertical-slice polish.

## 31.6 Review Checklist for AI-Generated Code

- Does it duplicate a system that already exists?
- Are gameplay constants hidden in code rather than data?
- Does update logic depend on rendering frame rate?
- Are event listeners and physics bodies cleaned up?
- Can an object enter an impossible state?
- Is network authority explicit?
- Are save fields versioned?
- Are user inputs validated?
- Does UI become the source of gameplay truth?
- Are tests asserting behavior rather than implementation details?
- Has complexity been added for hypothetical future needs?

---

# 32. Risks and Mitigations

## 32.1 Physics Feels Frustrating

**Risk:** Comedy becomes loss of control.  
**Mitigation:** Use assisted carrying, capped impulses, forgiving air control, automatic recovery, stable-horizon options, and frequent playtests. Simulate only where the result improves play.

## 32.2 Networked Physics Is Unstable

**Risk:** Cargo jitters, ownership conflicts, and desynchronization undermine the core loop.  
**Mitigation:** Prototype multiplayer early, limit authoritative dynamic objects, use explicit ownership, synchronize mission-critical objects preferentially, and allow approximate cosmetic physics.

## 32.3 Scope Expansion

**Risk:** New planets, tools, progression, enemies, and Steam features arrive before the core is fun.  
**Mitigation:** Enforce milestone exit criteria. No content expansion before the first playable proves movement, extraction, carrying, and escape.

## 32.4 Repetition

**Risk:** The simple loop becomes predictable.  
**Mitigation:** Add systemic variety through cargo handling, destination physics, contracts, events, route choices, and tool tradeoffs before relying on large quantities of content.

## 32.5 Griefing

**Risk:** Physical interaction enables intentional disruption.  
**Mitigation:** Optimize first for friend groups, add host controls and collision settings, protect deposited cargo where appropriate, and delay public matchmaking until moderation exists.

## 32.6 Browser Performance

**Risk:** Physics, rendering, audio, and networking overload the main thread.  
**Mitigation:** Establish performance budgets, profile early, bound active bodies, pool effects, move suitable work off-thread, and keep the desktop-wrapper path available.

## 32.7 Solo Experience Is Weak

**Risk:** Mechanics that shine with friends become chores alone.  
**Mitigation:** Scale workload, provide cart and tether assists, reduce team-lift requirements, allow a utility drone, and tune contracts for player count.

## 32.8 Progression Creates Failure Spirals

**Risk:** Lost equipment prevents recovery.  
**Mitigation:** Always supply a basic loadout, cap repair burdens, reward discoveries on failed missions, and avoid debt that blocks play.

## 32.9 Humor Becomes Exhausting

**Risk:** Constant gags undermine tension and wonder.  
**Mitigation:** Let systems produce most comedy, use corporate dialogue sparingly, and preserve quiet exploration moments.

## 32.10 AI-Assisted Code Quality

**Risk:** Rapid generation creates duplicated abstractions and fragile cross-system coupling.  
**Mitigation:** Keep tasks bounded, require code inspection and tests, maintain architecture records, review every integration, and avoid large unverified rewrites.

---

# 33. Future Content

Future content is considered only after the commercial foundation is stable.

## 33.1 Destinations

- Tidal moon with periodically flooding caves.
- Hollow asteroid with gravity toward the outer shell.
- Dust planet with buried moving ruins.
- Living planetoid with reactive terrain.
- Failed luxury orbital resort.
- Twin fragments exchanging cargo through a gravity bridge.

## 33.2 Tools

- Inflatable bridge.
- Portable anchor launcher.
- Sample tranquilizer.
- Vacuum excavator.
- Remote cargo drone.
- Terrain resonance hammer.
- Emergency cloning beacon.

## 33.3 Systems

- Daily or weekly contracts without mandatory login pressure.
- Custom contract modifiers.
- Workshop-supported cosmetic or level content, if technically and legally viable.
- Photo mode.
- Replay highlights built from recorded gameplay events.
- Expanded specimen containment aboard the ship.

## 33.4 Social Features

- Crew names and shared ship customization.
- Trophy displays generated from major discoveries.
- Mission replay statistics.
- Spectator drone after permanent loss.
- Community challenge totals that do not gate core progression.

## 33.5 Platform Expansion

Other operating systems and consoles should be evaluated only after:

- Input and UI scale correctly.
- Performance budgets are stable.
- Platform abstractions are proven.
- Multiplayer service requirements are understood.

---

# 34. Open Questions

These decisions should be answered through prototypes and playtests:

1. Should oxygen be universal, destination-specific, or reserved for difficulty modifiers?
2. How physical should loading the ship be before it becomes tedious?
3. Is the best camera conventional third-person or a closer, more physical view?
4. Does voluntary ragdoll add useful play or only novelty?
5. Should a player outside the ship at launch ever survive through a tether?
6. How much cargo can be secured against accidental teammate interference?
7. Is native voice chat necessary at launch?
8. Does the host own campaign progression, or should the crew maintain a shared portable campaign?
9. How much destination randomization preserves route learning?
10. Should tools persist physically in the world after loss, or be recoverable through insurance?
11. What is the right balance between authored malfunctions and director-driven events?
12. Which desktop wrapper best fits Steamworks, performance, update size, and team expertise?
13. What launch content count provides sufficient variety at the intended price?
14. What title survives trademark, store search, and domain review?

---

# 35. Glossary

**Cargo:** Any physical resource or mission object intended for recovery.  
**Contract:** The selected mission objective and its reward conditions.  
**Deposit:** A resource node in the environment, or the act of securing cargo in the ship; context distinguishes the terms.  
**Destination:** A mission environment with a distinct gravity, hazard, and resource identity.  
**Event Director:** The system that schedules compatible dynamic events within a pressure budget.  
**First Playable:** The smallest end-to-end mission that proves the core loop.  
**Gravity Profile:** A data definition controlling movement and physical behavior for a destination.  
**Host Authority:** The rule that the session host validates mission-critical state.  
**Malfunction:** A recoverable degraded tool or equipment state.  
**Mission Phase:** Landing, operation, warning, final departure, or debrief.  
**Research:** Persistent progression currency used for capability unlocks.  
**Secured Cargo:** Cargo recognized by the ship and protected for reward calculation.  
**S.P.A.C.E.:** Scientific Procurement and Collection Enterprise, the player crew’s employer.  
**Team Lift:** A cargo interaction requiring multiple players at separate grab points.  
**Vertical Slice:** A small portion of the game produced at representative release quality.

---

## Closing Direction

The next production step is not to add more destinations or features. It is to build a graybox Practice Moon where one player can make a satisfying low-gravity jump, locate a deposit, overheat a drill, struggle with a physical sample, and reach the ship as the departure alarm sounds.

If that sequence is fun with placeholder art, *Moon Goons* has a foundation. Every system after it should deepen the same promise: a clear scientific job, a risky physical plan, and a disaster worth laughing about.
