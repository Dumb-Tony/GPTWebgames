export const PROGRESSION_SAVE_VERSION = 2;
export const MAX_EQUIPPED_UPGRADES = 2;

export type DestinationId = "practice_moon" | "rust_belt";
export type ContractId =
  | "standard_procurement"
  | "rapid_recovery"
  | "hazard_bonus"
  | "rust_belt_salvage"
  | "magnetic_storm_recovery";
export type UpgradeId =
  | "survey_array"
  | "cooling_jacket"
  | "thruster_reserve"
  | "cargo_harness";

export type ProgressionSave = {
  version: 2;
  credits: number;
  research: number;
  successfulMissions: number;
  failedMissions: number;
  totalRepairCredits: number;
  ownedUpgradeIds: UpgradeId[];
  equippedUpgradeIds: UpgradeId[];
};

export type ContractDefinition = {
  id: ContractId;
  destinationId: DestinationId;
  name: string;
  shortName: string;
  description: string;
  target: number;
  seconds: number;
  creditReward: number;
  researchReward: number;
  hazardLabel: string;
};

export type DestinationDefinition = {
  id: DestinationId;
  code: string;
  name: string;
  classification: string;
  description: string;
  hazard: string;
  gravity: number;
  unlockResearch: number;
  defaultContractId: ContractId;
};

export type UpgradeDefinition = {
  id: UpgradeId;
  name: string;
  description: string;
  creditCost: number;
  researchRequired: number;
};

export const CONTRACTS: Record<ContractId, ContractDefinition> = {
  standard_procurement: {
    id: "standard_procurement",
    destinationId: "practice_moon",
    name: "Practice Moon Procurement",
    shortName: "STANDARD",
    description: "A balanced collection run with a forgiving launch window.",
    target: 900,
    seconds: 180,
    creditReward: 170,
    researchReward: 2,
    hazardLabel: "ROUTINE-ish",
  },
  rapid_recovery: {
    id: "rapid_recovery",
    destinationId: "practice_moon",
    name: "Rapid Sample Recovery",
    shortName: "SPRINT",
    description: "A lower quota, a much shorter clock, and better overtime pay.",
    target: 650,
    seconds: 115,
    creditReward: 215,
    researchReward: 2,
    hazardLabel: "NO OVERTIME",
  },
  hazard_bonus: {
    id: "hazard_bonus",
    destinationId: "practice_moon",
    name: "Hazard Bonus Survey",
    shortName: "DEEP FIELD",
    description: "Bring back more science before the debris forecast becomes accurate.",
    target: 1120,
    seconds: 205,
    creditReward: 260,
    researchReward: 3,
    hazardLabel: "BONUS ELIGIBLE",
  },
  rust_belt_salvage: {
    id: "rust_belt_salvage",
    destinationId: "rust_belt",
    name: "Rust Belt First Survey",
    shortName: "IRON RANGE",
    description: "Map the metallic asteroid and recover a representative industrial sample set.",
    target: 1180,
    seconds: 210,
    creditReward: 290,
    researchReward: 4,
    hazardLabel: "MAGNETIC WEATHER",
  },
  magnetic_storm_recovery: {
    id: "magnetic_storm_recovery",
    destinationId: "rust_belt",
    name: "Magnetic Storm Recovery",
    shortName: "POLAR SHIFT",
    description: "A shorter launch window during a forecast that Legal insists is merely colorful.",
    target: 860,
    seconds: 145,
    creditReward: 340,
    researchReward: 4,
    hazardLabel: "COMPASS OPTIONAL",
  },
};

export const CONTRACT_IDS = Object.keys(CONTRACTS) as ContractId[];

export const DESTINATIONS: Record<DestinationId, DestinationDefinition> = {
  practice_moon: {
    id: "practice_moon",
    code: "PM-01",
    name: "The Practice Moon",
    classification: "TRAINING SATELLITE",
    description: "Low gravity, familiar terrain, pressure vents, and only moderate paperwork.",
    hazard: "DEBRIS SHOWERS",
    gravity: 4.35,
    unlockResearch: 0,
    defaultContractId: "standard_procurement",
  },
  rust_belt: {
    id: "rust_belt",
    code: "RB-02",
    name: "The Rust Belt",
    classification: "METALLIC ASTEROID",
    description: "Iron ridges, drifting scrap, weak gravity, and magnetic storms that move loose cargo.",
    hazard: "POLARITY SURGES",
    gravity: 2.7,
    unlockResearch: 0,
    defaultContractId: "rust_belt_salvage",
  },
};

export const DESTINATION_IDS = Object.keys(DESTINATIONS) as DestinationId[];

export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  survey_array: {
    id: "survey_array",
    name: "Wideband Survey Array",
    description: "+5m scanner range and a 25% faster recharge.",
    creditCost: 240,
    researchRequired: 2,
  },
  cooling_jacket: {
    id: "cooling_jacket",
    name: "Questionable Cooling Jacket",
    description: "Drill heat rises 24% slower and cools 20% faster.",
    creditCost: 320,
    researchRequired: 3,
  },
  thruster_reserve: {
    id: "thruster_reserve",
    name: "Auxiliary Thruster Flask",
    description: "+25% EVA fuel at the start of every mission.",
    creditCost: 410,
    researchRequired: 5,
  },
  cargo_harness: {
    id: "cargo_harness",
    name: "Load-Bearing Friendship Harness",
    description: "Reduces the movement penalty from carried samples.",
    creditCost: 520,
    researchRequired: 7,
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export const DEFAULT_PROGRESSION: ProgressionSave = {
  version: PROGRESSION_SAVE_VERSION,
  credits: 0,
  research: 0,
  successfulMissions: 0,
  failedMissions: 0,
  totalRepairCredits: 0,
  ownedUpgradeIds: [],
  equippedUpgradeIds: [],
};

function safeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function validUpgradeIds(value: unknown): UpgradeId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)].filter((id): id is UpgradeId =>
    UPGRADE_IDS.includes(id as UpgradeId),
  );
}

