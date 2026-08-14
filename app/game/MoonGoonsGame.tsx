"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { ControlSettingsPanel } from "./ControlSettingsPanel";
import { CrewLobby, CrewRoster } from "./CrewLobby";
import { FieldNotes } from "./FieldNotes";
import { GamepadMenuNavigation } from "./GamepadMenuNavigation";
import { MissionGuide } from "./MissionGuide";
import { OperationsHub } from "./OperationsHub";
import { OrbitalHub, type HubStationId } from "./OrbitalHub";
import { primaryGamepad, readStandardGamepad } from "./gamepad";
import {
  CREW_INPUT_DOWNED,
  CREW_INPUT_DRILL,
  CREW_INPUT_MOVING,
  CREW_INPUT_POLARITY_REPEL,
  CREW_INPUT_TOOL_CORER,
  CREW_INPUT_TOOL_SIPHON,
  CREW_INPUT_THRUSTER,
  CREW_SYNC_INTERVAL_MS,
  DEFAULT_CREW_NETWORK_TUNING,
  crewColor,
  enqueueCrewAction,
  type CrewActionType,
  type CrewFieldToolCase,
  type CrewLocalPresence,
  type CrewMissionPing,
  type CrewMissionState,
  type CrewPingKind,
  type CrewRescueAssist,
  type CrewNetworkTuning,
  type CrewRoomSnapshot,
  type CrewSession,
} from "./crewNetwork";
import {
  DEFAULT_CONTROL_SETTINGS,
  DRILL_JAM_WEAR,
  FIELD_CASE_PICKUP_RANGE,
  CART_CAPACITY,
  MISSION_SECONDS,
  TETHER_BREAK_RANGE,
  TETHER_LOCK_RANGE,
  TETHER_MAX_OWNERS,
  RUST_RELAY_REQUIREMENTS,
  advanceSuitRecovery,
  alignRustRelay,
  applySuitDamage as calculateSuitDamage,
  canAirmailCargo,
  canHarvestCargo,
  canLoadCargoCart,
  calculateBankShotBonus,
  calculateCargoBounce,
  calculateCargoImpact,
  calculateCargoValue,
  cargoCartManifestValue,
  cargoCartTowMultiplier,
  calculateTetherPull,
  cargoData,
  createMissionDepositDefinitions,
  formatSignalBearing,
  formatTime,
  fieldCaseHarvestMultiplier,
  harvestToolData,
  nextMissionSeed,
  nextHarvestTool,
  normalizeControlSettings,
  predictCargoThrow,
  registerRepairStrike,
  requiredHarvestTool,
  renderPixelRatioCap,
  seededRandom,
  type CargoKind,
  type ControlSettings,
  type DepositDefinition,
  type HarvestToolId,
  type MagneticPolarity,
} from "./gameRules";
import {
  CONTRACTS,
  DESTINATIONS,
  DEFAULT_PROGRESSION,
  calculateMissionSettlement,
  hasEquippedUpgrade,
  normalizeProgressionSave,
  purchaseUpgrade,
  toggleEquippedUpgrade,
  type ContractId,
  type DestinationId,
  type ProgressionSave,
  type UpgradeId,
} from "./progression";
import styles from "./game.module.css";

const MOON_RADIUS = 48;
const JUMP_VELOCITY = 6.1;
const INITIAL_MISSION_SEED = 12013;
const INITIAL_MESSAGE = "Awaiting a legally sufficient level of consent.";
const SHIP_POSITION = new THREE.Vector3(-19, 0, 5);
const SHIP_ROTATION = 0.16;
const CARGO_RECEIVER_POSITION = new THREE.Vector3(4.8, 0, 1.3)
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), SHIP_ROTATION)
  .add(SHIP_POSITION);
const CONTROL_SETTINGS_KEY = "moon-goons-control-settings-v1";
const CREW_SESSION_KEY = "moon-goons-crew-session-v1";
const PROGRESSION_KEY = "moon-goons-progression-v1";
const HUB_STATION_HEADINGS: Record<HubStationId, string> = {
  contracts: "CONTRACT CONTROL",
  equipment: "EQUIPMENT CAGE",
  crew: "CREW LINK UPLINK",
  maintenance: "MAINTENANCE BENCH",
};
const HUB_STATION_COPY: Record<HubStationId, string> = {
  contracts: "Choose the shift profile and review which destinations your research has uncovered.",
  equipment: "Buy field modules, install up to two, and review the company-minimum loadout.",
  crew: "Start solo, create a Crew Link room, or join a friend's shared mission.",
  maintenance: "Review repair policy, recovery wages, and the cost of previous safety decisions.",
};
const HUB_STATION_ORDER: HubStationId[] = [
  "contracts",
  "equipment",
  "crew",
  "maintenance",
];

function normalizeContractId(value: unknown): ContractId {
  return typeof value === "string" && value in CONTRACTS
    ? (value as ContractId)
    : "standard_procurement";
}

type Phase = "briefing" | "active" | "success" | "failed";
type MouseLockIssue = "unsupported" | "blocked" | null;
type DepositState =
  | "hidden"
  | "revealed"
  | "extracting"
  | "cargo"
  | "cart"
  | "secured"
  | "broken";
type MeteorState = "idle" | "warning" | "falling" | "impact";

type DepositRuntime = {
  id: number;
  kind: CargoKind;
  position: THREE.Vector3;
  state: DepositState;
  progress: number;
  condition: number;
  velocity: THREE.Vector3;
  isBallistic: boolean;
  bounceCount: number;
  ownerId: string | null;
  tetherOwnerIds: string[];
  group: THREE.Group;
  shell: THREE.Object3D;
  core: THREE.Object3D;
  ring: THREE.Object3D;
  methodMarker: THREE.Group;
  shards: THREE.Group;
  beacon: THREE.PointLight;
  harvestPulse: number;
};

type MeteorRuntime = {
  group: THREE.Group;
  marker: THREE.Mesh;
  markerMaterial: THREE.MeshBasicMaterial;
  meteor: THREE.Mesh;
  trail: THREE.Mesh;
  light: THREE.PointLight;
  state: MeteorState;
  timer: number;
  impactAge: number;
};

type CrewPingRuntime = {
  data: CrewMissionPing;
  group: THREE.Group;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
  light: THREE.PointLight;
};

type FieldToolCaseRuntime = CrewFieldToolCase & {
  group: THREE.Group;
  beacon: THREE.PointLight;
};

type Snapshot = {
  phase: Phase;
  time: number;
  score: number;
  heat: number;
  overheated: boolean;
  drillWear: number;
  drillJammed: boolean;
  activeHarvestTool: HarvestToolId;
  specialistCase: HarvestToolId | null;
  nearbyFieldCase: HarvestToolId | null;
  harvestMeter: number;
  repairProgress: number;
  repairsCompleted: number;
  airmailDeliveries: number;
  bankShotDeliveries: number;
  stuntBonus: number;
  cargoBounces: number;
  brokenSamples: number;
  missionSeed: number;
  suitIntegrity: number;
  downed: boolean;
  recoveryProgress: number;
  suitRecoveries: number;
  carrying: string | null;
  cargoCondition: number | null;
  cargoStructure: string | null;
  throwRisk: "STABLE" | "RISKY" | "SEVERE" | "SHATTER" | null;
  throwDistance: number | null;
  message: string;
  scanCooldown: number;
  magnetCooldown: number;
  polarityMode: MagneticPolarity;
  facilityRelays: number;
  facilityVaultOpen: boolean;
  stabilizerCharges: number;
  cartCargoCount: number;
  cartCapacity: number;
  cartHitched: boolean;
  cartDistance: number;
  depositsSecured: number;
  prompt: string;
  homeDistance: number;
  thrusterFuel: number;
  signalsTracked: number;
  nearestSignalDistance: number | null;
  nearestSignalBearing: number | null;
  nearestSignalName: string | null;
  nearestSignalTool: HarvestToolId | null;
  tetheredCargo: string | null;
  tetherDistance: number | null;
  tetherTeamLift: boolean;
  contractId: ContractId;
  contractTarget: number;
  thrusterCapacity: number;
  tutorialMoved: boolean;
  tutorialScanned: boolean;
  tutorialDrilled: boolean;
  tutorialCarried: boolean;
};

const palette = {
  void: 0x060914,
  lunar: 0x4a4d5c,
  lunarDark: 0x292c39,
  cream: 0xf4f1dc,
  yellow: 0xffd85a,
  cyan: 0x6ee7e4,
  coral: 0xff865e,
  red: 0xff616f,
  green: 0x8ee07d,
  graphite: 0x202733,
};

function standardMaterial(
  color: number,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.08,
    flatShading: true,
    ...options,
  });
}

function colorCss(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function createBillboardLabel(
  primary: string,
  secondary: string,
  color: number,
  scale: [number, number] = [5.6, 1.35],
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(7, 10, 18, 0.86)";
    context.fillRect(4, 4, 504, 120);
    context.strokeStyle = colorCss(color);
    context.lineWidth = 5;
    context.strokeRect(7, 7, 498, 114);
    context.fillStyle = colorCss(color);
    context.font = "700 34px monospace";
    context.textAlign = "center";
    context.fillText(primary.toUpperCase().slice(0, 22), 256, 56);
    context.fillStyle = "#f4f1dc";
    context.font = "600 21px monospace";
    context.fillText(secondary.toUpperCase().slice(0, 34), 256, 94);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.renderOrder = 20;
  return sprite;
}

function crewPingStyle(kind: CrewPingKind) {
  return {
    position: { label: "CREW POSITION", color: palette.cyan },
    help: { label: "ASSISTANCE", color: palette.yellow },
    cargo: { label: "CARGO MARK", color: palette.green },
    danger: { label: "DANGER", color: palette.red },
    ship: { label: "RETURN SHIP", color: palette.coral },
  }[kind];
}

function createCrewPingVisual(data: CrewMissionPing): CrewPingRuntime {
  const style = crewPingStyle(data.kind);
  const group = new THREE.Group();
  group.position.fromArray(data.position);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.05, 32),
    new THREE.MeshBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.11, 3.4, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 1.75;
  const light = new THREE.PointLight(style.color, 7, 11, 2);
  light.position.y = 2;
  const label = createBillboardLabel(style.label, data.memberName, style.color, [5, 1.25]);
  label.position.y = 4.15;
  group.add(ring, beam, light, label);
  return { data: { ...data }, group, ring, beam, light };
}

function createMoonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const random = seededRandom(44021);
  context.fillStyle = "#4a4d5c";
  context.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 540; index += 1) {
    const shade = 54 + Math.floor(random() * 46);
    const alpha = 0.08 + random() * 0.24;
    context.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 10}, ${alpha})`;
    const radius = 0.4 + random() * (index % 19 === 0 ? 6.5 : 2.2);
    context.beginPath();
    context.arc(random() * 256, random() * 256, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (let index = 0; index < 14; index += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const radius = 5 + random() * 13;
    const gradient = context.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    gradient.addColorStop(0, "rgba(30, 32, 42, 0.22)");
    gradient.addColorStop(0.7, "rgba(42, 45, 56, 0.12)");
    gradient.addColorStop(1, "rgba(120, 124, 142, 0.08)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.anisotropy = 4;
  return texture;
}

function createRustTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const random = seededRandom(77221);
  context.fillStyle = "#5d4038";
  context.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 720; index += 1) {
    const rust = 70 + Math.floor(random() * 88);
    context.fillStyle = `rgba(${rust + 35}, ${Math.floor(rust * 0.58)}, ${Math.floor(
      rust * 0.4,
    )}, ${0.06 + random() * 0.24})`;
    const radius = 0.5 + random() * (index % 31 === 0 ? 9 : 3.2);
    context.beginPath();
    context.arc(random() * 256, random() * 256, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 0.28;
  context.strokeStyle = "#f1a56f";
  context.lineWidth = 1;
  for (let line = 0; line < 12; line += 1) {
    context.beginPath();
    context.moveTo(-20, line * 24 + random() * 18);
    context.lineTo(276, line * 24 - 42 + random() * 24);
    context.stroke();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.anisotropy = 4;
  return texture;
}

function createCorporateLabel(
  title: string,
  serial: string,
  width = 2.5,
  height = 0.72,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Group();
  context.fillStyle = "#e9e4cd";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#182438";
  context.fillRect(0, 0, 22, canvas.height);
  context.fillStyle = "#e26f45";
  context.fillRect(22, 0, 10, canvas.height);
  context.fillStyle = "#182438";
  context.font = "900 42px Arial";
  context.fillText(title, 52, 62);
  context.font = "700 21px monospace";
  context.fillText(serial, 54, 104);
  context.strokeStyle = "#182438";
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  return label;
}

function createCargoTexture(kind: CargoKind) {
  const data = cargoData[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = colorCss(data.color);
  context.fillRect(0, 0, 128, 128);
  const random = seededRandom(8300 + Object.keys(cargoData).indexOf(kind) * 181);
  for (let index = 0; index < 95; index += 1) {
    const alpha = 0.06 + random() * 0.16;
    context.fillStyle = `rgba(10, 13, 22, ${alpha})`;
    context.beginPath();
    context.arc(random() * 128, random() * 128, 0.6 + random() * 2.8, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = colorCss(data.emissive);
  context.lineWidth = kind === "fossil" ? 5 : 9;
  context.globalAlpha = 0.55;
  if (kind === "fossil") {
    for (let radius = 10; radius <= 50; radius += 9) {
      context.beginPath();
      context.arc(64, 64, radius, Math.PI * 0.18, Math.PI * 1.8);
      context.stroke();
    }
  } else {
    for (let x = -128; x < 256; x += 34) {
      context.beginPath();
      context.moveTo(x, 128);
      context.lineTo(x + 128, 0);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "fossil" ? 1 : 1.5, kind === "fossil" ? 1 : 1.5);
  texture.anisotropy = 4;
  return texture;
}

function box(
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(...size, 1, 1, 1),
    standardMaterial(color, options),
  );
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  position: [number, number, number],
  segments = 8,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  const object = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    standardMaterial(color, options),
  );
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function createShip() {
  const ship = new THREE.Group();
  ship.position.copy(SHIP_POSITION);
  ship.rotation.y = SHIP_ROTATION;

  const body = box([9.6, 3.8, 6.8], palette.cream, [0, 3.6, 0], {
    metalness: 0.2,
    roughness: 0.62,
  });
  body.geometry.rotateY(Math.PI / 4);
  ship.add(body);

  const cabin = box([5.2, 2.2, 4.8], 0xd6d2bb, [-0.2, 6.05, -0.2], {
    metalness: 0.12,
  });
  cabin.geometry.rotateY(Math.PI / 4);
  ship.add(cabin);

  const windowMaterial = standardMaterial(0x173246, {
    emissive: 0x0a2838,
    emissiveIntensity: 1.3,
    roughness: 0.15,
    metalness: 0.35,
  });
  const windowFront = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.3, 0.18), windowMaterial);
  windowFront.position.set(2.75, 6.25, 2.65);
  windowFront.rotation.y = Math.PI / 4;
  ship.add(windowFront);

  const bay = box([5.7, 0.35, 4.1], palette.yellow, [4.8, 0.28, 1.3], {
    emissive: 0x604700,
    emissiveIntensity: 0.35,
  });
  bay.rotation.y = 0.12;
  ship.add(bay);

  const ramp = box([4.8, 0.28, 3.8], 0x777868, [5.8, 1.22, 0.25], {
    metalness: 0.34,
    roughness: 0.58,
  });
  ramp.rotation.z = -0.36;
  ramp.rotation.y = 0.1;
  ship.add(ramp);

  const yellowStripe = box([9.9, 0.65, 7.05], palette.yellow, [0, 3.12, 0]);
  yellowStripe.geometry.rotateY(Math.PI / 4);
  ship.add(yellowStripe);

  const hullLabel = createCorporateLabel("S.P.A.C.E.", "PROCUREMENT VEHICLE · MG-03", 3.1, 0.86);
  hullLabel.position.set(-0.35, 4.45, -3.48);
  ship.add(hullLabel);

  const bayLabel = createCorporateLabel("CARGO", "NO ORGANICS WITHOUT FORM 12-B", 2.25, 0.62);
  bayLabel.position.set(4.75, 1.05, 3.35);
  bayLabel.rotation.y = Math.PI / 2;
  ship.add(bayLabel);

  const enginePositions: Array<[number, number, number]> = [
    [-3.5, 1.35, -2.8],
    [3.5, 1.35, -2.8],
    [-3.5, 1.35, 2.8],
    [3.5, 1.35, 2.8],
  ];
  enginePositions.forEach((position) => {
    const leg = cylinder(0.42, 0.62, 3.8, 0x8b8b7e, position, 8, { metalness: 0.42 });
    leg.rotation.z = position[0] > 0 ? -0.22 : 0.22;
    ship.add(leg);
    const foot = cylinder(1, 1.25, 0.35, palette.graphite, [
      position[0] + (position[0] > 0 ? 0.35 : -0.35),
      0.2,
      position[2],
    ]);
    ship.add(foot);
  });

  const antenna = cylinder(0.08, 0.11, 3.5, 0xd9d5be, [-1.8, 8.8, -0.8], 8, {
    metalness: 0.4,
  });
  ship.add(antenna);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    standardMaterial(0xc9c5ae, { side: THREE.DoubleSide, metalness: 0.35 }),
  );
  dish.position.set(-1.8, 10.45, -0.8);
  dish.rotation.x = -0.55;
  ship.add(dish);

  const beacon = new THREE.PointLight(palette.yellow, 22, 24, 1.8);
  beacon.position.set(3.8, 5.2, 1.8);
  beacon.castShadow = true;
  ship.add(beacon);

  const cargoGlow = new THREE.PointLight(palette.yellow, 12, 16, 2);
  cargoGlow.position.set(6, 2.2, 1.2);
  ship.add(cargoGlow);

  const guideBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 1.7, 24, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: palette.yellow,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  guideBeam.position.set(6, 12.2, 1.2);
  ship.add(guideBeam);

  const guideRings = [7, 12, 17].map((height, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35 + index * 0.22, 0.045, 8, 48),
      new THREE.MeshBasicMaterial({
        color: palette.yellow,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.set(6, height, 1.2);
    ring.rotation.x = Math.PI / 2;
    ship.add(ring);
    return ring;
  });
  ship.userData.guideBeam = guideBeam;
  ship.userData.guideRings = guideRings;

  return ship;
}

function createCargoReceiver() {
  const receiver = new THREE.Group();
  receiver.position.copy(CARGO_RECEIVER_POSITION);
  receiver.rotation.y = SHIP_ROTATION;

  const padMaterial = new THREE.MeshBasicMaterial({
    color: palette.yellow,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pad = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.3, 48), padMaterial);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.08;
  receiver.add(pad);

  const gateMaterial = new THREE.MeshBasicMaterial({
    color: palette.cyan,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const gate = new THREE.Mesh(new THREE.TorusGeometry(2.28, 0.08, 8, 48), gateMaterial);
  gate.position.y = 2.35;
  gate.rotation.y = Math.PI / 2;
  receiver.add(gate);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: palette.cyan,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.3, 4.7, 24, 1, true),
    beamMaterial,
  );
  beam.position.y = 2.4;
  receiver.add(beam);

  const light = new THREE.PointLight(palette.cyan, 5, 10, 2);
  light.position.y = 2.1;
  receiver.add(light);

  receiver.userData.pad = pad;
  receiver.userData.padMaterial = padMaterial;
  receiver.userData.gate = gate;
  receiver.userData.gateMaterial = gateMaterial;
  receiver.userData.beamMaterial = beamMaterial;
  receiver.userData.light = light;
  return receiver;
}

function createRover() {
  const rover = new THREE.Group();
  rover.position.set(-7.5, 0.3, 7.2);
  rover.rotation.y = -0.18;

  const chassis = box([4.25, 0.48, 2.65], 0xd6d1b8, [0, 0.9, 0], {
    metalness: 0.3,
    roughness: 0.58,
  });
  rover.add(chassis);
  rover.add(box([4.4, 0.2, 2.72], palette.yellow, [0, 1.18, 0], {
    metalness: 0.35,
    roughness: 0.42,
  }));
  const roverLabel = createCorporateLabel("FIELD CART", "PROPERTY OF EVERYONE / OWNED BY NO ONE", 2.65, 0.58);
  roverLabel.position.set(0, 0.82, 1.34);
  rover.add(roverLabel);

  const cargoBed = new THREE.Group();
  cargoBed.position.y = 1.32;
  cargoBed.add(box([4.05, 0.16, 2.38], palette.graphite, [0, 0, 0]));
  cargoBed.add(box([0.16, 1.05, 2.38], 0xe4dec5, [-2.02, 0.48, 0]));
  cargoBed.add(box([0.16, 1.05, 2.38], 0xe4dec5, [2.02, 0.48, 0]));
  cargoBed.add(box([4.05, 1.05, 0.16], 0xe4dec5, [0, 0.48, 1.12]));
  cargoBed.add(box([4.05, 0.32, 0.12], palette.yellow, [0, 0.12, -1.12]));
  rover.add(cargoBed);

  const wheels: THREE.Mesh[] = [];
  [-1.45, 1.45].forEach((x) => {
    [-1.25, 1.25].forEach((z) => {
      const wheel = cylinder(0.62, 0.62, 0.48, 0x151824, [x, 0.5, z], 12, {
        roughness: 0.92,
      });
      wheel.rotation.x = Math.PI / 2;
      rover.add(wheel);
      wheels.push(wheel);
    });
  });

  const leftTowBar = cylinder(0.075, 0.1, 2.8, 0xb5b39f, [-0.7, 0.92, -2.28], 8, {
    metalness: 0.65,
    roughness: 0.32,
  });
  leftTowBar.rotation.x = Math.PI / 2.5;
  leftTowBar.rotation.z = -0.19;
  rover.add(leftTowBar);
  const rightTowBar = leftTowBar.clone();
  rightTowBar.position.x = 0.7;
  rightTowBar.rotation.z = 0.19;
  rover.add(rightTowBar);
  const hitch = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.08, 8, 18),
    standardMaterial(palette.yellow, {
      emissive: 0x6b5314,
      emissiveIntensity: 0.75,
      metalness: 0.62,
      roughness: 0.34,
    }),
  );
  hitch.position.set(0, 0.82, -3.45);
  hitch.rotation.x = Math.PI / 2;
  rover.add(hitch);

  const mast = cylinder(0.07, 0.1, 1.35, 0x9c9b8e, [1.72, 2.18, 0.82], 8);
  rover.add(mast);
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.35, 0.35),
    standardMaterial(palette.coral, {
      emissive: palette.red,
      emissiveIntensity: 2.5,
    }),
  );
  light.position.set(1.72, 2.86, 0.82);
  rover.add(light);
  rover.userData.cargoBed = cargoBed;
  rover.userData.wheels = wheels;
  rover.userData.hitch = hitch;
  rover.userData.lastPosition = rover.position.clone();
  return rover;
}

function createAstronaut(suitColor = palette.yellow) {
  const astronaut = new THREE.Group();
  astronaut.position.set(-12, 0, 5);

  const backpack = box([1.35, 2.35, 0.8], 0xd5d0b7, [0, 2.95, 0.72], {
    metalness: 0.15,
  });
  astronaut.add(backpack);

  const torso = cylinder(0.9, 1.05, 2.5, suitColor, [0, 3.05, 0], 10);
  astronaut.add(torso);
  astronaut.add(box([1.82, 0.3, 1.05], 0x202733, [0, 2.55, -0.12]));

  const chestPlate = box([1.28, 0.72, 0.22], 0xefe9cf, [0, 3.25, -0.92]);
  chestPlate.rotation.x = -0.05;
  astronaut.add(chestPlate);

  const suitNumber = box([0.48, 0.28, 0.08], 0x173246, [0, 3.22, -1.08], {
    emissive: 0x0b2633,
    emissiveIntensity: 1,
  });
  astronaut.add(suitNumber);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 16, 12),
    standardMaterial(0xe7e1ca, { metalness: 0.08, roughness: 0.35 }),
  );
  helmet.position.set(0, 4.85, 0);
  helmet.scale.set(1, 0.96, 1);
  helmet.castShadow = true;
  astronaut.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.91, 16, 10, 0.25, Math.PI - 0.5, 0.28, Math.PI * 0.54),
    new THREE.MeshPhysicalMaterial({
      color: 0x173144,
      emissive: 0x071b28,
      emissiveIntensity: 0.8,
      roughness: 0.08,
      metalness: 0.35,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    }),
  );
  visor.position.set(0, 4.91, -0.33);
  visor.rotation.y = Math.PI;
  astronaut.add(visor);

  const helmetLamp = box([0.34, 0.2, 0.2], palette.cyan, [0, 5.78, -0.25], {
    emissive: palette.cyan,
    emissiveIntensity: 2,
  });
  astronaut.add(helmetLamp);

  const leftArm = new THREE.Group();
  leftArm.position.set(-1.05, 3.55, 0);
  leftArm.add(cylinder(0.3, 0.36, 1.65, suitColor, [0, -0.65, 0], 8));
  leftArm.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 6),
      standardMaterial(palette.graphite),
    ),
  );
  leftArm.children[1].position.set(0, -1.5, 0);
  astronaut.add(leftArm);

  const rightArm = leftArm.clone(true);
  rightArm.position.x = 1.05;
  astronaut.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.58, 2.05, 0);
  leftLeg.add(cylinder(0.42, 0.48, 1.7, suitColor, [0, -0.72, 0], 8));
  leftLeg.add(box([0.85, 0.56, 1.15], palette.graphite, [0, -1.65, -0.17]));
  astronaut.add(leftLeg);

  const rightLeg = leftLeg.clone(true);
  rightLeg.position.x = 0.58;
  astronaut.add(rightLeg);

  const drill = new THREE.Group();
  drill.position.set(1.22, 2.7, -0.8);
  drill.rotation.x = Math.PI / 2;
  drill.add(cylinder(0.36, 0.44, 1.6, suitColor, [0, 0, 0], 10));
  drill.add(cylinder(0.26, 0.35, 0.85, palette.graphite, [0, -1.05, 0], 10));
  const bit = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.45, 10),
    standardMaterial(0xb9bcc2, { metalness: 0.75, roughness: 0.28 }),
  );
  bit.position.y = -2.05;
  drill.add(bit);
  const drillLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.5, 0.5),
    standardMaterial(palette.cyan, {
      emissive: palette.cyan,
      emissiveIntensity: 2.6,
    }),
  );
  drillLight.position.set(0.37, 0.2, 0);
  drill.add(drillLight);
  astronaut.add(drill);

  const corer = new THREE.Group();
  corer.position.copy(drill.position);
  corer.rotation.copy(drill.rotation);
  corer.add(cylinder(0.3, 0.4, 1.45, palette.cream, [0, 0, 0], 10, {
    metalness: 0.46,
    roughness: 0.4,
  }));
  corer.add(cylinder(0.18, 0.22, 1.7, palette.yellow, [0, -1.42, 0], 10, {
    emissive: 0x6d5312,
    emissiveIntensity: 0.8,
    metalness: 0.62,
  }));
  corer.add(box([1.2, 0.18, 0.22], palette.graphite, [0, 0.56, 0]));
  const corerHead = cylinder(0.42, 0.42, 0.38, palette.coral, [0, -2.35, 0], 10, {
    emissive: 0x6a281d,
    emissiveIntensity: 0.75,
    metalness: 0.7,
  });
  corer.add(corerHead);
  const corerLight = box([0.2, 0.42, 0.42], palette.yellow, [0.34, 0.1, 0], {
    emissive: palette.yellow,
    emissiveIntensity: 2.8,
  });
  corer.add(corerLight);
  corer.visible = false;
  astronaut.add(corer);

  const siphon = new THREE.Group();
  siphon.position.copy(drill.position);
  siphon.rotation.copy(drill.rotation);
  siphon.add(cylinder(0.48, 0.48, 1.25, 0x9fd8d1, [0, 0.18, 0], 12, {
    emissive: 0x184f56,
    emissiveIntensity: 0.55,
    metalness: 0.38,
    roughness: 0.32,
  }));
  siphon.add(cylinder(0.12, 0.2, 2.15, palette.cyan, [0, -1.45, 0], 10, {
    emissive: 0x195c68,
    emissiveIntensity: 1.1,
    metalness: 0.54,
  }));
  const siphonValve = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.07, 8, 18),
    standardMaterial(palette.coral, {
      emissive: 0x67251b,
      emissiveIntensity: 0.9,
      metalness: 0.58,
    }),
  );
  siphonValve.position.set(0, 0.72, 0);
  siphonValve.rotation.x = Math.PI / 2;
  siphon.add(siphonValve);
  const siphonLight = box([0.2, 0.42, 0.42], palette.cyan, [0.52, 0.15, 0], {
    emissive: palette.cyan,
    emissiveIntensity: 3.2,
  });
  siphon.add(siphonLight);
  siphon.visible = false;
  astronaut.add(siphon);

  const thrusterMaterial = new THREE.MeshBasicMaterial({
    color: palette.cyan,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const thrusterFlames = [-0.42, 0.42].map((x) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.15, 8, 1, true),
      thrusterMaterial.clone(),
    );
    flame.position.set(x, 1.65, 0.88);
    flame.rotation.z = Math.PI;
    flame.scale.setScalar(0.01);
    astronaut.add(flame);
    return flame;
  });
  const thrusterGlow = new THREE.PointLight(palette.cyan, 0, 7, 2);
  thrusterGlow.position.set(0, 1.85, 0.92);
  astronaut.add(thrusterGlow);

  const fieldCaseAnchor = new THREE.Object3D();
  fieldCaseAnchor.position.set(-0.92, 2.08, 0.32);
  fieldCaseAnchor.rotation.set(0.08, -0.22, -0.08);
  astronaut.add(fieldCaseAnchor);

  astronaut.userData.leftArm = leftArm;
  astronaut.userData.rightArm = rightArm;
  astronaut.userData.leftLeg = leftLeg;
  astronaut.userData.rightLeg = rightLeg;
  astronaut.userData.drill = drill;
  astronaut.userData.drillLight = drillLight;
  astronaut.userData.harvestTools = { drill, corer, siphon } satisfies Record<
    HarvestToolId,
    THREE.Group
  >;
  astronaut.userData.harvestToolLights = {
    drill: drillLight,
    corer: corerLight,
    siphon: siphonLight,
  } satisfies Record<HarvestToolId, THREE.Mesh>;
  astronaut.userData.corerHead = corerHead;
  astronaut.userData.siphonValve = siphonValve;
  astronaut.userData.visor = visor;
  astronaut.userData.thrusterFlames = thrusterFlames;
  astronaut.userData.thrusterGlow = thrusterGlow;
  astronaut.userData.fieldCaseAnchor = fieldCaseAnchor;
  return astronaut;
}

function setAstronautHarvestTool(
  astronaut: THREE.Group,
  tool: HarvestToolId,
) {
  const tools = astronaut.userData.harvestTools as Record<
    HarvestToolId,
    THREE.Group
  >;
  Object.entries(tools).forEach(([id, model]) => {
    model.visible = id === tool;
  });
}

function crewHarvestTool(inputMask: number): HarvestToolId {
  if ((inputMask & CREW_INPUT_TOOL_SIPHON) !== 0) return "siphon";
  if ((inputMask & CREW_INPUT_TOOL_CORER) !== 0) return "corer";
  return "drill";
}

function createHarvestMethodMarker(tool: HarvestToolId) {
  const marker = new THREE.Group();
  marker.position.y = 2.25;
  const color =
    tool === "drill" ? palette.coral : tool === "corer" ? palette.yellow : palette.cyan;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  marker.add(halo);

  let glyph: THREE.Mesh;
  if (tool === "drill") {
    glyph = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.62, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    glyph.rotation.z = Math.PI;
  } else if (tool === "corer") {
    glyph = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.58, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
  } else {
    glyph = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.075, 8, 18),
      new THREE.MeshBasicMaterial({ color }),
    );
    glyph.rotation.x = Math.PI / 2;
  }
  marker.add(glyph);
  return marker;
}

function fieldToolCaseColor(tool: HarvestToolId) {
  return tool === "drill"
    ? palette.coral
    : tool === "corer"
      ? palette.yellow
      : palette.cyan;
}

function createFieldToolCase(
  id: string,
  toolId: HarvestToolId,
  position: [number, number, number],
): FieldToolCaseRuntime {
  const color = fieldToolCaseColor(toolId);
  const group = new THREE.Group();
  group.position.fromArray(position);
  group.userData.spin = new THREE.Vector3(2.2, 3.4, 1.4);

  const body = box([1.45, 0.72, 1.02], 0xe7dfc8, [0, 0, 0], {
    roughness: 0.62,
    metalness: 0.24,
  });
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  group.add(box([1.52, 0.14, 1.08], color, [0, 0.12, 0], {
    emissive: color,
    emissiveIntensity: 0.65,
    metalness: 0.42,
  }));
  group.add(box([0.62, 0.16, 0.16], 0x272a31, [0, 0.48, 0], {
    metalness: 0.72,
    roughness: 0.36,
  }));
  [-0.52, 0.52].forEach((x) => {
    group.add(box([0.18, 0.2, 0.12], 0x30333a, [x, 0.42, -0.5], {
      metalness: 0.72,
      roughness: 0.32,
    }));
  });
  const badge = createBillboardLabel(
    harvestToolData[toolId].shortName,
    "SPECIALIST CASE",
    color,
    [2.75, 0.78],
  );
  badge.position.set(0, 1.45, 0);
  group.add(badge);
  group.userData.badge = badge;
  const beacon = new THREE.PointLight(color, 4.8, 7, 2);
  beacon.position.set(0, 1.05, 0);
  group.add(beacon);

  return {
    id,
    toolId,
    position,
    velocity: [0, 0, 0],
    ownerId: null,
    isBallistic: false,
    bounceCount: 0,
    group,
    beacon,
  };
}

function createDeposit(
  definition: DepositDefinition,
): DepositRuntime {
  const data = cargoData[definition.kind];
  const cargoTexture = createCargoTexture(definition.kind);
  const group = new THREE.Group();
  group.position.set(definition.position[0], 0.25, definition.position[1]);
  group.visible = false;

  const shell = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.25, 0),
    standardMaterial(0x2a2d39, { roughness: 0.94 }),
  );
  shell.scale.y = 0.68;
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  let core: THREE.Object3D;
  if (definition.kind === "vial") {
    const vial = new THREE.Group();
    const glassBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.56, 1.7, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0xc8fff4,
        emissive: data.emissive,
        emissiveIntensity: 0.7,
        metalness: 0.05,
        roughness: 0.18,
        transparent: true,
        opacity: 0.62,
      }),
    );
    const specimen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 1.25, 12),
      standardMaterial(data.color, {
        emissive: data.emissive,
        emissiveIntensity: 2.1,
        roughness: 0.28,
      }),
    );
    const capMaterial = standardMaterial(palette.cream, {
      metalness: 0.72,
      roughness: 0.3,
    });
    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.64, 0.25, 12),
      capMaterial,
    );
    topCap.position.y = 0.92;
    const bottomCap = topCap.clone();
    bottomCap.position.y = -0.92;
    vial.add(glassBody, specimen, topCap, bottomCap);
    vial.rotation.z = 0.12;
    core = vial;
  } else if (definition.kind === "helium") {
    const canister = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 1.82, 12),
      standardMaterial(data.color, {
        map: cargoTexture,
        emissive: data.emissive,
        emissiveIntensity: 0.72,
        metalness: 0.62,
        roughness: 0.3,
      }),
    );
    const capMaterial = standardMaterial(palette.graphite, {
      metalness: 0.78,
      roughness: 0.27,
    });
    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 0.24, 12),
      capMaterial,
    );
    topCap.position.y = 1.02;
    const bottomCap = topCap.clone();
    bottomCap.position.y = -1.02;
    const valve = cylinder(0.18, 0.28, 0.4, palette.coral, [0, 1.3, 0], 8, {
      emissive: palette.coral,
      emissiveIntensity: 1.3,
      metalness: 0.66,
    });
    const bumper = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.09, 8, 20),
      standardMaterial(palette.cream, { metalness: 0.58, roughness: 0.34 }),
    );
    bumper.rotation.x = Math.PI / 2;
    const lowerBumper = bumper.clone();
    bumper.position.y = 0.62;
    lowerBumper.position.y = -0.62;
    canister.add(body, topCap, bottomCap, valve, bumper, lowerBumper);
    canister.rotation.z = -0.14;
    core = canister;
  } else if (definition.kind === "flux_core") {
    const fluxCore = new THREE.Group();
    const reactor = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.68, 1),
      new THREE.MeshPhysicalMaterial({
        color: data.color,
        emissive: data.emissive,
        emissiveIntensity: 3.4,
        metalness: 0.48,
        roughness: 0.2,
        clearcoat: 0.72,
        clearcoatRoughness: 0.16,
      }),
    );
    const cage = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.08, 0),
      new THREE.MeshBasicMaterial({
        color: palette.cream,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
      }),
    );
    const gyroMaterial = standardMaterial(palette.coral, {
      emissive: data.emissive,
      emissiveIntensity: 2.4,
      metalness: 0.76,
      roughness: 0.22,
    });
    const gyroA = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.085, 8, 28),
      gyroMaterial,
    );
    gyroA.rotation.x = Math.PI / 2;
    const gyroB = gyroA.clone();
    gyroB.rotation.set(Math.PI / 3, Math.PI / 2, 0);
    const gyroC = gyroA.clone();
    gyroC.rotation.set(-Math.PI / 3, Math.PI / 2, 0);
    fluxCore.add(reactor, cage, gyroA, gyroB, gyroC);
    fluxCore.rotation.set(0.18, 0.3, -0.12);
    core = fluxCore;
  } else if (definition.kind === "fossil") {
    const fossil = new THREE.Group();
    const tablet = new THREE.Mesh(
      new THREE.CylinderGeometry(1.04, 1.12, 0.42, 11),
      standardMaterial(data.color, {
        map: cargoTexture,
        emissive: data.emissive,
        emissiveIntensity: 0.46,
        roughness: 0.92,
      }),
    );
    tablet.rotation.x = Math.PI / 2;
    tablet.scale.y = 0.82;
    const archiveBand = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.055, 7, 24),
      standardMaterial(palette.cyan, {
        emissive: palette.cyan,
        emissiveIntensity: 1.8,
        metalness: 0.35,
        roughness: 0.4,
      }),
    );
    archiveBand.position.z = 0.23;
    fossil.add(tablet, archiveBand);
    fossil.rotation.y = 0.16;
    core = fossil;
  } else {
    const coreGeometry =
      definition.kind === "glass"
        ? new THREE.OctahedronGeometry(1.15, 0)
        : new THREE.DodecahedronGeometry(
            definition.kind === "platinum" ? 1.42 : 1.05,
            0,
          );
    core = new THREE.Mesh(
      coreGeometry,
      standardMaterial(data.color, {
        map: cargoTexture,
        emissive: data.emissive,
        emissiveIntensity: definition.kind === "glass" ? 1.7 : 0.85,
        metalness: definition.kind === "platinum" ? 0.78 : 0.2,
        roughness: definition.kind === "platinum" ? 0.26 : 0.48,
      }),
    );
  }
  core.visible = false;
  core.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.85, 0.035, 8, 40),
    new THREE.MeshBasicMaterial({
      color: palette.cyan,
      transparent: true,
      opacity: 0.72,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);

  const methodMarker = createHarvestMethodMarker(
    requiredHarvestTool(definition.kind),
  );
  group.add(methodMarker);

  const shards = new THREE.Group();
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    const fragment = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.16 + (index % 3) * 0.055, 0),
      standardMaterial(index % 2 === 0 ? data.color : 0xc8fff4, {
        emissive: data.emissive,
        emissiveIntensity: 0.9,
        roughness: 0.34,
      }),
    );
    fragment.position.set(
      Math.cos(angle) * (0.35 + (index % 2) * 0.28),
      0.08 + (index % 3) * 0.12,
      Math.sin(angle) * (0.35 + (index % 2) * 0.28),
    );
    fragment.rotation.set(angle * 0.7, angle, angle * 0.35);
    fragment.castShadow = true;
    shards.add(fragment);
  }
  shards.visible = false;
  group.add(shards);

  const beacon = new THREE.PointLight(data.color, 0, 8, 2);
  beacon.position.y = 1.4;
  group.add(beacon);

  return {
    id: definition.id,
    kind: definition.kind,
    position: group.position,
    state: "hidden",
    progress: 0,
    condition: 1,
    velocity: new THREE.Vector3(),
    isBallistic: false,
    bounceCount: 0,
    ownerId: null,
    tetherOwnerIds: [],
    group,
    shell,
    core,
    ring,
    methodMarker,
    shards,
    beacon,
    harvestPulse: 0,
  };
}

function createMoonSurface() {
  const random = seededRandom(9274);
  const geometry = new THREE.CircleGeometry(MOON_RADIUS, 96);
  const position = geometry.attributes.position;
  for (let index = 1; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const ridge = Math.sin(x * 0.19) * 0.18 + Math.cos(y * 0.23) * 0.16;
    position.setZ(index, ridge + (random() - 0.5) * 0.28);
  }
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(
    geometry,
    standardMaterial(palette.lunar, {
      map: createMoonTexture(),
      roughness: 1,
      metalness: 0,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  return surface;
}

function createRustSurface() {
  const random = seededRandom(61403);
  const geometry = new THREE.CircleGeometry(MOON_RADIUS, 96);
  const position = geometry.attributes.position;
  for (let index = 1; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const plate = Math.sin(x * 0.32) * 0.24 + Math.cos(y * 0.27) * 0.22;
    const seam = Math.sin((x + y) * 0.61) * 0.12;
    position.setZ(index, plate + seam + (random() - 0.5) * 0.38);
  }
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(
    geometry,
    standardMaterial(0x67443a, {
      map: createRustTexture(),
      roughness: 0.82,
      metalness: 0.34,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  return surface;
}

function createRustBeltScenery() {
  const scenery = new THREE.Group();
  const random = seededRandom(22062);
  for (let index = 0; index < 46; index += 1) {
    const angle = (index / 46) * Math.PI * 2 + (random() - 0.5) * 0.14;
    const distance = 41 + random() * 6;
    const size = 1.8 + random() * 5.8;
    const ridge = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      standardMaterial(index % 5 === 0 ? 0x7c4938 : 0x4d3434, {
        color: index % 7 === 0 ? 0x86513c : undefined,
        roughness: 0.88,
        metalness: 0.28,
      }),
    );
    ridge.position.set(
      Math.cos(angle) * distance,
      size * (0.45 + random() * 0.35) - 0.4,
      Math.sin(angle) * distance,
    );
    ridge.scale.set(0.65 + random(), 0.8 + random() * 1.7, 0.65 + random());
    ridge.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    ridge.castShadow = true;
    ridge.receiveShadow = true;
    scenery.add(ridge);
  }

  const trussMaterial = standardMaterial(0x9a785e, {
    metalness: 0.72,
    roughness: 0.42,
  });
  [-1, 1].forEach((side) => {
    const tower = new THREE.Group();
    tower.position.set(side * 27, 0, side * -15);
    tower.rotation.z = side * 0.14;
    for (let level = 0; level < 4; level += 1) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.4, 0.22), trussMaterial);
      beam.position.set(side * 0.72, 2.6 + level * 3.6, 0);
      beam.rotation.z = side * (level % 2 === 0 ? 0.22 : -0.22);
      beam.castShadow = true;
      tower.add(beam);
    }
    const warning = new THREE.PointLight(palette.coral, 8, 16, 2);
    warning.position.set(0, 15.8, 0);
    tower.add(warning);
    scenery.add(tower);
  });
  return scenery;
}

function createFloatingRustDebris() {
  const debris = new THREE.Group();
  const random = seededRandom(8871);
  for (let index = 0; index < 28; index += 1) {
    const shape = index % 4 === 0
      ? new THREE.BoxGeometry(0.8 + random() * 1.8, 0.18 + random() * 0.38, 0.6 + random() * 2.4)
      : new THREE.DodecahedronGeometry(0.3 + random() * 1.25, 0);
    const scrap = new THREE.Mesh(
      shape,
      standardMaterial(index % 3 === 0 ? 0xa65c3d : 0x5a4644, {
        metalness: 0.58,
        roughness: 0.56,
      }),
    );
    const angle = random() * Math.PI * 2;
    const radius = 13 + random() * 50;
    scrap.position.set(Math.cos(angle) * radius, 7 + random() * 25, Math.sin(angle) * radius);
    scrap.rotation.set(random() * 4, random() * 4, random() * 4);
    scrap.userData.spin = new THREE.Vector3(
      (random() - 0.5) * 0.36,
      (random() - 0.5) * 0.42,
      (random() - 0.5) * 0.32,
    );
    debris.add(scrap);
  }
  return debris;
}

function createMagneticField() {
  const field = new THREE.Group();
  field.position.set(7, 0.18, -7);
  const arcs: THREE.Mesh[] = [];
  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: index % 2 === 0 ? palette.coral : palette.yellow,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(4.4 + index * 1.45, 0.035 + index * 0.008, 6, 72),
      material,
    );
    arc.rotation.set(Math.PI / 2 + index * 0.18, index * 0.37, index * 0.22);
    arc.userData.baseOpacity = 0.05 + index * 0.018;
    field.add(arc);
    arcs.push(arc);
  }
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.05, 1),
    standardMaterial(0x2e2429, {
      emissive: 0xb43e24,
      emissiveIntensity: 1.4,
      metalness: 0.82,
      roughness: 0.3,
    }),
  );
  core.position.y = 0.9;
  field.add(core);
  const light = new THREE.PointLight(palette.coral, 2, 24, 2);
  light.position.y = 2;
  field.add(light);
  field.userData.arcs = arcs;
  field.userData.core = core;
  field.userData.light = light;
  field.userData.active = false;
  field.userData.warning = false;
  return field;
}

function createRustProcessingStation() {
  const station = new THREE.Group();
  station.position.set(18, 0, -12);
  station.rotation.y = -0.22;

  const fadedCream = 0xbab29a;
  const oxidizedSteel = 0x60433b;
  const darkSteel = 0x26252a;
  const structure = new THREE.Group();
  structure.add(box([11.5, 0.42, 7.8], darkSteel, [0, 0.18, 0], {
    metalness: 0.62,
    roughness: 0.68,
  }));
  structure.add(box([9.4, 3.8, 5.8], fadedCream, [0.8, 2.15, 0.5], {
    metalness: 0.36,
    roughness: 0.82,
  }));
  structure.add(box([9.65, 0.56, 6.02], 0xb65d3e, [0.8, 2.8, 0.5], {
    metalness: 0.42,
    roughness: 0.76,
  }));
  structure.add(box([4.4, 1.9, 0.38], darkSteel, [0.8, 1.18, -2.47], {
    metalness: 0.68,
    roughness: 0.48,
  }));
  const label = createCorporateLabel(
    "POLARITY ANNEX 6",
    "FEDERAL SURPLUS · INSPECTION OVERDUE 14 YEARS",
    4.4,
    0.82,
  );
  label.position.set(0.8, 3.55, -2.52);
  structure.add(label);

  const vaultDoor = box([3.55, 2.8, 0.48], 0x4c4c49, [0.8, 1.52, -2.7], {
    metalness: 0.76,
    roughness: 0.5,
  });
  vaultDoor.userData.closedY = 1.52;
  vaultDoor.userData.openY = 4.62;
  structure.add(vaultDoor);
  const vaultWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.09, 8, 22),
    standardMaterial(0xa4a092, { metalness: 0.78, roughness: 0.38 }),
  );
  vaultWheel.position.set(0.8, 1.52, -3.02);
  structure.add(vaultWheel);
  const vaultLight = new THREE.PointLight(palette.coral, 7, 12, 2);
  vaultLight.position.set(0.8, 3.05, -3.25);
  structure.add(vaultLight);

  const rail = new THREE.Group();
  rail.position.set(-6.2, 0.35, 0.2);
  rail.rotation.y = 0.2;
  const leftRail = box([7.8, 0.18, 0.2], oxidizedSteel, [0, 0.45, -0.72], {
    metalness: 0.82,
    roughness: 0.44,
  });
  const rightRail = leftRail.clone();
  rightRail.position.z = 0.72;
  rail.add(leftRail, rightRail);
  const railCoils: THREE.Mesh[] = [];
  for (let index = 0; index < 6; index += 1) {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.07, 8, 22),
      standardMaterial(index % 2 === 0 ? 0xa75438 : 0x7c6d5e, {
        emissive: 0x4a1915,
        emissiveIntensity: 0.3,
        metalness: 0.72,
        roughness: 0.5,
      }),
    );
    coil.position.set(-3.2 + index * 1.3, 1.05, 0);
    coil.rotation.y = Math.PI / 2;
    rail.add(coil);
    railCoils.push(coil);
  }
  const intakePoint = new THREE.Object3D();
  intakePoint.position.set(-3.8, 0.85, 0);
  rail.add(intakePoint);
  const exitPoint = new THREE.Object3D();
  exitPoint.position.set(4.1, 1.25, 0);
  rail.add(exitPoint);
  const railLabel = createCorporateLabel("MAG-RAIL", "KEEP LIMBS / LUNCH / CLIPBOARDS CLEAR", 2.7, 0.6);
  railLabel.position.set(-0.2, 0.25, -1.05);
  railLabel.rotation.x = -0.18;
  rail.add(railLabel);
  station.add(structure, rail);

  const relayOffsets: Array<[number, number, number]> = [
    [-5.2, 0, -4.3],
    [5.7, 0, -3.8],
    [4.8, 0, 4.4],
  ];
  const relays = relayOffsets.map((offset, index) => {
    const relay = new THREE.Group();
    relay.position.set(...offset);
    relay.add(cylinder(0.72, 0.92, 1.5, darkSteel, [0, 0.75, 0], 10, {
      metalness: 0.7,
      roughness: 0.54,
    }));
    relay.add(cylinder(0.42, 0.52, 1.05, oxidizedSteel, [0, 1.8, 0], 10, {
      metalness: 0.66,
      roughness: 0.62,
    }));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.08, 8, 28),
      new THREE.MeshBasicMaterial({
        color: RUST_RELAY_REQUIREMENTS[index] === "attract" ? palette.cyan : palette.coral,
        transparent: true,
        opacity: 0.38,
      }),
    );
    ring.position.y = 2.32;
    ring.rotation.x = Math.PI / 2;
    relay.add(ring);
    const light = new THREE.PointLight(
      RUST_RELAY_REQUIREMENTS[index] === "attract" ? palette.cyan : palette.coral,
      2,
      8,
      2,
    );
    light.position.y = 2.4;
    relay.add(light);
    relay.userData.ring = ring;
    relay.userData.light = light;
    relay.userData.requirement = RUST_RELAY_REQUIREMENTS[index];
    relay.userData.index = index;
    station.add(relay);
    return relay;
  });

  station.userData.relays = relays;
  station.userData.vaultDoor = vaultDoor;
  station.userData.vaultWheel = vaultWheel;
  station.userData.vaultLight = vaultLight;
  station.userData.railCoils = railCoils;
  station.userData.intakePoint = intakePoint;
  station.userData.exitPoint = exitPoint;
  station.userData.relayMask = 0;
  station.userData.vaultOpen = false;
  station.userData.railPulse = 0;
  return station;
}

function createStars() {
  const random = seededRandom(66);
  const positions = new Float32Array(900 * 3);
  for (let index = 0; index < 900; index += 1) {
    const radius = 90 + random() * 100;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = Math.abs(radius * Math.cos(phi)) + 8;
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xeef2e4,
      size: 0.18,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
    }),
  );
}

function createDust() {
  const random = seededRandom(221);
  const positions = new Float32Array(260 * 3);
  for (let index = 0; index < 260; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 5 + random() * 43;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0.05 + random() * 0.18;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xd1d0c8,
      size: 0.08,
      transparent: true,
      opacity: 0.42,
    }),
  );
}

function createHorizonRidges() {
  const ridges = new THREE.Group();
  const random = seededRandom(441);
  for (let index = 0; index < 34; index += 1) {
    const angle = (index / 34) * Math.PI * 2 + (random() - 0.5) * 0.08;
    const distance = 43.5 + random() * 3.2;
    const width = 2.4 + random() * 4.8;
    const height = 2.8 + random() * 8.5;
    const ridge = new THREE.Mesh(
      new THREE.ConeGeometry(width, height, 5 + Math.floor(random() * 3)),
      standardMaterial(index % 4 === 0 ? 0x30333f : 0x3b3e4a, {
        roughness: 1,
      }),
    );
    ridge.position.set(
      Math.cos(angle) * distance,
      height * 0.46 - 0.25,
      Math.sin(angle) * distance,
    );
    ridge.rotation.y = random() * Math.PI;
    ridge.scale.z = 0.68 + random() * 0.72;
    ridge.castShadow = true;
    ridge.receiveShadow = true;
    ridges.add(ridge);
  }
  return ridges;
}

function createMeteorStreaks() {
  const streaks = new THREE.Group();
  const random = seededRandom(704);
  for (let index = 0; index < 7; index += 1) {
    const length = 5 + random() * 8;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-length, length * 0.28, length * 0.16),
    ]);
    const streak = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: index % 3 === 0 ? palette.cyan : 0xecebdc,
        transparent: true,
        opacity: 0.22 + random() * 0.32,
        blending: THREE.AdditiveBlending,
      }),
    );
    streak.position.set(-80 + random() * 130, 24 + random() * 46, -35 - random() * 95);
    streak.userData.speed = 4 + random() * 8;
    streaks.add(streak);
  }
  return streaks;
}

function createMeteorHazards(parent: THREE.Object3D) {
  return Array.from({ length: 4 }, () => {
    const group = new THREE.Group();
    group.visible = false;

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: palette.red,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(1.45, 1.82, 36),
      markerMaterial,
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.1;
    group.add(marker);

    const crossMaterial = markerMaterial;
    const crossA = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.08),
      crossMaterial,
    );
    crossA.rotation.x = -Math.PI / 2;
    crossA.position.y = 0.105;
    group.add(crossA);
    const crossB = crossA.clone();
    crossB.rotation.z = Math.PI / 2;
    group.add(crossB);

    const meteor = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.82, 0),
      standardMaterial(0x40352f, {
        emissive: palette.coral,
        emissiveIntensity: 1.7,
        roughness: 0.82,
      }),
    );
    meteor.castShadow = true;
    meteor.visible = false;
    group.add(meteor);

    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 6.8, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: palette.coral,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    trail.position.y = 3.7;
    meteor.add(trail);

    const light = new THREE.PointLight(palette.coral, 0, 12, 2);
    light.position.y = 1;
    group.add(light);

    parent.add(group);
    return {
      group,
      marker,
      markerMaterial,
      meteor,
      trail,
      light,
      state: "idle" as MeteorState,
      timer: 0,
      impactAge: 0,
    } satisfies MeteorRuntime;
  });
}

function createPressureVents() {
  const positions: Array<[number, number]> = [
    [-8, 23],
    [31, -21],
  ];
  return positions.map(([x, z], index) => {
    const vent = new THREE.Group();
    vent.position.set(x, 0.08, z);

    const base = cylinder(1.35, 1.6, 0.42, palette.graphite, [0, 0.2, 0], 12, {
      metalness: 0.34,
      roughness: 0.7,
    });
    vent.add(base);
    const nozzle = cylinder(0.5, 0.78, 0.72, 0x6d706f, [0, 0.68, 0], 10, {
      metalness: 0.46,
    });
    vent.add(nozzle);

    const warningRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.065, 8, 48),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    warningRing.rotation.x = Math.PI / 2;
    warningRing.position.y = 0.08;
    vent.add(warningRing);

    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 7.5, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    plume.position.y = 4.35;
    plume.scale.set(0.08, 0.08, 0.08);
    vent.add(plume);

    const light = new THREE.PointLight(palette.cyan, 0.8, 9, 2);
    light.position.y = 1.2;
    vent.add(light);

    vent.userData.offset = index * 2.7;
    vent.userData.erupting = false;
    vent.userData.warning = false;
    vent.userData.lastLaunchCycle = -1;
    vent.userData.warningRing = warningRing;
    vent.userData.plume = plume;
    vent.userData.light = light;
    return vent;
  });
}

function createCrater(x: number, z: number, radius: number) {
  const crater = new THREE.Group();
  crater.position.set(x, 0.03, z);
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.78, 30),
    standardMaterial(palette.lunarDark, { roughness: 1 }),
  );
  center.rotation.x = -Math.PI / 2;
  crater.add(center);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.11, 6, 30),
    standardMaterial(0x626573, { roughness: 1 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.scale.y = 0.42;
  crater.add(rim);
  return crater;
}

function createWorld(scene: THREE.Scene, destinationId: DestinationId) {
  const root = new THREE.Group();
  root.name = `destination-${destinationId}`;
  scene.add(root);
  root.add(destinationId === "rust_belt" ? createRustSurface() : createMoonSurface());
  root.add(createStars());
  root.add(destinationId === "rust_belt" ? createRustBeltScenery() : createHorizonRidges());
  const dust = createDust();
  if (destinationId === "rust_belt") {
    (dust.material as THREE.PointsMaterial).color.setHex(0xd88d67);
    (dust.material as THREE.PointsMaterial).opacity = 0.3;
  }
  root.add(dust);
  if (destinationId === "practice_moon") {
    root.add(createCrater(-6, -2, 4.5));
    root.add(createCrater(13, -15, 5.8));
    root.add(createCrater(22, 13, 4));
    root.add(createCrater(-28, -14, 6.2));
  } else {
    root.add(createCrater(-5, -3, 3.4));
    root.add(createCrater(19, -18, 4.7));
  }

  const random = seededRandom(982);
  for (let index = 0; index < 82; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 7 + random() * 38;
    const size = 0.12 + random() * 0.66;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      standardMaterial(
        destinationId === "rust_belt"
          ? index % 5 === 0
            ? 0x9a5337
            : 0x5f403a
          : index % 5 === 0
            ? 0x343744
            : 0x555864,
        {
          roughness: destinationId === "rust_belt" ? 0.78 : 1,
          metalness: destinationId === "rust_belt" ? 0.32 : 0,
        },
      ),
    );
    rock.position.set(Math.cos(angle) * radius, size * 0.42, Math.sin(angle) * radius);
    rock.rotation.set(random() * 2, random() * 2, random() * 2);
    rock.scale.y = 0.65 + random() * 0.5;
    rock.castShadow = true;
    rock.receiveShadow = true;
    root.add(rock);
  }

  const ship = createShip();
  const cargoReceiver = createCargoReceiver();
  const rover = createRover();
  const meteorStreaks = createMeteorStreaks();
  const meteorHazards = createMeteorHazards(root);
  const pressureVents = destinationId === "practice_moon" ? createPressureVents() : [];
  const floatingDebris = destinationId === "rust_belt" ? createFloatingRustDebris() : new THREE.Group();
  const magneticField = destinationId === "rust_belt" ? createMagneticField() : new THREE.Group();
  const processingStation = destinationId === "rust_belt"
    ? createRustProcessingStation()
    : new THREE.Group();
  root.add(ship);
  root.add(cargoReceiver);
  root.add(rover);
  root.add(meteorStreaks);
  root.add(floatingDebris);
  root.add(magneticField);
  root.add(processingStation);
  pressureVents.forEach((vent) => root.add(vent));

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(7, 28, 20),
    standardMaterial(destinationId === "rust_belt" ? 0x6f2b28 : 0x315c83, {
      emissive: destinationId === "rust_belt" ? 0x3f1217 : 0x102a45,
      emissiveIntensity: destinationId === "rust_belt" ? 1.15 : 0.75,
      roughness: 0.86,
    }),
  );
  earth.scale.setScalar(destinationId === "rust_belt" ? 1.7 : 1);
  earth.position.set(62, destinationId === "rust_belt" ? 42 : 48, -92);
  root.add(earth);

  const earthCloud = new THREE.Mesh(
    new THREE.SphereGeometry(7.08, 22, 16),
    new THREE.MeshBasicMaterial({
      color: destinationId === "rust_belt" ? 0xff9b68 : 0xa8d9dc,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
    }),
  );
  earthCloud.position.copy(earth.position);
  earthCloud.scale.copy(earth.scale);
  root.add(earthCloud);

  return {
    root,
    destinationId,
    gravity: DESTINATIONS[destinationId].gravity,
    ship,
    cargoReceiver,
    rover,
    earth,
    earthCloud,
    meteorStreaks,
    meteorHazards,
    pressureVents,
    floatingDebris,
    magneticField,
    processingStation,
  };
}

export function MoonGoonsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const ambienceRef = useRef<AudioContext | null>(null);
  const pointerTargetRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef(new Set<string>());
  const phaseRef = useRef<Phase>("briefing");
  const missionSeedRef = useRef(INITIAL_MISSION_SEED);
  const activeContractIdRef = useRef<ContractId>("standard_procurement");
  const activeDestinationRef = useRef<DestinationId>("practice_moon");
  const missionRunIdRef = useRef(0);
  const settledRunIdRef = useRef(-1);
  const timeRef = useRef(MISSION_SECONDS);
  const scoreRef = useRef(0);
  const heatRef = useRef(0);
  const overheatedRef = useRef(false);
  const drillWearRef = useRef(0);
  const drillJammedRef = useRef(false);
  const activeHarvestToolRef = useRef<HarvestToolId>("drill");
  const corerCycleRef = useRef(0);
  const siphonSealRef = useRef(0);
  const repairProgressRef = useRef(0);
  const repairsCompletedRef = useRef(0);
  const airmailDeliveriesRef = useRef(0);
  const bankShotDeliveriesRef = useRef(0);
  const stuntBonusRef = useRef(0);
  const cargoBouncesRef = useRef(0);
  const brokenSamplesRef = useRef(0);
  const suitIntegrityRef = useRef(100);
  const downedRef = useRef(false);
  const recoveryProgressRef = useRef(0);
  const suitRecoveriesRef = useRef(0);
  const scanCooldownRef = useRef(0);
  const magnetCooldownRef = useRef(0);
  const polarityModeRef = useRef<MagneticPolarity>("attract");
  const stabilizerChargesRef = useRef(2);
  const messageRef = useRef(INITIAL_MESSAGE);
  const carryingRef = useRef<number | null>(null);
  const interactLatchRef = useRef(false);
  const scanLatchRef = useRef(false);
  const magnetLatchRef = useRef(false);
  const stabilizerLatchRef = useRef(false);
  const repairLatchRef = useRef(false);
  const tutorialMovedRef = useRef(false);
  const tutorialScannedRef = useRef(false);
  const tutorialDrilledRef = useRef(false);
  const tutorialCarriedRef = useRef(false);
  const notesOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const mouseCapturedRef = useRef(false);
  const resetRuntimeRef = useRef<(() => void) | null>(null);
  const crewSessionRef = useRef<CrewSession | null>(null);
  const crewRoomRef = useRef<CrewRoomSnapshot | null>(null);
  const localPresenceRef = useRef<CrewLocalPresence>({
    x: -12,
    y: 0,
    z: 5,
    yaw: 0,
    inputMask: 0,
  });
  const outgoingCrewActionsRef = useRef<Array<{
    sequence: number;
    type: CrewActionType;
  }>>([]);
  const crewActionSequenceRef = useRef(0);
  const authoritativeStateRef = useRef<CrewMissionState | null>(null);
  const incomingAuthorityRef = useRef<{
    revision: number;
    state: CrewMissionState;
  } | null>(null);
  const networkMissionStartRef = useRef<number | null>(null);
  const processedAuthorityRevisionRef = useRef(0);
  const processedCrewActionRef = useRef(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlSettings, setControlSettings] = useState<ControlSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_CONTROL_SETTINGS;

    try {
      const stored = window.localStorage.getItem(CONTROL_SETTINGS_KEY);
      const parsed = stored ? (JSON.parse(stored) as Partial<ControlSettings>) : null;
      return normalizeControlSettings(parsed);
    } catch {
      return DEFAULT_CONTROL_SETTINGS;
    }
  });
  const controlSettingsRef = useRef<ControlSettings>(controlSettings);
  const [mouseCaptured, setMouseCaptured] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);
  const [mouseLockIssue, setMouseLockIssue] = useState<MouseLockIssue>(null);
  const [crewSession, setCrewSession] = useState<CrewSession | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem(CREW_SESSION_KEY);
      return saved ? (JSON.parse(saved) as CrewSession) : null;
    } catch {
      return null;
    }
  });
  const [crewRoom, setCrewRoom] = useState<CrewRoomSnapshot | null>(null);
  const [crewBusy, setCrewBusy] = useState(false);
  const [crewError, setCrewError] = useState<string | null>(null);
  const [crewLatency, setCrewLatency] = useState<number | null>(null);
  const [crewNetworkTuning, setCrewNetworkTuning] = useState<CrewNetworkTuning>(
    DEFAULT_CREW_NETWORK_TUNING,
  );
  const [progression, setProgression] = useState<ProgressionSave>(() => {
    if (typeof window === "undefined") return DEFAULT_PROGRESSION;
    try {
      const stored = window.localStorage.getItem(PROGRESSION_KEY);
      return normalizeProgressionSave(stored ? JSON.parse(stored) : null);
    } catch {
      return DEFAULT_PROGRESSION;
    }
  });
  const progressionRef = useRef<ProgressionSave>(progression);
  const [hubTerminalOpen, setHubTerminalOpen] = useState(false);
  const [hubStation, setHubStation] = useState<HubStationId>("contracts");
  const [selectedContractId, setSelectedContractId] = useState<ContractId>(
    "standard_procurement",
  );
  const [lastSettlement, setLastSettlement] = useState<{
    grossCreditsEarned: number;
    repairCreditsCharged: number;
    creditsEarned: number;
    researchEarned: number;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    phase: "briefing",
    time: MISSION_SECONDS,
    score: 0,
    heat: 0,
    overheated: false,
    drillWear: 0,
    drillJammed: false,
    activeHarvestTool: "drill",
    specialistCase: null,
    nearbyFieldCase: null,
    harvestMeter: 0,
    repairProgress: 0,
    repairsCompleted: 0,
    airmailDeliveries: 0,
    bankShotDeliveries: 0,
    stuntBonus: 0,
    cargoBounces: 0,
    brokenSamples: 0,
    missionSeed: INITIAL_MISSION_SEED,
    suitIntegrity: 100,
    downed: false,
    recoveryProgress: 0,
    suitRecoveries: 0,
    carrying: null,
    cargoCondition: null,
    cargoStructure: null,
    throwRisk: null,
    throwDistance: null,
    message: INITIAL_MESSAGE,
    scanCooldown: 0,
    magnetCooldown: 0,
    polarityMode: "attract",
    facilityRelays: 0,
    facilityVaultOpen: false,
    stabilizerCharges: 2,
    cartCargoCount: 0,
    cartCapacity: CART_CAPACITY,
    cartHitched: false,
    cartDistance: 10,
    depositsSecured: 0,
    prompt: "Q · SCAN FOR VALUABLE MATERIAL",
    homeDistance: 7,
    thrusterFuel: 100,
    signalsTracked: 0,
    nearestSignalDistance: null,
    nearestSignalBearing: null,
    nearestSignalName: null,
    nearestSignalTool: null,
    tetheredCargo: null,
    tetherDistance: null,
    tetherTeamLift: false,
    contractId: "standard_procurement",
    contractTarget: CONTRACTS.standard_procurement.target,
    thrusterCapacity: 100,
    tutorialMoved: false,
    tutorialScanned: false,
    tutorialDrilled: false,
    tutorialCarried: false,
  });

  useEffect(() => {
    progressionRef.current = progression;
    try {
      window.localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progression));
    } catch {
      // Career progress remains available for this session when storage is unavailable.
    }
  }, [progression]);

  const buyUpgrade = useCallback((upgradeId: UpgradeId) => {
    setProgression((current) => purchaseUpgrade(current, upgradeId));
  }, []);

  const toggleUpgrade = useCallback((upgradeId: UpgradeId) => {
    setProgression((current) => toggleEquippedUpgrade(current, upgradeId));
  }, []);

  const updateControlSettings = useCallback((nextSettings: ControlSettings) => {
    const normalized = normalizeControlSettings(nextSettings);
    controlSettingsRef.current = normalized;
    setControlSettings(normalized);
    window.dispatchEvent(new Event("resize"));
    try {
      window.localStorage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(normalized));
    } catch {
      // Preferences still apply for this session when storage is unavailable.
    }
  }, []);

  const queueCrewAction = useCallback((type: CrewActionType) => {
    if (crewSessionRef.current?.role !== "guest") return;
    crewActionSequenceRef.current += 1;
    outgoingCrewActionsRef.current = enqueueCrewAction(
      outgoingCrewActionsRef.current,
      { sequence: crewActionSequenceRef.current, type },
    );
  }, []);

  const clearCrewSession = useCallback((reason?: string) => {
    crewSessionRef.current = null;
    crewRoomRef.current = null;
    setCrewSession(null);
    setCrewRoom(null);
    setCrewLatency(null);
    outgoingCrewActionsRef.current = [];
    authoritativeStateRef.current = null;
    incomingAuthorityRef.current = null;
    networkMissionStartRef.current = null;
    processedAuthorityRevisionRef.current = 0;
    processedCrewActionRef.current = 0;
    try {
      window.localStorage.removeItem(CREW_SESSION_KEY);
    } catch {
      // A temporary room still closes locally when storage is unavailable.
    }
    if (reason) setCrewError(reason);
  }, []);

  const connectCrew = useCallback(
    async (action: "create" | "join", name: string, roomCode?: string) => {
      setCrewBusy(true);
      setCrewError(null);
      try {
        const response = await fetch("/api/crew", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, name, roomCode }),
        });
        const payload = (await response.json()) as {
          session?: CrewSession;
          error?: string;
        };
        if (!response.ok || !payload.session) {
          throw new Error(payload.error ?? "Crew Link refused the connection.");
        }
        crewSessionRef.current = payload.session;
        setCrewSession(payload.session);
        setCrewRoom(null);
        crewActionSequenceRef.current = 0;
        outgoingCrewActionsRef.current = [];
        processedCrewActionRef.current = 0;
        try {
          window.localStorage.setItem(CREW_SESSION_KEY, JSON.stringify(payload.session));
        } catch {
          // The room remains usable for this page session.
        }
      } catch (error) {
        setCrewError(error instanceof Error ? error.message : "Crew Link failed.");
      } finally {
        setCrewBusy(false);
      }
    },
    [],
  );

  const leaveCrew = useCallback(() => {
    const session = crewSessionRef.current;
    if (session) {
      const url = `/api/crew?room=${encodeURIComponent(
        session.roomCode,
      )}&member=${encodeURIComponent(session.memberId)}`;
      void fetch(url, {
        method: "DELETE",
        headers: { "x-crew-token": session.token },
        keepalive: true,
      }).catch(() => undefined);
    }
    clearCrewSession();
  }, [clearCrewSession]);

  useEffect(() => {
    crewSessionRef.current = crewSession;
  }, [crewSession]);

  useEffect(() => {
    crewRoomRef.current = crewRoom;
  }, [crewRoom]);

  useEffect(() => {
    if (!crewSession) return;
    let cancelled = false;
    let syncing = false;

    const syncCrew = async () => {
      if (syncing || cancelled) return;
      syncing = true;
      const sentAt = performance.now();
      const action = outgoingCrewActionsRef.current[0] ?? null;
      try {
        if (crewNetworkTuning.addedLatencyMs > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, crewNetworkTuning.addedLatencyMs),
          );
        }
        if (
          crewNetworkTuning.packetLossPercent > 0 &&
          Math.random() * 100 < crewNetworkTuning.packetLossPercent
        ) {
          return;
        }
        const url = `/api/crew?room=${encodeURIComponent(
          crewSession.roomCode,
        )}&member=${encodeURIComponent(crewSession.memberId)}`;
        const hostState =
          crewSession.role === "host" ? authoritativeStateRef.current : null;
        const response = await fetch(url, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-crew-token": crewSession.token,
          },
          body: JSON.stringify({
            presence: localPresenceRef.current,
            action,
            authoritativeState: hostState ?? undefined,
            phase:
              crewSession.role === "host"
                ? phaseRef.current === "briefing"
                  ? "lobby"
                  : phaseRef.current
                : undefined,
            ackActionId:
              crewSession.role === "host" ? processedCrewActionRef.current : undefined,
          }),
        });
        const payload = (await response.json()) as {
          room?: CrewRoomSnapshot;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.room) {
          if (response.status === 401) {
            clearCrewSession("Crew session expired. Create or join a new room.");
            return;
          }
          throw new Error(payload.error ?? "Crew Link sync failed.");
        }
        if (
          action &&
          outgoingCrewActionsRef.current[0]?.sequence === action.sequence
        ) {
          outgoingCrewActionsRef.current.shift();
        }
        const room = payload.room;
        if (room.phase === "closed" && crewSession.role === "guest") {
          clearCrewSession("Mission lead disconnected. Your solo controls are still available.");
          return;
        }
        setCrewRoom(room);
        setCrewLatency(Math.max(0, Math.round(performance.now() - sentAt)));
        setCrewError(null);
        if (
          crewSession.role === "guest" &&
          room.authoritativeState &&
          room.revision > processedAuthorityRevisionRef.current
        ) {
          incomingAuthorityRef.current = {
            revision: room.revision,
            state: room.authoritativeState,
          };
        }
        if (room.phase === "active" && phaseRef.current !== "active") {
          networkMissionStartRef.current = room.missionSeed;
        }
        if (
          room.phase === "lobby" &&
          crewSession.role === "guest" &&
          phaseRef.current !== "briefing"
        ) {
          phaseRef.current = "briefing";
          authoritativeStateRef.current = null;
          setSnapshot((current) => ({ ...current, phase: "briefing" }));
        }
      } catch (error) {
        if (!cancelled) {
          setCrewError(error instanceof Error ? error.message : "Crew Link sync failed.");
        }
      } finally {
        syncing = false;
      }
    };

    void syncCrew();
    const interval = window.setInterval(syncCrew, CREW_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [clearCrewSession, crewNetworkTuning, crewSession]);

  const sound = useCallback(
    (
      tone:
        | "scan"
        | "pickup"
        | "secure"
        | "warning"
        | "launch"
        | "bounce"
        | "break"
        | "step"
        | "repair"
        | "relay"
        | "storm"
        | "drill"
        | "siphon",
    ) => {
      try {
        const volume = controlSettingsRef.current.volume;
        if (volume <= 0.001) return;
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const settings = {
          scan: [330, 920, 0.34],
          pickup: [250, 390, 0.12],
          secure: [390, 820, 0.3],
          warning: [170, 115, 0.24],
          launch: [105, 340, 0.52],
          bounce: [155, 92, 0.13],
          break: [640, 88, 0.42],
          step: [92, 72, 0.055],
          repair: [125, 540, 0.14],
          relay: [182, 1180, 0.46],
          storm: [74, 510, 0.72],
          drill: [118, 86, 0.34],
          siphon: [210, 470, 0.28],
        }[tone];
        oscillator.type =
          tone === "warning" || tone === "repair" || tone === "relay" || tone === "break" || tone === "storm"
            ? "square"
            : tone === "step" || tone === "drill"
              ? "triangle"
              : "sine";
        oscillator.frequency.setValueAtTime(settings[0], now);
        oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
        gain.gain.setValueAtTime(
          (tone === "step"
            ? 0.018
            : tone === "repair"
              ? 0.042
              : tone === "relay"
                ? 0.048
              : tone === "storm"
                ? 0.035
                : tone === "drill" || tone === "siphon"
                  ? 0.026
                  : 0.05) * volume,
          now,
        );
        gain.gain.exponentialRampToValueAtTime(0.001, now + settings[2]);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + settings[2]);
        oscillator.addEventListener("ended", () => context.close());
      } catch {
        // Audio is optional when browser policies reject a new audio context.
      }
    },
    [],
  );

  const stopAmbience = useCallback(() => {
    const context = ambienceRef.current;
    ambienceRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const startAmbience = useCallback(
    (destinationId: DestinationId) => {
      stopAmbience();
      try {
        const volume = controlSettingsRef.current.volume;
        if (volume <= 0.001) return;
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        ambienceRef.current = context;
        const master = context.createGain();
        master.gain.setValueAtTime(0.0001, context.currentTime);
        master.gain.exponentialRampToValueAtTime(
          (destinationId === "rust_belt" ? 0.038 : 0.022) * volume,
          context.currentTime + 1.5,
        );
        master.connect(context.destination);

        const hum = context.createOscillator();
        const humGain = context.createGain();
        hum.type = destinationId === "rust_belt" ? "sawtooth" : "sine";
        hum.frequency.value = destinationId === "rust_belt" ? 43 : 58;
        humGain.gain.value = destinationId === "rust_belt" ? 0.24 : 0.16;
        hum.connect(humGain).connect(master);
        hum.start();

        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < channel.length; index += 1) {
          channel[index] = (Math.random() * 2 - 1) * 0.35;
        }
        const noise = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const noiseGain = context.createGain();
        noise.buffer = buffer;
        noise.loop = true;
        filter.type = destinationId === "rust_belt" ? "bandpass" : "lowpass";
        filter.frequency.value = destinationId === "rust_belt" ? 760 : 180;
        filter.Q.value = destinationId === "rust_belt" ? 2.6 : 0.8;
        noiseGain.gain.value = destinationId === "rust_belt" ? 0.32 : 0.18;
        noise.connect(filter).connect(noiseGain).connect(master);
        noise.start();

        if (destinationId === "rust_belt") {
          const lfo = context.createOscillator();
          const lfoDepth = context.createGain();
          lfo.type = "sine";
          lfo.frequency.value = 0.11;
          lfoDepth.gain.value = 0.006 * volume;
          lfo.connect(lfoDepth).connect(master.gain);
          lfo.start();
        }
      } catch {
        ambienceRef.current = null;
      }
    },
    [stopAmbience],
  );

  useEffect(() => () => stopAmbience(), [stopAmbience]);

  const handleNotesOpenChange = useCallback((open: boolean) => {
    notesOpenRef.current = open;
    if (open) {
      settingsOpenRef.current = false;
      setSettingsOpen(false);
    }
    keysRef.current.clear();
    if (open && document.pointerLockElement) {
      document.exitPointerLock();
    }
    setNotesOpen(open);
  }, []);

  const handleSettingsOpenChange = useCallback((open: boolean) => {
    settingsOpenRef.current = open;
    if (open) {
      notesOpenRef.current = false;
      setNotesOpen(false);
    }
    keysRef.current.clear();
    if (open && document.pointerLockElement) {
      document.exitPointerLock();
    }
    setSettingsOpen(open);
  }, []);

  const closeActivePanel = useCallback(() => {
    if (notesOpenRef.current) {
      notesOpenRef.current = false;
      setNotesOpen(false);
      return;
    }
    if (settingsOpenRef.current) {
      settingsOpenRef.current = false;
      setSettingsOpen(false);
      return;
    }
    setHubTerminalOpen(false);
  }, []);

  const requestMouseLock = useCallback(() => {
    if (
      phaseRef.current !== "active" ||
      notesOpenRef.current ||
      settingsOpenRef.current
    ) {
      return;
    }

    const target = pointerTargetRef.current;
    if (
      !target ||
      typeof target.requestPointerLock !== "function" ||
      typeof document.exitPointerLock !== "function"
    ) {
      setMouseLockIssue("unsupported");
      return;
    }

    target.focus({ preventScroll: true });
    try {
      const lockRequest = target.requestPointerLock();
      if (lockRequest) {
        void lockRequest.catch(() => setMouseLockIssue("blocked"));
      }
    } catch {
      setMouseLockIssue("blocked");
    }
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.void);
    scene.fog = new THREE.FogExp2(0x0c1222, 0.0085);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    camera.position.set(-12, 10, 19);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        renderPixelRatioCap(controlSettingsRef.current.renderQuality),
      ),
    );
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    pointerTargetRef.current = renderer.domElement;

    const hemisphere = new THREE.HemisphereLight(0x8fd9ea, 0x171827, 1.65);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff1d1, 4.6);
    sun.position.set(-28, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 48;
    sun.shadow.camera.bottom = -48;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    const cyanRim = new THREE.DirectionalLight(palette.cyan, 1.25);
    cyanRim.position.set(28, 12, -34);
    scene.add(cyanRim);

    const applyDestinationLook = (destinationId: DestinationId) => {
      const rust = destinationId === "rust_belt";
      scene.background = new THREE.Color(rust ? 0x0e080b : palette.void);
      scene.fog = new THREE.FogExp2(rust ? 0x1b0d11 : 0x0c1222, rust ? 0.011 : 0.0085);
      hemisphere.color.setHex(rust ? 0xd98f68 : 0x8fd9ea);
      hemisphere.groundColor.setHex(rust ? 0x21131a : 0x171827);
      hemisphere.intensity = rust ? 1.4 : 1.65;
      sun.color.setHex(rust ? 0xffc08b : 0xfff1d1);
      sun.intensity = rust ? 4.15 : 4.6;
      cyanRim.color.setHex(rust ? palette.coral : palette.cyan);
      cyanRim.intensity = rust ? 2.05 : 1.25;
      renderer.toneMappingExposure = rust ? 1.22 : 1.12;
    };
    applyDestinationLook(activeDestinationRef.current);
    let world = createWorld(scene, activeDestinationRef.current);
    const astronaut = createAstronaut();
    scene.add(astronaut);
    const remoteAstronauts = new Map<
      string,
      {
        group: THREE.Group;
        anchor: THREE.Object3D;
        caseAnchor: THREE.Object3D;
        target: THREE.Vector3;
        networkPosition: THREE.Vector3;
        networkVelocity: THREE.Vector3;
        lastSyncAt: number;
        targetYaw: number;
        inputMask: number;
        nameplate: THREE.Sprite;
      }
    >();
    const crewPings = new Map<string, CrewPingRuntime>();
    const crewRescueAssists = new Map<string, CrewRescueAssist>();
    let localPingSequence = 0;
    let previousLocalFieldCaseId: string | null = null;
    const tetherLines = new Map<string, THREE.Line>();
    const cartTowLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({
        color: palette.yellow,
        transparent: true,
        opacity: 0.82,
      }),
    );
    cartTowLine.visible = false;
    scene.add(cartTowLine);
    let cartOwnerId: string | null = null;
    let cartCargoIds: number[] = [];
    const cartSlots: Array<[number, number, number]> = [
      [-1.08, 0.76, -0.54],
      [1.08, 0.76, -0.54],
      [-1.08, 0.76, 0.58],
      [1.08, 0.76, 0.58],
    ];

    const fieldToolCaseStarts = [
        ["field-case-drill", "drill", [-14.8, 0.56, 1.8]],
        ["field-case-corer", "corer", [-14.8, 0.56, 5]],
        ["field-case-siphon", "siphon", [-14.8, 0.56, 8.2]],
      ] as const;
    const createInitialFieldToolCases = () =>
      fieldToolCaseStarts.map(([id, toolId, position]) =>
        createFieldToolCase(id, toolId, [...position]),
      );
    const fieldToolCases = createInitialFieldToolCases();
    fieldToolCases.forEach((fieldCase) => scene.add(fieldCase.group));

    let deposits = createMissionDepositDefinitions(
      missionSeedRef.current,
      activeDestinationRef.current,
    ).map(
      (definition) => createDeposit(definition),
    );
    deposits.forEach((deposit) => scene.add(deposit.group));

    const scanRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 72),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    scanRing.rotation.x = -Math.PI / 2;
    scanRing.visible = false;
    scene.add(scanRing);

    const drillBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.11, 1, 8),
      new THREE.MeshBasicMaterial({
        color: palette.coral,
        transparent: true,
        opacity: 0.9,
      }),
    );
    drillBeam.visible = false;
    scene.add(drillBeam);

    const drillGlow = new THREE.PointLight(palette.coral, 0, 8, 2);
    scene.add(drillGlow);

    const trajectoryGuide = new THREE.Group();
    const trajectoryMaterial = new THREE.MeshBasicMaterial({
      color: palette.cyan,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trajectoryGeometry = new THREE.SphereGeometry(0.095, 8, 6);
    const trajectoryDots = Array.from({ length: 24 }, (_, index) => {
      const dot = new THREE.Mesh(trajectoryGeometry, trajectoryMaterial);
      dot.scale.setScalar(0.72 + index * 0.018);
      trajectoryGuide.add(dot);
      return dot;
    });
    const landingMaterial = new THREE.MeshBasicMaterial({
      color: palette.cyan,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const landingMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 1.02, 28),
      landingMaterial,
    );
    landingMarker.rotation.x = -Math.PI / 2;
    trajectoryGuide.add(landingMarker);
    trajectoryGuide.visible = false;
    scene.add(trajectoryGuide);

    const dustBursts = Array.from({ length: 12 }, () => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.56, 18),
        new THREE.MeshBasicMaterial({
          color: 0xd9d3c1,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, age: 1, duration: 1, strength: 1 };
    });
    let dustCursor = 0;
    const emitDustBurst = (position: THREE.Vector3, strength = 1) => {
      const burst = dustBursts[dustCursor];
      dustCursor = (dustCursor + 1) % dustBursts.length;
      burst.age = 0;
      burst.duration = 0.55 + strength * 0.28;
      burst.strength = strength;
      burst.mesh.position.set(position.x, 0.09, position.z);
      burst.mesh.scale.setScalar(0.4 + strength * 0.22);
      burst.mesh.visible = true;
    };

    const carriedAnchor = new THREE.Object3D();
    carriedAnchor.position.set(0, 2.05, -2.05);
    astronaut.add(carriedAnchor);
    const localFieldCaseAnchor = astronaut.userData.fieldCaseAnchor as THREE.Object3D;

    const velocity = new THREE.Vector3();
    let verticalVelocity = 0;
    let playerHeight = 0;
    let thrusterFuel = 100;
    let thrusterCapacity = 100;
    let scanAnimation = 0;
    let hudTimer = 0;
    let warningPlayed = false;
    let meteorWarningPlayed = false;
    let missionRandom = seededRandom(missionSeedRef.current + 704);
    let meteorCooldown = 5.5;
    let magneticStormCycle = -1;
    let magneticStormPlayed = false;
    let stepTimer = 0;
    let cameraImpact = 0;
    let cameraPitch = 0;
    let repairKick = 0;
    let damageCooldown = 0;
    let airmailFlash = 0;
    let currentThrowPrediction: ReturnType<typeof predictCargoThrow> | null = null;
    let animationFrame = 0;
    let previous = performance.now();
    let padTetherLatch = false;
    let padMagnetLatch = false;
    let padPolarityLatch = false;
    let padStabilizerLatch = false;
    let padCartLatch = false;
    let padToolCycleLatch = false;
    let padMenuLatch = false;
    let padPingLatch = false;
    let lastPadConnected = false;
    let wrongHarvestToolLatch = false;
    let harvestAudioActive = false;
    let lastToolWheelAt = 0;

    const shatterDeposit = (deposit: DepositRuntime, impactSpeed: number) => {
      deposit.state = "broken";
      deposit.condition = 0;
      deposit.velocity.set(0, 0, 0);
      deposit.isBallistic = false;
      deposit.bounceCount = 0;
      deposit.ownerId = null;
      deposit.tetherOwnerIds = [];
      deposit.group.position.y = 0.22;
      deposit.group.scale.setScalar(1);
      deposit.shell.visible = false;
      deposit.core.visible = false;
      deposit.ring.visible = false;
      deposit.shards.visible = true;
      deposit.beacon.intensity = 0;
      brokenSamplesRef.current += 1;
      emitDustBurst(deposit.group.position, 1.65);
      cameraImpact = Math.max(cameraImpact, Math.min(0.48, impactSpeed * 0.04));
      messageRef.current = `${cargoData[deposit.kind].name} SHATTERED at ${impactSpeed.toFixed(
        1,
      )} m/s. Scientific value: aggressively zero.`;
      sound("break");
    };

    const resetDeposits = () => {
      deposits.forEach((deposit) => deposit.group.removeFromParent());
      deposits = createMissionDepositDefinitions(
        missionSeedRef.current,
        activeDestinationRef.current,
      ).map(
        (definition) => createDeposit(definition),
      );
      deposits.forEach((deposit) => scene.add(deposit.group));
      const fluxCore = deposits.find((deposit) => deposit.kind === "flux_core");
      if (fluxCore && world.destinationId === "rust_belt") {
        const vaultPosition = world.processingStation.localToWorld(
          new THREE.Vector3(0.8, 0.78, -1.65),
        );
        fluxCore.group.position.copy(vaultPosition);
        fluxCore.position = fluxCore.group.position;
        fluxCore.group.visible = false;
        fluxCore.shell.visible = false;
        fluxCore.core.visible = false;
        fluxCore.ring.visible = false;
        fluxCore.methodMarker.visible = false;
      }
    };

    const resetFieldToolCases = () => {
      fieldToolCases.forEach((fieldCase, index) => {
        if (fieldCase.group.parent !== scene) scene.attach(fieldCase.group);
        fieldCase.ownerId = null;
        fieldCase.velocity = [0, 0, 0];
        fieldCase.isBallistic = false;
        fieldCase.bounceCount = 0;
        fieldCase.group.position.fromArray(fieldToolCaseStarts[index][2]);
        fieldCase.group.rotation.set(0, index * 0.08 - 0.08, 0);
        fieldCase.group.scale.setScalar(1);
        fieldCase.group.visible = true;
      });
    };

    const removeCrewPing = (id: string) => {
      const ping = crewPings.get(id);
      if (!ping) return;
      ping.group.removeFromParent();
      ping.group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if (material instanceof THREE.SpriteMaterial) material.map?.dispose();
            material.dispose();
          });
        }
      });
      crewPings.delete(id);
    };

    const clearCrewPings = () => {
      [...crewPings.keys()].forEach(removeCrewPing);
    };

    const upsertCrewPing = (data: CrewMissionPing) => {
      const existing = crewPings.get(data.id);
      if (existing) {
        existing.data = { ...data };
        existing.group.position.fromArray(data.position);
        return existing;
      }
      const ping = createCrewPingVisual(data);
      crewPings.set(data.id, ping);
      scene.add(ping.group);
      return ping;
    };

    const pingKindFromAction = (actionType: CrewActionType): CrewPingKind => {
      if (actionType === "ping_help") return "help";
      if (actionType === "ping_cargo") return "cargo";
      if (actionType === "ping_danger") return "danger";
      if (actionType === "ping_ship") return "ship";
      return "position";
    };

    const placeCrewPing = (
      id: string,
      memberId: string,
      memberName: string,
      actionType: CrewActionType,
      memberPosition: THREE.Vector3,
    ) => {
      const kind = pingKindFromAction(actionType);
      let target = memberPosition.clone();
      if (kind === "ship") {
        target = SHIP_POSITION.clone();
      } else if (kind === "cargo") {
        const cargoTarget = deposits
          .filter(
            (deposit) =>
              deposit.state !== "hidden" &&
              deposit.state !== "secured" &&
              deposit.state !== "broken",
          )
          .sort(
            (a, b) =>
              a.group.position.distanceTo(memberPosition) -
              b.group.position.distanceTo(memberPosition),
          )[0];
        if (cargoTarget && cargoTarget.group.position.distanceTo(memberPosition) <= 18) {
          target = cargoTarget.group.getWorldPosition(new THREE.Vector3());
        }
      }
      target.y = 0.05;
      crewPings.forEach((ping, pingId) => {
        if (ping.data.memberId === memberId && ping.data.kind === kind) {
          removeCrewPing(pingId);
        }
      });
      if (crewPings.size >= 8) {
        const oldest = [...crewPings.values()].sort(
          (a, b) => a.data.remaining - b.data.remaining,
        )[0];
        if (oldest) removeCrewPing(oldest.data.id);
      }
      upsertCrewPing({
        id,
        memberId,
        memberName,
        kind,
        position: target.toArray() as [number, number, number],
        remaining: kind === "help" || kind === "danger" ? 10 : 8,
      });
    };

    const nearbyDownedCrewMember = (helperId: string, helperPosition: THREE.Vector3) =>
      (crewRoomRef.current?.members ?? [])
        .filter(
          (member) =>
            member.id !== helperId &&
            (member.inputMask & CREW_INPUT_DOWNED) !== 0,
        )
        .map((member) => ({
          member,
          distance: helperPosition.distanceTo(
            new THREE.Vector3(member.x, member.y, member.z),
          ),
        }))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;

    const activateCrewRescue = (
      helperId: string,
      helperName: string,
      helperPosition: THREE.Vector3,
    ) => {
      const target = nearbyDownedCrewMember(helperId, helperPosition);
      if (!target || target.distance > 3.8) return false;
      crewRescueAssists.set(target.member.id, {
        targetMemberId: target.member.id,
        helperMemberId: helperId,
        helperName,
        remaining: 2.6,
      });
      messageRef.current = `${helperName} CONNECTED A SUIT REBOOT LEAD TO ${target.member.name}. TEAM SAFETY EVENT IN PROGRESS.`;
      sound("repair");
      return true;
    };

    const fieldCaseWorldPosition = (fieldCase: FieldToolCaseRuntime) =>
      fieldCase.group.getWorldPosition(new THREE.Vector3());

    const nearestLooseFieldToolCase = (memberPosition: THREE.Vector3) =>
      fieldToolCases
        .filter((fieldCase) => fieldCase.ownerId === null)
        .map((fieldCase) => ({
          fieldCase,
          distance: fieldCaseWorldPosition(fieldCase).distanceTo(memberPosition),
        }))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;

    const pickupFieldToolCase = (
      ownerId: string,
      ownerName: string,
      ownerPosition: THREE.Vector3,
    ) => {
      if (fieldToolCases.some((fieldCase) => fieldCase.ownerId === ownerId)) {
        return false;
      }
      const nearest = nearestLooseFieldToolCase(ownerPosition);
      if (!nearest || nearest.distance > FIELD_CASE_PICKUP_RANGE) return false;
      nearest.fieldCase.ownerId = ownerId;
      nearest.fieldCase.velocity = [0, 0, 0];
      nearest.fieldCase.isBallistic = false;
      nearest.fieldCase.bounceCount = 0;
      if (ownerId === (crewSessionRef.current?.memberId ?? "solo")) {
        activeHarvestToolRef.current = nearest.fieldCase.toolId;
        setAstronautHarvestTool(astronaut, nearest.fieldCase.toolId);
      }
      messageRef.current = `${ownerName} CLAIMED THE ${harvestToolData[
        nearest.fieldCase.toolId
      ].name.toUpperCase()} SPECIALIST CASE. MATCHING EXTRACTION OUTPUT +30%.`;
      sound("pickup");
      return true;
    };

    const tossFieldToolCase = (
      ownerId: string,
      ownerName: string,
      ownerPosition: THREE.Vector3,
      ownerYaw: number,
    ) => {
      const owned = fieldToolCases.find(
        (fieldCase) => fieldCase.ownerId === ownerId,
      );
      if (!owned) {
        messageRef.current = `${ownerName} HAS NO SPECIALIST CASE TO TOSS.`;
        return false;
      }
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        ownerYaw,
      );
      if (owned.group.parent !== scene) scene.attach(owned.group);
      owned.group.position.copy(ownerPosition).addScaledVector(forward, 1.8);
      owned.group.position.y += 1.6;
      owned.group.scale.setScalar(1);
      owned.ownerId = null;
      owned.velocity = [forward.x * 8.6, 4.8, forward.z * 8.6];
      owned.isBallistic = true;
      owned.bounceCount = 0;
      messageRef.current = `${ownerName} AIRMAILED THE ${harvestToolData[
        owned.toolId
      ].name.toUpperCase()} CASE. CATCHING IT IS OPTIONAL BUT EFFICIENT.`;
      sound("launch");
      return true;
    };

    const tetherOwnerPosition = (ownerId: string) => {
      const session = crewSessionRef.current;
      const localOwnerId = session?.memberId ?? "solo";
      if (ownerId === localOwnerId) return astronaut.position.clone();
      const member = crewRoomRef.current?.members.find(
        (candidate) => candidate.id === ownerId,
      );
      return member ? new THREE.Vector3(member.x, member.y, member.z) : null;
    };

    const toggleTether = (
      ownerId: string,
      ownerName: string,
      ownerPosition: THREE.Vector3,
    ) => {
      const attached = deposits.find((deposit) =>
        deposit.tetherOwnerIds.includes(ownerId),
      );
      if (attached) {
        attached.tetherOwnerIds = attached.tetherOwnerIds.filter(
          (candidate) => candidate !== ownerId,
        );
        messageRef.current = `${ownerName} released the ${cargoData[
          attached.kind
        ].name} tether. Momentum has resumed negotiations.`;
        return;
      }

      if (deposits.some((deposit) => deposit.ownerId === ownerId)) {
        messageRef.current = `${ownerName} cannot fire a tether while carrying cargo.`;
        return;
      }

      const target = deposits
        .filter(
          (deposit) =>
            deposit.state === "cargo" &&
            deposit.ownerId === null &&
            deposit.tetherOwnerIds.length < TETHER_MAX_OWNERS,
        )
        .sort(
          (a, b) =>
            a.group.position.distanceTo(ownerPosition) -
            b.group.position.distanceTo(ownerPosition),
        )[0];
      if (!target || target.group.position.distanceTo(ownerPosition) > TETHER_LOCK_RANGE) {
        messageRef.current = `${ownerName} found no loose cargo within tether range.`;
        return;
      }

      target.tetherOwnerIds.push(ownerId);
      const teamLift = target.tetherOwnerIds.length >= 2;
      messageRef.current = teamLift
        ? `TEAM LIFT ONLINE! ${ownerName} joined the ${cargoData[
            target.kind
          ].name} haul. Dense-object privileges unlocked.`
        : `${ownerName} tethered ${cargoData[target.kind].name}. Move together; cable snaps at ${TETHER_BREAK_RANGE}m.`;
      sound("pickup");
    };

    const updateFacilityVisuals = () => {
      const station = world.processingStation;
      if (world.destinationId !== "rust_belt") return;
      const relayMask = Number(station.userData.relayMask ?? 0);
      const vaultOpen = Boolean(station.userData.vaultOpen);
      const relays = station.userData.relays as THREE.Group[];
      relays.forEach((relay, index) => {
        const aligned = (relayMask & (1 << index)) !== 0;
        const ring = relay.userData.ring as THREE.Mesh;
        const light = relay.userData.light as THREE.PointLight;
        (ring.material as THREE.MeshBasicMaterial).opacity = aligned ? 0.92 : 0.34;
        ring.scale.setScalar(aligned ? 1.16 : 1);
        light.intensity = aligned ? 12 : 2;
      });
      const vaultDoor = station.userData.vaultDoor as THREE.Mesh;
      const vaultWheel = station.userData.vaultWheel as THREE.Mesh;
      const vaultLight = station.userData.vaultLight as THREE.PointLight;
      vaultDoor.position.y = vaultOpen
        ? Number(vaultDoor.userData.openY)
        : Number(vaultDoor.userData.closedY);
      vaultWheel.visible = !vaultOpen;
      vaultLight.color.setHex(vaultOpen ? palette.green : palette.coral);
      vaultLight.intensity = vaultOpen ? 14 : 7;
    };

    const releaseFluxCore = () => {
      const fluxCore = deposits.find((deposit) => deposit.kind === "flux_core");
      if (!fluxCore || fluxCore.state !== "hidden") return;
      if (fluxCore.group.parent !== scene) scene.attach(fluxCore.group);
      const releasePoint = world.processingStation.localToWorld(
        new THREE.Vector3(0.8, 0.78, -3.7),
      );
      fluxCore.group.position.copy(releasePoint);
      fluxCore.position = fluxCore.group.position;
      fluxCore.state = "cargo";
      fluxCore.condition = 1;
      fluxCore.group.visible = true;
      fluxCore.shell.visible = false;
      fluxCore.core.visible = true;
      fluxCore.ring.visible = true;
      fluxCore.methodMarker.visible = false;
      fluxCore.beacon.intensity = 12;
    };

    const tryAlignFacilityRelay = (
      ownerName: string,
      ownerPosition: THREE.Vector3,
      mode: MagneticPolarity,
    ) => {
      if (world.destinationId !== "rust_belt") return false;
      const station = world.processingStation;
      const relays = station.userData.relays as THREE.Group[];
      const target = relays
        .map((relay) => ({
          relay,
          position: relay.getWorldPosition(new THREE.Vector3()),
        }))
        .sort(
          (a, b) =>
            a.position.distanceTo(ownerPosition) - b.position.distanceTo(ownerPosition),
        )[0];
      if (!target || target.position.distanceTo(ownerPosition) > 4.2) return false;
      const index = Number(target.relay.userData.index);
      const currentMask = Number(station.userData.relayMask ?? 0);
      const alignment = alignRustRelay(currentMask, index, mode);
      if ((currentMask & (1 << index)) !== 0) {
        messageRef.current = `RELAY ${index + 1} ALREADY STABLE. ${ownerName} may redirect their expertise.`;
        return true;
      }
      if (!alignment.accepted) {
        messageRef.current = `RELAY ${index + 1} REJECTED ${mode.toUpperCase()} POLARITY. TAP V AND TRY THE OTHER BAD IDEA.`;
        sound("warning");
        return true;
      }
      const nextMask = alignment.relayMask;
      station.userData.relayMask = nextMask;
      station.userData.vaultOpen = alignment.vaultOpen;
      updateFacilityVisuals();
      if (nextMask === 0b111) {
        releaseFluxCore();
        messageRef.current = `${ownerName} RESTORED POLARITY ANNEX 6. VAULT OPEN // PROTOTYPE FLUX CORE RELEASED.`;
        sound("secure");
      } else {
        const alignedCount = nextMask.toString(2).replace(/0/g, "").length;
        messageRef.current = `${ownerName} ALIGNED RELAY ${index + 1} (${alignedCount}/3). THE ANNEX HAS RESUMED HUMMING.`;
        sound("relay");
      }
      return true;
    };

    const fireMagneticRetriever = (
      ownerName: string,
      ownerPosition: THREE.Vector3,
      mode: MagneticPolarity,
    ) => {
      if (tryAlignFacilityRelay(ownerName, ownerPosition, mode)) return true;
      const target = deposits
        .filter(
          (deposit) =>
            deposit.state === "cargo" &&
            deposit.ownerId === null &&
            cargoData[deposit.kind].magnetic,
        )
        .sort(
          (a, b) =>
            a.group.position.distanceTo(ownerPosition) -
            b.group.position.distanceTo(ownerPosition),
        )[0];
      const distance = target?.group.position.distanceTo(ownerPosition) ?? Infinity;
      if (!target || distance > 18) {
        messageRef.current = `${ownerName}'s polarity manipulator found no cooperative metal within 18m.`;
        return false;
      }

      if (target.group.parent !== scene) scene.attach(target.group);
      const operatorAnchor = ownerPosition.clone().add(new THREE.Vector3(0, 1.3, 0));
      const pullDirection = mode === "attract"
        ? operatorAnchor.sub(target.group.position).normalize()
        : target.group.position.clone().sub(operatorAnchor).normalize();
      target.tetherOwnerIds = [];
      target.isBallistic = true;
      target.bounceCount = 0;
      target.velocity.copy(pullDirection).multiplyScalar(8.6 + Math.min(4, distance * 0.2));
      target.velocity.y = Math.max(mode === "attract" ? 2.6 : 3.2, target.velocity.y + 1.8);
      messageRef.current = mode === "attract"
        ? `${ownerName} magnet-yanked ${cargoData[target.kind].name}. Ducking is now optional but wise.`
        : `${ownerName} polarity-kicked ${cargoData[target.kind].name}. Someone should begin chasing it.`;
      sound("launch");
      return true;
    };

    const polarityActionCooldown = (ownerPosition: THREE.Vector3) => {
      if (world.destinationId !== "rust_belt") return 6.5;
      const nearRelay = (world.processingStation.userData.relays as THREE.Group[]).some(
        (relay) =>
          relay
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(ownerPosition) <= 4.2,
      );
      return nearRelay ? 0.85 : 6.5;
    };

    const launchCargoByMagRail = (
      ownerId: string,
      ownerName: string,
      ownerPosition: THREE.Vector3,
    ) => {
      if (world.destinationId !== "rust_belt") return false;
      const held = deposits.find((deposit) => deposit.ownerId === ownerId);
      if (!held || !cargoData[held.kind].magnetic) return false;
      const intake = (world.processingStation.userData.intakePoint as THREE.Object3D)
        .getWorldPosition(new THREE.Vector3());
      if (ownerPosition.distanceTo(intake) > 5) return false;
      const exit = (world.processingStation.userData.exitPoint as THREE.Object3D)
        .getWorldPosition(new THREE.Vector3());
      if (held.group.parent !== scene) scene.attach(held.group);
      held.group.position.copy(exit);
      const receiverTarget = CARGO_RECEIVER_POSITION.clone().setY(2.35);
      const launchOffset = receiverTarget.clone().sub(exit);
      const horizontalDistance = Math.hypot(launchOffset.x, launchOffset.z);
      const flightTime = THREE.MathUtils.clamp(horizontalDistance / 11.5, 2.15, 3.25);
      held.velocity.set(
        launchOffset.x / flightTime,
        (launchOffset.y + 0.5 * world.gravity * flightTime * flightTime) /
          flightTime,
        launchOffset.z / flightTime,
      );
      held.ownerId = null;
      held.tetherOwnerIds = [];
      held.isBallistic = true;
      held.bounceCount = 0;
      carryingRef.current = carryingRef.current === held.id ? null : carryingRef.current;
      world.processingStation.userData.railPulse = 1;
      messageRef.current = `${ownerName} FIRED ${cargoData[held.kind].name.toUpperCase()} DOWN THE MAG-RAIL. RECEIVER SOLUTION CALIBRATED // STORMS VOID WARRANTY.`;
      sound("launch");
      return true;
    };

    const stabilizeSample = (ownerId: string, ownerName: string) => {
      const held = deposits.find((deposit) => deposit.ownerId === ownerId);
      if (!held) {
        messageRef.current = `${ownerName} sprayed stabilizer foam on absolutely nothing.`;
        return false;
      }
      if (held.condition >= 0.995) {
        messageRef.current = `${cargoData[held.kind].name} is already pristine. Foam ration preserved.`;
        return false;
      }
      const previousCondition = held.condition;
      held.condition = Math.min(1, held.condition + 0.28);
      messageRef.current = `${ownerName} stabilized ${cargoData[held.kind].name}: ${Math.round(
        previousCondition * 100,
      )}% → ${Math.round(held.condition * 100)}% condition. The foam is probably archival.`;
      sound("repair");
      return true;
    };

    const applySuitDamage = (amount: number) => {
      if (damageCooldown > 0 || downedRef.current) return "ignored" as const;

      damageCooldown = 1.35;
      const damage = calculateSuitDamage(suitIntegrityRef.current, amount);
      suitIntegrityRef.current = damage.integrity;
      if (!damage.downed) return "damaged" as const;

      downedRef.current = true;
      recoveryProgressRef.current = 0;
      velocity.multiplyScalar(0.2);
      verticalVelocity = Math.min(verticalVelocity, 1.5);
      const held = deposits.find((deposit) => deposit.id === carryingRef.current);
      if (held) {
        scene.attach(held.group);
        const dropDirection = new THREE.Vector3(0, 0, -1.8).applyQuaternion(
          astronaut.quaternion,
        );
        held.group.position.copy(astronaut.position).add(dropDirection);
        held.group.position.y = 0.62;
        held.group.scale.setScalar(1);
        held.condition = Math.max(0.42, held.condition - 0.08);
        held.velocity.set(0, 0, 0);
        held.isBallistic = false;
        held.bounceCount = 0;
        held.ownerId = null;
        held.tetherOwnerIds = [];
        carryingRef.current = null;
      }
      messageRef.current =
        "SUIT SAFE MODE. HOLD E TO REBOOT. Any cargo separation was completely intentional.";
      const session = crewSessionRef.current;
      if (session?.role === "guest") {
        queueCrewAction("ping_help");
      } else if (session) {
        localPingSequence += 1;
        placeCrewPing(
          `lead-${localPingSequence}`,
          session.memberId,
          session.name,
          "ping_help",
          astronaut.position,
        );
      }
      return "downed" as const;
    };

    resetRuntimeRef.current = () => {
      clearCrewPings();
      crewRescueAssists.clear();
      if (world.destinationId !== activeDestinationRef.current) {
        world.root.removeFromParent();
        world = createWorld(scene, activeDestinationRef.current);
        applyDestinationLook(activeDestinationRef.current);
      }
      astronaut.position.set(-12, 0, 5);
      astronaut.rotation.set(0, 0, 0);
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      playerHeight = 0;
      thrusterCapacity = hasEquippedUpgrade(
        progressionRef.current,
        "thruster_reserve",
      )
        ? 125
        : 100;
      thrusterFuel = thrusterCapacity;
      carryingRef.current = null;
      timeRef.current = CONTRACTS[activeContractIdRef.current].seconds;
      scoreRef.current = 0;
      heatRef.current = 0;
      overheatedRef.current = false;
      drillWearRef.current = 0;
      drillJammedRef.current = false;
      activeHarvestToolRef.current = "drill";
      corerCycleRef.current = 0;
      siphonSealRef.current = 0;
      setAstronautHarvestTool(astronaut, "drill");
      repairProgressRef.current = 0;
      repairsCompletedRef.current = 0;
      airmailDeliveriesRef.current = 0;
      bankShotDeliveriesRef.current = 0;
      stuntBonusRef.current = 0;
      cargoBouncesRef.current = 0;
      brokenSamplesRef.current = 0;
      suitIntegrityRef.current = 100;
      downedRef.current = false;
      recoveryProgressRef.current = 0;
      suitRecoveriesRef.current = 0;
      repairLatchRef.current = false;
      scanCooldownRef.current = 0;
      magnetCooldownRef.current = 0;
      polarityModeRef.current = "attract";
      stabilizerChargesRef.current = 2;
      magnetLatchRef.current = false;
      stabilizerLatchRef.current = false;
      tutorialMovedRef.current = false;
      tutorialScannedRef.current = false;
      tutorialDrilledRef.current = false;
      tutorialCarriedRef.current = false;
      warningPlayed = false;
      meteorWarningPlayed = false;
      magneticStormCycle = -1;
      magneticStormPlayed = false;
      missionRandom = seededRandom(missionSeedRef.current + 704);
      meteorCooldown = 4.5 + missionRandom() * 2;
      cameraImpact = 0;
      cameraPitch = 0;
      repairKick = 0;
      damageCooldown = 0;
      airmailFlash = 0;
      processedAuthorityRevisionRef.current = 0;
      processedCrewActionRef.current = 0;
      currentThrowPrediction = null;
      trajectoryGuide.visible = false;
      dustBursts.forEach((burst) => {
        burst.age = 1;
        burst.mesh.visible = false;
      });
      world.pressureVents.forEach((vent) => {
        vent.userData.lastLaunchCycle = -1;
      });
      world.meteorHazards.forEach((meteor) => {
        meteor.state = "idle";
        meteor.timer = 0;
        meteor.impactAge = 0;
        meteor.group.visible = false;
        meteor.meteor.visible = false;
        meteor.light.intensity = 0;
      });
      world.processingStation.userData.relayMask = 0;
      world.processingStation.userData.vaultOpen = false;
      world.processingStation.userData.railPulse = 0;
      updateFacilityVisuals();
      cartOwnerId = null;
      cartCargoIds = [];
      world.rover.position.set(-7.5, 0.3, 7.2);
      world.rover.rotation.set(0, -0.18, 0);
      (world.rover.userData.lastPosition as THREE.Vector3).copy(
        world.rover.position,
      );
      cartTowLine.visible = false;
      resetFieldToolCases();
      resetDeposits();
    };

    const onResize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio,
          renderPixelRatioCap(controlSettingsRef.current.renderQuality),
        ),
      );
    };
    onResize();
    window.addEventListener("resize", onResize);

    const cycleHarvestTool = (direction = 1) => {
      const nextTool = nextHarvestTool(activeHarvestToolRef.current, direction);
      activeHarvestToolRef.current = nextTool;
      setAstronautHarvestTool(astronaut, nextTool);
      const tool = harvestToolData[nextTool];
      messageRef.current = `${tool.name.toUpperCase()} EQUIPPED // ${
        nextTool === "drill"
          ? "DENSE METALS"
          : nextTool === "corer"
            ? "GLASS + FOSSILS"
            : "PRESSURIZED SAMPLES"
      }.`;
      sound("scan");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, button")
      ) {
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === "Tab" && !event.repeat && phaseRef.current === "active") {
        cycleHarvestTool(event.shiftKey ? -1 : 1);
      }
      if (event.code === "KeyP" && !event.repeat && crewSessionRef.current) {
        if (crewSessionRef.current.role === "guest") {
          queueCrewAction("ping");
        } else {
          localPingSequence += 1;
          placeCrewPing(
            `lead-${localPingSequence}`,
            crewSessionRef.current.memberId,
            crewSessionRef.current.name,
            "ping",
            astronaut.position,
          );
          messageRef.current = "MISSION LEAD PINGED THEIR LOCATION. Confidence is implied.";
        }
        sound("scan");
      }
      const quickPingTypes: Partial<Record<string, CrewActionType>> = {
        Digit1: "ping_help",
        Digit2: "ping_cargo",
        Digit3: "ping_danger",
        Digit4: "ping_ship",
      };
      const quickPing = quickPingTypes[event.code];
      if (quickPing && !event.repeat && crewSessionRef.current) {
        const pingLabels: Record<string, string> = {
          ping_help: "NEEDS HELP",
          ping_cargo: "MARKED CARGO",
          ping_danger: "MARKED DANGER",
          ping_ship: "CALLED RETURN TO SHIP",
        };
        if (crewSessionRef.current.role === "guest") queueCrewAction(quickPing);
        else {
          localPingSequence += 1;
          placeCrewPing(
            `lead-${localPingSequence}`,
            crewSessionRef.current.memberId,
            crewSessionRef.current.name,
            quickPing,
            astronaut.position,
          );
          messageRef.current = `${crewSessionRef.current.name} ${pingLabels[quickPing]}.`;
        }
        sound(quickPing === "ping_danger" ? "warning" : "scan");
      }
      if (event.code === "KeyT" && !event.repeat && phaseRef.current === "active") {
        const session = crewSessionRef.current;
        if (session?.role === "guest") {
          queueCrewAction("tether");
          messageRef.current = "Tether request sent to mission lead authority.";
        } else {
          toggleTether(
            session?.memberId ?? "solo",
            session?.name ?? "SOLO GOON",
            astronaut.position,
          );
        }
      }
      if (event.code === "KeyH" && !event.repeat && phaseRef.current === "active") {
        const session = crewSessionRef.current;
        if (session?.role === "guest") {
          queueCrewAction("cart_toggle");
          messageRef.current = "Cargo cart hitch request sent to mission lead authority.";
        } else {
          toggleCargoCart(
            session?.memberId ?? "solo",
            session?.name ?? "SOLO GOON",
            astronaut.position,
          );
        }
      }
      if (event.code === "KeyG" && !event.repeat && phaseRef.current === "active") {
        const session = crewSessionRef.current;
        if (magnetCooldownRef.current > 0) {
          messageRef.current = `Magnetic retriever recharging: ${magnetCooldownRef.current.toFixed(1)}s.`;
        } else if (session?.role === "guest") {
          queueCrewAction("magnet");
          magnetCooldownRef.current = polarityActionCooldown(astronaut.position);
          messageRef.current = "Magnetic retrieval request sent to mission lead authority.";
          sound("scan");
        } else if (
          fireMagneticRetriever(
            session?.name ?? "SOLO GOON",
            astronaut.position,
            polarityModeRef.current,
          )
        ) {
          magnetCooldownRef.current = polarityActionCooldown(astronaut.position);
        }
      }
      if (event.code === "KeyV" && !event.repeat && phaseRef.current === "active") {
        polarityModeRef.current =
          polarityModeRef.current === "attract" ? "repel" : "attract";
        messageRef.current = `POLARITY MANIPULATOR // ${polarityModeRef.current.toUpperCase()} MODE.`;
        sound("scan");
      }
      if (event.code === "KeyC" && !event.repeat && phaseRef.current === "active") {
        const session = crewSessionRef.current;
        if (stabilizerChargesRef.current <= 0) {
          messageRef.current = "Sample stabilizer empty. The foam budget has been respected.";
        } else if (session?.role === "guest") {
          queueCrewAction("stabilize");
          stabilizerChargesRef.current -= 1;
          messageRef.current = "Sample stabilization request sent to mission lead authority.";
        } else if (
          stabilizeSample(
            session?.memberId ?? "solo",
            session?.name ?? "SOLO GOON",
          )
        ) {
          stabilizerChargesRef.current -= 1;
        }
      }
      if (event.code === "KeyX" && !event.repeat && phaseRef.current === "active") {
        const session = crewSessionRef.current;
        if (session?.role === "guest") {
          queueCrewAction("tool_throw");
          messageRef.current = "Specialist-case toss request sent to mission lead authority.";
        } else {
          tossFieldToolCase(
            session?.memberId ?? "solo",
            session?.name ?? "SOLO GOON",
            astronaut.position,
            astronaut.rotation.y,
          );
        }
      }
      keysRef.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    const onPointerLockChange = () => {
      const captured = document.pointerLockElement === renderer.domElement;
      mouseCapturedRef.current = captured;
      setMouseCaptured(captured);
      if (captured) setMouseLockIssue(null);
      if (!captured) keysRef.current.clear();
    };
    const onPointerLockError = () => {
      setMouseLockIssue("blocked");
    };
    const onMouseMove = (event: MouseEvent) => {
      if (
        document.pointerLockElement !== renderer.domElement ||
        phaseRef.current !== "active" ||
        notesOpenRef.current ||
        settingsOpenRef.current
      ) {
        return;
      }
      const deltaX = THREE.MathUtils.clamp(event.movementX, -45, 45);
      const deltaY = THREE.MathUtils.clamp(event.movementY, -35, 35);
      const { lookSensitivity, invertY } = controlSettingsRef.current;
      astronaut.rotation.y -= deltaX * 0.00235 * lookSensitivity;
      cameraPitch = THREE.MathUtils.clamp(
        cameraPitch + deltaY * 0.0019 * lookSensitivity * (invertY ? 1 : -1),
        -0.28,
        0.34,
      );
    };
    const onWheel = (event: WheelEvent) => {
      if (
        document.pointerLockElement !== renderer.domElement ||
        phaseRef.current !== "active" ||
        notesOpenRef.current ||
        settingsOpenRef.current
      ) {
        return;
      }
      event.preventDefault();
      const now = performance.now();
      if (now - lastToolWheelAt < 180 || Math.abs(event.deltaY) < 1) return;
      lastToolWheelAt = now;
      cycleHarvestTool(event.deltaY < 0 ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);
    document.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("wheel", onWheel, { passive: false });
    mount.addEventListener("click", requestMouseLock);

    const updateDrillBeam = (start: THREE.Vector3, end: THREE.Vector3) => {
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const direction = end.clone().sub(start);
      drillBeam.position.copy(midpoint);
      drillBeam.scale.set(1, direction.length(), 1);
      drillBeam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
      drillGlow.position.copy(end).add(new THREE.Vector3(0, 0.45, 0));
    };

    const armMeteorHazard = () => {
      const meteor = world.meteorHazards.find((candidate) => candidate.state === "idle");
      if (!meteor) return false;

      const angle = missionRandom() * Math.PI * 2;
      const distance = 3.5 + missionRandom() * 8.5;
      const target = astronaut.position
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
      const targetRadius = Math.hypot(target.x, target.z);
      if (targetRadius > MOON_RADIUS - 3) {
        target.x *= (MOON_RADIUS - 3) / targetRadius;
        target.z *= (MOON_RADIUS - 3) / targetRadius;
      }
      const shipDistance = target.distanceTo(SHIP_POSITION);
      if (shipDistance < 8.5) {
        const awayFromShip = target.clone().sub(SHIP_POSITION).setY(0);
        if (awayFromShip.lengthSq() < 0.01) awayFromShip.set(1, 0, 0);
        target.copy(SHIP_POSITION).add(awayFromShip.normalize().multiplyScalar(8.5));
      }

      meteor.group.position.set(target.x, 0.02, target.z);
      meteor.group.visible = true;
      meteor.state = "warning";
      meteor.timer = 1.8;
      meteor.impactAge = 0;
      meteor.marker.visible = true;
      meteor.marker.scale.setScalar(1);
      meteor.markerMaterial.opacity = 0.46;
      meteor.meteor.visible = true;
      meteor.meteor.position.set(0, 34, 0);
      meteor.meteor.rotation.set(
        missionRandom() * Math.PI,
        missionRandom() * Math.PI,
        missionRandom() * Math.PI,
      );
      meteor.trail.visible = true;
      (meteor.trail.material as THREE.MeshBasicMaterial).opacity = 0.56;
      meteor.light.intensity = 2;
      return true;
    };

    const setDepositVisualState = (deposit: DepositRuntime) => {
      const embedded =
        deposit.state === "revealed" || deposit.state === "extracting";
      deposit.group.visible = deposit.state !== "hidden" && deposit.state !== "secured";
      deposit.shell.visible = embedded;
      deposit.core.visible = deposit.state === "cargo" || deposit.state === "cart";
      deposit.shards.visible = deposit.state === "broken";
      deposit.ring.visible = deposit.state !== "broken" && deposit.state !== "cart";
      deposit.methodMarker.visible = embedded;
      deposit.beacon.intensity = embedded ? 7 : deposit.state === "cargo" ? 9 : 0;
    };

    const placeCargoInCart = (deposit: DepositRuntime, slotIndex: number) => {
      const cargoBed = world.rover.userData.cargoBed as THREE.Group;
      const slot = cartSlots[slotIndex];
      if (!slot) return;
      if (deposit.group.parent !== cargoBed) cargoBed.add(deposit.group);
      deposit.group.position.set(...slot);
      deposit.group.rotation.set(0.08 * (slotIndex % 2 ? -1 : 1), slotIndex * 0.42, 0.06);
      deposit.group.scale.setScalar(deposit.kind === "platinum" ? 0.52 : 0.46);
      setDepositVisualState(deposit);
    };

    const cartOwnerTransform = (ownerId: string) => {
      const session = crewSessionRef.current;
      const localOwnerId = session?.memberId ?? "solo";
      if (ownerId === localOwnerId) {
        return { position: astronaut.position.clone(), yaw: astronaut.rotation.y };
      }
      const member = crewRoomRef.current?.members.find(
        (candidate) => candidate.id === ownerId,
      );
      return member
        ? { position: new THREE.Vector3(member.x, member.y, member.z), yaw: member.yaw }
        : null;
    };

    const toggleCargoCart = (
      ownerId: string,
      ownerName: string,
      ownerPosition: THREE.Vector3,
    ) => {
      if (cartOwnerId === ownerId) {
        cartOwnerId = null;
        messageRef.current = `${ownerName} released the cargo cart. Parking brake confidence: moderate.`;
        sound("pickup");
        return true;
      }
      if (cartOwnerId) {
        const currentOwner = crewRoomRef.current?.members.find(
          (member) => member.id === cartOwnerId,
        )?.name;
        messageRef.current = `Cargo cart already hitched to ${currentOwner ?? "ANOTHER GOON"}.`;
        return false;
      }
      if (world.rover.position.distanceTo(ownerPosition) > 4.5) {
        messageRef.current = `${ownerName} is too far from the cargo cart to negotiate a hitch.`;
        return false;
      }
      cartOwnerId = ownerId;
      messageRef.current = `${ownerName} hitched the cargo cart // ${cartCargoIds.length}/${CART_CAPACITY} slots occupied.`;
      sound("pickup");
      return true;
    };

    const loadCargoIntoCart = (
      ownerId: string,
      ownerName: string,
      ownerPosition: THREE.Vector3,
    ) => {
      const held = deposits.find((deposit) => deposit.ownerId === ownerId);
      if (!held || world.rover.position.distanceTo(ownerPosition) > 4.5) return false;
      if (!canLoadCargoCart(cartCargoIds.length)) {
        messageRef.current = `Cargo cart full // ${CART_CAPACITY}/${CART_CAPACITY}. Procurement recommends finally going home.`;
        sound("warning");
        return false;
      }
      held.state = "cart";
      held.ownerId = null;
      held.tetherOwnerIds = [];
      held.velocity.set(0, 0, 0);
      held.isBallistic = false;
      held.bounceCount = 0;
      cartCargoIds.push(held.id);
      placeCargoInCart(held, cartCargoIds.length - 1);
      if (ownerId === (crewSessionRef.current?.memberId ?? "solo")) {
        carryingRef.current = null;
      }
      messageRef.current = `${ownerName} loaded ${cargoData[held.kind].name} // cart ${cartCargoIds.length}/${CART_CAPACITY}.`;
      sound("pickup");
      return true;
    };

    const depositCargoCart = (ownerName: string, ownerPosition: THREE.Vector3) => {
      if (
        cartCargoIds.length === 0 ||
        world.rover.position.distanceTo(CARGO_RECEIVER_POSITION) > 4.8 ||
        ownerPosition.distanceTo(CARGO_RECEIVER_POSITION) > 5.8
      ) {
        return false;
      }
      const manifest = cartCargoIds
        .map((id) => deposits.find((deposit) => deposit.id === id))
        .filter((deposit): deposit is DepositRuntime => Boolean(deposit));
      const earned = cargoCartManifestValue(
        manifest.map((deposit) => ({
          kind: deposit.kind,
          condition: deposit.condition,
        })),
      );
      manifest.forEach((deposit) => {
        if (deposit.group.parent !== scene) scene.attach(deposit.group);
        deposit.state = "secured";
        deposit.ownerId = null;
        deposit.tetherOwnerIds = [];
        deposit.velocity.set(0, 0, 0);
        deposit.isBallistic = false;
        deposit.group.visible = false;
      });
      const sampleCount = manifest.length;
      cartCargoIds = [];
      scoreRef.current += earned;
      airmailFlash = 1;
      messageRef.current = `${ownerName} submitted a ${sampleCount}-sample cart manifest for ¢${earned}. Bulk science achieved.`;
      sound("secure");
      return true;
    };

    const updateCargoCart = (dt: number, hasAuthority: boolean) => {
      let owner = cartOwnerId ? cartOwnerTransform(cartOwnerId) : null;
      if (hasAuthority && cartOwnerId && !owner) {
        cartOwnerId = null;
        owner = null;
        messageRef.current =
          "Cargo cart auto-released after losing its assigned goon. The brake may even work.";
      }

      if (hasAuthority && owner) {
        const targetPosition = owner.position
          .clone()
          .add(
            new THREE.Vector3(0, 0, 3.65).applyAxisAngle(
              new THREE.Vector3(0, 1, 0),
              owner.yaw,
            ),
          );
        targetPosition.y = 0.3;
        const targetRadius = Math.hypot(targetPosition.x, targetPosition.z);
        if (targetRadius > MOON_RADIUS - 2.7) {
          targetPosition.x *= (MOON_RADIUS - 2.7) / targetRadius;
          targetPosition.z *= (MOON_RADIUS - 2.7) / targetRadius;
        }
        if (world.rover.position.distanceTo(targetPosition) > 12) {
          world.rover.position.copy(targetPosition);
        } else {
          world.rover.position.x = THREE.MathUtils.damp(
            world.rover.position.x,
            targetPosition.x,
            5.8,
            dt,
          );
          world.rover.position.z = THREE.MathUtils.damp(
            world.rover.position.z,
            targetPosition.z,
            5.8,
            dt,
          );
        }
        const yawDelta = Math.atan2(
          Math.sin(owner.yaw - world.rover.rotation.y),
          Math.cos(owner.yaw - world.rover.rotation.y),
        );
        world.rover.rotation.y += yawDelta * (1 - Math.exp(-7.5 * dt));
      }

      const previousCartPosition = world.rover.userData.lastPosition as THREE.Vector3;
      const cartTravel = previousCartPosition.distanceTo(world.rover.position);
      if (cartTravel > 0.001) {
        (world.rover.userData.wheels as THREE.Mesh[]).forEach((wheel) => {
          wheel.rotation.x -= cartTravel / 0.42;
        });
        previousCartPosition.copy(world.rover.position);
      }

      cartTowLine.visible = phaseRef.current === "active" && Boolean(owner);
      if (owner) {
        const hitchPosition = (
          world.rover.userData.hitch as THREE.Object3D
        ).getWorldPosition(new THREE.Vector3());
        const ownerAnchor = owner.position.clone().add(new THREE.Vector3(0, 1.15, 0));
        cartTowLine.geometry.setFromPoints([ownerAnchor, hitchPosition]);
      }
    };

    const applyAuthoritativeState = (state: CrewMissionState) => {
      if (state.missionSeed !== missionSeedRef.current) return;
      const incomingContractId = normalizeContractId(state.contractId);
      timeRef.current = state.time;
      activeContractIdRef.current = incomingContractId;
      activeDestinationRef.current = CONTRACTS[incomingContractId].destinationId;
      setSelectedContractId(incomingContractId);
      scoreRef.current = state.score;
      messageRef.current = state.message;
      phaseRef.current = state.phase;
      repairsCompletedRef.current = state.stats.repairsCompleted;
      airmailDeliveriesRef.current = state.stats.airmailDeliveries;
      bankShotDeliveriesRef.current = state.stats.bankShotDeliveries;
      stuntBonusRef.current = state.stats.stuntBonus;
      cargoBouncesRef.current = state.stats.cargoBounces;
      brokenSamplesRef.current = state.stats.brokenSamples;

      if (state.cart) {
        cartOwnerId = state.cart.ownerId;
        cartCargoIds = state.cart.cargoIds.filter((id) =>
          state.deposits.some((deposit) => deposit.id === id && deposit.state === "cart"),
        );
        world.rover.position.fromArray(state.cart.position);
        world.rover.rotation.y = state.cart.yaw;
      }

      if (state.facility && world.destinationId === "rust_belt") {
        world.processingStation.userData.relayMask = state.facility.relayMask;
        world.processingStation.userData.vaultOpen = state.facility.vaultOpen;
        world.processingStation.userData.railPulse = Math.max(
          Number(world.processingStation.userData.railPulse ?? 0),
          state.facility.railPulse,
        );
        updateFacilityVisuals();
      }

      const incomingPings = state.pings ?? [];
      const incomingPingIds = new Set(incomingPings.map((ping) => ping.id));
      incomingPings.forEach(upsertCrewPing);
      [...crewPings.keys()].forEach((id) => {
        if (!incomingPingIds.has(id)) removeCrewPing(id);
      });
      crewRescueAssists.clear();
      (state.rescueAssists ?? []).forEach((assist) => {
        crewRescueAssists.set(assist.targetMemberId, { ...assist });
      });

      const localMemberId = crewSessionRef.current?.memberId ?? null;
      (state.fieldToolCases ?? []).forEach((incoming) => {
        const fieldCase = fieldToolCases.find(
          (candidate) => candidate.id === incoming.id,
        );
        if (!fieldCase) return;
        fieldCase.ownerId = incoming.ownerId;
        fieldCase.velocity = [...incoming.velocity];
        fieldCase.isBallistic = incoming.isBallistic;
        fieldCase.bounceCount = incoming.bounceCount;
        if (incoming.ownerId === null) {
          if (fieldCase.group.parent !== scene) scene.attach(fieldCase.group);
          fieldCase.group.position.fromArray(incoming.position);
          fieldCase.group.scale.setScalar(1);
        }
      });
      const incomingLocalFieldCase = fieldToolCases.find(
        (fieldCase) => fieldCase.ownerId === localMemberId,
      );
      if (
        incomingLocalFieldCase &&
        incomingLocalFieldCase.id !== previousLocalFieldCaseId
      ) {
        activeHarvestToolRef.current = incomingLocalFieldCase.toolId;
        setAstronautHarvestTool(astronaut, incomingLocalFieldCase.toolId);
        sound("pickup");
      }
      previousLocalFieldCaseId = incomingLocalFieldCase?.id ?? null;

      carryingRef.current = null;
      state.deposits.forEach((incoming) => {
        const deposit = deposits.find((candidate) => candidate.id === incoming.id);
        if (!deposit) return;
        if (deposit.group.parent !== scene) scene.attach(deposit.group);
        deposit.state = incoming.state;
        deposit.progress = incoming.progress;
        deposit.condition = incoming.condition;
        deposit.group.position.fromArray(incoming.position);
        deposit.position = deposit.group.position;
        deposit.velocity.fromArray(incoming.velocity);
        deposit.isBallistic = incoming.isBallistic;
        deposit.bounceCount = incoming.bounceCount;
        deposit.ownerId = incoming.ownerId;
        deposit.tetherOwnerIds = incoming.tetherOwnerIds ?? [];
        setDepositVisualState(deposit);
        if (incoming.ownerId === localMemberId) carryingRef.current = incoming.id;
      });
      cartCargoIds.forEach((id, slotIndex) => {
        const deposit = deposits.find((candidate) => candidate.id === id);
        if (deposit) placeCargoInCart(deposit, slotIndex);
      });
    };

    const processCrewActions = () => {
      const room = crewRoomRef.current;
      const session = crewSessionRef.current;
      if (!room || session?.role !== "host") return;

      room.actions.forEach((action) => {
        if (action.id <= processedCrewActionRef.current) return;
        const member = room.members.find((candidate) => candidate.id === action.memberId);
        processedCrewActionRef.current = Math.max(
          processedCrewActionRef.current,
          action.id,
        );
        if (!member) return;
        const memberPosition = new THREE.Vector3(member.x, member.y, member.z);

        if (action.type === "scan") {
          let revealed = 0;
          deposits.forEach((deposit) => {
            if (
              deposit.state === "hidden" &&
              (deposit.kind !== "flux_core" ||
                Boolean(world.processingStation.userData.vaultOpen)) &&
              deposit.group.position.distanceTo(memberPosition) < 16
            ) {
              deposit.state = "revealed";
              setDepositVisualState(deposit);
              revealed += 1;
            }
          });
          messageRef.current = `${member.name} scanned ${
            revealed > 0 ? `${revealed} profitable signal${revealed === 1 ? "" : "s"}` : "mostly dust"
          }.`;
          return;
        }

        if (action.type.startsWith("ping")) {
          const pingMessages: Record<string, string> = {
            ping: "PINGED THEIR LOCATION",
            ping_help: "NEEDS HELP",
            ping_cargo: "MARKED CARGO",
            ping_danger: "MARKED DANGER",
            ping_ship: "CALLED RETURN TO SHIP",
          };
          placeCrewPing(
            `crew-action-${action.id}`,
            member.id,
            member.name,
            action.type,
            memberPosition,
          );
          messageRef.current = `${member.name} ${pingMessages[action.type]}.`;
          if (action.type === "ping_danger") sound("warning");
          return;
        }

        if (action.type === "tether") {
          toggleTether(member.id, member.name, memberPosition);
          return;
        }

        if (action.type === "magnet") {
          fireMagneticRetriever(
            member.name,
            memberPosition,
            (member.inputMask & CREW_INPUT_POLARITY_REPEL) !== 0
              ? "repel"
              : "attract",
          );
          return;
        }

        if (action.type === "stabilize") {
          stabilizeSample(member.id, member.name);
          return;
        }

        if (action.type === "rescue") {
          activateCrewRescue(member.id, member.name, memberPosition);
          return;
        }

        if (action.type === "cart_toggle") {
          toggleCargoCart(member.id, member.name, memberPosition);
          return;
        }

        if (action.type === "tool_throw") {
          tossFieldToolCase(
            member.id,
            member.name,
            memberPosition,
            member.yaw,
          );
          return;
        }

        const held = deposits.find((deposit) => deposit.ownerId === member.id);
        if (held) {
          if (
            action.type === "interact" &&
            launchCargoByMagRail(member.id, member.name, memberPosition)
          ) {
            return;
          }
          if (
            action.type === "interact" &&
            memberPosition.distanceTo(CARGO_RECEIVER_POSITION) < 3.8
          ) {
            const earned = calculateCargoValue(held.kind, held.condition);
            held.state = "secured";
            held.ownerId = null;
            held.tetherOwnerIds = [];
            held.group.visible = false;
            held.velocity.set(0, 0, 0);
            held.isBallistic = false;
            scoreRef.current += earned;
            messageRef.current = `${member.name} secured ${cargoData[held.kind].name} for ¢${earned}.`;
            airmailFlash = 1;
            sound("secure");
            return;
          }

          if (
            action.type === "interact" &&
            loadCargoIntoCart(member.id, member.name, memberPosition)
          ) {
            return;
          }

          if (held.group.parent !== scene) scene.attach(held.group);
          const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            member.yaw,
          );
          held.group.position.copy(memberPosition).addScaledVector(forward, 2.3);
          held.group.position.y = action.type === "throw" ? 2.4 + member.y : 0.62;
          held.ownerId = null;
          held.tetherOwnerIds = [];
          held.group.scale.setScalar(1);
          if (action.type === "throw") {
            held.velocity.copy(forward).multiplyScalar(cargoData[held.kind].throwSpeed);
            held.velocity.y = cargoData[held.kind].throwLift;
            held.isBallistic = true;
            held.bounceCount = 0;
            messageRef.current = `${member.name} launched ${cargoData[held.kind].name}. Crew chase authorized.`;
            sound("launch");
          } else {
            held.velocity.set(0, 0, 0);
            held.isBallistic = false;
            held.bounceCount = 0;
            messageRef.current = `${member.name} placed ${cargoData[held.kind].name}. Suspiciously careful.`;
          }
          return;
        }

        if (
          action.type === "interact" &&
          pickupFieldToolCase(member.id, member.name, memberPosition)
        ) {
          return;
        }

        if (
          action.type === "interact" &&
          depositCargoCart(member.name, memberPosition)
        ) {
          return;
        }

        const nearbyCargo = deposits
          .filter(
            (deposit) =>
              deposit.state === "cargo" &&
              deposit.ownerId === null &&
              !deposit.isBallistic,
          )
          .sort(
            (a, b) =>
              a.group.position.distanceTo(memberPosition) -
              b.group.position.distanceTo(memberPosition),
          )[0];
        if (nearbyCargo && nearbyCargo.group.position.distanceTo(memberPosition) < 3.2) {
          nearbyCargo.ownerId = member.id;
          nearbyCargo.tetherOwnerIds = [];
          nearbyCargo.velocity.set(0, 0, 0);
          nearbyCargo.isBallistic = false;
          nearbyCargo.bounceCount = 0;
          messageRef.current = `${member.name} acquired ${cargoData[nearbyCargo.kind].name}.`;
          sound("pickup");
        }
      });
    };

    const updateRemoteCrew = (dt: number, now: number) => {
      const room = crewRoomRef.current;
      const session = crewSessionRef.current;
      const activeIds = new Set<string>();
      if (room && session) {
        room.members.forEach((member) => {
          if (member.id === session.memberId) return;
          activeIds.add(member.id);
          let remote = remoteAstronauts.get(member.id);
          if (!remote) {
            const memberColor = crewColor(member.colorIndex).hex;
            const group = createAstronaut(memberColor);
            group.position.set(member.x, member.y, member.z);
            group.scale.setScalar(0.94);
            const anchor = new THREE.Object3D();
            anchor.position.set(0, 2.05, -2.05);
            const caseAnchor = group.userData.fieldCaseAnchor as THREE.Object3D;
            const nameplate = createBillboardLabel(
              member.name,
              member.role === "host" ? "MISSION LEAD" : "FIELD GOON",
              memberColor,
              [4.6, 1.12],
            );
            nameplate.position.set(0, 4.25, 0);
            group.add(anchor, nameplate);
            scene.add(group);
            remote = {
              group,
              anchor,
              caseAnchor,
              target: new THREE.Vector3(member.x, member.y, member.z),
              networkPosition: new THREE.Vector3(member.x, member.y, member.z),
              networkVelocity: new THREE.Vector3(),
              lastSyncAt: now,
              targetYaw: member.yaw,
              inputMask: member.inputMask,
              nameplate,
            };
            remoteAstronauts.set(member.id, remote);
          }
          const incomingPosition = new THREE.Vector3(member.x, member.y, member.z);
          if (incomingPosition.distanceToSquared(remote.networkPosition) > 0.0001) {
            const networkDelta = Math.max(0.05, (now - remote.lastSyncAt) / 1000);
            remote.networkVelocity
              .copy(incomingPosition)
              .sub(remote.networkPosition)
              .divideScalar(networkDelta);
            if (remote.networkVelocity.length() > 11) {
              remote.networkVelocity.setLength(11);
            }
            remote.networkPosition.copy(incomingPosition);
            remote.lastSyncAt = now;
          }
          remote.target
            .copy(incomingPosition)
            .addScaledVector(remote.networkVelocity, 0.11);
          remote.targetYaw = member.yaw;
          remote.inputMask = member.inputMask;
          remote.group.visible = phaseRef.current === "active";
          remote.group.position.lerp(remote.target, 1 - Math.exp(-dt * 9));
          const yawDelta = Math.atan2(
            Math.sin(remote.targetYaw - remote.group.rotation.y),
            Math.cos(remote.targetYaw - remote.group.rotation.y),
          );
          remote.group.rotation.y += yawDelta * (1 - Math.exp(-dt * 11));

          const moving = (remote.inputMask & CREW_INPUT_MOVING) !== 0;
          const downed = (remote.inputMask & CREW_INPUT_DOWNED) !== 0;
          (remote.nameplate.material as THREE.SpriteMaterial).opacity = downed
            ? 0.72 + Math.sin(now * 0.012) * 0.2
            : 1;
          const gait = now * 0.009;
          const gaitAmount = downed ? 0.03 : moving ? 0.52 : 0.08;
          (remote.group.userData.leftLeg as THREE.Group).rotation.x =
            Math.sin(gait) * gaitAmount;
          (remote.group.userData.rightLeg as THREE.Group).rotation.x =
            Math.sin(gait + Math.PI) * gaitAmount;
          remote.group.rotation.z = THREE.MathUtils.damp(
            remote.group.rotation.z,
            downed ? -1.18 : 0,
            8,
            dt,
          );
          const drilling = (remote.inputMask & CREW_INPUT_DRILL) !== 0;
          const remoteTool = crewHarvestTool(remote.inputMask);
          setAstronautHarvestTool(remote.group, remoteTool);
          if (drilling) {
            if (remoteTool === "drill") {
              (remote.group.userData.drill as THREE.Group).rotation.y += dt * 34;
            } else if (remoteTool === "corer") {
              const head = remote.group.userData.corerHead as THREE.Mesh;
              head.position.y = -2.35 + Math.sin(now * 0.03) * 0.18;
            } else {
              (remote.group.userData.siphonValve as THREE.Mesh).rotation.z += dt * 4.5;
            }
          }
          const thruster = (remote.inputMask & CREW_INPUT_THRUSTER) !== 0;
          (remote.group.userData.thrusterFlames as THREE.Mesh[]).forEach((flame) => {
            flame.scale.setScalar(
              THREE.MathUtils.damp(flame.scale.x, thruster ? 0.82 : 0.01, 18, dt),
            );
          });
          (remote.group.userData.thrusterGlow as THREE.PointLight).intensity =
            THREE.MathUtils.damp(
              (remote.group.userData.thrusterGlow as THREE.PointLight).intensity,
              thruster ? 9 : 0,
              16,
              dt,
            );
        });
      }

      remoteAstronauts.forEach((remote, id) => {
        if (activeIds.has(id)) return;
        remote.group.removeFromParent();
        const nameplateMaterial = remote.nameplate.material as THREE.SpriteMaterial;
        nameplateMaterial.map?.dispose();
        nameplateMaterial.dispose();
        remoteAstronauts.delete(id);
      });
    };

    const animate = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      hudTimer += dt;
      const keys = keysRef.current;
      const pad = readStandardGamepad(
        typeof navigator.getGamepads === "function"
          ? primaryGamepad(navigator.getGamepads())
          : null,
      );
      if (pad.connected !== lastPadConnected) {
        lastPadConnected = pad.connected;
        setControllerConnected(pad.connected);
      }
      if (
        networkMissionStartRef.current !== null &&
        phaseRef.current === "briefing"
      ) {
        const incomingContractId = incomingAuthorityRef.current?.state.contractId;
        if (incomingContractId) {
          const safeContractId = normalizeContractId(incomingContractId);
          activeContractIdRef.current = safeContractId;
          activeDestinationRef.current = CONTRACTS[safeContractId].destinationId;
          setSelectedContractId(safeContractId);
        }
        missionSeedRef.current = networkMissionStartRef.current;
        resetRuntimeRef.current?.();
        missionRunIdRef.current += 1;
        setLastSettlement(null);
        phaseRef.current = "active";
        messageRef.current =
          crewSessionRef.current?.role === "guest"
            ? "Crew contract received. Local movement prediction engaged."
            : "Crew contract live. Mission state authority assigned.";
        startAmbience(activeDestinationRef.current);
        networkMissionStartRef.current = null;
      }
      const session = crewSessionRef.current;
      const hasAuthority = !session || session.role === "host";
      const incomingAuthority = incomingAuthorityRef.current;
      if (
        session?.role === "guest" &&
        incomingAuthority &&
        incomingAuthority.revision > processedAuthorityRevisionRef.current
      ) {
        applyAuthoritativeState(incomingAuthority.state);
        processedAuthorityRevisionRef.current = incomingAuthority.revision;
      }
      const localOwnerId = session?.memberId ?? "solo";
      const localSpecialistCase = fieldToolCases.find(
        (fieldCase) => fieldCase.ownerId === localOwnerId,
      );
      const nearbyLooseFieldCase = nearestLooseFieldToolCase(astronaut.position);
      const phase = phaseRef.current;
      const gameplayInputEnabled =
        phase === "active" &&
        !notesOpenRef.current &&
        !settingsOpenRef.current;
      if (gameplayInputEnabled && pad.connected) {
        const { lookSensitivity, invertY } = controlSettingsRef.current;
        astronaut.rotation.y -= pad.lookX * dt * 2.75 * lookSensitivity;
        cameraPitch = THREE.MathUtils.clamp(
          cameraPitch + pad.lookY * dt * 2.1 * lookSensitivity * (invertY ? 1 : -1),
          -0.28,
          0.34,
        );
      }
      if (pad.menu && !padMenuLatch && phase === "active") {
        settingsOpenRef.current = true;
        notesOpenRef.current = false;
        setNotesOpen(false);
        setSettingsOpen(true);
        keys.clear();
        if (document.pointerLockElement) document.exitPointerLock();
      }
      padMenuLatch = pad.menu;

      if (pad.toolCycle && !padToolCycleLatch && gameplayInputEnabled) {
        cycleHarvestTool(1);
      }
      padToolCycleLatch = pad.toolCycle;

      if (pad.tether && !padTetherLatch && gameplayInputEnabled) {
        const activeSession = crewSessionRef.current;
        if (activeSession?.role === "guest") {
          queueCrewAction("tether");
          messageRef.current = "Tether request sent to mission lead authority.";
        } else {
          toggleTether(
            activeSession?.memberId ?? "solo",
            activeSession?.name ?? "SOLO GOON",
            astronaut.position,
          );
        }
      }
      padTetherLatch = pad.tether;

      if (pad.cartToggle && !padCartLatch && gameplayInputEnabled) {
        const activeSession = crewSessionRef.current;
        if (activeSession?.role === "guest") {
          queueCrewAction("cart_toggle");
          messageRef.current =
            "Cargo cart hitch request sent to mission lead authority.";
        } else {
          toggleCargoCart(
            activeSession?.memberId ?? "solo",
            activeSession?.name ?? "SOLO GOON",
            astronaut.position,
          );
        }
      }
      padCartLatch = pad.cartToggle;

      if (pad.magnet && !padMagnetLatch && gameplayInputEnabled) {
        const activeSession = crewSessionRef.current;
        if (magnetCooldownRef.current > 0) {
          messageRef.current = `Magnetic retriever recharging: ${magnetCooldownRef.current.toFixed(1)}s.`;
        } else if (activeSession?.role === "guest") {
          queueCrewAction("magnet");
          magnetCooldownRef.current = polarityActionCooldown(astronaut.position);
          messageRef.current = "Magnetic retrieval request sent to mission lead authority.";
          sound("scan");
        } else if (
          fireMagneticRetriever(
            activeSession?.name ?? "SOLO GOON",
            astronaut.position,
            polarityModeRef.current,
          )
        ) {
          magnetCooldownRef.current = polarityActionCooldown(astronaut.position);
        }
      }
      padMagnetLatch = pad.magnet;

      if (pad.polarityToggle && !padPolarityLatch && gameplayInputEnabled) {
        polarityModeRef.current =
          polarityModeRef.current === "attract" ? "repel" : "attract";
        messageRef.current = `POLARITY MANIPULATOR // ${polarityModeRef.current.toUpperCase()} MODE.`;
        sound("scan");
      }
      padPolarityLatch = pad.polarityToggle;

      if (pad.stabilize && !padStabilizerLatch && gameplayInputEnabled) {
        const activeSession = crewSessionRef.current;
        if (stabilizerChargesRef.current <= 0) {
          messageRef.current = "Sample stabilizer empty. The foam budget has been respected.";
        } else if (activeSession?.role === "guest") {
          queueCrewAction("stabilize");
          stabilizerChargesRef.current -= 1;
          messageRef.current = "Sample stabilization request sent to mission lead authority.";
        } else if (
          stabilizeSample(
            activeSession?.memberId ?? "solo",
            activeSession?.name ?? "SOLO GOON",
          )
        ) {
          stabilizerChargesRef.current -= 1;
        }
      }
      padStabilizerLatch = pad.stabilize;

      const padPingType: CrewActionType | null = pad.pingHelp
        ? "ping_help"
        : pad.pingCargo
          ? "ping_cargo"
          : pad.pingDanger
            ? "ping_danger"
            : pad.pingShip
              ? "ping_ship"
              : null;
      if (
        padPingType &&
        !padPingLatch &&
        gameplayInputEnabled &&
        crewSessionRef.current
      ) {
        const pingLabels: Record<string, string> = {
          ping_help: "NEEDS HELP",
          ping_cargo: "MARKED CARGO",
          ping_danger: "MARKED DANGER",
          ping_ship: "CALLED RETURN TO SHIP",
        };
        if (crewSessionRef.current.role === "guest") queueCrewAction(padPingType);
        else {
          localPingSequence += 1;
          placeCrewPing(
            `lead-${localPingSequence}`,
            crewSessionRef.current.memberId,
            crewSessionRef.current.name,
            padPingType,
            astronaut.position,
          );
          messageRef.current = `${crewSessionRef.current.name} ${pingLabels[padPingType]}.`;
        }
        sound(padPingType === "ping_danger" ? "warning" : "scan");
      }
      padPingLatch = padPingType !== null;
      updateRemoteCrew(dt, now);
      if (hasAuthority && phase === "active") processCrewActions();

      crewPings.forEach((ping, id) => {
        ping.data.remaining = Math.max(0, ping.data.remaining - dt);
        ping.group.visible = phase === "active";
        const pulse = 1 + Math.sin(now * 0.008 + id.length) * 0.14;
        ping.ring.rotation.z += dt * 0.75;
        ping.ring.scale.setScalar(pulse);
        ping.beam.scale.y = 0.84 + Math.sin(now * 0.006) * 0.08;
        ping.light.intensity = 5.5 + pulse * 2.5;
        const fade = Math.min(1, ping.data.remaining / 1.25);
        (ping.ring.material as THREE.MeshBasicMaterial).opacity = 0.82 * fade;
        (ping.beam.material as THREE.MeshBasicMaterial).opacity = 0.26 * fade;
        if (ping.data.remaining <= 0) removeCrewPing(id);
      });
      crewRescueAssists.forEach((assist, targetMemberId) => {
        assist.remaining = Math.max(0, assist.remaining - dt);
        if (assist.remaining <= 0) crewRescueAssists.delete(targetMemberId);
      });

      airmailFlash = Math.max(0, airmailFlash - dt * 1.25);
      const receiverPulse = 1 + Math.sin(now * 0.0045) * 0.06 + airmailFlash * 0.22;
      const receiverPad = world.cargoReceiver.userData.pad as THREE.Mesh;
      const receiverGate = world.cargoReceiver.userData.gate as THREE.Mesh;
      receiverPad.rotation.z -= dt * (0.18 + airmailFlash * 2.2);
      receiverGate.scale.setScalar(receiverPulse);
      (world.cargoReceiver.userData.padMaterial as THREE.MeshBasicMaterial).opacity =
        0.38 + airmailFlash * 0.46;
      (world.cargoReceiver.userData.gateMaterial as THREE.MeshBasicMaterial).opacity =
        0.2 + airmailFlash * 0.72;
      (world.cargoReceiver.userData.beamMaterial as THREE.MeshBasicMaterial).opacity =
        0.045 + airmailFlash * 0.18;
      (world.cargoReceiver.userData.light as THREE.PointLight).intensity =
        4.5 + airmailFlash * 18;

      world.pressureVents.forEach((vent, index) => {
        const total = now * 0.001 + (vent.userData.offset as number);
        const cycleTime = total % 14.5;
        const cycle = Math.floor(total / 14.5);
        const warning = cycleTime >= 11.35 && cycleTime < 12.4;
        const erupting = cycleTime >= 12.4 && cycleTime < 13.55;
        vent.userData.warning = warning;
        vent.userData.erupting = erupting;
        vent.userData.cycle = cycle;

        const warningRing = vent.userData.warningRing as THREE.Mesh;
        const ringMaterial = warningRing.material as THREE.MeshBasicMaterial;
        const ringPulse = 1 + Math.sin(now * 0.014 + index) * 0.16;
        warningRing.scale.setScalar(warning || erupting ? ringPulse * 1.2 : ringPulse);
        ringMaterial.color.setHex(warning || erupting ? palette.coral : palette.cyan);
        ringMaterial.opacity = erupting ? 0.72 : warning ? 0.5 : 0.2;

        const plume = vent.userData.plume as THREE.Mesh;
        const plumeMaterial = plume.material as THREE.MeshBasicMaterial;
        const plumeScale = erupting
          ? 0.82 + Math.sin(now * 0.042 + index) * 0.16
          : warning
            ? 0.13
            : 0.04;
        plume.scale.x = THREE.MathUtils.damp(plume.scale.x, plumeScale, 14, dt);
        plume.scale.y = THREE.MathUtils.damp(
          plume.scale.y,
          erupting ? 0.95 + Math.sin(now * 0.035) * 0.12 : plumeScale,
          14,
          dt,
        );
        plume.scale.z = THREE.MathUtils.damp(plume.scale.z, plumeScale, 14, dt);
        plumeMaterial.opacity = erupting ? 0.4 : warning ? 0.08 : 0;
        (vent.userData.light as THREE.PointLight).intensity = erupting
          ? 11 + Math.sin(now * 0.04) * 3
          : warning
            ? 3
            : 0.65;
      });

      let magneticStormWarning = false;
      let magneticStormActive = false;
      if (world.destinationId === "rust_belt") {
        const station = world.processingStation;
        const railPulse = Math.max(0, Number(station.userData.railPulse ?? 0) - dt * 1.15);
        station.userData.railPulse = railPulse;
        (station.userData.railCoils as THREE.Mesh[]).forEach((coil, index) => {
          coil.rotation.x += dt * (0.35 + railPulse * (6 + index * 0.55));
          const coilMaterial = coil.material as THREE.MeshStandardMaterial;
          coilMaterial.emissiveIntensity = THREE.MathUtils.damp(
            coilMaterial.emissiveIntensity,
            0.28 + railPulse * 3.6,
            12,
            dt,
          );
        });
        (station.userData.relays as THREE.Group[]).forEach((relay, index) => {
          const ring = relay.userData.ring as THREE.Mesh;
          ring.rotation.z += dt * (0.22 + index * 0.07);
        });
        const fieldTime = now * 0.001 + (missionSeedRef.current % 17) * 0.31;
        const fieldCycle = Math.floor(fieldTime / 19);
        const fieldPhase = fieldTime % 19;
        magneticStormWarning = fieldPhase >= 13.2 && fieldPhase < 15.2;
        magneticStormActive = fieldPhase >= 15.2 && fieldPhase < 18.1;
        if (fieldCycle !== magneticStormCycle) {
          magneticStormCycle = fieldCycle;
          magneticStormPlayed = false;
        }
        const fieldStrength = magneticStormActive
          ? 0.72 + Math.sin(now * 0.018) * 0.24
          : magneticStormWarning
            ? 0.24 + Math.sin(now * 0.011) * 0.09
            : 0.06;
        const arcs = (world.magneticField.userData.arcs ?? []) as THREE.Mesh[];
        arcs.forEach((arc, index) => {
          arc.rotation.z += dt * (0.08 + index * 0.035) * (magneticStormActive ? 4 : 1);
          arc.rotation.y -= dt * 0.04 * (index % 2 === 0 ? 1 : -1);
          (arc.material as THREE.MeshBasicMaterial).opacity =
            (arc.userData.baseOpacity as number) + fieldStrength * (0.22 + index * 0.018);
          arc.scale.setScalar(1 + fieldStrength * 0.08 + Math.sin(now * 0.006 + index) * 0.025);
        });
        const fieldCore = world.magneticField.userData.core as THREE.Mesh;
        const fieldLight = world.magneticField.userData.light as THREE.PointLight;
        fieldCore.rotation.y += dt * (magneticStormActive ? 2.8 : 0.42);
        fieldCore.rotation.x -= dt * (magneticStormActive ? 1.7 : 0.18);
        fieldLight.intensity = magneticStormActive
          ? 18 + Math.sin(now * 0.027) * 7
          : magneticStormWarning
            ? 6
            : 1.5;

        if (phase === "active" && magneticStormWarning && !magneticStormPlayed) {
          magneticStormPlayed = true;
          messageRef.current =
            "POLARITY SURGE INBOUND. Secure magnetic cargo or enjoy the company chase procedure.";
          sound("storm");
        }

        if (phase === "active" && magneticStormActive) {
          const fieldPosition = world.magneticField.getWorldPosition(new THREE.Vector3());
          if (playerHeight > 0.25) {
            const playerPull = fieldPosition.clone().sub(astronaut.position).setY(0);
            if (playerPull.lengthSq() > 0.01) velocity.addScaledVector(playerPull.normalize(), dt * 0.9);
          }
          if (hasAuthority) {
            deposits.forEach((deposit) => {
              if (
                !cargoData[deposit.kind].magnetic ||
                (deposit.state !== "cargo" && !deposit.isBallistic) ||
                deposit.ownerId
              ) {
                return;
              }
              const pull = fieldPosition.clone().sub(deposit.group.position);
              if (pull.lengthSq() > 0.01) {
                deposit.velocity.addScaledVector(pull.normalize(), dt * 5.4);
                deposit.isBallistic = true;
              }
            });
            if (!cartOwnerId && cartCargoIds.length > 0) {
              const cartPull = fieldPosition.clone().sub(world.rover.position).setY(0);
              if (cartPull.lengthSq() > 0.01) {
                world.rover.position.addScaledVector(cartPull.normalize(), dt * 0.42);
              }
            }
          }
        }
      }

      if (
        phase === "active" &&
        !notesOpenRef.current &&
        !settingsOpenRef.current
      ) {
        timeRef.current = Math.max(0, timeRef.current - dt);
        scanCooldownRef.current = Math.max(0, scanCooldownRef.current - dt);
        magnetCooldownRef.current = Math.max(0, magnetCooldownRef.current - dt);
        damageCooldown = Math.max(0, damageCooldown - dt);
        const jumpPressed = keys.has("Space") || pad.jump;
        const scanInput = keys.has("KeyQ") || pad.scan;
        const drillInput = keys.has("KeyF") || pad.drill;
        const repairInput = keys.has("KeyR") || pad.repair;
        const interactInput = keys.has("KeyE") || pad.interact || pad.throwCargo;
        const throwInput =
          keys.has("ShiftLeft") || keys.has("ShiftRight") || pad.throwCargo;

        if (downedRef.current) {
          const localMemberId = session?.memberId ?? "solo";
          const rescueAssist = crewRescueAssists.get(localMemberId);
          const assisted = Boolean(rescueAssist && rescueAssist.remaining > 0);
          recoveryProgressRef.current = advanceSuitRecovery(
            recoveryProgressRef.current,
            interactInput || assisted,
            dt * (assisted ? 1.7 : 1),
          );
          if (recoveryProgressRef.current >= 100) {
            downedRef.current = false;
            suitIntegrityRef.current = 42;
            recoveryProgressRef.current = 0;
            suitRecoveriesRef.current += 1;
            damageCooldown = 3;
            crewRescueAssists.delete(localMemberId);
            messageRef.current =
              assisted
                ? `${rescueAssist?.helperName ?? "A TEAMMATE"} COMPLETED THE SUIT REBOOT ASSIST. Forty-two percent integrity is apparently within policy.`
                : "Suit reboot complete. Forty-two percent integrity is apparently within policy.";
            sound("repair");
          }
        } else {
          recoveryProgressRef.current = 0;
          if (astronaut.position.distanceTo(SHIP_POSITION) < 7.2) {
            suitIntegrityRef.current = Math.min(
              100,
              suitIntegrityRef.current + dt * 9,
            );
          }
        }

        if (timeRef.current <= 30 && !warningPlayed) {
          warningPlayed = true;
          messageRef.current = "FINAL DEPARTURE. The ship has stopped accepting excuses.";
          sound("warning");
        }

        const carried = deposits.find((deposit) => deposit.id === carryingRef.current);
        if (hasAuthority && session?.role === "host") {
          crewRoomRef.current?.members.forEach((member) => {
            if (
              member.id === session.memberId ||
              (member.inputMask & CREW_INPUT_DRILL) === 0
            ) {
              return;
            }
            const memberPosition = new THREE.Vector3(member.x, member.y, member.z);
            const memberTool = crewHarvestTool(member.inputMask);
            const memberSpecialistCase = fieldToolCases.find(
              (fieldCase) => fieldCase.ownerId === member.id,
            );
            const target = deposits
              .filter(
                (deposit) =>
                  (deposit.state === "revealed" || deposit.state === "extracting") &&
                  deposit.ownerId === null,
              )
              .sort(
                (a, b) =>
                  a.group.position.distanceTo(memberPosition) -
                  b.group.position.distanceTo(memberPosition),
            )[0];
            if (!target || target.group.position.distanceTo(memberPosition) >= 3) return;
            if (!canHarvestCargo(memberTool, target.kind)) return;
            target.state = "extracting";
            const harvestRate =
              (memberTool === "drill" ? 20 : memberTool === "corer" ? 18 : 22) *
              fieldCaseHarvestMultiplier(memberSpecialistCase?.toolId, memberTool);
            target.progress = Math.min(100, target.progress + dt * harvestRate);
            target.harvestPulse = Math.max(
              target.harvestPulse,
              memberTool === "corer" ? 0.72 : memberTool === "siphon" ? 0.42 : 0.18,
            );
            target.beacon.intensity = 11;
            if (target.progress >= 100) {
              target.state = "cargo";
              target.shell.visible = false;
              target.core.visible = true;
              target.methodMarker.visible = false;
              target.beacon.intensity = 9;
              messageRef.current = `${member.name} extracted ${cargoData[target.kind].name} with the ${harvestToolData[memberTool].name}. Shared logistics problem created.`;
              sound("pickup");
            }
          });
        }
        const debrisWindow = world.destinationId === "rust_belt" ? 82 : 55;
        if (timeRef.current <= debrisWindow) {
          if (!meteorWarningPlayed) {
            meteorWarningPlayed = true;
            messageRef.current =
              world.destinationId === "rust_belt"
                ? "ORBITAL SCRAP CONVERGENCE. The asteroid is collecting company property at speed."
                : "DEBRIS SHOWER INBOUND. Coral target markers now indicate professional concern.";
            sound("warning");
          }
          meteorCooldown -= dt;
          if (meteorCooldown <= 0 && armMeteorHazard()) {
            meteorCooldown =
              timeRef.current <= 25
                ? (world.destinationId === "rust_belt" ? 1.9 : 2.5) + missionRandom() * 1.8
                : (world.destinationId === "rust_belt" ? 3.1 : 4) + missionRandom() * 2.5;
          }
        }

        world.meteorHazards.forEach((meteor) => {
          if (meteor.state === "idle") return;

          if (meteor.state === "warning") {
            meteor.timer -= dt;
            const warningPulse = 1 + Math.sin(now * 0.025) * 0.16;
            meteor.marker.scale.setScalar(warningPulse);
            meteor.markerMaterial.opacity = 0.38 + Math.sin(now * 0.03) * 0.22;
            meteor.light.intensity = 2.5 + Math.sin(now * 0.024) * 1.4;
            if (meteor.timer <= 0) {
              meteor.state = "falling";
              meteor.timer = 0.72;
            }
          } else if (meteor.state === "falling") {
            meteor.timer -= dt;
            const fallProgress = THREE.MathUtils.clamp(1 - meteor.timer / 0.72, 0, 1);
            meteor.meteor.position.y = THREE.MathUtils.lerp(34, 0.65, fallProgress);
            meteor.meteor.rotation.x += dt * 8;
            meteor.meteor.rotation.z += dt * 5;
            meteor.markerMaterial.opacity = 0.62 + Math.sin(now * 0.05) * 0.2;
            meteor.light.intensity = 4 + fallProgress * 18;
            meteor.light.position.y = meteor.meteor.position.y;
            if (meteor.timer <= 0) {
              meteor.state = "impact";
              meteor.impactAge = 0;
              meteor.meteor.visible = false;
              meteor.trail.visible = false;
              meteor.light.position.y = 0.8;
              meteor.light.intensity = 22;
              emitDustBurst(meteor.group.position, 2.15);
              sound("warning");

              const impactDistance = meteor.group.position.distanceTo(
                astronaut.position,
              );
              if (impactDistance < 4.4) {
                const suitResult = applySuitDamage(
                  impactDistance < 2.35 ? 44 : 28,
                );
                const blastDirection = astronaut.position
                  .clone()
                  .sub(meteor.group.position)
                  .setY(0);
                if (blastDirection.lengthSq() < 0.01) blastDirection.set(1, 0, 0);
                velocity.add(blastDirection.normalize().multiplyScalar(5.2));
                verticalVelocity = Math.max(verticalVelocity, carried ? 6.4 : 8.2);
                playerHeight = Math.max(playerHeight, 0.16);
                cameraImpact = Math.max(cameraImpact, 1.8);
                if (carried) {
                  const impactDamage =
                    carried.kind === "glass"
                      ? 0.18
                      : carried.kind === "ferric"
                        ? 0.065
                        : 0.03;
                  carried.condition = Math.max(
                    0.42,
                    carried.condition - impactDamage,
                  );
                  if (suitResult !== "downed") {
                    messageRef.current = `METEOR IMPACT! ${
                      cargoData[carried.kind].name
                    } condition ${Math.round(
                      carried.condition * 100,
                    )}%. Suit ${Math.round(suitIntegrityRef.current)}%.`;
                  }
                } else if (suitResult !== "downed") {
                  messageRef.current =
                    `METEOR IMPACT! Your trajectory is now pending peer review. Suit ${Math.round(
                      suitIntegrityRef.current,
                    )}%.`;
                }
              }
            }
          } else {
            meteor.impactAge += dt;
            const impactProgress = meteor.impactAge / 0.82;
            meteor.marker.scale.setScalar(1 + impactProgress * 3.8);
            meteor.markerMaterial.opacity = Math.max(0, 0.8 * (1 - impactProgress));
            meteor.light.intensity = Math.max(0, 22 * (1 - impactProgress));
            if (meteor.impactAge >= 0.82) {
              meteor.state = "idle";
              meteor.group.visible = false;
              meteor.light.intensity = 0;
            }
          }
        });

        world.pressureVents.forEach((vent) => {
          const distance = vent.position.distanceTo(astronaut.position);
          const cycle = vent.userData.cycle as number;
          if (
            vent.userData.erupting &&
            distance < 3.25 &&
            playerHeight < 1.25 &&
            vent.userData.lastLaunchCycle !== cycle
          ) {
            vent.userData.lastLaunchCycle = cycle;
            verticalVelocity = Math.max(verticalVelocity, carried ? 7.1 : 9.3);
            playerHeight = Math.max(playerHeight, 0.18);
            cameraImpact = Math.max(cameraImpact, 1.55);
            emitDustBurst(astronaut.position, 1.7);
            if (carried) {
              const hazardDamage =
                carried.kind === "glass" ? 0.22 : carried.kind === "ferric" ? 0.08 : 0.035;
              carried.condition = Math.max(0.42, carried.condition - hazardDamage);
            }
            const suitResult = applySuitDamage(18);
            if (suitResult !== "downed") {
              messageRef.current = carried
                ? `PRESSURE VENT! Crew and ${
                    cargoData[carried.kind].name
                  } launched together. Condition ${Math.round(
                    carried.condition * 100,
                  )}%. Suit ${Math.round(suitIntegrityRef.current)}%.`
                : `PRESSURE VENT! Congratulations on the unscheduled field launch. Suit ${Math.round(
                    suitIntegrityRef.current,
                  )}%.`;
            }
            sound("warning");
          }
        });
        const incapacitated = downedRef.current;
        const cargoSpeed = carried ? cargoData[carried.kind].speed : 1;
        const carriedSpeedFactor =
          carried && hasEquippedUpgrade(progressionRef.current, "cargo_harness")
            ? 1 - (1 - cargoSpeed) * 0.55
            : cargoSpeed;
        const cartSpeedFactor =
          cartOwnerId === (session?.memberId ?? "solo")
            ? cargoCartTowMultiplier(cartCargoIds.length)
            : 1;
        const speedFactor = carriedSpeedFactor * cartSpeedFactor;
        const keyboardDrive =
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        const keyboardStrafe =
          (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
        const driveInput = incapacitated ? 0 : keyboardDrive || -pad.moveY;
        const strafeInput = incapacitated ? 0 : keyboardStrafe || pad.moveX;
        const fallbackTurnInput = mouseCapturedRef.current || incapacitated
          ? 0
          : (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
        const moving = driveInput !== 0 || strafeInput !== 0;
        if (moving) tutorialMovedRef.current = true;

        if (fallbackTurnInput !== 0) {
          astronaut.rotation.y += fallbackTurnInput * 2.35 * dt;
        }

        if (moving) {
          const forwardDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(
            astronaut.quaternion,
          );
          const rightDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(
            astronaut.quaternion,
          );
          const moveDirection = forwardDirection
            .multiplyScalar(driveInput)
            .addScaledVector(rightDirection, strafeInput)
            .normalize();
          const reverseMultiplier = driveInput < 0 ? 0.62 : 1;
          const strafeMultiplier = driveInput === 0 && strafeInput !== 0 ? 0.86 : 1;
          const targetSpeed =
            9.2 * speedFactor * reverseMultiplier * strafeMultiplier;
          const movementResponse = playerHeight > 0.05 ? 2.15 : 8;
          velocity.x = THREE.MathUtils.damp(
            velocity.x,
            moveDirection.x * targetSpeed,
            movementResponse,
            dt,
          );
          velocity.z = THREE.MathUtils.damp(
            velocity.z,
            moveDirection.z * targetSpeed,
            movementResponse,
            dt,
          );
        } else {
          const momentumDrag = playerHeight > 0.05 ? 0.42 : 7;
          velocity.x = THREE.MathUtils.damp(velocity.x, 0, momentumDrag, dt);
          velocity.z = THREE.MathUtils.damp(velocity.z, 0, momentumDrag, dt);
        }

        if (!incapacitated && jumpPressed && playerHeight <= 0.01) {
          verticalVelocity =
            carried?.kind === "platinum" ? JUMP_VELOCITY * 0.72 : JUMP_VELOCITY;
          playerHeight = 0.02;
          emitDustBurst(astronaut.position, carried ? 0.8 : 0.62);
        }
        const thrusterActive =
          !incapacitated &&
          jumpPressed &&
          playerHeight > 0.38 &&
          thrusterFuel > 0;
        if (thrusterActive) {
          const cargoEfficiency =
            carried?.kind === "platinum" ? 0.58 : carried ? 0.78 : 1;
          verticalVelocity = Math.min(
            JUMP_VELOCITY * 1.08,
            verticalVelocity + 5.2 * cargoEfficiency * dt,
          );
          thrusterFuel = Math.max(0, thrusterFuel - 46 * dt);
        } else if (playerHeight <= 0.01) {
          thrusterFuel = Math.min(thrusterCapacity, thrusterFuel + 31 * dt);
        }
        if (playerHeight > 0 || verticalVelocity > 0) {
          verticalVelocity -= world.gravity * dt;
          playerHeight += verticalVelocity * dt;
          if (playerHeight <= 0) {
            const landingSpeed = Math.abs(verticalVelocity);
            playerHeight = 0;
            verticalVelocity = 0;
            if (landingSpeed > 1.7) {
              const impactStrength = Math.min(1.8, landingSpeed / 4.8);
              emitDustBurst(astronaut.position, impactStrength);
              cameraImpact = Math.max(cameraImpact, impactStrength);
            }
            if (landingSpeed > 7.25) {
              const suitResult = applySuitDamage(
                Math.min(22, (landingSpeed - 7.25) * 7.5),
              );
              if (suitResult !== "ignored") sound("warning");
              if (suitResult === "damaged") {
                messageRef.current = `HARD LANDING. Suit integrity ${Math.round(
                  suitIntegrityRef.current,
                )}%. Knees remain company property.`;
                sound("warning");
              }
            }
          }
        }

        astronaut.position.x += velocity.x * dt;
        astronaut.position.z += velocity.z * dt;
        const radius = Math.hypot(astronaut.position.x, astronaut.position.z);
        if (radius > MOON_RADIUS - 2) {
          astronaut.position.x *= (MOON_RADIUS - 2) / radius;
          astronaut.position.z *= (MOON_RADIUS - 2) / radius;
        }
        astronaut.position.y = playerHeight;
        updateCargoCart(dt, hasAuthority);

        const thrusterFlames = astronaut.userData.thrusterFlames as THREE.Mesh[];
        const thrusterGlow = astronaut.userData.thrusterGlow as THREE.PointLight;
        thrusterFlames.forEach((flame, index) => {
          const targetScale = thrusterActive
            ? 0.82 + Math.sin(now * 0.045 + index * 2.1) * 0.18
            : 0.01;
          flame.scale.x = THREE.MathUtils.damp(flame.scale.x, targetScale, 18, dt);
          flame.scale.y = THREE.MathUtils.damp(flame.scale.y, targetScale, 18, dt);
          flame.scale.z = THREE.MathUtils.damp(flame.scale.z, targetScale, 18, dt);
          (flame.material as THREE.MeshBasicMaterial).opacity =
            0.58 + Math.sin(now * 0.035 + index) * 0.16;
        });
        thrusterGlow.intensity = THREE.MathUtils.damp(
          thrusterGlow.intensity,
          thrusterActive ? 9 : 0,
          16,
          dt,
        );

        const gait = now * 0.009;
        const gaitAmount = incapacitated
          ? 0.03
          : moving && playerHeight < 0.05
            ? 0.58
            : 0.08;
        const leftLeg = astronaut.userData.leftLeg as THREE.Group;
        const rightLeg = astronaut.userData.rightLeg as THREE.Group;
        const leftArm = astronaut.userData.leftArm as THREE.Group;
        const rightArm = astronaut.userData.rightArm as THREE.Group;
        leftLeg.rotation.x = Math.sin(gait) * gaitAmount;
        rightLeg.rotation.x = Math.sin(gait + Math.PI) * gaitAmount;
        leftArm.rotation.x = Math.sin(gait + Math.PI) * gaitAmount * 0.7;
        rightArm.rotation.x = Math.sin(gait) * gaitAmount * 0.7;
        astronaut.rotation.z = THREE.MathUtils.damp(
          astronaut.rotation.z,
          incapacitated ? -1.18 : -strafeInput * 0.065,
          8,
          dt,
        );
        if (moving && playerHeight < 0.05) {
          stepTimer -= dt;
          if (stepTimer <= 0) {
            stepTimer = 0.48 / Math.max(speedFactor, 0.6);
            sound("step");
            emitDustBurst(astronaut.position, 0.28);
          }
        }

        const scanPressed = !incapacitated && scanInput;
        if (scanPressed && !scanLatchRef.current && scanCooldownRef.current <= 0) {
          tutorialScannedRef.current = true;
          const upgradedScanner = hasEquippedUpgrade(
            progressionRef.current,
            "survey_array",
          );
          const scanRange = upgradedScanner ? 21 : 16;
          scanCooldownRef.current = upgradedScanner ? 3 : 4;
          scanAnimation = 0.01;
          scanRing.visible = true;
          scanRing.position.set(astronaut.position.x, 0.18, astronaut.position.z);
          if (hasAuthority) {
            let revealed = 0;
            deposits.forEach((deposit) => {
              if (
                deposit.state === "hidden" &&
                (deposit.kind !== "flux_core" ||
                  Boolean(world.processingStation.userData.vaultOpen)) &&
                deposit.position.distanceTo(astronaut.position) < scanRange
              ) {
                deposit.state = "revealed";
                deposit.group.visible = true;
                deposit.beacon.intensity = 7;
                revealed += 1;
              }
            });
            messageRef.current =
              revealed > 0
                ? `Scanner confirms ${revealed} financially interesting signal${revealed === 1 ? "" : "s"}.`
                : "Scanner found dust, regret, and no nearby deposits.";
          } else {
            queueCrewAction("scan");
            messageRef.current = "Scan request sent to mission lead authority.";
          }
          sound("scan");
        }
        scanLatchRef.current = scanPressed;

        if (scanAnimation > 0) {
          scanAnimation += dt * 1.05;
          const scale = scanAnimation * 16;
          scanRing.scale.setScalar(scale);
          const material = scanRing.material as THREE.MeshBasicMaterial;
          material.opacity = Math.max(0, 0.88 - scanAnimation * 0.82);
          if (scanAnimation >= 1.1) {
            scanAnimation = 0;
            scanRing.visible = false;
          }
        }

        deposits.forEach((deposit, index) => {
          if (!deposit.group.visible || deposit.state === "secured") return;
          if (deposit.state === "broken") {
            deposit.shards.children.forEach((fragment, fragmentIndex) => {
              fragment.rotation.y += dt * (0.18 + fragmentIndex * 0.035);
            });
            return;
          }
          deposit.group.rotation.y += dt * (deposit.state === "cargo" ? 0.58 : 0.16);
          if (deposit.kind === "flux_core") {
            deposit.core.rotation.y += dt * 1.8;
            deposit.core.children.slice(2).forEach((gyro, gyroIndex) => {
              gyro.rotation.z += dt * (1.4 + gyroIndex * 0.48);
            });
          }
          deposit.harvestPulse = Math.max(0, deposit.harvestPulse - dt * 3.8);
          const extractionPulse = deposit.harvestPulse * 0.34;
          deposit.ring.scale.setScalar(
            1 + Math.sin(now * 0.003 + index) * 0.08 + extractionPulse,
          );
          deposit.methodMarker.rotation.y += dt * 1.4;
          deposit.methodMarker.scale.setScalar(1 + extractionPulse * 0.75);
          if (!hasAuthority) return;
          if (
            deposit.state === "cargo" &&
            carryingRef.current !== deposit.id &&
            deposit.ownerId === null
          ) {
            const validTetherOwners = deposit.tetherOwnerIds.filter((ownerId) => {
              const ownerPosition = tetherOwnerPosition(ownerId);
              if (!ownerPosition) return false;
              const distance = deposit.group.position.distanceTo(ownerPosition);
              if (!calculateTetherPull(deposit.kind, distance, deposit.tetherOwnerIds.length).breaks) {
                return true;
              }
              const ownerName =
                crewRoomRef.current?.members.find((member) => member.id === ownerId)
                  ?.name ?? "A GOON";
              messageRef.current = `${ownerName}'S TETHER SNAPPED at ${Math.round(
                distance,
              )}m. Cable complexity remains bounded.`;
              sound("warning");
              return false;
            });
            deposit.tetherOwnerIds = validTetherOwners;
            const tetherCount = validTetherOwners.length;
            const tetherState = calculateTetherPull(
              deposit.kind,
              validTetherOwners.reduce((largest, ownerId) => {
                const ownerPosition = tetherOwnerPosition(ownerId);
                return ownerPosition
                  ? Math.max(largest, deposit.group.position.distanceTo(ownerPosition))
                  : largest;
              }, 0),
              tetherCount,
            );
            validTetherOwners.forEach((ownerId) => {
              const ownerPosition = tetherOwnerPosition(ownerId);
              if (!ownerPosition) return;
              const pullTarget = ownerPosition.clone().add(new THREE.Vector3(0, 1, 0));
              const pullDirection = pullTarget.sub(deposit.group.position);
              const distance = pullDirection.length();
              if (distance <= 0.01) return;
              const pull = calculateTetherPull(deposit.kind, distance, tetherCount);
              deposit.velocity.addScaledVector(
                pullDirection.normalize(),
                pull.pullAcceleration * dt,
              );
            });
            if (deposit.isBallistic) {
              deposit.velocity.y -= world.gravity * dt;
              deposit.group.position.addScaledVector(deposit.velocity, dt);
              deposit.group.rotation.x += dt * 4.8;
              deposit.group.rotation.z += dt * 3.2;

              const surfaceRadius = Math.hypot(
                deposit.group.position.x,
                deposit.group.position.z,
              );
              if (surfaceRadius > MOON_RADIUS - 1.2) {
                const boundaryScale = (MOON_RADIUS - 1.2) / surfaceRadius;
                deposit.group.position.x *= boundaryScale;
                deposit.group.position.z *= boundaryScale;
                deposit.velocity.x *= -0.3;
                deposit.velocity.z *= -0.3;
              }

              const receiverOffset = deposit.group.position
                .clone()
                .sub(CARGO_RECEIVER_POSITION);
              const receiverDistance = Math.hypot(receiverOffset.x, receiverOffset.z);
              if (
                canAirmailCargo(
                  receiverDistance,
                  deposit.group.position.y,
                  deposit.isBallistic,
                )
              ) {
                const earned = calculateCargoValue(deposit.kind, deposit.condition);
                const bankBounces = deposit.bounceCount;
                const bankBonus = calculateBankShotBonus(
                  deposit.kind,
                  deposit.condition,
                  bankBounces,
                );
                deposit.state = "secured";
                deposit.group.visible = false;
                deposit.velocity.set(0, 0, 0);
                deposit.isBallistic = false;
                deposit.bounceCount = 0;
                deposit.tetherOwnerIds = [];
                scoreRef.current += earned + bankBonus;
                airmailDeliveriesRef.current += 1;
                if (bankBounces > 0) {
                  bankShotDeliveriesRef.current += 1;
                  stuntBonusRef.current += bankBonus;
                }
                airmailFlash = 1;
                emitDustBurst(CARGO_RECEIVER_POSITION, 1.45);
                cameraImpact = Math.max(cameraImpact, 0.32);
                messageRef.current =
                  bankBounces > 0
                    ? `BANK SHOT! ${cargoData[deposit.kind].name} ricochet ×${bankBounces} secured for ¢${earned} + ¢${bankBonus} reckless-science bonus.`
                    : `AIRMAIL ACCEPTED! ${cargoData[deposit.kind].name} secured for ¢${earned}. No carrying required.`;
                sound("secure");
                return;
              }

              if (deposit.group.position.y <= 0.65) {
                const verticalImpactSpeed = Math.abs(deposit.velocity.y);
                const impactSpeed = deposit.velocity.length();
                const previousCondition = deposit.condition;
                deposit.group.position.y = 0.65;
                const impact = calculateCargoImpact(
                  deposit.kind,
                  deposit.condition,
                  impactSpeed,
                );
                deposit.condition = impact.condition;
                emitDustBurst(deposit.group.position, Math.min(1.35, impactSpeed / 4.5));
                cameraImpact = Math.max(cameraImpact, Math.min(0.28, impactSpeed * 0.025));

                if (impact.broken) {
                  shatterDeposit(deposit, impactSpeed);
                } else {
                  const bounce = calculateCargoBounce(
                    deposit.kind,
                    verticalImpactSpeed,
                    deposit.bounceCount,
                  );
                  if (bounce.continues) {
                    deposit.bounceCount += 1;
                    cargoBouncesRef.current += 1;
                    deposit.velocity.y = bounce.verticalSpeed;
                    deposit.velocity.x *= bounce.horizontalRetention;
                    deposit.velocity.z *= bounce.horizontalRetention;
                    deposit.group.position.y = 0.68;
                    messageRef.current = `${cargoData[deposit.kind].name} ricochet #${
                      deposit.bounceCount
                    } // ${Math.round(deposit.condition * 100)}% condition. Chase it.`;
                    sound(
                      previousCondition - deposit.condition > 0.045
                        ? "warning"
                        : "bounce",
                    );
                  } else {
                    deposit.velocity.set(0, 0, 0);
                    deposit.isBallistic = false;
                    deposit.bounceCount = 0;
                    if (previousCondition - deposit.condition > 0.005) {
                      messageRef.current = `${cargoData[deposit.kind].name} completed its flight at ${Math.round(
                        deposit.condition * 100,
                      )}% condition.`;
                      sound("warning");
                    } else {
                      sound("step");
                    }
                  }
                }
              }
            } else if (tetherCount > 0) {
              deposit.velocity.y = 0;
              deposit.velocity.multiplyScalar(Math.exp(-2.4 * dt));
              if (deposit.velocity.length() > tetherState.maxSpeed) {
                deposit.velocity.setLength(tetherState.maxSpeed);
              }
              deposit.group.position.addScaledVector(deposit.velocity, dt);
              const surfaceRadius = Math.hypot(
                deposit.group.position.x,
                deposit.group.position.z,
              );
              if (surfaceRadius > MOON_RADIUS - 1.2) {
                const boundaryScale = (MOON_RADIUS - 1.2) / surfaceRadius;
                deposit.group.position.x *= boundaryScale;
                deposit.group.position.z *= boundaryScale;
                deposit.velocity.multiplyScalar(0.3);
              }
              deposit.group.position.y = tetherState.teamLift
                ? 1.02 + Math.sin(now * 0.004 + index) * 0.08
                : 0.65;
              deposit.group.rotation.x += dt * deposit.velocity.length() * 0.6;
            } else {
              deposit.velocity.multiplyScalar(Math.exp(-5 * dt));
              deposit.group.position.y = 0.65 + Math.sin(now * 0.0025 + index) * 0.12;
            }
          }
        });

        const localOwnerId = session?.memberId ?? "solo";
        deposits.forEach((deposit) => {
          if (deposit.state !== "cargo" || !deposit.ownerId) return;
          if (deposit.ownerId === localOwnerId) {
            carryingRef.current = deposit.id;
            if (deposit.group.parent !== carriedAnchor) {
              carriedAnchor.add(deposit.group);
              deposit.group.position.set(0, 0, 0);
              deposit.group.scale.setScalar(deposit.kind === "platinum" ? 0.9 : 0.72);
            }
            return;
          }
          const remote = remoteAstronauts.get(deposit.ownerId);
          if (remote && deposit.group.parent !== remote.anchor) {
            remote.anchor.add(deposit.group);
            deposit.group.position.set(0, 0, 0);
            deposit.group.scale.setScalar(deposit.kind === "platinum" ? 0.9 : 0.72);
          }
        });

        fieldToolCases.forEach((fieldCase, index) => {
          const badge = fieldCase.group.userData.badge as THREE.Sprite;
          badge.visible = fieldCase.ownerId === null;
          fieldCase.beacon.intensity = fieldCase.ownerId
            ? 0.7
            : 4.4 + Math.sin(now * 0.006 + index) * 1.2;
          if (fieldCase.ownerId === localOwnerId) {
            if (fieldCase.group.parent !== localFieldCaseAnchor) {
              localFieldCaseAnchor.add(fieldCase.group);
            }
            fieldCase.group.position.set(0, 0, 0);
            fieldCase.group.rotation.set(0.08, 0.12, -0.04);
            fieldCase.group.scale.setScalar(0.58);
            return;
          }
          if (fieldCase.ownerId) {
            const remote = remoteAstronauts.get(fieldCase.ownerId);
            if (remote && fieldCase.group.parent !== remote.caseAnchor) {
              remote.caseAnchor.add(fieldCase.group);
              fieldCase.group.position.set(0, 0, 0);
              fieldCase.group.rotation.set(0.08, 0.12, -0.04);
              fieldCase.group.scale.setScalar(0.58);
            }
            return;
          }
          if (fieldCase.group.parent !== scene) scene.attach(fieldCase.group);
          fieldCase.group.scale.setScalar(1);
          if (fieldCase.isBallistic) {
            const caseVelocity = new THREE.Vector3().fromArray(fieldCase.velocity);
            caseVelocity.y -= world.gravity * 1.22 * dt;
            fieldCase.group.position.addScaledVector(caseVelocity, dt);
            const surfaceRadius = Math.hypot(
              fieldCase.group.position.x,
              fieldCase.group.position.z,
            );
            if (surfaceRadius > MOON_RADIUS - 1.25) {
              const boundaryScale = (MOON_RADIUS - 1.25) / surfaceRadius;
              fieldCase.group.position.x *= boundaryScale;
              fieldCase.group.position.z *= boundaryScale;
              caseVelocity.x *= -0.46;
              caseVelocity.z *= -0.46;
            }
            const spin = fieldCase.group.userData.spin as THREE.Vector3;
            fieldCase.group.rotation.x += spin.x * dt;
            fieldCase.group.rotation.y += spin.y * dt;
            fieldCase.group.rotation.z += spin.z * dt;
            if (fieldCase.group.position.y <= 0.56 && caseVelocity.y < 0) {
              const impactSpeed = Math.abs(caseVelocity.y);
              fieldCase.group.position.y = 0.56;
              if (impactSpeed > 0.9 && fieldCase.bounceCount < 5) {
                fieldCase.bounceCount += 1;
                caseVelocity.y = impactSpeed * 0.48;
                caseVelocity.x *= 0.78;
                caseVelocity.z *= 0.78;
                sound("bounce");
              } else {
                caseVelocity.set(0, 0, 0);
                fieldCase.isBallistic = false;
                fieldCase.bounceCount = 0;
                fieldCase.group.rotation.x = 0;
                fieldCase.group.rotation.z = 0;
              }
            }
            fieldCase.velocity = caseVelocity.toArray() as [number, number, number];
          } else {
            fieldCase.group.position.y =
              0.56 + Math.sin(now * 0.0028 + index * 1.4) * 0.08;
            fieldCase.group.rotation.y += dt * 0.18;
          }
        });

        const activeTetherLines = new Set<string>();
        deposits.forEach((deposit) => {
          if (deposit.state !== "cargo") return;
          const end = deposit.group.getWorldPosition(new THREE.Vector3());
          deposit.tetherOwnerIds.forEach((ownerId) => {
            const localOwnerId = session?.memberId ?? "solo";
            let start: THREE.Vector3 | null = null;
            if (ownerId === localOwnerId) {
              start = astronaut.position.clone().add(new THREE.Vector3(0, 2.05, 0));
            } else {
              const remote = remoteAstronauts.get(ownerId);
              if (remote) {
                start = remote.group
                  .getWorldPosition(new THREE.Vector3())
                  .add(new THREE.Vector3(0, 2.05, 0));
              }
            }
            if (!start) return;
            activeTetherLines.add(ownerId);
            let line = tetherLines.get(ownerId);
            if (!line) {
              const colorIndex = crewRoomRef.current?.members.find(
                (member) => member.id === ownerId,
              )?.colorIndex;
              line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([start, end]),
                new THREE.LineBasicMaterial({
                  color:
                    colorIndex === undefined
                      ? palette.yellow
                      : crewColor(colorIndex).hex,
                  transparent: true,
                  opacity: 0.9,
                  depthWrite: false,
                }),
              );
              tetherLines.set(ownerId, line);
              scene.add(line);
            }
            line.geometry.setFromPoints([start, end]);
            (line.material as THREE.LineBasicMaterial).opacity =
              0.68 + Math.sin(now * 0.018) * 0.2;
          });
        });
        tetherLines.forEach((line, ownerId) => {
          if (activeTetherLines.has(ownerId)) return;
          line.removeFromParent();
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
          tetherLines.delete(ownerId);
        });

        const nearestHarvestable = deposits
          .filter(
            (deposit) =>
              deposit.state === "revealed" || deposit.state === "extracting",
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        const activeHarvestTool = activeHarvestToolRef.current;
        const specialistMultiplier = fieldCaseHarvestMultiplier(
          localSpecialistCase?.toolId,
          activeHarvestTool,
        );
        const harvestToolMatches = Boolean(
          nearestHarvestable &&
            canHarvestCargo(activeHarvestTool, nearestHarvestable.kind),
        );
        const activeToolAvailable =
          activeHarvestTool !== "drill" ||
          (!overheatedRef.current && !drillJammedRef.current);
        const harvesting =
          !incapacitated &&
          drillInput &&
          nearestHarvestable &&
          nearestHarvestable.position.distanceTo(astronaut.position) < 3 &&
          harvestToolMatches &&
          carryingRef.current === null &&
          playerHeight < 0.15 &&
          activeToolAvailable;

        const wrongToolAttempt = Boolean(
          !incapacitated &&
            drillInput &&
            nearestHarvestable &&
            nearestHarvestable.position.distanceTo(astronaut.position) < 3 &&
            !harvestToolMatches,
        );
        if (wrongToolAttempt && !wrongHarvestToolLatch && nearestHarvestable) {
          const requiredTool = requiredHarvestTool(nearestHarvestable.kind);
          messageRef.current = `${harvestToolData[
            activeHarvestTool
          ].name.toUpperCase()} REJECTED // ${cargoData[
            nearestHarvestable.kind
          ].name.toUpperCase()} REQUIRES ${harvestToolData[
            requiredTool
          ].name.toUpperCase()}. TAB OR MOUSE WHEEL TO SWITCH.`;
          sound("warning");
        }
        wrongHarvestToolLatch = wrongToolAttempt;

        const drill = astronaut.userData.drill as THREE.Group;
        const drillLight = astronaut.userData.drillLight as THREE.Mesh;
        const drillLightMaterial = drillLight.material as THREE.MeshStandardMaterial;
        const repairPressed = !incapacitated && repairInput;
        if (
          repairPressed &&
          !repairLatchRef.current &&
          drillJammedRef.current
        ) {
          const repair = registerRepairStrike(repairProgressRef.current);
          repairProgressRef.current = repair.progress;
          repairKick = 1;
          drill.rotation.y += 0.72;
          cameraImpact = Math.max(cameraImpact, 0.22);
          sound("repair");
          if (repair.completed) {
            drillJammedRef.current = false;
            drillWearRef.current = 18;
            repairsCompletedRef.current += 1;
            messageRef.current =
              "Percussive maintenance successful. The drill has agreed to continue.";
          } else {
            const hitsRemaining = repair.hitsRemaining;
            messageRef.current = `REPAIR STRIKE REGISTERED. ${hitsRemaining} hit${
              hitsRemaining === 1 ? "" : "s"
            } remaining.`;
          }
        }
        repairLatchRef.current = repairPressed;
        repairKick = Math.max(0, repairKick - dt * 4.6);
        drill.rotation.z = THREE.MathUtils.damp(
          drill.rotation.z,
          drillJammedRef.current
            ? Math.sin(now * 0.04) * 0.045 + repairKick * 0.18
            : 0,
          18,
          dt,
        );
        const jamLightOn = Math.sin(now * 0.028) > -0.15;
        drillLightMaterial.color.setHex(
          drillJammedRef.current ? palette.red : palette.cyan,
        );
        drillLightMaterial.emissive.setHex(
          drillJammedRef.current ? palette.red : palette.cyan,
        );
        drillLightMaterial.emissiveIntensity = drillJammedRef.current
          ? jamLightOn
            ? 5.5
            : 0.25
          : 2.6;

        if (harvesting && nearestHarvestable) {
          if (!harvestAudioActive) {
            sound(
              activeHarvestTool === "drill"
                ? "drill"
                : activeHarvestTool === "siphon"
                  ? "siphon"
                  : "repair",
            );
            harvestAudioActive = true;
          }
          tutorialDrilledRef.current = true;
          nearestHarvestable.state = "extracting";
          let extractionGain = 0;
          if (activeHarvestTool === "drill") {
            extractionGain = dt * (heatRef.current > 72 ? 15 : 23);
            nearestHarvestable.harvestPulse = Math.max(
              nearestHarvestable.harvestPulse,
              0.18,
            );
            drillWearRef.current = Math.min(
              DRILL_JAM_WEAR,
              drillWearRef.current +
                dt *
                  (heatRef.current > 72 ? 18 : 10) *
                  (specialistMultiplier > 1 ? 0.78 : 1),
            );
            const upgradedCooling = hasEquippedUpgrade(
              progressionRef.current,
              "cooling_jacket",
            );
            heatRef.current = Math.min(
              100,
              heatRef.current +
                dt *
                  33 *
                  (upgradedCooling ? 0.76 : 1) *
                  (specialistMultiplier > 1 ? 0.72 : 1),
            );
            drill.rotation.y += dt * 34;
            drill.position.y = 2.7 + Math.sin(now * 0.07) * 0.045;
          } else if (activeHarvestTool === "corer") {
            corerCycleRef.current += dt * 112;
            const corerHead = astronaut.userData.corerHead as THREE.Mesh;
            corerHead.position.y =
              -2.35 + Math.sin((corerCycleRef.current / 100) * Math.PI) * 0.28;
            if (corerCycleRef.current >= 100) {
              corerCycleRef.current %= 100;
              extractionGain = 15;
              nearestHarvestable.harvestPulse = 1;
              cameraImpact = Math.max(cameraImpact, 0.18);
              emitDustBurst(nearestHarvestable.position, 0.42);
              sound("repair");
            }
          } else {
            siphonSealRef.current = Math.min(100, siphonSealRef.current + dt * 48);
            extractionGain = dt * (12 + siphonSealRef.current * 0.15);
            nearestHarvestable.harvestPulse = Math.max(
              nearestHarvestable.harvestPulse,
              0.22 + siphonSealRef.current * 0.0028,
            );
            (astronaut.userData.siphonValve as THREE.Mesh).rotation.z += dt * 5.2;
          }
          extractionGain *= specialistMultiplier;
          if (activeHarvestTool !== "drill") {
            heatRef.current = Math.max(
              0,
              heatRef.current -
                dt *
                  25 *
                  (hasEquippedUpgrade(progressionRef.current, "cooling_jacket")
                    ? 1.2
                    : 1),
            );
            if (overheatedRef.current && heatRef.current <= 34) {
              overheatedRef.current = false;
            }
          }
          if (hasAuthority) {
            nearestHarvestable.progress = Math.min(
              100,
              nearestHarvestable.progress + extractionGain,
            );
          }
          const start = new THREE.Vector3();
          const activeToolModel = (
            astronaut.userData.harvestTools as Record<HarvestToolId, THREE.Group>
          )[activeHarvestTool];
          activeToolModel.getWorldPosition(start);
          const beamMaterial = drillBeam.material as THREE.MeshBasicMaterial;
          const toolColor =
            activeHarvestTool === "drill"
              ? palette.coral
              : activeHarvestTool === "corer"
                ? palette.yellow
                : palette.cyan;
          beamMaterial.color.setHex(toolColor);
          drillGlow.color.setHex(toolColor);
          updateDrillBeam(
            start,
            nearestHarvestable.position.clone().add(new THREE.Vector3(0, 0.55, 0)),
          );
          drillBeam.visible = true;
          drillGlow.intensity =
            (activeHarvestTool === "siphon" ? 11 : 16) + Math.sin(now * 0.08) * 4;
          nearestHarvestable.beacon.intensity = 11;
          if (hasAuthority && nearestHarvestable.progress >= 100) {
            nearestHarvestable.progress = 100;
            nearestHarvestable.state = "cargo";
            nearestHarvestable.shell.visible = false;
            nearestHarvestable.core.visible = true;
            nearestHarvestable.methodMarker.visible = false;
            nearestHarvestable.beacon.intensity = 9;
            messageRef.current = `${cargoData[
              nearestHarvestable.kind
            ].name} harvested with the ${harvestToolData[activeHarvestTool].name} // ${cargoData[
              nearestHarvestable.kind
            ].structure}. It is now a logistics problem.`;
            sound("pickup");
          }
          if (
            activeHarvestTool === "drill" &&
            drillWearRef.current >= DRILL_JAM_WEAR
          ) {
            drillJammedRef.current = true;
            repairProgressRef.current = 0;
            drillBeam.visible = false;
            drillGlow.intensity = 0;
            messageRef.current =
              "DRILL JAMMED. TAP R THREE TIMES FOR APPROVED PERCUSSIVE MAINTENANCE.";
            sound("warning");
          } else if (activeHarvestTool === "drill" && heatRef.current >= 100) {
            heatRef.current = 100;
            overheatedRef.current = true;
            drillBeam.visible = false;
            drillGlow.intensity = 0;
            messageRef.current = "DRILL OVERHEATED. Engineering recommends less drilling.";
            sound("warning");
          }
        } else {
          harvestAudioActive = false;
          drillBeam.visible = false;
          drillGlow.intensity = 0;
          corerCycleRef.current = Math.max(0, corerCycleRef.current - dt * 42);
          siphonSealRef.current = Math.max(0, siphonSealRef.current - dt * 34);
          heatRef.current = Math.max(
            0,
            heatRef.current -
              dt *
                25 *
                (hasEquippedUpgrade(progressionRef.current, "cooling_jacket")
                  ? 1.2
                  : 1),
          );
          if (overheatedRef.current && heatRef.current <= 34) {
            overheatedRef.current = false;
            if (!drillJammedRef.current) {
              messageRef.current = "Drill grudgingly operational.";
            }
          }
        }

        const interactPressed = !incapacitated && interactInput;
        if (interactPressed && !interactLatchRef.current) {
          const helperId = session?.memberId ?? "solo";
          const rescueTarget = nearbyDownedCrewMember(helperId, astronaut.position);
          if (
            !throwInput &&
            carryingRef.current === null &&
            rescueTarget &&
            rescueTarget.distance <= 3.8
          ) {
            if (!hasAuthority) {
              queueCrewAction("rescue");
              messageRef.current = `SUIT REBOOT ASSIST REQUESTED FOR ${rescueTarget.member.name}.`;
            } else {
              activateCrewRescue(
                helperId,
                session?.name ?? "SOLO GOON",
                astronaut.position,
              );
            }
          } else if (
            throwInput &&
            carryingRef.current === null &&
            localSpecialistCase
          ) {
            if (!hasAuthority) {
              queueCrewAction("tool_throw");
              messageRef.current = "Specialist-case toss request sent to mission lead authority.";
            } else {
              tossFieldToolCase(
                helperId,
                session?.name ?? "SOLO GOON",
                astronaut.position,
                astronaut.rotation.y,
              );
            }
          } else if (!hasAuthority) {
            queueCrewAction(
              throwInput ? "throw" : "interact",
            );
            messageRef.current =
              nearbyLooseFieldCase &&
              nearbyLooseFieldCase.distance <= FIELD_CASE_PICKUP_RANGE &&
              !localSpecialistCase
                ? "Specialist-case claim request sent to mission lead authority."
                : "Cargo request sent to mission lead authority.";
          } else if (carryingRef.current !== null) {
            const held = deposits.find((deposit) => deposit.id === carryingRef.current);
            if (held) {
              if (
                !throwInput &&
                launchCargoByMagRail(
                  session?.memberId ?? "solo",
                  session?.name ?? "SOLO GOON",
                  astronaut.position,
                )
              ) {
                // Mag-rail owns the cargo release and launch trajectory.
              } else if (astronaut.position.distanceTo(CARGO_RECEIVER_POSITION) < 3.8) {
                held.state = "secured";
                held.ownerId = null;
                held.tetherOwnerIds = [];
                held.group.visible = false;
                const earned = calculateCargoValue(held.kind, held.condition);
                scoreRef.current += earned;
                carryingRef.current = null;
                scene.attach(held.group);
                messageRef.current = `${cargoData[held.kind].name} secured for ¢${earned}. S.P.A.C.E. owns it now.`;
                sound("secure");
              } else if (
                !throwInput &&
                loadCargoIntoCart(
                  session?.memberId ?? "solo",
                  session?.name ?? "SOLO GOON",
                  astronaut.position,
                )
              ) {
                // The loader owns the state transition and cart attachment.
              } else {
                const throwing = throwInput;
                const roughDrop = !throwing && (playerHeight > 0.3 || velocity.length() > 4);
                if (roughDrop) {
                  const roughImpactSpeed =
                    3.8 + Math.min(5.2, playerHeight * 0.7 + velocity.length() * 0.42);
                  held.condition = calculateCargoImpact(
                    held.kind,
                    held.condition,
                    roughImpactSpeed,
                  ).condition;
                }
                scene.attach(held.group);
                const dropDirection = new THREE.Vector3(0, 0, -2.3).applyQuaternion(
                  astronaut.quaternion,
                );
                held.group.position.copy(astronaut.position).add(dropDirection);
                held.group.position.y = throwing ? 2.4 + playerHeight : 0.62;
                held.group.scale.setScalar(1);
                if (throwing) {
                  held.velocity
                    .copy(dropDirection)
                    .setLength(cargoData[held.kind].throwSpeed)
                    .addScaledVector(velocity, 0.42);
                  held.velocity.y =
                    cargoData[held.kind].throwLift +
                    Math.max(0, verticalVelocity * 0.35);
                  held.isBallistic = true;
                  held.bounceCount = 0;
                  held.ownerId = null;
                  held.tetherOwnerIds = [];
                } else {
                  held.velocity.set(0, 0, 0);
                  held.isBallistic = false;
                  held.bounceCount = 0;
                  held.ownerId = null;
                  held.tetherOwnerIds = [];
                }
                carryingRef.current = null;
                messageRef.current = throwing
                  ? `${cargoData[held.kind].name} launched // ${cargoData[held.kind].structure}. Expect ricochets.`
                  : roughDrop
                    ? `${cargoData[held.kind].name} survived a questionable drop at ${Math.round(held.condition * 100)}% condition.`
                    : `${cargoData[held.kind].name} placed with suspicious competence.`;
                if (throwing) sound("launch");
              }
            }
          } else {
            const nearbyCargo = deposits
              .filter(
                (deposit) =>
                  deposit.state === "cargo" &&
                  deposit.ownerId === null &&
                  !deposit.isBallistic,
              )
              .sort(
                (a, b) =>
                  a.position.distanceTo(astronaut.position) -
                  b.position.distanceTo(astronaut.position),
              )[0];
            if (
              pickupFieldToolCase(
                session?.memberId ?? "solo",
                session?.name ?? "SOLO GOON",
                astronaut.position,
              )
            ) {
              // Specialist cases use the belt slot and leave both hands free.
            } else if (
              depositCargoCart(
                session?.name ?? "SOLO GOON",
                astronaut.position,
              )
            ) {
              // Bulk handoff completes before loose-cargo pickup checks.
            } else if (
              nearbyCargo &&
              nearbyCargo.position.distanceTo(astronaut.position) < 3.2
            ) {
              carryingRef.current = nearbyCargo.id;
              tutorialCarriedRef.current = true;
              nearbyCargo.ownerId = session?.memberId ?? "solo";
              nearbyCargo.tetherOwnerIds = [];
              nearbyCargo.velocity.set(0, 0, 0);
              nearbyCargo.isBallistic = false;
              nearbyCargo.bounceCount = 0;
              carriedAnchor.add(nearbyCargo.group);
              nearbyCargo.group.position.set(0, 0, 0);
              nearbyCargo.group.scale.setScalar(nearbyCargo.kind === "platinum" ? 0.9 : 0.72);
              messageRef.current = `${cargoData[nearbyCargo.kind].name} acquired // ${cargoData[
                nearbyCargo.kind
              ].structure}. Momentum is now a group project.`;
              sound("pickup");
            } else if (
              astronaut.position.distanceTo(SHIP_POSITION) < 7.2 &&
              scoreRef.current >= CONTRACTS[activeContractIdRef.current].target
            ) {
              phaseRef.current = "success";
              messageRef.current = "Contract met. Launching before anyone finds more work.";
              sound("launch");
            }
          }
        }
        interactLatchRef.current = interactPressed;

        if (timeRef.current <= 0) {
          const aboard = astronaut.position.distanceTo(SHIP_POSITION) < 7.2;
          phaseRef.current =
            aboard &&
            scoreRef.current >= CONTRACTS[activeContractIdRef.current].target
              ? "success"
              : "failed";
          messageRef.current = aboard
            ? scoreRef.current >= CONTRACTS[activeContractIdRef.current].target
              ? "Automatic launch complete. Somehow, this counts as science."
              : "Crew recovered. Contract failed. Payroll is composing an email."
            : "Ship departed. Your emergency clone paperwork is being reviewed.";
          sound(aboard ? "launch" : "warning");
        }
      }

      if (
        phaseRef.current !== "active" &&
        document.pointerLockElement === renderer.domElement
      ) {
        document.exitPointerLock();
      }

      let networkInputMask = 0;
      const networkHarvestTool = activeHarvestToolRef.current;
      if (
        (keys.has("KeyF") || pad.drill) &&
        (networkHarvestTool !== "drill" ||
          (!overheatedRef.current && !drillJammedRef.current))
      ) {
        networkInputMask |= CREW_INPUT_DRILL;
      }
      if (networkHarvestTool === "corer") {
        networkInputMask |= CREW_INPUT_TOOL_CORER;
      } else if (networkHarvestTool === "siphon") {
        networkInputMask |= CREW_INPUT_TOOL_SIPHON;
      }
      if (
        keys.has("KeyW") ||
        keys.has("KeyS") ||
        keys.has("KeyA") ||
        keys.has("KeyD") ||
        keys.has("ArrowUp") ||
        keys.has("ArrowDown") ||
        Math.abs(pad.moveX) > 0.08 ||
        Math.abs(pad.moveY) > 0.08
      ) {
        networkInputMask |= CREW_INPUT_MOVING;
      }
      if ((keys.has("Space") || pad.jump) && playerHeight > 0.38 && thrusterFuel > 0) {
        networkInputMask |= CREW_INPUT_THRUSTER;
      }
      if (downedRef.current) networkInputMask |= CREW_INPUT_DOWNED;
      if (polarityModeRef.current === "repel") {
        networkInputMask |= CREW_INPUT_POLARITY_REPEL;
      }
      localPresenceRef.current = {
        x: astronaut.position.x,
        y: astronaut.position.y,
        z: astronaut.position.z,
        yaw: astronaut.rotation.y,
        inputMask: networkInputMask,
      };

      dustBursts.forEach((burst) => {
        if (!burst.mesh.visible) return;
        burst.age += dt;
        const progress = burst.age / burst.duration;
        if (progress >= 1) {
          burst.mesh.visible = false;
          return;
        }
        const scale = (0.4 + progress * 3.2) * burst.strength;
        burst.mesh.scale.setScalar(scale);
        (burst.mesh.material as THREE.MeshBasicMaterial).opacity =
          (1 - progress) * 0.34 * burst.strength;
      });

      world.meteorStreaks.children.forEach((streak) => {
        const speed = streak.userData.speed as number;
        streak.position.x += dt * speed;
        streak.position.y -= dt * speed * 0.24;
        if (streak.position.x > 82 || streak.position.y < 14) {
          streak.position.x = -86;
          streak.position.y = 34 + ((streak.id * 17) % 36);
        }
      });

      world.floatingDebris.children.forEach((scrap, index) => {
        const spin = scrap.userData.spin as THREE.Vector3 | undefined;
        if (spin) {
          scrap.rotation.x += spin.x * dt;
          scrap.rotation.y += spin.y * dt;
          scrap.rotation.z += spin.z * dt;
        }
        scrap.position.y += Math.sin(now * 0.00035 + index * 1.7) * dt * 0.12;
      });

      const finalWindow = phase === "active" && timeRef.current <= 30;
      const rustBelt = world.destinationId === "rust_belt";
      sun.intensity = THREE.MathUtils.damp(
        sun.intensity,
        finalWindow
          ? (rustBelt ? 4.8 : 3.65) + Math.sin(now * 0.012) * 0.28
          : rustBelt
            ? 4.15
            : 4.6,
        3,
        dt,
      );
      cyanRim.intensity = THREE.MathUtils.damp(
        cyanRim.intensity,
        finalWindow ? (rustBelt ? 3.4 : 2.35) : rustBelt ? 2.05 : 1.25,
        3,
        dt,
      );

      const beaconPulse = 0.72 + Math.sin(now * 0.0035) * 0.22;
      const guideBeam = world.ship.userData.guideBeam as THREE.Mesh;
      const guideBeamMaterial = guideBeam.material as THREE.MeshBasicMaterial;
      guideBeamMaterial.opacity = 0.07 + beaconPulse * 0.045;
      const guideRings = world.ship.userData.guideRings as THREE.Mesh[];
      guideRings.forEach((ring, index) => {
        const cycle = (now * 0.00032 + index / guideRings.length) % 1;
        const scale = 0.72 + cycle * 0.72;
        ring.scale.setScalar(scale);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.62;
      });
      world.earth.rotation.y += dt * 0.018;
      world.earthCloud.rotation.y -= dt * 0.026;

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(astronaut.quaternion);
      const heldForGuide = deposits.find(
        (deposit) => deposit.id === carryingRef.current,
      );
      const showTrajectory =
        phase === "active" &&
        heldForGuide !== undefined &&
        !downedRef.current &&
        !notesOpenRef.current &&
        !settingsOpenRef.current &&
        astronaut.position.distanceTo(CARGO_RECEIVER_POSITION) >= 3.8;

      if (showTrajectory && heldForGuide) {
        const throwOrigin = astronaut.position
          .clone()
          .add(
            new THREE.Vector3(0, 0, -2.3).applyQuaternion(
              astronaut.quaternion,
            ),
          );
        throwOrigin.y = 2.4 + playerHeight;
        const throwVelocity = new THREE.Vector3(0, 0, -2.3)
          .applyQuaternion(astronaut.quaternion)
          .setLength(cargoData[heldForGuide.kind].throwSpeed)
          .addScaledVector(velocity, 0.42);
        throwVelocity.y =
          cargoData[heldForGuide.kind].throwLift +
          Math.max(0, verticalVelocity * 0.35);
        currentThrowPrediction = predictCargoThrow(
          heldForGuide.kind,
          heldForGuide.condition,
          throwOrigin.y,
          Math.hypot(throwVelocity.x, throwVelocity.z),
          throwVelocity.y,
          world.gravity,
        );
        const riskColor =
          currentThrowPrediction.risk === "SHATTER"
            ? palette.red
            : currentThrowPrediction.risk === "SEVERE"
              ? palette.coral
              : currentThrowPrediction.risk === "RISKY"
                ? palette.yellow
                : palette.cyan;
        trajectoryMaterial.color.setHex(riskColor);
        landingMaterial.color.setHex(riskColor);
        trajectoryGuide.visible = true;
        trajectoryDots.forEach((dot, index) => {
          const sampleTime =
            currentThrowPrediction!.flightTime *
            ((index + 1) / trajectoryDots.length);
          dot.position
            .copy(throwOrigin)
            .addScaledVector(throwVelocity, sampleTime);
          dot.position.y -= 0.5 * world.gravity * sampleTime * sampleTime;
          dot.visible = dot.position.y >= 0.62;
        });
        landingMarker.position.set(
          throwOrigin.x +
            throwVelocity.x * currentThrowPrediction.flightTime,
          0.11,
          throwOrigin.z +
            throwVelocity.z * currentThrowPrediction.flightTime,
        );
        landingMarker.rotation.z -= dt * 0.72;
        landingMarker.scale.setScalar(1 + Math.sin(now * 0.009) * 0.11);
      } else {
        trajectoryGuide.visible = false;
        currentThrowPrediction = null;
      }

      const desiredCamera = astronaut.position
        .clone()
        .addScaledVector(forward, -10.5)
        .add(new THREE.Vector3(0, 8.3 + playerHeight * 0.2, 0));
      if (cameraImpact > 0.01) {
        const shakeStrength =
          cameraImpact * controlSettingsRef.current.cameraShake;
        desiredCamera.x += Math.sin(now * 0.065) * shakeStrength * 0.22;
        desiredCamera.y += Math.cos(now * 0.052) * shakeStrength * 0.15;
        cameraImpact = Math.max(0, cameraImpact - dt * 3.8);
      }
      camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 4.5));
      const targetFov = 52 + Math.min(4, velocity.length() * 0.32);
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
      camera.updateProjectionMatrix();
      const lookAt = astronaut.position
        .clone()
        .add(new THREE.Vector3(0, 3.1 + cameraPitch * 7.2, 0))
        .addScaledVector(forward, 2.6);
      camera.lookAt(lookAt);

      const visor = astronaut.userData.visor as THREE.Mesh;
      const visorMaterial = visor.material as THREE.MeshPhysicalMaterial;
      visorMaterial.emissiveIntensity = 0.72 + Math.sin(now * 0.002) * 0.08;

      if (hudTimer >= 0.09) {
        hudTimer = 0;
        const held = deposits.find((deposit) => deposit.id === carryingRef.current);
        if (held) tutorialCarriedRef.current = true;
        const hudOwnerId = session?.memberId ?? "solo";
        const nearbyDownedCrew = nearbyDownedCrewMember(
          hudOwnerId,
          astronaut.position,
        );
        const tethered = deposits.find((deposit) =>
          deposit.tetherOwnerIds.includes(hudOwnerId),
        );
        const tetherDistance = tethered
          ? tethered.group
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(astronaut.position)
          : null;
        const homeDistance = astronaut.position.distanceTo(SHIP_POSITION);
        const receiverDistance = astronaut.position.distanceTo(CARGO_RECEIVER_POSITION);
        const cartDistance = astronaut.position.distanceTo(world.rover.position);
        const cartReceiverDistance = world.rover.position.distanceTo(
          CARGO_RECEIVER_POSITION,
        );
        const railIntakeDistance =
          world.destinationId === "rust_belt"
            ? (world.processingStation.userData.intakePoint as THREE.Object3D)
                .getWorldPosition(new THREE.Vector3())
                .distanceTo(astronaut.position)
            : Infinity;
        const nearbyRelay =
          world.destinationId === "rust_belt"
            ? (world.processingStation.userData.relays as THREE.Group[])
                .map((relay) => ({
                  relay,
                  distance: relay
                    .getWorldPosition(new THREE.Vector3())
                    .distanceTo(astronaut.position),
                }))
                .sort((a, b) => a.distance - b.distance)[0]
            : null;
        const nearbyCargo = deposits
          .filter(
            (deposit) =>
              deposit.state === "cargo" &&
              deposit.ownerId === null &&
              !deposit.isBallistic,
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        const magneticCargo = deposits
          .filter(
            (deposit) =>
              deposit.state === "cargo" &&
              deposit.ownerId === null &&
              cargoData[deposit.kind].magnetic,
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        const nearbySignal = deposits
          .filter(
            (deposit) =>
              deposit.state === "revealed" || deposit.state === "extracting",
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        const trackedSignals = deposits.filter(
          (deposit) =>
            deposit.state !== "hidden" &&
            deposit.state !== "secured" &&
            deposit.state !== "broken" &&
            deposit.state !== "cart" &&
            deposit.id !== carryingRef.current,
        );
        const nearestTracked =
          nearbySignal ??
          trackedSignals.sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        let nearestSignalDistance: number | null = null;
        let nearestSignalBearing: number | null = null;
        let nearestSignalName: string | null = null;
        let nearestSignalTool: HarvestToolId | null = null;
        if (nearestTracked) {
          if (
            nearestTracked.state === "revealed" ||
            nearestTracked.state === "extracting"
          ) {
            nearestSignalName = cargoData[nearestTracked.kind].name;
            nearestSignalTool = requiredHarvestTool(nearestTracked.kind);
          }
          const trackedPosition = nearestTracked.group.getWorldPosition(
            new THREE.Vector3(),
          );
          const signalDirection = trackedPosition
            .clone()
            .sub(astronaut.position)
            .setY(0);
          nearestSignalDistance = signalDirection.length();
          if (nearestSignalDistance > 0.01) {
            signalDirection.normalize();
            const facingDirection = new THREE.Vector3(0, 0, -1)
              .applyQuaternion(astronaut.quaternion)
              .setY(0)
              .normalize();
            nearestSignalBearing = THREE.MathUtils.radToDeg(
              Math.atan2(
                facingDirection.x * signalDirection.z -
                  facingDirection.z * signalDirection.x,
                facingDirection.dot(signalDirection),
              ),
            );
          }
        }
        let prompt = tethered
          ? `T · RELEASE ${cargoData[tethered.kind].name.toUpperCase()} · ${Math.round(
              tetherDistance ?? 0,
            )}m${tethered.tetherOwnerIds.length >= 2 ? " · TEAM LIFT" : ""}`
          : "Q · SCAN FOR VALUABLE MATERIAL";
        if (held) {
          prompt =
            railIntakeDistance < 5 && cargoData[held.kind].magnetic
              ? `E · LOAD MAG-RAIL // ${cargoData[held.kind].name.toUpperCase()} · BAY TRAJECTORY`
              : receiverDistance < 3.8
              ? `E · SECURE ${cargoData[held.kind].name.toUpperCase()}`
              : cartDistance < 4.5 && canLoadCargoCart(cartCargoIds.length)
                ? `E · LOAD ${cargoData[
                    held.kind
                  ].name.toUpperCase()} // CART ${cartCargoIds.length}/${CART_CAPACITY}`
                : currentThrowPrediction
                ? `E DROP · SHIFT+E THROW · ${currentThrowPrediction.risk} @ ${Math.round(
                    currentThrowPrediction.horizontalDistance,
                  )}m · BAY ${Math.round(receiverDistance)}m`
                : `E DROP · SHIFT+E THROW · BAY ${Math.round(receiverDistance)}m`;
          if (held.condition < 0.995 && stabilizerChargesRef.current > 0) {
            prompt += ` · C FOAM ${Math.round(held.condition * 100)}%`;
          }
        } else if (
          nearbyDownedCrew &&
          nearbyDownedCrew.distance <= 3.8
        ) {
          prompt = `E · CONNECT REBOOT LEAD // ${nearbyDownedCrew.member.name.toUpperCase()} · TEAM RECOVERY`;
        } else if (
          nearbyLooseFieldCase &&
          nearbyLooseFieldCase.distance <= FIELD_CASE_PICKUP_RANGE &&
          !localSpecialistCase
        ) {
          prompt = `E · CLAIM ${harvestToolData[
            nearbyLooseFieldCase.fieldCase.toolId
          ].name.toUpperCase()} SPECIALIST CASE // +30% MATCHED OUTPUT`;
        } else if (
          cartCargoIds.length > 0 &&
          cartReceiverDistance < 4.8 &&
          receiverDistance < 5.8
        ) {
          prompt = `E · DEPOSIT CART // ${cartCargoIds.length} SAMPLE${
            cartCargoIds.length === 1 ? "" : "S"
          }`;
        } else if (
          nearbyCargo &&
          nearbyCargo.position.distanceTo(astronaut.position) < 3.2
        ) {
          prompt = `E · PICK UP ${cargoData[
            nearbyCargo.kind
          ].name.toUpperCase()} · ${cargoData[nearbyCargo.kind].structure}`;
        } else if (
          nearbyRelay &&
          nearbyRelay.distance <= 4.2 &&
          (Number(world.processingStation.userData.relayMask ?? 0) &
            (1 << Number(nearbyRelay.relay.userData.index))) ===
            0
        ) {
          const requiredMode = nearbyRelay.relay.userData
            .requirement as MagneticPolarity;
          prompt = `G · ALIGN RELAY ${Number(nearbyRelay.relay.userData.index) + 1} · REQUIRES ${requiredMode.toUpperCase()} · V FLIPS POLARITY`;
        } else if (
          magneticCargo &&
          magneticCargo.position.distanceTo(astronaut.position) <= 18 &&
          magnetCooldownRef.current <= 0
        ) {
          prompt = `G · ${polarityModeRef.current === "attract" ? "MAG-YANK" : "POLARITY-KICK"} ${cargoData[magneticCargo.kind].name.toUpperCase()} · ${Math.round(
            magneticCargo.position.distanceTo(astronaut.position),
          )}m · V ${polarityModeRef.current.toUpperCase()}`;
        } else if (cartDistance < 4.5) {
          prompt =
            cartOwnerId === hudOwnerId
              ? `H · RELEASE CART // ${cartCargoIds.length}/${CART_CAPACITY}`
              : cartOwnerId
                ? `CART IN USE // ${cartCargoIds.length}/${CART_CAPACITY}`
                : `H · HITCH CART // ${cartCargoIds.length}/${CART_CAPACITY}`;
        } else if (
          nearbySignal &&
          nearbySignal.position.distanceTo(astronaut.position) < 3
        ) {
          const requiredTool = requiredHarvestTool(nearbySignal.kind);
          const selectedTool = activeHarvestToolRef.current;
          prompt =
            selectedTool !== requiredTool
              ? `TAB / WHEEL · SELECT ${harvestToolData[
                  requiredTool
                ].name.toUpperCase()} FOR ${cargoData[nearbySignal.kind].name.toUpperCase()}`
              : selectedTool === "drill" && overheatedRef.current
                ? "DRILL COOLING · SWITCH TOOLS OR WAIT"
                : selectedTool === "drill" && drillJammedRef.current
                  ? "TAP R · REPAIR JAMMED THERMAL DRILL"
                  : `HOLD F · ${harvestToolData[
                      selectedTool
                    ].verb} ${cargoData[
                      nearbySignal.kind
                    ].name.toUpperCase()} · ${Math.round(nearbySignal.progress)}%`;
        } else if (
          scoreRef.current >= CONTRACTS[activeContractIdRef.current].target &&
          homeDistance < 7.2
        ) {
          prompt = "E · LAUNCH WITH CONTRACT SECURED";
        } else if (nearbySignal) {
          prompt = `SIGNAL AHEAD · ${Math.round(
            nearbySignal.position.distanceTo(astronaut.position),
          )}m`;
        } else if (playerHeight > 0.4 && thrusterFuel > 0) {
          prompt = `HOLD SPACE · EVA THRUSTER · ${Math.round(thrusterFuel)}%`;
        }
        if (
          drillJammedRef.current &&
          activeHarvestToolRef.current === "drill"
        ) {
          const repairHitsRemaining = Math.ceil(
            (100 - repairProgressRef.current) / 34,
          );
          prompt = `TAP R · PERCUSSIVE REPAIR · ${repairHitsRemaining} HIT${
            repairHitsRemaining === 1 ? "" : "S"
          }`;
        }
        const nearestVent = [...world.pressureVents].sort(
          (a, b) =>
            a.position.distanceTo(astronaut.position) -
            b.position.distanceTo(astronaut.position),
          )[0];
        if (nearestVent) {
          const ventDistance = nearestVent.position.distanceTo(astronaut.position);
          if (ventDistance < 6 && nearestVent.userData.erupting) {
            prompt = "PRESSURE VENT ERUPTING · USE THRUSTER TO CLEAR";
          } else if (ventDistance < 6 && nearestVent.userData.warning) {
            prompt = `VENT PRESSURE RISING · ${Math.round(ventDistance)}m`;
          }
        }
        if (magneticStormActive) {
          prompt = "POLARITY SURGE ACTIVE · MAGNETIC CARGO IS MOVING";
        } else if (magneticStormWarning) {
          prompt = "POLARITY SURGE INBOUND · SECURE CART + CARGO";
        }
        const nearbyMeteor = world.meteorHazards
          .filter(
            (meteor) =>
              meteor.state === "warning" || meteor.state === "falling",
          )
          .sort(
            (a, b) =>
              a.group.position.distanceTo(astronaut.position) -
              b.group.position.distanceTo(astronaut.position),
          )[0];
        if (nearbyMeteor) {
          const meteorDistance = nearbyMeteor.group.position.distanceTo(
            astronaut.position,
          );
          if (meteorDistance < 7.5) {
            prompt =
              nearbyMeteor.state === "falling"
                ? "IMPACT IMMINENT · MOVE NOW"
                : `METEOR TARGET LOCK · CLEAR ${Math.max(
                    1,
                    Math.round(meteorDistance),
                  )}m`;
          }
        }
        if (downedRef.current) {
          prompt = `HOLD E · EMERGENCY SUIT REBOOT · ${Math.round(
            recoveryProgressRef.current,
          )}%`;
        }
        if (
          hasAuthority &&
          session?.role === "host" &&
          phaseRef.current !== "briefing"
        ) {
          authoritativeStateRef.current = {
            missionSeed: missionSeedRef.current,
            contractId: activeContractIdRef.current,
            phase: phaseRef.current,
            time: timeRef.current,
            score: scoreRef.current,
            message: messageRef.current,
            cart: {
              position: world.rover.position.toArray() as [number, number, number],
              yaw: world.rover.rotation.y,
              ownerId: cartOwnerId,
              cargoIds: [...cartCargoIds],
            },
            facility:
              world.destinationId === "rust_belt"
                ? {
                    relayMask: Number(world.processingStation.userData.relayMask ?? 0),
                    vaultOpen: Boolean(world.processingStation.userData.vaultOpen),
                    railPulse: Number(world.processingStation.userData.railPulse ?? 0),
                }
                : undefined,
            pings: [...crewPings.values()].map((ping) => ({
              ...ping.data,
              position: ping.group.position.toArray() as [number, number, number],
            })),
            rescueAssists: [...crewRescueAssists.values()].map((assist) => ({
              ...assist,
            })),
            fieldToolCases: fieldToolCases.map((fieldCase) => ({
              id: fieldCase.id,
              toolId: fieldCase.toolId,
              position: fieldCaseWorldPosition(fieldCase).toArray() as [
                number,
                number,
                number,
              ],
              velocity: [...fieldCase.velocity] as [number, number, number],
              ownerId: fieldCase.ownerId,
              isBallistic: fieldCase.isBallistic,
              bounceCount: fieldCase.bounceCount,
            })),
            deposits: deposits.map((deposit) => {
              const worldPosition = deposit.group.getWorldPosition(new THREE.Vector3());
              return {
                id: deposit.id,
                state: deposit.state,
                progress: deposit.progress,
                condition: deposit.condition,
                position: worldPosition.toArray() as [number, number, number],
                velocity: deposit.velocity.toArray() as [number, number, number],
                isBallistic: deposit.isBallistic,
                bounceCount: deposit.bounceCount,
                ownerId: deposit.ownerId,
                tetherOwnerIds: deposit.tetherOwnerIds,
              };
            }),
            stats: {
              repairsCompleted: repairsCompletedRef.current,
              airmailDeliveries: airmailDeliveriesRef.current,
              bankShotDeliveries: bankShotDeliveriesRef.current,
              stuntBonus: stuntBonusRef.current,
              cargoBounces: cargoBouncesRef.current,
              brokenSamples: brokenSamplesRef.current,
            },
          };
        }
        setSnapshot({
          phase: phaseRef.current,
          time: timeRef.current,
          score: scoreRef.current,
          heat: heatRef.current,
          overheated: overheatedRef.current,
          drillWear: drillWearRef.current,
          drillJammed: drillJammedRef.current,
          activeHarvestTool: activeHarvestToolRef.current,
          specialistCase: localSpecialistCase?.toolId ?? null,
          nearbyFieldCase: nearbyLooseFieldCase?.fieldCase.toolId ?? null,
          harvestMeter:
            activeHarvestToolRef.current === "drill"
              ? heatRef.current
              : activeHarvestToolRef.current === "corer"
                ? corerCycleRef.current
                : siphonSealRef.current,
          repairProgress: repairProgressRef.current,
          repairsCompleted: repairsCompletedRef.current,
          airmailDeliveries: airmailDeliveriesRef.current,
          bankShotDeliveries: bankShotDeliveriesRef.current,
          stuntBonus: stuntBonusRef.current,
          cargoBounces: cargoBouncesRef.current,
          brokenSamples: brokenSamplesRef.current,
          missionSeed: missionSeedRef.current,
          suitIntegrity: suitIntegrityRef.current,
          downed: downedRef.current,
          recoveryProgress: recoveryProgressRef.current,
          suitRecoveries: suitRecoveriesRef.current,
          carrying: held ? cargoData[held.kind].name : null,
          cargoCondition: held ? held.condition : null,
          cargoStructure: held ? cargoData[held.kind].structure : null,
          throwRisk: held && currentThrowPrediction ? currentThrowPrediction.risk : null,
          throwDistance:
            held && currentThrowPrediction
              ? currentThrowPrediction.horizontalDistance
              : null,
          message: messageRef.current,
          scanCooldown: scanCooldownRef.current,
          magnetCooldown: magnetCooldownRef.current,
          polarityMode: polarityModeRef.current,
          facilityRelays: Number(world.processingStation.userData.relayMask ?? 0)
            .toString(2)
            .replace(/0/g, "").length,
          facilityVaultOpen: Boolean(world.processingStation.userData.vaultOpen),
          stabilizerCharges: stabilizerChargesRef.current,
          cartCargoCount: cartCargoIds.length,
          cartCapacity: CART_CAPACITY,
          cartHitched: cartOwnerId === hudOwnerId,
          cartDistance,
          depositsSecured: deposits.filter((deposit) => deposit.state === "secured").length,
          prompt,
          homeDistance,
          thrusterFuel,
          signalsTracked: trackedSignals.length,
          nearestSignalDistance,
          nearestSignalBearing,
          nearestSignalName,
          nearestSignalTool,
          tetheredCargo: tethered ? cargoData[tethered.kind].name : null,
          tetherDistance,
          tetherTeamLift: (tethered?.tetherOwnerIds.length ?? 0) >= 2,
          contractId: activeContractIdRef.current,
          contractTarget: CONTRACTS[activeContractIdRef.current].target,
          thrusterCapacity,
          tutorialMoved: tutorialMovedRef.current,
          tutorialScanned: tutorialScannedRef.current,
          tutorialDrilled: tutorialDrilledRef.current,
          tutorialCarried: tutorialCarriedRef.current,
        });
      }

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("pointerlockerror", onPointerLockError);
      document.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("wheel", onWheel);
      mount.removeEventListener("click", requestMouseLock);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      pointerTargetRef.current = null;
      resetRuntimeRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Sprite) {
          const material = object.material as THREE.SpriteMaterial;
          material.map?.dispose();
          material.dispose();
          return;
        }
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [queueCrewAction, requestMouseLock, sound, startAmbience]);

  useEffect(() => {
    if (snapshot.phase !== "success" && snapshot.phase !== "failed") return;
    if (settledRunIdRef.current === missionRunIdRef.current) return;
    settledRunIdRef.current = missionRunIdRef.current;
    const settlement = calculateMissionSettlement({
      progression: progressionRef.current,
      contractId: snapshot.contractId,
      success: snapshot.phase === "success",
      score: snapshot.score,
      timeRemaining: snapshot.time,
      samplesSecured: snapshot.depositsSecured,
      repairsCompleted: snapshot.repairsCompleted,
      suitRecoveries: snapshot.suitRecoveries,
    });
    progressionRef.current = settlement.progression;
    setProgression(settlement.progression);
    setLastSettlement({
      grossCreditsEarned: settlement.grossCreditsEarned,
      repairCreditsCharged: settlement.repairCreditsCharged,
      creditsEarned: settlement.creditsEarned,
      researchEarned: settlement.researchEarned,
    });
  }, [
    snapshot.contractId,
    snapshot.depositsSecured,
    snapshot.phase,
    snapshot.repairsCompleted,
    snapshot.score,
    snapshot.suitRecoveries,
    snapshot.time,
  ]);

  const openHubStation = useCallback((station: HubStationId) => {
    setHubStation(station);
    setHubTerminalOpen(true);
  }, []);

  const returnToHub = useCallback(() => {
    if (crewSessionRef.current?.role === "guest") return;
    phaseRef.current = "briefing";
    authoritativeStateRef.current = null;
    incomingAuthorityRef.current = null;
    setHubTerminalOpen(false);
    stopAmbience();
    setSnapshot((current) => ({ ...current, phase: "briefing" }));
  }, [stopAmbience]);

  const resetMission = useCallback(() => {
    const session = crewSessionRef.current;
    if (session?.role === "guest") return;
    activeContractIdRef.current = selectedContractId;
    activeDestinationRef.current = CONTRACTS[selectedContractId].destinationId;
    missionRunIdRef.current += 1;
    setHubTerminalOpen(false);
    setLastSettlement(null);
    const contract = CONTRACTS[selectedContractId];
    const thrusterCapacity = hasEquippedUpgrade(
      progressionRef.current,
      "thruster_reserve",
    )
      ? 125
      : 100;
    missionSeedRef.current = session
      ? session.missionSeed
      : nextMissionSeed(missionSeedRef.current);
    resetRuntimeRef.current?.();
    phaseRef.current = "active";
    messageRef.current = session
      ? "Crew mission live. Shared contract authority assigned to mission lead."
      : "Mission live. Find something expensive and remain technically alive.";
    setSnapshot({
      phase: "active",
      time: contract.seconds,
      score: 0,
      heat: 0,
      overheated: false,
      drillWear: 0,
      drillJammed: false,
      activeHarvestTool: "drill",
      specialistCase: null,
      nearbyFieldCase: null,
      harvestMeter: 0,
      repairProgress: 0,
      repairsCompleted: 0,
      airmailDeliveries: 0,
      bankShotDeliveries: 0,
      stuntBonus: 0,
      cargoBounces: 0,
      brokenSamples: 0,
      missionSeed: missionSeedRef.current,
      suitIntegrity: 100,
      downed: false,
      recoveryProgress: 0,
      suitRecoveries: 0,
      carrying: null,
      cargoCondition: null,
      cargoStructure: null,
      throwRisk: null,
      throwDistance: null,
      message: messageRef.current,
      scanCooldown: 0,
      magnetCooldown: 0,
      polarityMode: "attract",
      facilityRelays: 0,
      facilityVaultOpen: false,
      stabilizerCharges: 2,
      cartCargoCount: 0,
      cartCapacity: CART_CAPACITY,
      cartHitched: false,
      cartDistance: 10,
      depositsSecured: 0,
      prompt: "Q · SCAN FOR VALUABLE MATERIAL",
      homeDistance: 7,
      thrusterFuel: thrusterCapacity,
      signalsTracked: 0,
      nearestSignalDistance: null,
      nearestSignalBearing: null,
      nearestSignalName: null,
      nearestSignalTool: null,
      tetheredCargo: null,
      tetherDistance: null,
      tetherTeamLift: false,
      contractId: selectedContractId,
      contractTarget: contract.target,
      thrusterCapacity,
      tutorialMoved: false,
      tutorialScanned: false,
      tutorialDrilled: false,
      tutorialCarried: false,
    });
    requestMouseLock();
    startAmbience(activeDestinationRef.current);
    sound("launch");
  }, [requestMouseLock, selectedContractId, sound, startAmbience]);

  useEffect(() => {
    if (snapshot.phase !== "active") stopAmbience();
  }, [snapshot.phase, stopAmbience]);

  const percent = Math.min(100, (snapshot.score / snapshot.contractTarget) * 100);
  const urgent = snapshot.phase === "active" && snapshot.time <= 30;
  const activeDestination = DESTINATIONS[CONTRACTS[snapshot.contractId].destinationId];
  const debrisForecastWindow = activeDestination.id === "rust_belt" ? 82 : 55;
  const selectedHarvestTool = harvestToolData[snapshot.activeHarvestTool];
  const harvestMeterLabel =
    snapshot.activeHarvestTool === "drill"
      ? "CORE HEAT"
      : snapshot.activeHarvestTool === "corer"
        ? "STRIKE CYCLE"
        : "VACUUM SEAL";

  return (
    <main
      className={styles.shell}
      data-phase={snapshot.phase}
      data-destination={activeDestination.id}
      data-high-contrast={controlSettings.highContrast || undefined}
      data-quality={controlSettings.renderQuality}
      style={{ "--hud-scale": controlSettings.hudScale } as CSSProperties}
    >
      <div
        ref={mountRef}
        className={`${styles.canvas} ${mouseCaptured ? styles.mouseLocked : ""}`}
        role="img"
        aria-label={`Playable third-person 3D ${activeDestination.name} extraction mission`}
      />

      {snapshot.phase === "briefing" && (
        <OrbitalHub
          credits={progression.credits}
          research={progression.research}
          lastRepairBill={lastSettlement?.repairCreditsCharged ?? 0}
          renderQuality={controlSettings.renderQuality}
          interactive={!hubTerminalOpen && !notesOpen && !settingsOpen}
          onOpenStation={openHubStation}
        />
      )}

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>MG</span>
          <div>
            <p>MOON GOONS</p>
            <span>S.P.A.C.E. FIELD TEST // BUILD 032 // SPECIALIST HANDOFF</span>
          </div>
        </div>
        <div className={`${styles.clock} ${urgent ? styles.urgent : ""}`}>
          <span>{snapshot.phase === "briefing" ? "ORBITAL SHIFT" : "DEPARTURE WINDOW"}</span>
          <strong>{snapshot.phase === "briefing" ? "ON DUTY" : formatTime(snapshot.time)}</strong>
        </div>
      </header>

      <FieldNotes open={notesOpen} onOpenChange={handleNotesOpenChange} />
      <ControlSettingsPanel
        open={settingsOpen}
        settings={controlSettings}
        onOpenChange={handleSettingsOpenChange}
        onSettingsChange={updateControlSettings}
      />
      <GamepadMenuNavigation
        active={hubTerminalOpen || notesOpen || settingsOpen}
        onBack={closeActivePanel}
      />

      {snapshot.phase === "active" && (
        <>
          {crewSession && (
            <CrewRoster
              session={crewSession}
              room={crewRoom}
              latency={crewLatency}
              onLeave={leaveCrew}
            />
          )}
          {controlSettings.missionGuide && (
            <MissionGuide
              controllerConnected={controllerConnected}
              state={{
                moved: snapshot.tutorialMoved,
                scanned: snapshot.tutorialScanned,
                drilled: snapshot.tutorialDrilled,
                carried: snapshot.tutorialCarried,
                score: snapshot.score,
                target: snapshot.contractTarget,
              }}
            />
          )}
          {!mouseCaptured && !controllerConnected && (
            <div className={styles.mouseCapture}>
              <span>
                {mouseLockIssue === "unsupported"
                  ? "MOUSE LOCK UNAVAILABLE IN THIS PREVIEW"
                  : mouseLockIssue === "blocked"
                    ? "MOUSE LOCK BLOCKED BY THIS BROWSER"
                    : "CLICK VIEW TO LOCK MOUSE"}
              </span>
              <small>
                {mouseLockIssue === "unsupported" || mouseLockIssue === "blocked"
                  ? "OPEN THE PUBLIC LINK IN CHROME OR EDGE OUTSIDE CODEX"
                  : "CENTERED MOUSE CAPTURE IS REQUIRED FOR TURNING"}
              </small>
            </div>
          )}
          <div
            className={`${styles.crosshair} ${
              mouseCaptured ? styles.crosshairActive : ""
            }`}
            aria-hidden="true"
          >
            <i />
            <i />
          </div>

          <div className={styles.homeReadout}>
            <span className={styles.homePulse} />
            <div>
              <small>LANDER BEACON</small>
              <strong>HOME // {Math.round(snapshot.homeDistance)}m</strong>
            </div>
          </div>

          <aside className={styles.missionPanel}>
            <div className={styles.panelCode}>
              <span>{`${activeDestination.name.toUpperCase()} // ${activeDestination.gravity.toFixed(2)} m/s² FIELD`}</span>
              <b>{activeDestination.code}-{String(snapshot.missionSeed).padStart(5, "0")}</b>
            </div>
            <h2>{CONTRACTS[snapshot.contractId].name}</h2>
            <p>
              Secure ¢{snapshot.contractTarget} in approved scientific material.
            </p>
            <div className={styles.progressHeader}>
              <span>SHIP MANIFEST</span>
              <strong>
                ¢{snapshot.score} / ¢{snapshot.contractTarget}
              </strong>
            </div>
            <div className={styles.progressTrack}>
              <div style={{ width: `${percent}%` }} />
            </div>
            <div className={styles.miniStats}>
              <span>
                {snapshot.depositsSecured} secured · {snapshot.airmailDeliveries}{" "}
                airmail · {snapshot.bankShotDeliveries} bank shots
              </span>
              <span>
                {snapshot.cargoBounces} bounces · {snapshot.brokenSamples} broken · ¢
                {snapshot.stuntBonus} bonus
              </span>
              <span>
                CART {snapshot.cartCargoCount}/{snapshot.cartCapacity} · {snapshot.cartHitched
                  ? "HITCHED"
                  : `${Math.round(snapshot.cartDistance)}m`}
              </span>
              <span>
                {snapshot.carrying
                  ? `${snapshot.carrying} // ${Math.round(
                      (snapshot.cargoCondition ?? 1) * 100,
                    )}% // ${snapshot.cargoStructure}`
                  : "Hands regrettably empty"}
              </span>
              <span className={snapshot.time <= debrisForecastWindow ? styles.stormActive : ""}>
                {activeDestination.id === "rust_belt"
                  ? snapshot.time <= debrisForecastWindow
                    ? "SCRAP CONVERGENCE // ACTIVE · POLARITY SURGES INTERMITTENT"
                    : `SCRAP FORECAST // T-${Math.ceil(snapshot.time - debrisForecastWindow)}s · POLARITY UNSTABLE`
                  : snapshot.time <= debrisForecastWindow
                  ? "DEBRIS SHOWER // ACTIVE"
                  : `DEBRIS FORECAST // T-${Math.ceil(snapshot.time - debrisForecastWindow)}s`}
              </span>
            </div>
          </aside>

          <aside className={styles.toolPanel}>
            <div className={styles.toolHeading}>
              <span className={styles.toolIcon}>{selectedHarvestTool.shortName}</span>
              <div>
                <strong>{selectedHarvestTool.name.toUpperCase()}</strong>
                <small>
                  {snapshot.activeHarvestTool === "drill"
                    ? snapshot.drillJammed
                      ? "MECHANICAL JAM // R TO REPAIR"
                      : snapshot.overheated
                        ? "THERMAL LOCKOUT"
                        : "METALS // QUESTIONABLY OPERATIONAL"
                    : snapshot.activeHarvestTool === "corer"
                      ? "GLASS + FOSSILS // PULSE EXTRACTION"
                      : "PRESSURIZED // SEAL + FLOW"}
                </small>
              </div>
            </div>
            <div className={styles.heatLabel}>
              <span>{harvestMeterLabel}</span>
              <strong>{Math.round(snapshot.harvestMeter)}%</strong>
            </div>
            <div className={styles.heatTrack}>
              <div
                className={
                  snapshot.activeHarvestTool === "drill" && snapshot.overheated
                    ? styles.heatDanger
                    : ""
                }
                style={{ width: `${snapshot.harvestMeter}%` }}
              />
            </div>
            <div className={styles.integrityLabel}>
              <span>
                {snapshot.activeHarvestTool === "drill"
                  ? snapshot.drillJammed
                    ? "PERCUSSIVE REPAIR"
                    : "DRIVE CONDITION"
                  : snapshot.activeHarvestTool === "corer"
                    ? "IMPACT METHOD"
                    : "TRANSFER METHOD"}
              </span>
              <strong>
                {snapshot.activeHarvestTool === "drill"
                  ? snapshot.drillJammed
                    ? `${Math.round(snapshot.repairProgress)}%`
                    : `${Math.round(100 - snapshot.drillWear)}%`
                  : snapshot.activeHarvestTool === "corer"
                    ? "TIMED STRIKES"
                    : "CONTINUOUS"}
              </strong>
            </div>
            <div className={styles.integrityTrack}>
              <div
                className={
                  snapshot.activeHarvestTool === "drill" && snapshot.drillJammed
                    ? styles.integrityDanger
                    : ""
                }
                style={{
                  width: `${
                    snapshot.activeHarvestTool === "drill"
                      ? snapshot.drillJammed
                        ? snapshot.repairProgress
                        : 100 - snapshot.drillWear
                      : 100
                  }%`,
                }}
              />
            </div>
            <div className={styles.utilityToolStatus}>
              <span>FIELD KIT TAB / WHEEL</span>
              <strong>DRILL · CORER · SIPHON</strong>
            </div>
            <div
              className={`${styles.utilityToolStatus} ${
                snapshot.specialistCase === snapshot.activeHarvestTool
                  ? styles.specialistCaseActive
                  : ""
              }`}
            >
              <span>SPECIALIST CASE X / ⇧E</span>
              <strong>
                {snapshot.specialistCase
                  ? `${harvestToolData[
                      snapshot.specialistCase
                    ].shortName} OWNED · ${
                      snapshot.specialistCase === snapshot.activeHarvestTool
                        ? "+30% ACTIVE"
                        : "MATCH TOOL FOR BONUS"
                    }`
                  : snapshot.nearbyFieldCase
                    ? `${harvestToolData[snapshot.nearbyFieldCase].shortName} CASE NEARBY`
                    : "FIND OR CATCH A CASE"}
              </strong>
            </div>
            <div className={styles.suitLabel}>
              <span>{snapshot.downed ? "SUIT SAFE MODE" : "SUIT INTEGRITY"}</span>
              <strong>
                {snapshot.downed
                  ? `REBOOT ${Math.round(snapshot.recoveryProgress)}%`
                  : `${Math.round(snapshot.suitIntegrity)}%`}
              </strong>
            </div>
            <div className={styles.suitTrack}>
              <div
                className={
                  snapshot.downed || snapshot.suitIntegrity <= 30
                    ? styles.suitDanger
                    : ""
                }
                style={{
                  width: `${
                    snapshot.downed
                      ? snapshot.recoveryProgress
                      : snapshot.suitIntegrity
                  }%`,
                }}
              />
            </div>
            <div className={styles.scanStatus}>
              <span>SCANNER Q</span>
              <strong>
                {snapshot.scanCooldown <= 0
                  ? "READY"
                  : `CHARGING ${snapshot.scanCooldown.toFixed(1)}s`}
              </strong>
            </div>
            <div className={styles.signalTelemetry}>
              <span>{snapshot.signalsTracked} TRACKED</span>
              <strong>
                {snapshot.nearestSignalDistance === null
                  ? "NO CONTACT"
                  : `NEAREST ${Math.round(snapshot.nearestSignalDistance)}m · ${
                      snapshot.nearestSignalBearing === null
                        ? "AHEAD"
                        : formatSignalBearing(snapshot.nearestSignalBearing)
                    }`}
              </strong>
            </div>
            <div className={styles.utilityToolStatus}>
              <span>SPECTRAL ID</span>
              <strong>
                {snapshot.nearestSignalName && snapshot.nearestSignalTool
                  ? `${snapshot.nearestSignalName.toUpperCase()} · ${
                      harvestToolData[snapshot.nearestSignalTool].shortName
                    } ${harvestToolData[
                      snapshot.nearestSignalTool
                    ].name.toUpperCase()}`
                  : "SCAN TO CATALOG"}
              </strong>
            </div>
            <div
              className={`${styles.tetherStatus} ${
                snapshot.tetherTeamLift ? styles.tetherTeamLift : ""
              }`}
            >
              <span>TETHER GUN T</span>
              <strong>
                {snapshot.tetheredCargo
                  ? snapshot.tetherTeamLift
                    ? `TEAM LIFT · ${Math.round(snapshot.tetherDistance ?? 0)}m`
                    : `LOCKED · ${Math.round(snapshot.tetherDistance ?? 0)}m`
                  : "READY · 16m"}
              </strong>
            </div>
            <div className={styles.utilityToolStatus}>
              <span>POLARITY MANIPULATOR G / V</span>
              <strong>
                {activeDestination.id === "rust_belt"
                  ? `${snapshot.polarityMode.toUpperCase()} · ANNEX ${snapshot.facilityRelays}/3 · ${snapshot.facilityVaultOpen ? "VAULT OPEN" : "VAULT LOCKED"}`
                  : snapshot.magnetCooldown <= 0
                  ? `${snapshot.polarityMode.toUpperCase()} · METAL 18m`
                  : `CHARGING ${snapshot.magnetCooldown.toFixed(1)}s`}
              </strong>
            </div>
            <div className={styles.utilityToolStatus}>
              <span>STABILIZER C</span>
              <strong>{snapshot.stabilizerCharges} FOAM CHARGES</strong>
            </div>
            <div className={styles.utilityToolStatus}>
              <span>CARGO CART H</span>
              <strong>
                {snapshot.cartHitched
                  ? `HITCHED · ${snapshot.cartCargoCount}/${snapshot.cartCapacity}`
                  : `${snapshot.cartCargoCount}/${snapshot.cartCapacity} · ${Math.round(
                      snapshot.cartDistance,
                    )}m`}
              </strong>
            </div>
            <div className={styles.fuelLabel}>
              <span>EVA THRUSTER</span>
              <strong>
                {Math.round(snapshot.thrusterFuel)} / {snapshot.thrusterCapacity}
              </strong>
            </div>
            <div className={styles.fuelTrack}>
              <div
                style={{
                  width: `${Math.min(
                    100,
                    (snapshot.thrusterFuel / snapshot.thrusterCapacity) * 100,
                  )}%`,
                }}
              />
            </div>
          </aside>

          {controllerConnected && (
            <div className={styles.controllerControls} aria-label="Controller controls">
              <span className={styles.controlsLabel}>FIELD CONTROLS</span>
              <span><kbd>STICKS</kbd> MOVE / LOOK</span>
              <span><kbd>A</kbd> HOP / BOOST</span>
              <span><kbd>X</kbd> USE / CARGO</span>
              <span><kbd>RT</kbd> USE TOOL</span>
              <span><kbd>D↑</kbd> FLIP POLARITY</span>
              <span><kbd>VIEW</kbd> CYCLE TOOL</span>
              <span><kbd>RB</kbd> TOSS CASE / CARGO</span>
              <span><kbd>START</kbd> MENU</span>
            </div>
          )}

          <div
            className={`${styles.controls} ${controllerConnected ? styles.keyboardControlsDimmed : ""}`}
            aria-label="Keyboard controls"
          >
            <span className={styles.controlsLabel}>FIELD CONTROLS</span>
            <div>
              <kbd>WASD</kbd>
              <span>MOVE</span>
            </div>
            <div>
              <kbd>MOUSE</kbd>
              <span>LOOK / TURN</span>
            </div>
            <div>
              <kbd>SPACE</kbd>
              <span>HOP / HOLD BOOST</span>
            </div>
            <div>
              <kbd>F</kbd>
              <span>USE TOOL</span>
            </div>
            <div>
              <kbd>TAB / WHEEL</kbd>
              <span>CYCLE KIT</span>
            </div>
            <div>
              <kbd>E / ⇧E</kbd>
              <span>USE / THROW</span>
            </div>
            <div>
              <kbd>Q</kbd>
              <span>SCAN</span>
            </div>
            <div>
              <kbd>G / V</kbd>
              <span>POLARITY / FLIP</span>
            </div>
            <div>
              <kbd>X</kbd>
              <span>TOSS SPECIALIST CASE</span>
            </div>
          </div>

          <div className={styles.radio}>
            <span>FIELD COMMS</span>
            <p>{snapshot.message}</p>
          </div>

          <div className={styles.actionPrompt} data-risk={snapshot.throwRisk ?? undefined}>
            <span>
              {snapshot.throwRisk
                ? "FIRST IMPACT PREDICTION // RICOCHETS NOT INCLUDED"
                : "CONTEXT ACTION"}
            </span>
            <strong>{snapshot.prompt}</strong>
          </div>

          {snapshot.score >= snapshot.contractTarget && (
            <div className={styles.launchButton}>
              RETURN TO THE SHIP + PRESS E TO LAUNCH
            </div>
          )}
        </>
      )}

      {snapshot.phase === "briefing" && hubTerminalOpen && (
        <section
          className={`${styles.overlay} ${styles.hubTerminalOverlay}`}
          data-gamepad-scope="true"
        >
          <div className={`${styles.briefingCard} ${styles.hubTerminalCard}`}>
            <button
              type="button"
              className={styles.hubTerminalClose}
              onClick={() => setHubTerminalOpen(false)}
              aria-label="Close operations terminal and return to the ship deck"
            >
              ×
            </button>
            <div className={styles.companyLine}>
              <span>S.P.A.C.E.</span>
              {HUB_STATION_HEADINGS[hubStation]} {"// SHIPBOARD TERMINAL"}
            </div>
            <nav className={styles.terminalNav} aria-label="Operations terminal sections">
              {HUB_STATION_ORDER.map((station) => (
                <button
                  key={station}
                  type="button"
                  data-active={hubStation === station || undefined}
                  onClick={() => setHubStation(station)}
                >
                  {HUB_STATION_HEADINGS[station]}
                </button>
              ))}
            </nav>
            <div className={styles.terminalIntro}>
              <p className={styles.kicker}>SHIPBOARD OPERATIONS // {hubStation.toUpperCase()}</p>
              <h1>{HUB_STATION_HEADINGS[hubStation]}</h1>
              <p className={styles.lede}>{HUB_STATION_COPY[hubStation]}</p>
            </div>
            {hubStation === "crew" ? (
              <CrewLobby
                session={crewSession}
                room={crewRoom}
                busy={crewBusy}
                error={crewError}
                tuning={crewNetworkTuning}
                onTuningChange={setCrewNetworkTuning}
                onCreate={(name) => void connectCrew("create", name)}
                onJoin={(name, code) => void connectCrew("join", name, code)}
                onLeave={leaveCrew}
                onLaunch={resetMission}
                onSolo={resetMission}
              />
            ) : (
              <OperationsHub
                activeStation={hubStation}
                progression={progression}
                selectedContractId={selectedContractId}
                contractLocked={crewSession?.role === "guest"}
                onContractSelect={setSelectedContractId}
                onPurchaseUpgrade={buyUpgrade}
                onToggleUpgrade={toggleUpgrade}
              />
            )}
            <small>
              Personal career data stays on this device · Crew mission data is shared
            </small>
          </div>
        </section>
      )}

      {(snapshot.phase === "success" || snapshot.phase === "failed") && (
        <section className={styles.overlay}>
          <div
            className={`${styles.resultsCard} ${
              snapshot.phase === "failed" ? styles.failure : ""
            }`}
          >
            <p className={styles.kicker}>MISSION DEBRIEF // AUTOMATICALLY GENERATED</p>
            <span className={styles.resultSeal}>
              {snapshot.phase === "success" ? "ACCEPTABLE" : "LEARNING EVENT"}
            </span>
            <h1>{snapshot.phase === "success" ? "SCIENCE SECURED." : "SHIP DEPARTED."}</h1>
            <p className={styles.lede}>{snapshot.message}</p>
            <div className={styles.resultGrid}>
              <div>
                <span>CARGO VALUE</span>
                <strong>¢{snapshot.score}</strong>
              </div>
              <div>
                <span>SAMPLES</span>
                <strong>{snapshot.depositsSecured}</strong>
              </div>
              <div>
                <span>TOOL / SUIT FIXES</span>
                <strong>
                  {snapshot.repairsCompleted} / {snapshot.suitRecoveries}
                </strong>
              </div>
              <div>
                <span>AIRMAIL DELIVERIES</span>
                <strong>{snapshot.airmailDeliveries}</strong>
              </div>
              <div>
                <span>CARGO BOUNCES</span>
                <strong>{snapshot.cargoBounces}</strong>
              </div>
              <div>
                <span>SAMPLES BROKEN</span>
                <strong>{snapshot.brokenSamples}</strong>
              </div>
              <div>
                <span>BANK SHOTS</span>
                <strong>{snapshot.bankShotDeliveries}</strong>
              </div>
              <div>
                <span>STUNT BONUS</span>
                <strong>¢{snapshot.stuntBonus}</strong>
              </div>
              <div>
                <span>MISSION GROSS</span>
                <strong>¢{lastSettlement?.grossCreditsEarned ?? 0}</strong>
              </div>
              <div>
                <span>REPAIR INVOICE</span>
                <strong>-¢{lastSettlement?.repairCreditsCharged ?? 0}</strong>
              </div>
              <div>
                <span>CAREER NET PAY</span>
                <strong>¢{lastSettlement?.creditsEarned ?? 0}</strong>
              </div>
              <div>
                <span>RESEARCH FILED</span>
                <strong>+{lastSettlement?.researchEarned ?? 0}</strong>
              </div>
            </div>
            {crewSession?.role === "guest" ? (
              <p className={styles.crewWaiting}>
                WAITING FOR MISSION LEAD TO FILE MINIMAL PAPERWORK…
              </p>
            ) : (
              <button type="button" onClick={returnToHub}>
                RETURN TO ORBITAL OPERATIONS
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
