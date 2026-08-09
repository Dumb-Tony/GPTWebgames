export const CONTRACT_TARGET = 900;
export const MISSION_SECONDS = 180;
export const DRILL_JAM_WEAR = 100;
export const REPAIR_STRIKE_STRENGTH = 34;
export const SUIT_REBOOT_RATE = 44;
export const SUIT_REBOOT_DECAY = 28;
export const CARGO_RECEIVER_RADIUS = 2.35;
export const CARGO_RECEIVER_MAX_HEIGHT = 4.8;

export type ControlSettings = {
  lookSensitivity: number;
  invertY: boolean;
  volume: number;
};

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  lookSensitivity: 1,
  invertY: false,
  volume: 0.75,
};

export type CargoKind = "ferric" | "glass" | "platinum" | "vial";

export type CargoDefinition = {
  name: string;
  value: number;
  speed: number;
  color: number;
  emissive: number;
  structure: string;
  impactThreshold: number;
  impactDamage: number;
  minimumCondition: number;
  breakSpeed: number | null;
  restitution: number;
  horizontalRetention: number;
};

export type DepositDefinition = {
  id: number;
  kind: CargoKind;
  position: [number, number];
};

export const cargoData: Record<CargoKind, CargoDefinition> = {
  ferric: {
    name: "Ferric Nodule",
    value: 180,
    speed: 0.86,
    color: 0xb76d4a,
    emissive: 0x5c2116,
    structure: "RUGGED",
    impactThreshold: 4.2,
    impactDamage: 0.012,
    minimumCondition: 0.5,
    breakSpeed: null,
    restitution: 0.54,
    horizontalRetention: 0.86,
  },
  glass: {
    name: "Lunar Glass",
    value: 320,
    speed: 0.78,
    color: 0x56cad3,
    emissive: 0x174f61,
    structure: "BRITTLE",
    impactThreshold: 3,
    impactDamage: 0.05,
    minimumCondition: 0.24,
    breakSpeed: null,
    restitution: 0.38,
    horizontalRetention: 0.78,
  },
  platinum: {
    name: "Platinum Core",
    value: 620,
    speed: 0.57,
    color: 0xd8dced,
    emissive: 0x334d59,
    structure: "DENSE",
    impactThreshold: 5,
    impactDamage: 0.006,
    minimumCondition: 0.72,
    breakSpeed: null,
    restitution: 0.27,
    horizontalRetention: 0.7,
  },
  vial: {
    name: "Cryogenic Sample Vial",
    value: 440,
    speed: 0.83,
    color: 0x8ee07d,
    emissive: 0x286b64,
    structure: "FRAGILE // SHATTERS",
    impactThreshold: 2.2,
    impactDamage: 0.07,
    minimumCondition: 0.08,
    breakSpeed: 10.2,
    restitution: 0.46,
    horizontalRetention: 0.82,
  },
};

const depositSpawnPoints: Array<[number, number]> = [
  [-2, -12],
  [8, 11],
  [24, -8],
  [31, 18],
  [35, -23],
  [-10, 14],
  [12, 24],
  [22, 4],
  [-3, 29],
  [34, 4],
  [12, -25],
  [39, 10],
  [-25, 22],
  [-31, -2],
];

const missionCargoKinds: CargoKind[] = [
  "ferric",
  "glass",
  "platinum",
  "vial",
  "ferric",
];

export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function formatSignalBearing(bearing: number) {
  const magnitude = Math.round(Math.abs(bearing));
  if (magnitude <= 12) return "AHEAD";
  if (magnitude >= 168) return "BEHIND";
  return `${bearing > 0 ? "RIGHT" : "LEFT"} ${magnitude}°`;
}

