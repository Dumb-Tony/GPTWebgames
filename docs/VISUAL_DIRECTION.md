# Moon Goons Visual Direction

**Status:** Foundational art direction, Build 002  
**Purpose:** Prevent visual drift while the game transitions from the current browser prototype into full 3D production.

## Visual Thesis

Moon Goons is **optimistic low-budget space science**. The technology is capable enough to reach another moon and cheap enough to arrive with the wrong bolts.

The game should feel:

- Chunky, tactile, and toy-like
- Bright against a quiet, hostile environment
- Industrial without becoming military
- Funny through physical circumstances, not visual parody
- Worn and repaired, but never grim or filthy
- Scientific enough to feel purposeful and improvised enough to feel dangerous

## Five Visual Pillars

### 1. Toy-Box Silhouettes

Characters, tools, cargo, and vehicles must read clearly at gameplay distance. Favor short, sturdy proportions, oversized functional parts, large handles, thick cables, and clear mass.

Avoid thin detail, realistic astronaut proportions, or noisy silhouettes.

### 2. Corporate Safety Theater

S.P.A.C.E. branding uses cheerful cream, safety yellow, cyan, and optimistic labels to insist that everything is under control.

Visual motifs:

- Hazard stripes
- Serial numbers
- Inspection stamps
- Oversized status lights
- Laminated instructions
- Cheap molded plastic
- Repaired panels in mismatched colors

### 3. Quiet Worlds, Loud Equipment

Destinations use restrained environmental palettes. Players, tools, cargo, warnings, and the ship provide the saturated color.

This keeps interactive objects legible and makes the ship feel like home.

### 4. Physical Comedy With Weight

Animation and effects should sell mass before comedy. Heavy objects lean bodies, soft lunar dust reacts to impacts, tethers visibly strain, and overheated tools vibrate before failing.

The joke is funnier when the physical cause is credible.

### 5. Wonder Beneath the Workplace

Corporate absurdity sits on top of genuine cosmic beauty. Wide skies, distant planets, strange materials, and quiet lighting create moments of awe between accidents.

## Core Palette

| Token | Hex | Purpose |
|---|---|---|
| Void Navy | `#060914` | Space, deepest UI backgrounds |
| Panel Navy | `#111727` | Equipment and HUD panels |
| Lunar Mid | `#4A4D5C` | Main Practice Moon terrain |
| Lunar Dark | `#292C39` | Craters, shadow, depth |
| Suit Cream | `#F4F1DC` | Ship panels, labels, readable type |
| Safety Yellow | `#FFD85A` | Brand, objectives, player-one suit |
| Science Cyan | `#6EE7E4` | Scanners, valid signals, navigation |
| Hazard Coral | `#FF865E` | Heat, instability, urgent action |
| Failure Red | `#FF616F` | Terminal warnings only |
| Recovery Green | `#8EE07D` | Secured cargo and successful recovery |

Color must never be the only state indicator. Pair it with shape, text, animation, or sound.

## Materials

### S.P.A.C.E. Hardware

- Warm cream painted metal
- Yellow injection-molded polymer
- Dark graphite rubber
- Brushed aluminum
- Thick woven cables
- Cyan emissive instrument glass
- Coral emergency lamps

Edges should be beveled and slightly worn. Damage exposes darker underlayers rather than realistic rust everywhere.

### Lunar Environment

- Fine cool-gray dust
- Dark compacted crater interiors
- Angular basalt fragments
- Rare materials with one strong emissive characteristic

The ground should remain quieter than equipment and cargo.

## Shape Language

| Category | Shape language |
|---|---|
| S.P.A.C.E. ship and tools | Chamfered rectangles, clipped corners, heavy hinges |
| Friendly suits | Rounded capsules, circles, short limbs |
| Scientific signals | Rings, arcs, hexagons, clean lines |
| Hazards | Triangles, diagonal cuts, broken rhythms |
| Rare cargo | Faceted irregular masses with internal glow |
| Alien technology | Precise forms that do not share company construction logic |

## Character Direction

