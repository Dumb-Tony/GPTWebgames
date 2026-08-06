export const CONTRACT_TARGET = 900;
export const MISSION_SECONDS = 180;
export const DRILL_JAM_WEAR = 100;
export const REPAIR_STRIKE_STRENGTH = 34;
export const SUIT_REBOOT_RATE = 44;
export const SUIT_REBOOT_DECAY = 28;

export type CargoKind = "ferric" | "glass" | "platinum";

export type CargoDefinition = {
  name: string;
  value: number;
  speed: number;
  color: number;
  emissive: number;
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
  },
  glass: {
    name: "Lunar Glass",
    value: 320,
    speed: 0.78,
    color: 0x56cad3,
    emissive: 0x174f61,
  },
  platinum: {
    name: "Platinum Core",
    value: 620,
    speed: 0.57,
    color: 0xd8dced,
    emissive: 0x334d59,
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
  "glass",
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
  const safeCondition = Math.min(1, Math.max(0.42, condition));
  const damagingSpeed = Math.max(0, impactSpeed - 3);
  const fragility = kind === "glass" ? 0.045 : kind === "ferric" ? 0.016 : 0.008;
  return Math.max(0.42, safeCondition - damagingSpeed * fragility);
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
