import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_TARGET,
  DEFAULT_CONTROL_SETTINGS,
  TETHER_BREAK_RANGE,
  advanceSuitRecovery,
  applySuitDamage,
  canAirmailCargo,
  calculateBankShotBonus,
  calculateCargoBounce,
  calculateCargoImpact,
  calculateCargoImpactCondition,
  calculateCargoValue,
  calculateTetherPull,
  createMissionDepositDefinitions,
  formatSignalBearing,
  formatTime,
  missionMaximumValue,
  nextMissionSeed,
  normalizeControlSettings,
  predictCargoThrow,
  registerRepairStrike,
  seededRandom,
} from "../app/game/gameRules.ts";
import {
  CREW_INPUT_DOWNED,
  CREW_INPUT_DRILL,
  CREW_INPUT_MOVING,
  CREW_INPUT_THRUSTER,
  clampCrewTransform,
  crewColor,
  isCrewMemberFresh,
  normalizeCrewName,
  normalizeRoomCode,
} from "../app/game/crewNetwork.ts";
import {
  DEFAULT_PROGRESSION,
  calculateMissionSettlement,
  normalizeProgressionSave,
  purchaseUpgrade,
  toggleEquippedUpgrade,
} from "../app/game/progression.ts";

test("career saves migrate old fields and discard unknown equipment", () => {
  const migrated = normalizeProgressionSave({
    version: 0,
    money: 730.9,
    science: 9,
    missionsCompleted: 3,
    missionsFailed: 2,
    upgrades: ["survey_array", "definitely_illegal", "survey_array"],
    equipped: ["survey_array", "cargo_harness"],
  });
  assert.equal(migrated.version, 1);
  assert.equal(migrated.credits, 730);
  assert.equal(migrated.research, 9);
  assert.deepEqual(migrated.ownedUpgradeIds, ["survey_array"]);
  assert.deepEqual(migrated.equippedUpgradeIds, ["survey_array"]);
});

test("failed missions still pay recovery wages and cannot brick the free loadout", () => {
  const settlement = calculateMissionSettlement({
    progression: DEFAULT_PROGRESSION,
    contractId: "standard_procurement",
    success: false,
    score: 0,
    timeRemaining: 0,
    samplesSecured: 0,
  });
  assert.equal(settlement.creditsEarned, 25);
  assert.equal(settlement.researchEarned, 0);
  assert.equal(settlement.progression.failedMissions, 1);
  assert.equal(settlement.progression.credits, 25);
});

test("upgrades use stable ids, enforce costs, and cap equipped modules", () => {
  const funded = normalizeProgressionSave({ credits: 2000, research: 20 });
  const survey = purchaseUpgrade(funded, "survey_array");
  const cooled = purchaseUpgrade(survey, "cooling_jacket");
  const reserve = purchaseUpgrade(cooled, "thruster_reserve");
  assert.deepEqual(cooled.equippedUpgradeIds, ["survey_array", "cooling_jacket"]);
  assert.equal(reserve.ownedUpgradeIds.includes("thruster_reserve"), true);
  assert.deepEqual(reserve.equippedUpgradeIds, ["survey_array", "cooling_jacket"]);
  const openedSlot = toggleEquippedUpgrade(reserve, "survey_array");
  const equippedReserve = toggleEquippedUpgrade(openedSlot, "thruster_reserve");
  assert.deepEqual(equippedReserve.equippedUpgradeIds, ["cooling_jacket", "thruster_reserve"]);
});

test("crew names and room codes are safe, compact, and easy to share", () => {
  assert.equal(normalizeCrewName("  Doctor   Bounce  "), "Doctor Bounce");
  assert.equal(normalizeCrewName("X".repeat(40)).length, 24);
  assert.equal(normalizeRoomCode(" ab-2io9! "), "AB29");
  assert.equal(normalizeRoomCode("qwerty"), "QWERT");
});

