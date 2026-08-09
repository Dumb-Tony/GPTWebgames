"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ControlSettingsPanel } from "./ControlSettingsPanel";
import { CrewLobby, CrewRoster } from "./CrewLobby";
import { FieldNotes } from "./FieldNotes";
import {
  CREW_INPUT_DOWNED,
  CREW_INPUT_DRILL,
  CREW_INPUT_MOVING,
  CREW_INPUT_THRUSTER,
  CREW_SYNC_INTERVAL_MS,
  DEFAULT_CREW_NETWORK_TUNING,
  crewColor,
  type CrewActionType,
  type CrewLocalPresence,
  type CrewMissionState,
  type CrewNetworkTuning,
  type CrewRoomSnapshot,
  type CrewSession,
} from "./crewNetwork";
import {
  CONTRACT_TARGET,
  DEFAULT_CONTROL_SETTINGS,
  DRILL_JAM_WEAR,
  MISSION_SECONDS,
  TETHER_BREAK_RANGE,
  TETHER_LOCK_RANGE,
  TETHER_MAX_OWNERS,
  advanceSuitRecovery,
  applySuitDamage as calculateSuitDamage,
  canAirmailCargo,
  calculateBankShotBonus,
  calculateCargoBounce,
  calculateCargoImpact,
  calculateCargoValue,
  calculateTetherPull,
  cargoData,
  createMissionDepositDefinitions,
  formatSignalBearing,
  formatTime,
  nextMissionSeed,
  normalizeControlSettings,
  predictCargoThrow,
  registerRepairStrike,
  seededRandom,
  type CargoKind,
  type ControlSettings,
  type DepositDefinition,
} from "./gameRules";
import styles from "./game.module.css";

const MOON_RADIUS = 48;
const MOON_GRAVITY = 4.35;
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

type Phase = "briefing" | "active" | "success" | "failed";
type MouseLockIssue = "unsupported" | "blocked" | null;
type DepositState =
  | "hidden"
  | "revealed"
  | "extracting"
  | "cargo"
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
  shards: THREE.Group;
  beacon: THREE.PointLight;
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

type Snapshot = {
  phase: Phase;
  time: number;
  score: number;
  heat: number;
  overheated: boolean;
  drillWear: number;
  drillJammed: boolean;
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
  depositsSecured: number;
  prompt: string;
  homeDistance: number;
  thrusterFuel: number;
  signalsTracked: number;
  nearestSignalDistance: number | null;
  nearestSignalBearing: number | null;
  tetheredCargo: string | null;
  tetherDistance: number | null;
  tetherTeamLift: boolean;
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
  rover.position.set(2, 0.3, 8);
  rover.rotation.y = -0.4;
  rover.rotation.z = -0.08;
  rover.add(box([4.4, 1.4, 2.6], 0xd6d1b8, [0, 1.35, 0]));
  rover.add(box([4.5, 0.55, 2.72], palette.yellow, [0, 1.05, 0]));
  rover.add(box([2.1, 0.75, 1.95], 0x183040, [-0.45, 2.15, 0]));
  [-1.45, 1.45].forEach((x) => {
    [-1.25, 1.25].forEach((z) => {
      const wheel = cylinder(0.58, 0.58, 0.45, 0x151824, [x, 0.55, z], 10);
      wheel.rotation.x = Math.PI / 2;
      rover.add(wheel);
    });
  });
  const mast = cylinder(0.08, 0.1, 2.3, 0x9c9b8e, [1.3, 3.2, 0], 8);
  rover.add(mast);
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.35, 0.35),
    standardMaterial(palette.coral, {
      emissive: palette.red,
      emissiveIntensity: 2.5,
    }),
  );
  light.position.set(1.3, 4.3, 0);
  rover.add(light);
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

  astronaut.userData.leftArm = leftArm;
  astronaut.userData.rightArm = rightArm;
  astronaut.userData.leftLeg = leftLeg;
  astronaut.userData.rightLeg = rightLeg;
  astronaut.userData.drill = drill;
  astronaut.userData.drillLight = drillLight;
  astronaut.userData.visor = visor;
  astronaut.userData.thrusterFlames = thrusterFlames;
  astronaut.userData.thrusterGlow = thrusterGlow;
  return astronaut;
}

