import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_TARGET,
  CART_CAPACITY,
  DEFAULT_CONTROL_SETTINGS,
  TETHER_BREAK_RANGE,
  advanceSuitRecovery,
  alignRustRelay,
  applySuitDamage,
  canHarvestCargo,
  canLoadCargoCart,
  canAirmailCargo,
  calculateBankShotBonus,
  calculateCargoBounce,
  calculateCargoImpact,
  calculateCargoImpactCondition,
  calculateCargoValue,
  cargoCartManifestValue,
  cargoCartTowMultiplier,
  calculateTetherPull,
  createMissionDepositDefinitions,
  formatSignalBearing,
  formatTime,
  missionMaximumValue,
  nextHarvestTool,
  nextMissionSeed,
  normalizeControlSettings,
  predictCargoThrow,
  registerRepairStrike,
  requiredHarvestTool,
  renderPixelRatioCap,
  seededRandom,
} from "../app/game/gameRules.ts";
import {
  headingVectorsFromYaw,
  readStandardGamepad,
} from "../app/game/gamepad.ts";
import { getMissionGuideStep } from "../app/game/onboarding.ts";
import {
  CREW_INPUT_DOWNED,
  CREW_INPUT_DRILL,
  CREW_INPUT_MOVING,
  CREW_INPUT_POLARITY_REPEL,
  CREW_INPUT_THRUSTER,
  clampCrewTransform,
  crewColor,
  isCrewMemberFresh,
  normalizeCrewName,
  normalizeRoomCode,
} from "../app/game/crewNetwork.ts";
import {
  CONTRACTS,
  DEFAULT_PROGRESSION,
  DESTINATIONS,
  calculateMissionSettlement,
  normalizeProgressionSave,
  purchaseUpgrade,
  toggleEquippedUpgrade,
} from "../app/game/progression.ts";

test("career saves migrate old fields and discard unknown equipment", () => {
  const migrated = normalizeProgressionSave({
    version: 1,
    credits: 730.9,
    research: 9,
    successfulMissions: 3,
    failedMissions: 2,
    ownedUpgradeIds: ["survey_array", "definitely_illegal", "survey_array"],
    equippedUpgradeIds: ["survey_array", "cargo_harness"],
  });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.credits, 730);
  assert.equal(migrated.research, 9);
  assert.equal(migrated.totalRepairCredits, 0);
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

test("maintenance invoices reduce mission pay without touching savings or recovery wages", () => {
  const funded = normalizeProgressionSave({ credits: 500, research: 4 });
  const settlement = calculateMissionSettlement({
    progression: funded,
    contractId: "standard_procurement",
    success: true,
    score: 900,
    timeRemaining: 10,
    samplesSecured: 3,
    repairsCompleted: 2,
    suitRecoveries: 1,
  });
  assert.equal(settlement.grossCreditsEarned, 267);
  assert.equal(settlement.repairCreditsCharged, 54);
  assert.equal(settlement.creditsEarned, 213);
  assert.equal(settlement.progression.credits, 713);
  assert.equal(settlement.progression.totalRepairCredits, 54);

  const protectedFailure = calculateMissionSettlement({
    progression: funded,
    contractId: "standard_procurement",
    success: false,
    score: 0,
    timeRemaining: 0,
    samplesSecured: 0,
    repairsCompleted: 99,
    suitRecoveries: 99,
  });
  assert.equal(protectedFailure.repairCreditsCharged, 0);
  assert.equal(protectedFailure.creditsEarned, 25);
  assert.equal(protectedFailure.progression.credits, 525);
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
      CREW_INPUT_POLARITY_REPEL |
      128,
  });
  assert.equal(transform.x, 48);
  assert.equal(transform.y, 0);
  assert.equal(transform.z, -48);
  assert.ok(Math.abs(transform.yaw - Math.PI) < 0.000001);
  assert.equal(transform.inputMask, 127);
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
    assert.equal(mission.length, 7);
    assert.equal(new Set(mission.map(({ position }) => position.join(","))).size, 7);
    assert.ok(missionMaximumValue(mission) >= CONTRACT_TARGET);
    assert.deepEqual(
      mission.map(({ kind }) => kind).sort(),
      ["ferric", "ferric", "fossil", "glass", "helium", "platinum", "vial"],
    );
  }
});

