export const CREW_MAX_MEMBERS = 4;
export const CREW_SYNC_INTERVAL_MS = 260;
export const CREW_STALE_AFTER_MS = 12_000;

export const CREW_INPUT_DRILL = 1 << 0;
export const CREW_INPUT_MOVING = 1 << 1;
export const CREW_INPUT_THRUSTER = 1 << 2;
export const CREW_INPUT_DOWNED = 1 << 3;
export const CREW_INPUT_TOOL_CORER = 1 << 4;
export const CREW_INPUT_TOOL_SIPHON = 1 << 5;

export const CREW_COLORS = [
  { name: "SOLAR YELLOW", hex: 0xffd85a, css: "#ffd85a" },
  { name: "SIGNAL CYAN", hex: 0x6ee7e4, css: "#6ee7e4" },
  { name: "HAZARD CORAL", hex: 0xff865e, css: "#ff865e" },
  { name: "BIO GREEN", hex: 0x8ee07d, css: "#8ee07d" },
] as const;

export type CrewRole = "host" | "guest";
export type CrewRoomPhase = "lobby" | "active" | "success" | "failed" | "closed";
export type CrewActionType =
  | "scan"
  | "interact"
  | "throw"
  | "tether"
  | "magnet"
  | "stabilize"
  | "cart_toggle"
  | "ping"
  | "ping_help"
  | "ping_cargo"
  | "ping_danger"
  | "ping_ship";

export type CrewSession = {
  roomCode: string;
  memberId: string;
  token: string;
  role: CrewRole;
  name: string;
  colorIndex: number;
  missionSeed: number;
};

export type CrewMember = {
  id: string;
  name: string;
  colorIndex: number;
  role: CrewRole;
  x: number;
  y: number;
  z: number;
  yaw: number;
  inputMask: number;
  lastSeenAt: string;
};

export type CrewAction = {
  id: number;
  memberId: string;
  sequence: number;
  type: CrewActionType;
  createdAt: string;
};

export type CrewDepositState = {
  id: number;
  state:
    | "hidden"
    | "revealed"
    | "extracting"
    | "cargo"
    | "cart"
    | "secured"
    | "broken";
  progress: number;
  condition: number;
  position: [number, number, number];
  velocity: [number, number, number];
  isBallistic: boolean;
  bounceCount: number;
  ownerId: string | null;
  tetherOwnerIds: string[];
};

export type CrewMissionState = {
  missionSeed: number;
  contractId: ContractId;
  phase: Exclude<CrewRoomPhase, "lobby" | "closed">;
  time: number;
  score: number;
  message: string;
  cart: {
    position: [number, number, number];
    yaw: number;
    ownerId: string | null;
    cargoIds: number[];
  };
  deposits: CrewDepositState[];
  stats: {
    repairsCompleted: number;
    airmailDeliveries: number;
    bankShotDeliveries: number;
    stuntBonus: number;
    cargoBounces: number;
    brokenSamples: number;
  };
};

export type CrewRoomSnapshot = {
  roomCode: string;
  phase: CrewRoomPhase;
  missionSeed: number;
  revision: number;
  actionCursor: number;
  hostMemberId: string;
  members: CrewMember[];
  actions: CrewAction[];
  authoritativeState: CrewMissionState | null;
  serverTime: string;
};

export type CrewLocalPresence = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  inputMask: number;
};

export type CrewNetworkTuning = {
  addedLatencyMs: number;
  packetLossPercent: number;
};

export const DEFAULT_CREW_NETWORK_TUNING: CrewNetworkTuning = {
  addedLatencyMs: 0,
  packetLossPercent: 0,
};

export function normalizeCrewName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function normalizeRoomCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ2-9]/g, "")
    .slice(0, 5);
}

export function clampCrewTransform(presence: Partial<CrewLocalPresence>) {
  const finite = (value: unknown, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const yaw = finite(presence.yaw);
  return {
    x: clamp(finite(presence.x), -48, 48),
    y: clamp(finite(presence.y), 0, 24),
    z: clamp(finite(presence.z), -48, 48),
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
    inputMask: Math.max(0, Math.min(63, Math.trunc(finite(presence.inputMask)))),
  } satisfies CrewLocalPresence;
}

export function isCrewMemberFresh(lastSeenAt: string, now = Date.now()) {
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(seen) && now - seen <= CREW_STALE_AFTER_MS;
}

export function crewColor(index: number) {
  return CREW_COLORS[Math.abs(Math.trunc(index)) % CREW_COLORS.length];
}
import type { ContractId } from "./progression";
