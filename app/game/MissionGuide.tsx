"use client";

import styles from "./game.module.css";
import {
  GUIDE_STEPS,
  getMissionGuideStep,
  type MissionGuideState,
} from "./onboarding";

export function MissionGuide({
  state,
  controllerConnected,
}: {
  state: MissionGuideState;
  controllerConnected: boolean;
}) {
  const step = getMissionGuideStep(state);
  return (
    <aside className={styles.missionGuide} aria-live="polite">
      <header>
        <span>FIRST SHIFT GUIDE</span>
        <strong>{step.number}/6</strong>
      </header>
      <div className={styles.missionGuideProgress}>
        {GUIDE_STEPS.map((candidate) => (
          <i
            key={candidate.id}
            data-complete={candidate.number < step.number || undefined}
            data-active={candidate.id === step.id || undefined}
          />
        ))}
      </div>
      <h3>{step.label}</h3>
      <kbd>{controllerConnected ? step.controller : step.keyboard}</kbd>
      <p>{step.detail}</p>
    </aside>
  );
}