test("the Rust Belt has a distinct, completable mineral survey", () => {
  const rustSurvey = createMissionDepositDefinitions(12013, "rust_belt");
  assert.equal(rustSurvey.length, 8);
  assert.equal(new Set(rustSurvey.map(({ position }) => position.join(","))).size, 8);
  assert.ok(missionMaximumValue(rustSurvey) >= CONTRACTS.rust_belt_salvage.target);
  assert.deepEqual(
    rustSurvey.map(({ kind }) => kind).sort(),
    ["ferric", "ferric", "ferric", "flux_core", "glass", "helium", "platinum", "platinum"],
  );
  assert.equal(CONTRACTS.rust_belt_salvage.destinationId, "rust_belt");
  assert.ok(DESTINATIONS.rust_belt.gravity < DESTINATIONS.practice_moon.gravity);
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

test("the field kit routes each sample to a distinct harvesting method", () => {
  assert.equal(requiredHarvestTool("ferric"), "drill");
  assert.equal(requiredHarvestTool("platinum"), "drill");
  assert.equal(requiredHarvestTool("glass"), "corer");
  assert.equal(requiredHarvestTool("fossil"), "corer");
  assert.equal(requiredHarvestTool("vial"), "siphon");
  assert.equal(requiredHarvestTool("helium"), "siphon");
  assert.equal(requiredHarvestTool("flux_core"), "drill");
  assert.equal(canHarvestCargo("corer", "glass"), true);
  assert.equal(canHarvestCargo("drill", "glass"), false);
  assert.equal(nextHarvestTool("drill"), "corer");
  assert.equal(nextHarvestTool("siphon"), "drill");
  assert.equal(nextHarvestTool("drill", -1), "siphon");
});

test("cargo carts enforce four slots, load-aware towing, and a single manifest payout", () => {
  assert.equal(CART_CAPACITY, 4);
  assert.equal(canLoadCargoCart(3), true);
  assert.equal(canLoadCargoCart(4), false);
  assert.equal(canLoadCargoCart(99), false);
  assert.equal(cargoCartTowMultiplier(0), 1);
  assert.equal(cargoCartTowMultiplier(4), 0.76);
  assert.equal(cargoCartTowMultiplier(99), 0.76);
  assert.equal(
    cargoCartManifestValue([
      { kind: "helium", condition: 1 },
      { kind: "glass", condition: 0.5 },
    ]),
    670,
  );
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

test("new field samples have distinct handling and failure personalities", () => {
  assert.equal(calculateCargoValue("helium", 1), 510);
  assert.equal(calculateCargoValue("fossil", 0.5), 195);
  assert.ok(
    calculateCargoBounce("helium", 6, 0).verticalSpeed >
      calculateCargoBounce("platinum", 6, 0).verticalSpeed,
  );
  assert.equal(calculateCargoImpact("helium", 1, 12.4).broken, true);
  assert.equal(calculateCargoImpact("fossil", 1, 12.4).broken, false);
});

test("Rust Belt relays require deliberate polarity and unlock the surplus vault", () => {
  assert.deepEqual(alignRustRelay(0, 0, "repel"), {
    accepted: false,
    relayMask: 0,
    vaultOpen: false,
  });
  const first = alignRustRelay(0, 0, "attract");
  const second = alignRustRelay(first.relayMask, 1, "repel");
  const third = alignRustRelay(second.relayMask, 2, "attract");
  assert.deepEqual(first, { accepted: true, relayMask: 1, vaultOpen: false });
  assert.deepEqual(second, { accepted: true, relayMask: 3, vaultOpen: false });
  assert.deepEqual(third, { accepted: true, relayMask: 7, vaultOpen: true });
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
    {
      ...DEFAULT_CONTROL_SETTINGS,
      lookSensitivity: 2,
      invertY: true,
      volume: 0,
    },
  );
  assert.deepEqual(
    normalizeControlSettings({ lookSensitivity: 0.1, volume: 4 }),
    {
      ...DEFAULT_CONTROL_SETTINGS,
      lookSensitivity: 0.45,
      volume: 1,
    },
  );
  const accessible = normalizeControlSettings({
    cameraShake: -2,
    highContrast: true,
    hudScale: 9,
    renderQuality: "not-a-preset" as "low",
    missionGuide: false,
  });
  assert.equal(accessible.cameraShake, 0);
  assert.equal(accessible.highContrast, true);
  assert.equal(accessible.hudScale, 1.2);
  assert.equal(accessible.renderQuality, "balanced");
  assert.equal(accessible.missionGuide, false);
  assert.equal(renderPixelRatioCap("low"), 1);
  assert.equal(renderPixelRatioCap("balanced"), 1.5);
  assert.equal(renderPixelRatioCap("high"), 2);
});

test("standard controllers apply deadzones and expose the complete field control set", () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  buttons[2] = { pressed: true, value: 1 };
  buttons[3] = { pressed: true, value: 1 };
  buttons[4] = { pressed: true, value: 1 };
  buttons[5] = { pressed: true, value: 1 };
  buttons[6] = { pressed: true, value: 1 };
  buttons[7] = { pressed: false, value: 0.8 };
  buttons[8] = { pressed: true, value: 1 };
  buttons[10] = { pressed: true, value: 1 };
  buttons[11] = { pressed: true, value: 1 };
  buttons[12] = { pressed: true, value: 1 };
  buttons[13] = { pressed: true, value: 1 };
  const input = readStandardGamepad({
    connected: true,
    axes: [0.1, -0.58, 0.42, -0.2],
    buttons,
  });
  assert.equal(input.connected, true);
  assert.equal(input.moveX, 0);
  assert.ok(input.moveY < -0.49);
  assert.ok(input.lookX > 0.3);
  assert.ok(input.lookY < 0);
  assert.equal(input.jump, true);
  assert.equal(input.interact, true);
  assert.equal(input.scan, true);
  assert.equal(input.drill, true);
  assert.equal(input.tether, true);
  assert.equal(input.magnet, true);
  assert.equal(input.polarityToggle, true);
  assert.equal(input.stabilize, true);
  assert.equal(input.cartToggle, true);
  assert.equal(input.toolCycle, true);
  assert.equal(input.throwCargo, true);
  assert.equal(input.pingDanger, true);
});

test("home-base heading keeps forward and strafe aligned with mouse yaw", () => {
  const facingForward = headingVectorsFromYaw(0);
  assert.deepEqual(facingForward, {
    forwardX: -0,
    forwardZ: -1,
    rightX: 1,
    rightZ: -0,
  });
  const turnedRight = headingVectorsFromYaw(-Math.PI / 2);
  assert.ok(turnedRight.forwardX > 0.999);
  assert.ok(Math.abs(turnedRight.forwardZ) < 0.000001);
  assert.ok(Math.abs(turnedRight.rightX) < 0.000001);
  assert.ok(turnedRight.rightZ > 0.999);
});

test("first-shift guidance advances through the full extraction loop", () => {
  const state = {
    moved: false,
    scanned: false,
    drilled: false,
    carried: false,
    score: 0,
    target: 900,
  };
  assert.equal(getMissionGuideStep(state).id, "move");
  state.moved = true;
  assert.equal(getMissionGuideStep(state).id, "scan");
  state.scanned = true;
  assert.equal(getMissionGuideStep(state).id, "drill");
  state.drilled = true;
  assert.equal(getMissionGuideStep(state).id, "carry");
  state.carried = true;
  assert.equal(getMissionGuideStep(state).id, "secure");
  state.score = 900;
  assert.equal(getMissionGuideStep(state).id, "return");
});
