"use client";

import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  DEFAULT_CONTROL_SETTINGS,
  KEYBOARD_ACTION_ORDER,
  formatKeyboardCode,
  isRemappableKeyboardCode,
  rebindKeyboardAction,
  type ControlSettings,
  type KeyboardAction,
} from "./gameRules";
import styles from "./game.module.css";

const KEYBOARD_ACTION_LABELS: Record<KeyboardAction, string> = {
  forward: "MOVE FORWARD",
  backward: "MOVE BACKWARD",
  strafeLeft: "STRAFE LEFT",
  strafeRight: "STRAFE RIGHT",
  jump: "HOP / BOOST",
  scan: "PULSE SCANNER",
  useTool: "USE FIELD TOOL",
  interact: "USE / CARGO",
  repair: "PERCUSSIVE REPAIR",
  cycleTool: "CYCLE TOOL",
  crewPing: "CREW PING",
  tether: "TETHER",
  cart: "CARGO CART",
  magnet: "MAGNETIC RETRIEVER",
  polarity: "FLIP POLARITY",
  stabilize: "STABILIZE SAMPLE",
  throwCase: "TOSS SPECIALIST CASE",
};

type ControlSettingsPanelProps = {
  open: boolean;
  settings: ControlSettings;
  onOpenChange: (open: boolean) => void;
  onSettingsChange: (settings: ControlSettings) => void;
};