function createDeposit(
  definition: DepositDefinition,
): DepositRuntime {
  const data = cargoData[definition.kind];
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
    shards,
    beacon,
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
      roughness: 1,
      metalness: 0,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  return surface;
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

function createMeteorHazards(scene: THREE.Scene) {
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

    scene.add(group);
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
    [-4, 18],
    [16, 3],
    [29, -18],
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

function createWorld(scene: THREE.Scene) {
  scene.add(createMoonSurface());
  scene.add(createStars());
  scene.add(createDust());
  scene.add(createHorizonRidges());
  scene.add(createCrater(-6, -2, 4.5));
  scene.add(createCrater(13, -15, 5.8));
  scene.add(createCrater(22, 13, 4));
  scene.add(createCrater(-28, -14, 6.2));

  const random = seededRandom(982);
  for (let index = 0; index < 82; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 7 + random() * 38;
    const size = 0.12 + random() * 0.66;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      standardMaterial(index % 5 === 0 ? 0x343744 : 0x555864, { roughness: 1 }),
    );
    rock.position.set(Math.cos(angle) * radius, size * 0.42, Math.sin(angle) * radius);
    rock.rotation.set(random() * 2, random() * 2, random() * 2);
    rock.scale.y = 0.65 + random() * 0.5;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  const ship = createShip();
  const cargoReceiver = createCargoReceiver();
  const rover = createRover();
  const meteorStreaks = createMeteorStreaks();
  const meteorHazards = createMeteorHazards(scene);
  const pressureVents = createPressureVents();
  scene.add(ship);
  scene.add(cargoReceiver);
  scene.add(rover);
  scene.add(meteorStreaks);
  pressureVents.forEach((vent) => scene.add(vent));

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(7, 28, 20),
    standardMaterial(0x315c83, {
      emissive: 0x102a45,
      emissiveIntensity: 0.75,
      roughness: 0.86,
    }),
  );
  earth.position.set(62, 48, -92);
  scene.add(earth);

  const earthCloud = new THREE.Mesh(
    new THREE.SphereGeometry(7.08, 22, 16),
    new THREE.MeshBasicMaterial({
      color: 0xa8d9dc,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
    }),
  );
  earthCloud.position.copy(earth.position);
  scene.add(earthCloud);

  return {
    ship,
    cargoReceiver,
    rover,
    earth,
    earthCloud,
    meteorStreaks,
    meteorHazards,
    pressureVents,
  };
}

export function MoonGoonsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const pointerTargetRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef(new Set<string>());
  const phaseRef = useRef<Phase>("briefing");
  const missionSeedRef = useRef(INITIAL_MISSION_SEED);
  const timeRef = useRef(MISSION_SECONDS);
  const scoreRef = useRef(0);
  const heatRef = useRef(0);
  const overheatedRef = useRef(false);
  const drillWearRef = useRef(0);
  const drillJammedRef = useRef(false);
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
  const messageRef = useRef(INITIAL_MESSAGE);
  const carryingRef = useRef<number | null>(null);
  const interactLatchRef = useRef(false);
  const scanLatchRef = useRef(false);
  const repairLatchRef = useRef(false);
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
  const outgoingCrewActionRef = useRef<{
    sequence: number;
    type: CrewActionType;
  } | null>(null);
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
  const [snapshot, setSnapshot] = useState<Snapshot>({
    phase: "briefing",
    time: MISSION_SECONDS,
    score: 0,
    heat: 0,
    overheated: false,
    drillWear: 0,
    drillJammed: false,
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
    depositsSecured: 0,
    prompt: "Q · SCAN FOR VALUABLE MATERIAL",
    homeDistance: 7,
    thrusterFuel: 100,
    signalsTracked: 0,
    nearestSignalDistance: null,
    nearestSignalBearing: null,
    tetheredCargo: null,
    tetherDistance: null,
    tetherTeamLift: false,
  });

  const updateControlSettings = useCallback((nextSettings: ControlSettings) => {
    const normalized = normalizeControlSettings(nextSettings);
    controlSettingsRef.current = normalized;
    setControlSettings(normalized);
    try {
      window.localStorage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(normalized));
    } catch {
      // Preferences still apply for this session when storage is unavailable.
    }
  }, []);

  const queueCrewAction = useCallback((type: CrewActionType) => {
    if (crewSessionRef.current?.role !== "guest") return;
    crewActionSequenceRef.current += 1;
    outgoingCrewActionRef.current = {
      sequence: crewActionSequenceRef.current,
      type,
    };
  }, []);

  const clearCrewSession = useCallback((reason?: string) => {
    crewSessionRef.current = null;
    crewRoomRef.current = null;
    setCrewSession(null);
    setCrewRoom(null);
    setCrewLatency(null);
    outgoingCrewActionRef.current = null;
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
      const action = outgoingCrewActionRef.current;
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
            phase: crewSession.role === "host" ? phaseRef.current : undefined,
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
          outgoingCrewActionRef.current?.sequence === action.sequence
        ) {
          outgoingCrewActionRef.current = null;
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
        | "repair",
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
        }[tone];
        oscillator.type =
          tone === "warning" || tone === "repair" || tone === "break"
            ? "square"
            : tone === "step"
              ? "triangle"
              : "sine";
        oscillator.frequency.setValueAtTime(settings[0], now);
        oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
        gain.gain.setValueAtTime(
          (tone === "step" ? 0.018 : tone === "repair" ? 0.042 : 0.05) * volume,
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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

    const world = createWorld(scene);
    const astronaut = createAstronaut();
    scene.add(astronaut);
    const remoteAstronauts = new Map<
      string,
      {
        group: THREE.Group;
        anchor: THREE.Object3D;
        target: THREE.Vector3;
        targetYaw: number;
        inputMask: number;
      }
    >();
    const tetherLines = new Map<string, THREE.Line>();

    let deposits = createMissionDepositDefinitions(missionSeedRef.current).map(
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

    const velocity = new THREE.Vector3();
    let verticalVelocity = 0;
    let playerHeight = 0;
    let thrusterFuel = 100;
    let scanAnimation = 0;
    let hudTimer = 0;
    let warningPlayed = false;
    let meteorWarningPlayed = false;
    let missionRandom = seededRandom(missionSeedRef.current + 704);
    let meteorCooldown = 5.5;
    let stepTimer = 0;
    let cameraImpact = 0;
    let cameraPitch = 0;
    let repairKick = 0;
    let damageCooldown = 0;
    let airmailFlash = 0;
    let currentThrowPrediction: ReturnType<typeof predictCargoThrow> | null = null;
    let animationFrame = 0;
    let previous = performance.now();

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
      deposits = createMissionDepositDefinitions(missionSeedRef.current).map(
        (definition) => createDeposit(definition),
      );
      deposits.forEach((deposit) => scene.add(deposit.group));
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
      return "downed" as const;
    };

    resetRuntimeRef.current = () => {
      astronaut.position.set(-12, 0, 5);
      astronaut.rotation.set(0, 0, 0);
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      playerHeight = 0;
      thrusterFuel = 100;
      carryingRef.current = null;
      timeRef.current = MISSION_SECONDS;
      scoreRef.current = 0;
      heatRef.current = 0;
      overheatedRef.current = false;
      drillWearRef.current = 0;
      drillJammedRef.current = false;
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
      warningPlayed = false;
      meteorWarningPlayed = false;
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
      resetDeposits();
    };

    const onResize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    };
    onResize();
    window.addEventListener("resize", onResize);

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, button")
      ) {
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === "KeyP" && !event.repeat && crewSessionRef.current) {
        if (crewSessionRef.current.role === "guest") {
          queueCrewAction("ping");
        } else {
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
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);
    document.addEventListener("mousemove", onMouseMove);
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
      deposit.core.visible = deposit.state === "cargo";
      deposit.shards.visible = deposit.state === "broken";
      deposit.ring.visible = deposit.state !== "broken";
      deposit.beacon.intensity = embedded ? 7 : deposit.state === "cargo" ? 9 : 0;
    };

    const applyAuthoritativeState = (state: CrewMissionState) => {
      if (state.missionSeed !== missionSeedRef.current) return;
      timeRef.current = state.time;
      scoreRef.current = state.score;
      messageRef.current = state.message;
      phaseRef.current = state.phase;
      repairsCompletedRef.current = state.stats.repairsCompleted;
      airmailDeliveriesRef.current = state.stats.airmailDeliveries;
      bankShotDeliveriesRef.current = state.stats.bankShotDeliveries;
      stuntBonusRef.current = state.stats.stuntBonus;
      cargoBouncesRef.current = state.stats.cargoBounces;
      brokenSamplesRef.current = state.stats.brokenSamples;

      const localMemberId = crewSessionRef.current?.memberId ?? null;
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
          messageRef.current = `${member.name} ${pingMessages[action.type]}.`;
          if (action.type === "ping_danger") sound("warning");
          return;
        }

        if (action.type === "tether") {
          toggleTether(member.id, member.name, memberPosition);
          return;
        }

        const held = deposits.find((deposit) => deposit.ownerId === member.id);
        if (held) {
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
            const group = createAstronaut(crewColor(member.colorIndex).hex);
            group.position.set(member.x, member.y, member.z);
            group.scale.setScalar(0.94);
            const anchor = new THREE.Object3D();
            anchor.position.set(0, 2.05, -2.05);
            group.add(anchor);
            scene.add(group);
            remote = {
              group,
              anchor,
              target: new THREE.Vector3(member.x, member.y, member.z),
              targetYaw: member.yaw,
              inputMask: member.inputMask,
            };
            remoteAstronauts.set(member.id, remote);
          }
          remote.target.set(member.x, member.y, member.z);
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
          if (drilling) {
            (remote.group.userData.drill as THREE.Group).rotation.y += dt * 34;
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
        remoteAstronauts.delete(id);
      });
    };

    const animate = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      hudTimer += dt;
      const keys = keysRef.current;
      if (
        networkMissionStartRef.current !== null &&
        phaseRef.current === "briefing"
      ) {
        missionSeedRef.current = networkMissionStartRef.current;
        resetRuntimeRef.current?.();
        phaseRef.current = "active";
        messageRef.current =
          crewSessionRef.current?.role === "guest"
            ? "Crew contract received. Local movement prediction engaged."
            : "Crew contract live. Mission state authority assigned.";
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
      const phase = phaseRef.current;
      updateRemoteCrew(dt, now);
      if (hasAuthority && phase === "active") processCrewActions();

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
        const cycleTime = total % 9;
        const cycle = Math.floor(total / 9);
        const warning = cycleTime >= 6.15 && cycleTime < 7.25;
        const erupting = cycleTime >= 7.25 && cycleTime < 8.55;
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

      if (
        phase === "active" &&
        !notesOpenRef.current &&
        !settingsOpenRef.current
      ) {
        timeRef.current = Math.max(0, timeRef.current - dt);
        scanCooldownRef.current = Math.max(0, scanCooldownRef.current - dt);
        damageCooldown = Math.max(0, damageCooldown - dt);

        if (downedRef.current) {
          recoveryProgressRef.current = advanceSuitRecovery(
            recoveryProgressRef.current,
            keys.has("KeyE"),
            dt,
          );
          if (recoveryProgressRef.current >= 100) {
            downedRef.current = false;
            suitIntegrityRef.current = 42;
            recoveryProgressRef.current = 0;
            suitRecoveriesRef.current += 1;
            damageCooldown = 3;
            messageRef.current =
              "Suit reboot complete. Forty-two percent integrity is apparently within policy.";
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
            target.state = "extracting";
            target.progress = Math.min(100, target.progress + dt * 20);
            target.beacon.intensity = 11;
            if (target.progress >= 100) {
              target.state = "cargo";
              target.shell.visible = false;
              target.core.visible = true;
              target.beacon.intensity = 9;
              messageRef.current = `${member.name} extracted ${cargoData[target.kind].name}. Shared logistics problem created.`;
              sound("pickup");
            }
          });
        }
        if (timeRef.current <= 55) {
          if (!meteorWarningPlayed) {
            meteorWarningPlayed = true;
            messageRef.current =
              "DEBRIS SHOWER INBOUND. Coral target markers now indicate professional concern.";
            sound("warning");
          }
          meteorCooldown -= dt;
          if (meteorCooldown <= 0 && armMeteorHazard()) {
            meteorCooldown =
              timeRef.current <= 25
                ? 2.5 + missionRandom() * 1.8
                : 4 + missionRandom() * 2.5;
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
        const speedFactor = carried ? cargoData[carried.kind].speed : 1;
        const driveInput = incapacitated
          ? 0
          : (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
            (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        const strafeInput = incapacitated
          ? 0
          : (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
        const fallbackTurnInput = mouseCapturedRef.current || incapacitated
          ? 0
          : (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
        const moving = driveInput !== 0 || strafeInput !== 0;

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

        if (!incapacitated && keys.has("Space") && playerHeight <= 0.01) {
          verticalVelocity =
            carried?.kind === "platinum" ? JUMP_VELOCITY * 0.72 : JUMP_VELOCITY;
          playerHeight = 0.02;
          emitDustBurst(astronaut.position, carried ? 0.8 : 0.62);
        }
        const thrusterActive =
          !incapacitated &&
          keys.has("Space") &&
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
          thrusterFuel = Math.min(100, thrusterFuel + 31 * dt);
        }
        if (playerHeight > 0 || verticalVelocity > 0) {
          verticalVelocity -= MOON_GRAVITY * dt;
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

        const scanPressed = !incapacitated && keys.has("KeyQ");
        if (scanPressed && !scanLatchRef.current && scanCooldownRef.current <= 0) {
          scanCooldownRef.current = 4;
          scanAnimation = 0.01;
          scanRing.visible = true;
          scanRing.position.set(astronaut.position.x, 0.18, astronaut.position.z);
          if (hasAuthority) {
            let revealed = 0;
            deposits.forEach((deposit) => {
              if (
                deposit.state === "hidden" &&
                deposit.position.distanceTo(astronaut.position) < 16
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
          deposit.ring.scale.setScalar(1 + Math.sin(now * 0.003 + index) * 0.08);
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
              deposit.velocity.y -= MOON_GRAVITY * dt;
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

        const nearestDrillable = deposits
          .filter(
            (deposit) =>
              deposit.state === "revealed" || deposit.state === "extracting",
          )
          .sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        const drilling =
          !incapacitated &&
          keys.has("KeyF") &&
          nearestDrillable &&
          nearestDrillable.position.distanceTo(astronaut.position) < 3 &&
          carryingRef.current === null &&
          playerHeight < 0.15 &&
          !overheatedRef.current &&
          !drillJammedRef.current;

        const drill = astronaut.userData.drill as THREE.Group;
        const drillLight = astronaut.userData.drillLight as THREE.Mesh;
        const drillLightMaterial = drillLight.material as THREE.MeshStandardMaterial;
        const repairPressed = !incapacitated && keys.has("KeyR");
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

        if (drilling && nearestDrillable) {
          if (hasAuthority) {
            nearestDrillable.state = "extracting";
            nearestDrillable.progress += dt * (heatRef.current > 72 ? 15 : 23);
          }
          drillWearRef.current = Math.min(
            DRILL_JAM_WEAR,
            drillWearRef.current + dt * (heatRef.current > 72 ? 18 : 10),
          );
          heatRef.current = Math.min(100, heatRef.current + dt * 33);
          drill.rotation.y += dt * 34;
          drill.position.y = 2.7 + Math.sin(now * 0.07) * 0.045;
          const start = new THREE.Vector3();
          drill.getWorldPosition(start);
          updateDrillBeam(
            start,
            nearestDrillable.position.clone().add(new THREE.Vector3(0, 0.55, 0)),
          );
          drillBeam.visible = true;
          drillGlow.intensity = 16 + Math.sin(now * 0.08) * 5;
          nearestDrillable.beacon.intensity = 11;
          if (hasAuthority && nearestDrillable.progress >= 100) {
            nearestDrillable.progress = 100;
            nearestDrillable.state = "cargo";
            nearestDrillable.shell.visible = false;
            nearestDrillable.core.visible = true;
            nearestDrillable.beacon.intensity = 9;
            messageRef.current = `${cargoData[nearestDrillable.kind].name} extracted // ${cargoData[
              nearestDrillable.kind
            ].structure}. It is now a logistics problem.`;
            sound("pickup");
          }
          if (drillWearRef.current >= DRILL_JAM_WEAR) {
            drillJammedRef.current = true;
            repairProgressRef.current = 0;
            drillBeam.visible = false;
            drillGlow.intensity = 0;
            messageRef.current =
              "DRILL JAMMED. TAP R THREE TIMES FOR APPROVED PERCUSSIVE MAINTENANCE.";
            sound("warning");
          } else if (heatRef.current >= 100) {
            heatRef.current = 100;
            overheatedRef.current = true;
            drillBeam.visible = false;
            drillGlow.intensity = 0;
            messageRef.current = "DRILL OVERHEATED. Engineering recommends less drilling.";
            sound("warning");
          }
        } else {
          drillBeam.visible = false;
          drillGlow.intensity = 0;
          heatRef.current = Math.max(0, heatRef.current - dt * 25);
          if (overheatedRef.current && heatRef.current <= 34) {
            overheatedRef.current = false;
            if (!drillJammedRef.current) {
              messageRef.current = "Drill grudgingly operational.";
            }
          }
        }

        const interactPressed = !incapacitated && keys.has("KeyE");
        if (interactPressed && !interactLatchRef.current) {
          if (!hasAuthority) {
            queueCrewAction(
              keys.has("ShiftLeft") || keys.has("ShiftRight") ? "throw" : "interact",
            );
            messageRef.current = "Cargo request sent to mission lead authority.";
          } else if (carryingRef.current !== null) {
            const held = deposits.find((deposit) => deposit.id === carryingRef.current);
            if (held) {
              if (astronaut.position.distanceTo(CARGO_RECEIVER_POSITION) < 3.8) {
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
              } else {
                const throwing = keys.has("ShiftLeft") || keys.has("ShiftRight");
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
              nearbyCargo &&
              nearbyCargo.position.distanceTo(astronaut.position) < 3.2
            ) {
              carryingRef.current = nearbyCargo.id;
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
              scoreRef.current >= CONTRACT_TARGET
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
            aboard && scoreRef.current >= CONTRACT_TARGET ? "success" : "failed";
          messageRef.current = aboard
            ? scoreRef.current >= CONTRACT_TARGET
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
      if (keys.has("KeyF") && !overheatedRef.current && !drillJammedRef.current) {
        networkInputMask |= CREW_INPUT_DRILL;
      }
      if (
        keys.has("KeyW") ||
        keys.has("KeyS") ||
        keys.has("KeyA") ||
        keys.has("KeyD") ||
        keys.has("ArrowUp") ||
        keys.has("ArrowDown")
      ) {
        networkInputMask |= CREW_INPUT_MOVING;
      }
      if (keys.has("Space") && playerHeight > 0.38 && thrusterFuel > 0) {
        networkInputMask |= CREW_INPUT_THRUSTER;
      }
      if (downedRef.current) networkInputMask |= CREW_INPUT_DOWNED;
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

      const finalWindow = phase === "active" && timeRef.current <= 30;
      sun.intensity = THREE.MathUtils.damp(
        sun.intensity,
        finalWindow ? 3.65 + Math.sin(now * 0.012) * 0.28 : 4.6,
        3,
        dt,
      );
      cyanRim.intensity = THREE.MathUtils.damp(
        cyanRim.intensity,
        finalWindow ? 2.35 : 1.25,
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
          MOON_GRAVITY,
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
          dot.position.y -= 0.5 * MOON_GRAVITY * sampleTime * sampleTime;
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
        desiredCamera.x += Math.sin(now * 0.065) * cameraImpact * 0.22;
        desiredCamera.y += Math.cos(now * 0.052) * cameraImpact * 0.15;
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
        const hudOwnerId = session?.memberId ?? "solo";
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
            deposit.id !== carryingRef.current,
        );
        const nearestTracked = trackedSignals
          .sort(
            (a, b) =>
              a.position.distanceTo(astronaut.position) -
              b.position.distanceTo(astronaut.position),
          )[0];
        let nearestSignalDistance: number | null = null;
        let nearestSignalBearing: number | null = null;
        if (nearestTracked) {
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
            receiverDistance < 3.8
              ? `E · SECURE ${cargoData[held.kind].name.toUpperCase()}`
              : currentThrowPrediction
                ? `E DROP · SHIFT+E THROW · ${currentThrowPrediction.risk} @ ${Math.round(
                    currentThrowPrediction.horizontalDistance,
                  )}m · BAY ${Math.round(receiverDistance)}m`
                : `E DROP · SHIFT+E THROW · BAY ${Math.round(receiverDistance)}m`;
        } else if (
          nearbyCargo &&
          nearbyCargo.position.distanceTo(astronaut.position) < 3.2
        ) {
          prompt = `E · PICK UP ${cargoData[
            nearbyCargo.kind
          ].name.toUpperCase()} · ${cargoData[nearbyCargo.kind].structure}`;
        } else if (
          nearbySignal &&
          nearbySignal.position.distanceTo(astronaut.position) < 3
        ) {
          prompt = overheatedRef.current
            ? "DRILL COOLING · PLEASE PRETEND THIS IS NORMAL"
            : `HOLD F · EXTRACT ${cargoData[nearbySignal.kind].name.toUpperCase()} · ${Math.round(nearbySignal.progress)}%`;
        } else if (scoreRef.current >= CONTRACT_TARGET && homeDistance < 7.2) {
          prompt = "E · LAUNCH WITH CONTRACT SECURED";
        } else if (nearbySignal) {
          prompt = `SIGNAL AHEAD · ${Math.round(
            nearbySignal.position.distanceTo(astronaut.position),
          )}m`;
        } else if (playerHeight > 0.4 && thrusterFuel > 0) {
          prompt = `HOLD SPACE · EVA THRUSTER · ${Math.round(thrusterFuel)}%`;
        }
        if (drillJammedRef.current) {
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
        const ventDistance = nearestVent.position.distanceTo(astronaut.position);
        if (ventDistance < 6 && nearestVent.userData.erupting) {
          prompt = "PRESSURE VENT ERUPTING · USE THRUSTER TO CLEAR";
        } else if (ventDistance < 6 && nearestVent.userData.warning) {
          prompt = `VENT PRESSURE RISING · ${Math.round(ventDistance)}m`;
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
            phase: phaseRef.current,
            time: timeRef.current,
            score: scoreRef.current,
            message: messageRef.current,
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
          depositsSecured: deposits.filter((deposit) => deposit.state === "secured").length,
          prompt,
          homeDistance,
          thrusterFuel,
          signalsTracked: trackedSignals.length,
          nearestSignalDistance,
          nearestSignalBearing,
          tetheredCargo: tethered ? cargoData[tethered.kind].name : null,
          tetherDistance,
          tetherTeamLift: (tethered?.tetherOwnerIds.length ?? 0) >= 2,
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
      mount.removeEventListener("click", requestMouseLock);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      pointerTargetRef.current = null;
      resetRuntimeRef.current = null;
      scene.traverse((object) => {
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
  }, [queueCrewAction, requestMouseLock, sound]);

  const resetMission = useCallback(() => {
    const session = crewSessionRef.current;
    if (session?.role === "guest") return;
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
      time: MISSION_SECONDS,
      score: 0,
      heat: 0,
      overheated: false,
      drillWear: 0,
      drillJammed: false,
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
      depositsSecured: 0,
      prompt: "Q · SCAN FOR VALUABLE MATERIAL",
      homeDistance: 7,
      thrusterFuel: 100,
      signalsTracked: 0,
      nearestSignalDistance: null,
      nearestSignalBearing: null,
      tetheredCargo: null,
      tetherDistance: null,
      tetherTeamLift: false,
    });
    requestMouseLock();
    sound("launch");
  }, [requestMouseLock, sound]);

  const percent = Math.min(100, (snapshot.score / CONTRACT_TARGET) * 100);
  const urgent = snapshot.phase === "active" && snapshot.time <= 30;

  return (
    <main className={styles.shell} data-phase={snapshot.phase}>
      <div
        ref={mountRef}
        className={`${styles.canvas} ${mouseCaptured ? styles.mouseLocked : ""}`}
        role="img"
        aria-label="Playable third-person 3D Practice Moon extraction mission"
      />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>MG</span>
          <div>
            <p>MOON GOONS</p>
            <span>S.P.A.C.E. FIELD TEST // BUILD 019 // TEAM HAUL</span>
          </div>
        </div>
        <div className={`${styles.clock} ${urgent ? styles.urgent : ""}`}>
          <span>DEPARTURE WINDOW</span>
          <strong>{formatTime(snapshot.time)}</strong>
        </div>
      </header>

      <FieldNotes open={notesOpen} onOpenChange={handleNotesOpenChange} />
      <ControlSettingsPanel
        open={settingsOpen}
        settings={controlSettings}
        onOpenChange={handleSettingsOpenChange}
        onSettingsChange={updateControlSettings}
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
          <div
            className={`${styles.mouseCapture} ${
              mouseCaptured ? styles.mouseCaptureActive : ""
            }`}
          >
            <span>
              {mouseCaptured
                ? "MOUSE LOCKED TO CENTER"
                : mouseLockIssue === "unsupported"
                  ? "MOUSE LOCK UNAVAILABLE IN THIS PREVIEW"
                  : mouseLockIssue === "blocked"
                    ? "MOUSE LOCK BLOCKED BY THIS BROWSER"
                    : "CLICK VIEW TO LOCK MOUSE"}
            </span>
            <small>
              {mouseCaptured
                ? "ESC TO RELEASE"
                : mouseLockIssue === "unsupported" || mouseLockIssue === "blocked"
                  ? "OPEN THE PUBLIC LINK IN CHROME OR EDGE OUTSIDE CODEX"
                  : "CENTERED MOUSE CAPTURE IS REQUIRED FOR TURNING"}
            </small>
          </div>
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
              <span>ACTIVE CONTRACT</span>
              <b>PM-{String(snapshot.missionSeed).padStart(5, "0")}</b>
            </div>
            <h2>Practice Moon Procurement</h2>
            <p>Secure ¢{CONTRACT_TARGET} in approved scientific material.</p>
            <div className={styles.progressHeader}>
              <span>SHIP MANIFEST</span>
              <strong>
                ¢{snapshot.score} / ¢{CONTRACT_TARGET}
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
                {snapshot.carrying
                  ? `${snapshot.carrying} // ${Math.round(
                      (snapshot.cargoCondition ?? 1) * 100,
                    )}% // ${snapshot.cargoStructure}`
                  : "Hands regrettably empty"}
              </span>
              <span className={snapshot.time <= 55 ? styles.stormActive : ""}>
                {snapshot.time <= 55
                  ? "DEBRIS SHOWER // ACTIVE"
                  : `DEBRIS FORECAST // T-${Math.ceil(snapshot.time - 55)}s`}
              </span>
            </div>
          </aside>

          <aside className={styles.toolPanel}>
            <div className={styles.toolHeading}>
              <span className={styles.toolIcon}>DR</span>
              <div>
                <strong>ISSUE DRILL</strong>
                <small>
                  {snapshot.drillJammed
                    ? "MECHANICAL JAM // R TO REPAIR"
                    : snapshot.overheated
                      ? "THERMAL LOCKOUT"
                      : "QUESTIONABLY OPERATIONAL"}
                </small>
              </div>
            </div>
            <div className={styles.heatLabel}>
              <span>CORE HEAT</span>
              <strong>{Math.round(snapshot.heat)}%</strong>
            </div>
            <div className={styles.heatTrack}>
              <div
                className={snapshot.overheated ? styles.heatDanger : ""}
                style={{ width: `${snapshot.heat}%` }}
              />
            </div>
            <div className={styles.integrityLabel}>
              <span>{snapshot.drillJammed ? "PERCUSSIVE REPAIR" : "DRIVE CONDITION"}</span>
              <strong>
                {snapshot.drillJammed
                  ? `${Math.round(snapshot.repairProgress)}%`
                  : `${Math.round(100 - snapshot.drillWear)}%`}
              </strong>
            </div>
            <div className={styles.integrityTrack}>
              <div
                className={snapshot.drillJammed ? styles.integrityDanger : ""}
                style={{
                  width: `${
                    snapshot.drillJammed
                      ? snapshot.repairProgress
                      : 100 - snapshot.drillWear
                  }%`,
                }}
              />
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
            <div className={styles.fuelLabel}>
              <span>EVA THRUSTER</span>
              <strong>{Math.round(snapshot.thrusterFuel)}%</strong>
            </div>
            <div className={styles.fuelTrack}>
              <div style={{ width: `${snapshot.thrusterFuel}%` }} />
            </div>
          </aside>

          <div className={styles.controls} aria-label="Game controls">
            <div>
              <kbd>W / S</kbd>
              <span>FORWARD / REVERSE</span>
            </div>
            <div>
              <kbd>A / D</kbd>
              <span>STRAFE</span>
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
              <kbd>Q</kbd>
              <span>SCAN</span>
            </div>
            <div>
              <kbd>F</kbd>
              <span>HOLD TO DRILL</span>
            </div>
            <div>
              <kbd>R</kbd>
              <span>REPAIR JAM</span>
            </div>
            <div>
              <kbd>T</kbd>
              <span>TETHER / RELEASE</span>
            </div>
            {crewSession && (
              <>
                <div>
                  <kbd>P</kbd>
                  <span>LOCATION PING</span>
                </div>
                <div>
                  <kbd>1–4</kbd>
                  <span>HELP / CARGO / DANGER / SHIP</span>
                </div>
              </>
            )}
            <div>
              <kbd>E / ⇧E</kbd>
              <span>USE / THROW</span>
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

          {snapshot.score >= CONTRACT_TARGET && (
            <div className={styles.launchButton}>
              RETURN TO THE SHIP + PRESS E TO LAUNCH
            </div>
          )}
        </>
      )}

      {snapshot.phase === "briefing" && (
        <section className={styles.overlay}>
          <div className={styles.briefingCard}>
            <div className={styles.keyArt} aria-hidden="true" />
            <div className={styles.companyLine}>
              <span>S.P.A.C.E.</span>
              SCIENTIFIC PROCUREMENT AND COLLECTION ENTERPRISE
            </div>
            <p className={styles.kicker}>COOPERATION SYSTEMS 7A // TEAM HAUL FIELD TEST</p>
            <h1>
              SUIT UP.
              <br />
              <em>TRY NOT TO FLOAT.</em>
            </h1>
            <p className={styles.lede}>
              Run the Practice Moon solo, or open a room for up to four scientists.
              Crew movement, cargo, and mission results share one contract. Fire a tether
              with T to tow loose samples; two scientists can team-lift dense cargo without
              relying on voice chat.
            </p>
            <div className={styles.briefGrid}>
              <div>
                <span>01</span>
                <strong>SCAN</strong>
                <p>Pulse nearby terrain with Q. Cyan rings reveal buried material.</p>
              </div>
              <div>
                <span>02</span>
                <strong>EXTRACT</strong>
                <p>Hold F beside a signal. If the drill jams, tap R three times.</p>
              </div>
              <div>
                <span>03</span>
                <strong>TEAM HAUL</strong>
                <p>Press T near cargo. A second tether lifts it and makes heavy cores easier to tow.</p>
              </div>
            </div>
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
            <small>Keyboard + mouse recommended · Escape releases the camera</small>
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
            </div>
            {crewSession?.role === "guest" ? (
              <p className={styles.crewWaiting}>
                WAITING FOR MISSION LEAD TO FILE MINIMAL PAPERWORK…
              </p>
            ) : (
              <button type="button" onClick={resetMission}>
                FILE MINIMAL PAPERWORK + RETRY
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
