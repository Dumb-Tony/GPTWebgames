"use client";

import {
  DEFAULT_CONTROL_SETTINGS,
  type ControlSettings,
} from "./gameRules";
import styles from "./game.module.css";

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
  const update = (patch: Partial<ControlSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  return (
    <>
      <button
        type="button"
        className={styles.settingsToggle}
        aria-expanded={open}
        aria-controls="control-settings-panel"
        onClick={() => onOpenChange(!open)}
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
        >
          <header className={styles.settingsHeader}>
            <div>
              <span>SUIT INPUT CALIBRATION</span>
              <h2 id="control-settings-title">Control Tuning</h2>
            </div>
            <button
              type="button"
              aria-label="Close control tuning"
              onClick={() => onOpenChange(false)}
            >
              ×
            </button>
          </header>

          <p className={styles.settingsIntro}>
            The mission pauses while this panel is open. Changes are saved on this device.
          </p>

          <div className={styles.settingsBody}>
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
                EFFECTS VOLUME
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
              <small>Controls scanner, tool, hazard, impact, and suit feedback.</small>
            </label>
          </div>

          <footer className={styles.settingsFooter}>
            <button
              type="button"
              onClick={() => onSettingsChange(DEFAULT_CONTROL_SETTINGS)}
            >
              RESET DEFAULTS
            </button>
            <button type="button" onClick={() => onOpenChange(false)}>
              RETURN TO MISSION
            </button>
          </footer>
        </aside>
      )}
    </>
  );
}