export function ControlSettingsPanel({
  open,
  settings,
  onOpenChange,
  onSettingsChange,
}: ControlSettingsPanelProps) {
  const [listeningAction, setListeningAction] = useState<KeyboardAction | null>(null);
  const [bindingNotice, setBindingNotice] = useState("");
  const update = (patch: Partial<ControlSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };
  const changeOpen = (nextOpen: boolean) => {
    setListeningAction(null);
    setBindingNotice("");
    onOpenChange(nextOpen);
  };

  const captureBinding = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    action: KeyboardAction,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Escape") {
      setListeningAction(null);
      setBindingNotice("CALIBRATION CANCELLED");
      return;
    }
    if (!isRemappableKeyboardCode(event.code)) {
      setBindingNotice("USE A LETTER, SPACE, OR TAB");
      return;
    }
    const displacedAction = KEYBOARD_ACTION_ORDER.find(
      (candidate) =>
        candidate !== action && settings.keyboardBindings[candidate] === event.code,
    );
    update({
      keyboardBindings: rebindKeyboardAction(
        settings.keyboardBindings,
        action,
        event.code,
      ),
    });
    setListeningAction(null);
    setBindingNotice(
      displacedAction
        ? `${KEYBOARD_ACTION_LABELS[action]} SWAPPED WITH ${KEYBOARD_ACTION_LABELS[displacedAction]}`
        : `${KEYBOARD_ACTION_LABELS[action]} BOUND TO ${formatKeyboardCode(event.code)}`,
    );
  };

  return (
    <>
      <button
        type="button"
        className={styles.settingsToggle}
        aria-expanded={open}
        aria-controls="control-settings-panel"
        onClick={() => changeOpen(!open)}
      >
        <span>CT</span>
        CONTROL TUNING
      </button>

      {open && (
        <aside
          id="control-settings-panel"
          className={styles.settingsPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="control-settings-title"
          data-gamepad-scope="true"
        >
          <header className={styles.settingsHeader}>
            <div>
              <span>SUIT INPUT CALIBRATION</span>
              <h2 id="control-settings-title">Control Tuning</h2>
            </div>
            <button
              type="button"
              aria-label="Close control tuning"
              onClick={() => changeOpen(false)}
            >
              ×
            </button>
          </header>

          <p className={styles.settingsIntro}>
            The mission pauses while this panel is open. Changes are saved on this device.
          </p>

          <div className={styles.settingsBody}>
            <section className={styles.settingsGroup}>
              <header className={styles.settingsGroupTitle}>
                <span>01</span>
                <strong>INPUT + FEEDBACK</strong>
              </header>
            <label className={styles.rangeSetting}>
              <span>
                LOOK SENSITIVITY
                <output>{settings.lookSensitivity.toFixed(2)}×</output>
              </span>
              <input
                type="range"
                min="0.45"
                max="2"
                step="0.05"
                value={settings.lookSensitivity}
                onChange={(event) =>
                  update({ lookSensitivity: Number(event.target.value) })
                }
              />
              <small>Adjusts horizontal turning and vertical camera movement.</small>
            </label>

            <label className={styles.checkSetting}>
              <span>
                <strong>INVERT VERTICAL LOOK</strong>
                <small>Move the mouse down to look up.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.invertY}
                onChange={(event) => update({ invertY: event.target.checked })}
              />
            </label>

            <label className={styles.rangeSetting}>
              <span>
                MISSION AUDIO
                <output>{Math.round(settings.volume * 100)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.volume}
                onChange={(event) => update({ volume: Number(event.target.value) })}
              />
              <small>Controls ambience, scanner, tools, hazards, impacts, and suit feedback.</small>
            </label>

            <label className={styles.rangeSetting}>
              <span>
                CAMERA IMPACT
                <output>{Math.round(settings.cameraShake * 100)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.cameraShake}
                onChange={(event) => update({ cameraShake: Number(event.target.value) })}
              />
              <small>Reduce or disable landing, tool, and hazard camera shake.</small>
            </label>

            <label className={styles.rangeSetting}>
              <span>
                HUD SCALE
                <output>{Math.round(settings.hudScale * 100)}%</output>
              </span>
              <input
                type="range"
                min="0.85"
                max="1.2"
                step="0.05"
                value={settings.hudScale}
                onChange={(event) => update({ hudScale: Number(event.target.value) })}
              />
              <small>Scales mission instruments and instructional overlays.</small>
            </label>

            </section>
            <section className={styles.settingsGroup}>
              <header className={styles.settingsGroupTitle}>
                <span>02</span>
                <strong>DISPLAY + ACCESSIBILITY</strong>
              </header>

            <label className={styles.selectSetting}>
              <span>
                <strong>MISSION HUD</strong>
                <small>Compact keeps the essentials visible; Full shows every subsystem.</small>
              </span>
              <select
                value={settings.hudDensity}
                onChange={(event) =>
                  update({
                    hudDensity: event.target.value as ControlSettings["hudDensity"],
                  })
                }
              >
                <option value="compact">Compact</option>
                <option value="full">Full Telemetry</option>
              </select>
            </label>

            <label className={styles.selectSetting}>
              <span>
                <strong>RENDER QUALITY</strong>
                <small>Lower this when frame rate matters more than sharp edges.</small>
              </span>
              <select
                value={settings.renderQuality}
                onChange={(event) =>
                  update({
                    renderQuality: event.target.value as ControlSettings["renderQuality"],
                  })
                }
              >
                <option value="low">Battery Saver</option>
                <option value="balanced">Balanced</option>
                <option value="high">High Detail</option>
              </select>
            </label>

            <label className={styles.checkSetting}>
              <span>
                <strong>HIGH-CONTRAST HUD</strong>
                <small>Strengthens panel borders, text, and critical state colors.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(event) => update({ highContrast: event.target.checked })}
              />
            </label>

            <label className={styles.checkSetting}>
              <span>
                <strong>FIRST SHIFT GUIDE</strong>
                <small>Show the contextual six-step mission tutorial.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.missionGuide}
                onChange={(event) => update({ missionGuide: event.target.checked })}
              />
            </label>
            </section>

            <section className={styles.settingsGroup}>
              <header className={styles.settingsGroupTitle}>
                <span>03</span>
                <strong>KEYBOARD MAP</strong>
              </header>
              <p className={styles.bindingIntro}>
                Select an action, then press a letter, Space, or Tab. Occupied keys swap
                assignments automatically; Escape cancels.
              </p>
              <div className={styles.bindingGrid}>
                {KEYBOARD_ACTION_ORDER.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={styles.bindingButton}
                    data-listening={listeningAction === action || undefined}
                    aria-pressed={listeningAction === action}
                    onClick={() => {
                      setListeningAction(action);
                      setBindingNotice(`LISTENING FOR ${KEYBOARD_ACTION_LABELS[action]}`);
                    }}
                    onKeyDown={(event) => {
                      if (listeningAction === action) captureBinding(event, action);
                    }}
                  >
                    <span>{KEYBOARD_ACTION_LABELS[action]}</span>
                    <kbd>
                      {listeningAction === action
                        ? "PRESS KEY"
                        : formatKeyboardCode(settings.keyboardBindings[action])}
                    </kbd>
                  </button>
                ))}
              </div>
              <output className={styles.bindingNotice} aria-live="polite">
                {bindingNotice || "ALL ASSIGNMENTS UNIQUE // STORED ON THIS DEVICE"}
              </output>
            </section>
          </div>

          <footer className={styles.settingsFooter}>
            <button
              type="button"
              onClick={() => onSettingsChange(DEFAULT_CONTROL_SETTINGS)}
            >
              RESET DEFAULTS
            </button>
            <button type="button" onClick={() => changeOpen(false)}>
              RETURN TO MISSION
            </button>
          </footer>
        </aside>
      )}
    </>
  );
}