export function seededRandom(seed: number) {
  let current = Math.max(1, Math.abs(Math.trunc(seed)) % 2147483647);
  return () => {
    current = (current * 16807) % 2147483647;
    return current / 2147483647;
  };
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function nextMissionSeed(seed: number) {
  return (seed * 48271) % 99991;
}

export function createMissionDepositDefinitions(seed: number): DepositDefinition[] {
  const random = seededRandom(seed);
  const positions = shuffled(depositSpawnPoints, random).slice(
    0,
    missionCargoKinds.length,
  );
  const kinds = shuffled(missionCargoKinds, random);
  return positions.map((position, index) => ({
    id: index + 1,
    kind: kinds[index],
    position,
  }));
}

export function missionMaximumValue(definitions: readonly DepositDefinition[]) {
  return definitions.reduce((total, deposit) => total + cargoData[deposit.kind].value, 0);
}

export function calculateCargoValue(kind: CargoKind, condition: number) {
  const safeCondition = Math.min(1, Math.max(0, condition));
  return Math.round(cargoData[kind].value * safeCondition);
}

export function calculateCargoImpactCondition(
  kind: CargoKind,
  condition: number,
  impactSpeed: number,
) {
  return calculateCargoImpact(kind, condition, impactSpeed).condition;
}

export function calculateCargoImpact(
  kind: CargoKind,
  condition: number,
  impactSpeed: number,
) {
  const data = cargoData[kind];
  const safeCondition = Math.min(1, Math.max(0, condition));
  const safeSpeed = Math.max(0, impactSpeed);
  const broken = data.breakSpeed !== null && safeSpeed >= data.breakSpeed;
  const damagingSpeed = Math.max(0, safeSpeed - data.impactThreshold);
  return {
    broken,
    condition: broken
      ? 0
      : Math.max(
          data.minimumCondition,
          safeCondition - damagingSpeed * data.impactDamage,
        ),
  };
}

export function calculateCargoBounce(
  kind: CargoKind,
  verticalImpactSpeed: number,
  bounceCount: number,
) {
  const data = cargoData[kind];
  const verticalSpeed =
    Math.max(0, verticalImpactSpeed) *
    data.restitution *
    Math.pow(0.86, Math.max(0, bounceCount));
  const continues = bounceCount < 5 && verticalSpeed >= 0.72;
  return {
    continues,
    verticalSpeed: continues ? verticalSpeed : 0,
    horizontalRetention: continues ? data.horizontalRetention : 0,
  };
}

export function canAirmailCargo(
  horizontalDistance: number,
  height: number,
  isBallistic: boolean,
) {
  return (
    isBallistic &&
    horizontalDistance <= CARGO_RECEIVER_RADIUS &&
    height >= 0.35 &&
    height <= CARGO_RECEIVER_MAX_HEIGHT
  );
}

export function normalizeControlSettings(
  settings: Partial<ControlSettings> | null | undefined,
): ControlSettings {
  const sensitivity = Number(settings?.lookSensitivity);
  const volume = Number(settings?.volume);
  return {
    lookSensitivity: Number.isFinite(sensitivity)
      ? Math.min(2, Math.max(0.45, sensitivity))
      : DEFAULT_CONTROL_SETTINGS.lookSensitivity,
    invertY:
      typeof settings?.invertY === "boolean"
        ? settings.invertY
        : DEFAULT_CONTROL_SETTINGS.invertY,
    volume: Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : DEFAULT_CONTROL_SETTINGS.volume,
  };
}

export function registerRepairStrike(progress: number) {
  const advanced = Math.min(100, Math.max(0, progress) + REPAIR_STRIKE_STRENGTH);
  const completed = advanced >= 100;
  return {
    completed,
    progress: completed ? 0 : advanced,
    hitsRemaining: completed
      ? 0
      : Math.ceil((100 - advanced) / REPAIR_STRIKE_STRENGTH),
  };
}

export function applySuitDamage(integrity: number, amount: number) {
  const nextIntegrity = Math.max(0, Math.min(100, integrity) - Math.max(0, amount));
  return {
    integrity: nextIntegrity,
    downed: nextIntegrity === 0,
  };
}

export function advanceSuitRecovery(progress: number, holdingReboot: boolean, dt: number) {
  const rate = holdingReboot ? SUIT_REBOOT_RATE : -SUIT_REBOOT_DECAY;
  return Math.min(100, Math.max(0, progress + Math.max(0, dt) * rate));
}
