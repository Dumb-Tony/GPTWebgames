# Moon Goons Compatibility and Performance Targets

This matrix defines the first browser vertical-slice targets. A combination is considered
verified only after a dated manual hardware pass; automated build coverage alone does not
mark a row as verified.

## Performance budgets

| Preset | Intended hardware | Resolution target | Frame-rate target | Pixel-density cap |
|---|---|---:|---:|---:|
| Battery Saver | Older integrated graphics and laptops on battery | 1280×720 | Stable 30 FPS | 1.0× |
| Balanced | Modern integrated graphics or entry discrete GPU | 1920×1080 | Stable 60 FPS | 1.5× |
| High Detail | Recent discrete GPU | 1920×1080 or higher | Stable 60 FPS | 2.0× |

Frame time should remain below 16.7 ms for the 60 FPS targets and below 33.3 ms for the
30 FPS target during meteor impacts, scanner pulses, four-player presence, and five loose
cargo objects. A sustained ten-percent miss requires either optimization or a preset change.

## Browser matrix

| Platform | Browser | Current status | Exit requirement |
|---|---|---|---|
| Windows 11 | Current Chrome | Primary target | Full mission, persistence, Crew Link, pointer lock, controller |
| Windows 11 | Current Edge | Primary target | Full mission, persistence, Crew Link, pointer lock, controller |
| Windows 11 | Current Firefox | Provisional | Full mission and pointer-lock audit |
| macOS | Current Chrome | Provisional | Full mission, keyboard, and standard controller audit |
| macOS | Current Safari | Research target | WebGL, audio policy, persistence, and pointer-lock audit |
| Steam wrapper | Embedded Chromium | Future | Must match browser simulation and save behavior |

## Controller matrix

Moon Goons reads the browser Standard Gamepad mapping. The initial target set is:

- Xbox Series and Xbox One controllers over USB or Bluetooth.
- PlayStation DualSense and DualShock 4 where the browser exposes Standard mapping.
- Steam Input profiles that present a Standard gamepad.
- Keyboard and mouse remain fully supported when a controller disconnects mid-mission.

Controller verification covers the orbital hub, every field action, menu focus, sliders,
contract selection, equipment changes, Crew Link, mission launch, debrief, and reconnection.

## Accessibility baseline

- Critical states use text and shape/border changes in addition to color.
- Camera-impact strength can be reduced to zero.
- HUD scale ranges from 85% to 120%.
- High-contrast instruments strengthen text, borders, and danger indicators.
- The First Shift Guide can be disabled without affecting gameplay.
- System reduced-motion preferences disable decorative warning animation where supported.

Action rebinding, full screen-reader review, subtitle/caption auditing, and measured results
for the rows above remain Milestone 9 exit work.