test("network transforms clamp untrusted client movement and input", () => {
  const transform = clampCrewTransform({
    x: 900,
    y: -4,
    z: -900,
    yaw: Math.PI * 5,
    inputMask:
      CREW_INPUT_DRILL |
      CREW_INPUT_MOVING |
      CREW_INPUT_THRUSTER |
      CREW_INPUT_DOWNED |
      64,
  });
  assert.equal(transform.x, 48);
  assert.equal(transform.y, 0);
  assert.equal(transform.z, -48);
  assert.ok(Math.abs(transform.yaw - Math.PI) < 0.000001);
  assert.equal(transform.inputMask, 15);
});

test("crew colors wrap and presence expiration has a clear boundary", () => {
  assert.equal(crewColor(4).name, crewColor(0).name);
  const now = Date.parse("2026-08-09T12:00:12.000Z");
  assert.equal(isCrewMemberFresh("2026-08-09T12:00:00.000Z", now), true);
  assert.equal(isCrewMemberFresh("2026-08-09T11:59:59.999Z", now), false);
});

test("tether pull is capped, snaps predictably, and rewards a second hauler", () => {
  const soloDense = calculateTetherPull("platinum", 12, 1);
  const teamDense = calculateTetherPull("platinum", 12, 2);
  assert.equal(soloDense.breaks, false);
  assert.equal(soloDense.teamLift, false);
  assert.equal(teamDense.teamLift, true);
  assert.ok(teamDense.pullAcceleration > soloDense.pullAcceleration);
  assert.ok(teamDense.maxSpeed > soloDense.maxSpeed);
  assert.ok(teamDense.pullAcceleration <= 18 * 1.35);
  assert.equal(
    calculateTetherPull("ferric", TETHER_BREAK_RANGE, 1).breaks,
    false,
  );
  assert.equal(
    calculateTetherPull("ferric", TETHER_BREAK_RANGE + 0.01, 1).breaks,
    true,
  );
  assert.equal(calculateTetherPull("vial", 12, 0).pullAcceleration, 0);
});

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
      ["ferric", "ferric", "glass", "platinum", "vial"],
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
  assert.equal(calculateCargoImpactCondition("glass", 0.5, 100), 0.24);
});

test("cargo bounces by material and eventually settles", () => {
  assert.deepEqual(calculateCargoBounce("ferric", 6, 0), {
    continues: true,
    verticalSpeed: 3.24,
    horizontalRetention: 0.86,
  });
  assert.deepEqual(calculateCargoBounce("platinum", 2, 0), {
    continues: false,
    verticalSpeed: 0,
    horizontalRetention: 0,
  });
  assert.equal(calculateCargoBounce("ferric", 12, 5).continues, false);
});

test("cryogenic vials degrade on rough impacts and shatter at the redline", () => {
  const damaged = calculateCargoImpact("vial", 1, 9);
  assert.equal(damaged.broken, false);
  assert.ok(damaged.condition < 0.55);
  assert.deepEqual(calculateCargoImpact("vial", 1, 10.2), {
    broken: true,
    condition: 0,
  });
  assert.equal(calculateCargoImpact("platinum", 1, 20).broken, false);
});

test("throw prediction exposes distance and cargo-specific first-impact risk", () => {
  const ordinaryVialThrow = predictCargoThrow("vial", 1, 2.4, 8.2, 3.5);
  assert.ok(ordinaryVialThrow.horizontalDistance > 16);
  assert.ok(ordinaryVialThrow.impactSpeed < 10.2);
  assert.equal(ordinaryVialThrow.risk, "SEVERE");

  const boostedVialThrow = predictCargoThrow("vial", 1, 5, 8.2, 3.5);
  assert.ok(boostedVialThrow.impactSpeed > 10.2);
  assert.equal(boostedVialThrow.risk, "SHATTER");

  assert.equal(predictCargoThrow("platinum", 1, 2.4, 6.1, 2.7).risk, "STABLE");
});

test("bank-shot bonuses require a bounce and cap reckless-science payout", () => {
  assert.equal(calculateBankShotBonus("ferric", 1, 0), 0);
  assert.equal(calculateBankShotBonus("ferric", 1, 1), 25);
  assert.equal(calculateBankShotBonus("ferric", 1, 3), 47);
  assert.equal(calculateBankShotBonus("ferric", 1, 20), 58);
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
