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
              onClick={() => onOpenChange(false)}
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
