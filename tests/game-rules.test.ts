import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_TARGET,
  DEFAULT_CONTROL_SETTINGS,
  advanceSuitRecovery,
  applySuitDamage,
  canAirmailCargo,
  calculateCargoImpactCondition,
  calculateCargoValue,
  createMissionDepositDefinitions,
  formatSignalBearing,
  formatTime,
  missionMaximumValue,
  nextMissionSeed,
  normalizeControlSettings,
  registerRepairStrike,
  seededRandom,
} from "../app/game/gameRules.ts";

test("mission timer formatting is stable at boundaries", () => {
  assert.equal(formatTime(180), "3:00");
  assert.equal(formatTime(59.01), "1:00");
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(-10), "0:00");
});

test("scanner bearing labels cover forward, rear, left, and right", () => {
  assert.equal(formatSignalBearing(0), "AHEAD");
  assert.equal(formatSignalBearing(12), "AHEAD");
  assert.equal(formatSignalBearing(168), "BEHIND");
  assert.equal(formatSignalBearing(43.4), "RIGHT 43°");
  assert.equal(formatSignalBearing(-27.6), "LEFT 28°");
});

test("mission generation is deterministic, varied, unique, and completable", () => {
  const first = createMissionDepositDefinitions(12013);
  assert.deepEqual(createMissionDepositDefinitions(12013), first);
  assert.notDeepEqual(createMissionDepositDefinitions(nextMissionSeed(12013)), first);

  for (let seed = 1; seed <= 200; seed += 1) {
    const mission = createMissionDepositDefinitions(seed);
    assert.equal(mission.length, 5);
    assert.equal(new Set(mission.map(({ position }) => position.join(","))).size, 5);
    assert.ok(missionMaximumValue(mission) >= CONTRACT_TARGET);
    assert.deepEqual(
      mission.map(({ kind }) => kind).sort(),
      ["ferric", "ferric", "glass", "glass", "platinum"],
    );
  }
});

test("seeded random accepts awkward seeds and stays in range", () => {
  for (const seed of [0, -1, 1, 12013, Number.MAX_SAFE_INTEGER]) {
    const random = seededRandom(seed);
    for (let index = 0; index < 20; index += 1) {
      const value = random();
      assert.ok(value > 0 && value < 1);
    }
  }
});

test("three repair strikes clear a jam and reset repair progress", () => {
  const first = registerRepairStrike(0);
  assert.deepEqual(first, { completed: false, progress: 34, hitsRemaining: 2 });
  const second = registerRepairStrike(first.progress);
  assert.deepEqual(second, { completed: false, progress: 68, hitsRemaining: 1 });
  const third = registerRepairStrike(second.progress);
  assert.deepEqual(third, { completed: true, progress: 0, hitsRemaining: 0 });
});

test("suit damage and reboot progression clamp safely", () => {
  assert.deepEqual(applySuitDamage(100, 18), { integrity: 82, downed: false });
  assert.deepEqual(applySuitDamage(12, 18), { integrity: 0, downed: true });
  assert.equal(advanceSuitRecovery(0, true, 1), 44);
  assert.equal(advanceSuitRecovery(90, true, 1), 100);
  assert.equal(advanceSuitRecovery(20, false, 1), 0);
});

test("cargo payout respects condition and cannot exceed its base value", () => {
  assert.equal(calculateCargoValue("platinum", 1), 620);
  assert.equal(calculateCargoValue("glass", 0.5), 160);
  assert.equal(calculateCargoValue("ferric", 2), 180);
  assert.equal(calculateCargoValue("ferric", -1), 0);
});

test("low-gravity throws punish fragile cargo more than dense cargo", () => {
  assert.equal(calculateCargoImpactCondition("glass", 1, 3), 1);
  assert.ok(calculateCargoImpactCondition("glass", 1, 7) < 0.83);
  assert.ok(
    calculateCargoImpactCondition("glass", 1, 7) <
      calculateCargoImpactCondition("platinum", 1, 7),
  );
  assert.equal(calculateCargoImpactCondition("glass", 0.5, 100), 0.42);
});

test("only airborne cargo inside the receiver gate counts as airmail", () => {
  assert.equal(canAirmailCargo(2, 2.4, true), true);
  assert.equal(canAirmailCargo(2.36, 2.4, true), false);
  assert.equal(canAirmailCargo(2, 4.81, true), false);
  assert.equal(canAirmailCargo(2, 2.4, false), false);
});

test("control preferences reject invalid values and clamp extreme tuning", () => {
  assert.deepEqual(normalizeControlSettings(null), DEFAULT_CONTROL_SETTINGS);
  assert.deepEqual(
    normalizeControlSettings({ lookSensitivity: 9, invertY: true, volume: -4 }),
    { lookSensitivity: 2, invertY: true, volume: 0 },
  );
  assert.deepEqual(
    normalizeControlSettings({ lookSensitivity: 0.1, volume: 4 }),
    { lookSensitivity: 0.45, invertY: false, volume: 1 },
  );
});