export function normalizeProgressionSave(value: unknown): ProgressionSave {
  if (!value || typeof value !== "object") return { ...DEFAULT_PROGRESSION };
  const source = value as Record<string, unknown>;
  const ownedUpgradeIds = validUpgradeIds(
    source.ownedUpgradeIds ?? source.upgrades,
  );
  const equippedUpgradeIds = validUpgradeIds(
    source.equippedUpgradeIds ?? source.equipped,
  )
    .filter((id) => ownedUpgradeIds.includes(id))
    .slice(0, MAX_EQUIPPED_UPGRADES);

  return {
    version: PROGRESSION_SAVE_VERSION,
    credits: safeInteger(source.credits ?? source.money),
    research: safeInteger(source.research ?? source.science),
    successfulMissions: safeInteger(
      source.successfulMissions ?? source.missionsCompleted,
    ),
    failedMissions: safeInteger(source.failedMissions ?? source.missionsFailed),
    totalRepairCredits: safeInteger(
      source.totalRepairCredits ?? source.repairCreditsSpent,
    ),
    ownedUpgradeIds,
    equippedUpgradeIds,
  };
}

export function hasEquippedUpgrade(
  progression: ProgressionSave,
  upgradeId: UpgradeId,
) {
  return progression.equippedUpgradeIds.includes(upgradeId);
}

export function purchaseUpgrade(
  progression: ProgressionSave,
  upgradeId: UpgradeId,
) {
  const upgrade = UPGRADES[upgradeId];
  if (progression.ownedUpgradeIds.includes(upgradeId)) return progression;
  if (
    progression.credits < upgrade.creditCost ||
    progression.research < upgrade.researchRequired
  ) {
    return progression;
  }
  const ownedUpgradeIds = [...progression.ownedUpgradeIds, upgradeId];
  const equippedUpgradeIds =
    progression.equippedUpgradeIds.length < MAX_EQUIPPED_UPGRADES
      ? [...progression.equippedUpgradeIds, upgradeId]
      : progression.equippedUpgradeIds;
  return {
    ...progression,
    credits: progression.credits - upgrade.creditCost,
    ownedUpgradeIds,
    equippedUpgradeIds,
  };
}

export function toggleEquippedUpgrade(
  progression: ProgressionSave,
  upgradeId: UpgradeId,
) {
  if (!progression.ownedUpgradeIds.includes(upgradeId)) return progression;
  if (progression.equippedUpgradeIds.includes(upgradeId)) {
    return {
      ...progression,
      equippedUpgradeIds: progression.equippedUpgradeIds.filter(
        (id) => id !== upgradeId,
      ),
    };
  }
  if (progression.equippedUpgradeIds.length >= MAX_EQUIPPED_UPGRADES) {
    return progression;
  }
  return {
    ...progression,
    equippedUpgradeIds: [...progression.equippedUpgradeIds, upgradeId],
  };
}

export function calculateMissionSettlement({
  progression,
  contractId,
  success,
  score,
  timeRemaining,
  samplesSecured,
  repairsCompleted = 0,
  suitRecoveries = 0,
}: {
  progression: ProgressionSave;
  contractId: ContractId;
  success: boolean;
  score: number;
  timeRemaining: number;
  samplesSecured: number;
  repairsCompleted?: number;
  suitRecoveries?: number;
}) {
  const contract = CONTRACTS[contractId];
  const safeScore = Math.max(0, score);
  const salvageCredits = Math.floor(safeScore * (success ? 0.1 : 0.045));
  const timeBonus = success ? Math.floor(Math.max(0, timeRemaining) * 0.7) : 0;
  const grossCreditsEarned = Math.max(
    25,
    (success ? contract.creditReward : 25) + salvageCredits + timeBonus,
  );
  const quotedRepairCredits =
    Math.max(0, Math.trunc(repairsCompleted)) * 12 +
    Math.max(0, Math.trunc(suitRecoveries)) * 30;
  const repairCreditsCharged = Math.min(
    quotedRepairCredits,
    Math.max(0, grossCreditsEarned - 25),
  );
  const creditsEarned = grossCreditsEarned - repairCreditsCharged;
  const researchEarned = success
    ? contract.researchReward + Math.floor(Math.max(0, samplesSecured) / 3)
    : samplesSecured >= 2
      ? 1
      : 0;

  const nextProgression = {
    ...progression,
    credits: progression.credits + creditsEarned,
    research: progression.research + researchEarned,
    successfulMissions: progression.successfulMissions + (success ? 1 : 0),
    failedMissions: progression.failedMissions + (success ? 0 : 1),
    totalRepairCredits:
      progression.totalRepairCredits + repairCreditsCharged,
  } satisfies ProgressionSave;

  return {
    grossCreditsEarned,
    repairCreditsCharged,
    creditsEarned,
    researchEarned,
    progression: nextProgression,
  };
}