- Approximately three heads tall
- Large spherical helmet
- Compact torso with visible backpack
- Oversized gloves and boots
- Suit number centered on the chest
- Strong individual suit colors within the shared company palette
- Face or helmet display remains readable during motion

Animation should exaggerate anticipation, recoil, leaning, and recovery while preserving responsive controls.

## Tool Direction

Each tool needs:

- A unique silhouette
- One dominant moving component
- One large status indicator
- A readable connection point or handle
- Visible stress behavior

The standard drill is yellow and graphite with a cyan nominal-status strip. Heat progresses from yellow to coral to red. At critical heat it vents, shakes, and sparks.

## UI Direction

The interface is an equipment readout, not a generic futuristic HUD.

- Condensed uppercase headings
- Monospace operational data
- Cream text on translucent navy panels
- Clipped corners and asymmetric borders
- Yellow for objectives
- Cyan for tools and navigation
- Coral for warnings
- Small serial codes and inspection language as texture
- Minimal glassmorphism; panels should feel printed or mounted

UI animation should use quick mechanical slides, stepped warnings, and scan sweeps rather than soft floating transitions.

## Lighting

### Practice Moon

- Cool, directional cyan-white key light
- Long blue-gray shadows
- Warm yellow pools around the ship
- Coral points on hazard beacons
- Subtle emissive glow from valuable resources

Lighting should preserve readable silhouettes. Avoid crushed blacks, gray-on-gray characters, or excessive bloom.

## VFX Direction

- Scanner: thin cyan expanding rings with crisp decay
- Drill: directional coral sparks and gray dust
- Overheat: orange casing glow, heat shimmer, irregular venting
- Cargo secured: green locking sweep and solid mechanical latch
- Thruster: short cream vapor burst with loose dust
- Impact: low dust puff plus a few angular debris pieces

Effects communicate state first and spectacle second.

## Typography

Use a heavy condensed grotesque style for brand and mission headlines. Use a neutral monospace face for timers, telemetry, serial numbers, and controls.

Do not use sleek thin science-fiction fonts. Moon Goons should look like a municipal utility company accidentally received a space program.

## Camera and Composition

- Gameplay camera favors clear silhouettes and visible cargo
- Framing expands while carrying large objects
- The horizon remains stable where possible
- The ship uses warm light and yellow markings to remain the visual anchor
- Distant planets and structures provide wonder without competing with objectives

## Audio-Visual Pairing

Every major state should share a consistent audiovisual identity:

| State | Visual | Audio character |
|---|---|---|
| Ready | Cyan steady light | Clean electronic chirp |
| Working | Yellow motion or pulse | Mechanical loop with stable rhythm |
| Stressed | Coral vibration | Pitch rise and added rattle |
| Critical | Red stepped flash | Broken alarm rhythm |
| Secured | Green sweep | Heavy latch plus two-note confirmation |

## Do

- Make objects readable at thumbnail size
- Use wear to imply repeated field repair
- Let the environment breathe
- Keep warnings unmistakable
- Give heavy cargo visible consequence
- Preserve a sincere sense of space exploration

## Do Not

- Drift into military science fiction
- Use realistic NASA imitation as the primary style
- Cover every surface in grime, decals, or greebles
- Make every object glow
- Use red for ordinary decoration
- Depend on text alone for gameplay state
- Treat procedural chaos as permission for visually unclear outcomes

## 3D Translation Rules

When the project moves to Three.js or another 3D renderer:

1. Preserve the exact palette tokens before adding physically based material variation.
2. Prototype the player, standard drill, platinum core, and ship cargo bay first.
3. Use beveled low-poly geometry and weighted normals rather than dense meshes.
4. Target one primary material set per object plus a status-light material.
5. Validate silhouettes in flat unlit renders before lighting and texture work.
6. Build shader effects only after scanner, heat, and cargo states are readable without them.
7. Maintain the current HUD hierarchy and state colors unless playtesting disproves them.

This document is the visual contract. New assets may expand the language, but should not quietly redefine it.
