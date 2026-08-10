export const PROGRESSION_SAVE_VERSION = 2;
export const MAX_EQUIPPED_UPGRADES = 2;

export type ContractId = "standard_procurement" | "rapid_recovery" | "hazard_bonus";
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
  name: string;
  shortName: string;
  description: string;
  target: number;
  seconds: number;
  creditReward: number;
  researchReward: number;
  hazardLabel: string;
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
    name: "Hazard Bonus Survey",
    shortName: "DEEP FIELD",
    description: "Bring back more science before the debris forecast becomes accurate.",
    target: 1120,
    seconds: 205,
    creditReward: 260,
    researchReward: 3,
    hazardLabel: "BONUS ELIGIBLE",
  },
};

export const CONTRACT_IDS = Object.keys(CONTRACTS) as ContractId[];

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
