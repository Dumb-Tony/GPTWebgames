"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import styles from "./game.module.css";

const CONTRACT_TARGET = 900;
const MISSION_SECONDS = 180;
const MOON_RADIUS = 48;
const INITIAL_MESSAGE = "Awaiting a legally sufficient level of consent.";
const SHIP_POSITION = new THREE.Vector3(-19, 0, 5);

type Phase = "briefing" | "active" | "success" | "failed";
type CargoKind = "ferric" | "glass" | "platinum";
type DepositState = "hidden" | "revealed" | "extracting" | "cargo" | "secured";

type CargoDefinition = {
  name: string;
  value: number;
  speed: number;
  color: number;
  emissive: number;
};

type DepositRuntime = {
  id: number;
  kind: CargoKind;
  position: THREE.Vector3;
  state: DepositState;
  progress: number;
  condition: number;
  group: THREE.Group;
  shell: THREE.Object3D;
  core: THREE.Object3D;
  beacon: THREE.PointLight;
};

type Snapshot = {
  phase: Phase;
  time: number;
  score: number;
  heat: number;
  overheated: boolean;
  carrying: string | null;
  message: string;
  scanCooldown: number;
  depositsSecured: number;
};

const cargoData: Record<CargoKind, CargoDefinition> = {
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

const depositDefinitions: Array<{
  id: number;
  kind: CargoKind;
  position: [number, number];
}> = [
  { id: 1, kind: "ferric", position: [-2, -12] },
  { id: 2, kind: "glass", position: [8, 11] },
  { id: 3, kind: "platinum", position: [24, -8] },
  { id: 4, kind: "glass", position: [31, 18] },
  { id: 5, kind: "ferric", position: [35, -23] },
];

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

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function seededRandom(seed: number) {
  let current = seed;
  return () => {
    current = (current * 16807) % 2147483647;
    return current / 2147483647;
  };
}

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
  ship.rotation.y = 0.16;

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

  return ship;
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

function createAstronaut() {
  const astronaut = new THREE.Group();
  astronaut.position.set(-12, 0, 5);

  const backpack = box([1.35, 2.35, 0.8], 0xd5d0b7, [0, 2.95, 0.72], {
    metalness: 0.15,
  });
  astronaut.add(backpack);

  const torso = cylinder(0.9, 1.05, 2.5, palette.yellow, [0, 3.05, 0], 10);
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
  leftArm.add(cylinder(0.3, 0.36, 1.65, palette.yellow, [0, -0.65, 0], 8));
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
  leftLeg.add(cylinder(0.42, 0.48, 1.7, palette.yellow, [0, -0.72, 0], 8));
  leftLeg.add(box([0.85, 0.56, 1.15], palette.graphite, [0, -1.65, -0.17]));
  astronaut.add(leftLeg);

  const rightLeg = leftLeg.clone(true);
  rightLeg.position.x = 0.58;
  astronaut.add(rightLeg);

  const drill = new THREE.Group();
  drill.position.set(1.22, 2.7, -0.8);
  drill.rotation.x = Math.PI / 2;
  drill.add(cylinder(0.36, 0.44, 1.6, palette.yellow, [0, 0, 0], 10));
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

  astronaut.userData.leftArm = leftArm;
  astronaut.userData.rightArm = rightArm;
  astronaut.userData.leftLeg = leftLeg;
  astronaut.userData.rightLeg = rightLeg;
  astronaut.userData.drill = drill;
  astronaut.userData.visor = visor;
  return astronaut;
}

function createDeposit(
  definition: (typeof depositDefinitions)[number],
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

  const coreGeometry =
    definition.kind === "glass"
      ? new THREE.OctahedronGeometry(1.15, 0)
      : new THREE.DodecahedronGeometry(definition.kind === "platinum" ? 1.42 : 1.05, 0);
  const core = new THREE.Mesh(
    coreGeometry,
    standardMaterial(data.color, {
      emissive: data.emissive,
      emissiveIntensity: definition.kind === "glass" ? 1.7 : 0.85,
      metalness: definition.kind === "platinum" ? 0.78 : 0.2,
      roughness: definition.kind === "platinum" ? 0.26 : 0.48,
    }),
  );
  core.visible = false;
  core.castShadow = true;
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
    group,
    shell,
    core,
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

  scene.add(createShip());
  scene.add(createRover());

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
}

export function MoonGoonsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef(new Set<string>());
  const phaseRef = useRef<Phase>("briefing");
  const timeRef = useRef(MISSION_SECONDS);
  const scoreRef = useRef(0);
  const heatRef = useRef(0);
  const overheatedRef = useRef(false);
  const scanCooldownRef = useRef(0);
  const messageRef = useRef(INITIAL_MESSAGE);
  const carryingRef = useRef<number | null>(null);
  const interactLatchRef = useRef(false);
  const scanLatchRef = useRef(false);
  const resetRuntimeRef = useRef<(() => void) | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    phase: "briefing",
    time: MISSION_SECONDS,
    score: 0,
    heat: 0,
    overheated: false,
    carrying: null,
    message: INITIAL_MESSAGE,
    scanCooldown: 0,
    depositsSecured: 0,
  });

  const sound = useCallback(
    (tone: "scan" | "pickup" | "secure" | "warning" | "launch" | "step") => {
      try {
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
          step: [92, 72, 0.055],
        }[tone];
        oscillator.type = tone === "warning" ? "square" : tone === "step" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(settings[0], now);
        oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
        gain.gain.setValueAtTime(tone === "step" ? 0.018 : 0.05, now);
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

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

    createWorld(scene);
    const astronaut = createAstronaut();
    scene.add(astronaut);

    let deposits = depositDefinitions.map((definition) => createDeposit(definition));
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

    const carriedAnchor = new THREE.Object3D();
    carriedAnchor.position.set(0, 2.05, -2.05);
    astronaut.add(carriedAnchor);

    const velocity = new THREE.Vector3();
    let verticalVelocity = 0;
    let playerHeight = 0;
    let scanAnimation = 0;
    let hudTimer = 0;
    let warningPlayed = false;
    let stepTimer = 0;
    let animationFrame = 0;
    let previous = performance.now();

    const resetDeposits = () => {
      deposits.forEach((deposit) => deposit.group.removeFromParent());
      deposits = depositDefinitions.map((definition) => createDeposit(definition));
      deposits.forEach((deposit) => scene.add(deposit.group));
    };

    resetRuntimeRef.current = () => {
      astronaut.position.set(-12, 0, 5);
      astronaut.rotation.set(0, 0, 0);
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      playerHeight = 0;
      carryingRef.current = null;
      timeRef.current = MISSION_SECONDS;
      scoreRef.current = 0;
      heatRef.current = 0;
      overheatedRef.current = false;
      scanCooldownRef.current = 0;
      warningPlayed = false;
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
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      keysRef.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.code);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);

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

    const animate = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      hudTimer += dt;
      const keys = keysRef.current;
      const phase = phaseRef.current;

      if (phase === "active") {
        timeRef.current = Math.max(0, timeRef.current - dt);
        scanCooldownRef.current = Math.max(0, scanCooldownRef.current - dt);

        if (timeRef.current <= 30 && !warningPlayed) {
          warningPlayed = true;
          messageRef.current = "FINAL DEPARTURE. The ship has stopped accepting excuses.";
          sound("warning");
        }

        const carried = deposits.find((deposit) => deposit.id === carryingRef.current);
        const speedFactor = carried ? cargoData[carried.kind].speed : 1;
        const driveInput =
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        const turnInput =
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) -
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
        const moving = driveInput !== 0;

        if (turnInput !== 0) {
          const turnSpeed = (carried ? 2.05 : 2.65) * (moving ? 1 : 0.78);
          astronaut.rotation.y += turnInput * turnSpeed * dt;
        }

        if (moving) {
          const forwardDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(
            astronaut.quaternion,
          );
          const reverseMultiplier = driveInput < 0 ? 0.62 : 1;
          const targetSpeed = 9.2 * speedFactor * reverseMultiplier * driveInput;
          velocity.x = THREE.MathUtils.damp(
            velocity.x,
            forwardDirection.x * targetSpeed,
            8,
            dt,
          );
          velocity.z = THREE.MathUtils.damp(
            velocity.z,
            forwardDirection.z * targetSpeed,
            8,
            dt,
          );
        } else {
          velocity.x = THREE.MathUtils.damp(velocity.x, 0, 7, dt);
          velocity.z = THREE.MathUtils.damp(velocity.z, 0, 7, dt);
        }

        if (keys.has("Space") && playerHeight <= 0.01) {
          verticalVelocity = carried?.kind === "platinum" ? 4.6 : 6.8;
          playerHeight = 0.02;
        }
        if (playerHeight > 0 || verticalVelocity > 0) {
          verticalVelocity -= 8.4 * dt;
          playerHeight += verticalVelocity * dt;
          if (playerHeight <= 0) {
            playerHeight = 0;
            verticalVelocity = 0;
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

        const gait = now * 0.009;
        const gaitAmount = moving && playerHeight < 0.05 ? 0.58 : 0.08;
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
          turnInput * 0.055,
          8,
          dt,
        );
        if (moving && playerHeight < 0.05) {
          stepTimer -= dt;
          if (stepTimer <= 0) {
            stepTimer = 0.48 / Math.max(speedFactor, 0.6);
            sound("step");
          }
        }

        const scanPressed = keys.has("KeyQ");
        if (scanPressed && !scanLatchRef.current && scanCooldownRef.current <= 0) {
          scanCooldownRef.current = 4;
          scanAnimation = 0.01;
          scanRing.visible = true;
          scanRing.position.set(astronaut.position.x, 0.18, astronaut.position.z);
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
          deposit.group.rotation.y += dt * (deposit.state === "cargo" ? 0.58 : 0.16);
          const ring = deposit.group.children[2] as THREE.Mesh;
          ring.scale.setScalar(1 + Math.sin(now * 0.003 + index) * 0.08);
          if (deposit.state === "cargo" && carryingRef.current !== deposit.id) {
            deposit.group.position.y = 0.65 + Math.sin(now * 0.0025 + index) * 0.12;
          }
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
          keys.has("KeyF") &&
          nearestDrillable &&
          nearestDrillable.position.distanceTo(astronaut.position) < 3 &&
          carryingRef.current === null &&
          playerHeight < 0.15 &&
          !overheatedRef.current;

        const drill = astronaut.userData.drill as THREE.Group;
        if (drilling && nearestDrillable) {
          nearestDrillable.state = "extracting";
          nearestDrillable.progress += dt * (heatRef.current > 72 ? 15 : 23);
          heatRef.current += dt * 33;
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
          if (nearestDrillable.progress >= 100) {
            nearestDrillable.progress = 100;
            nearestDrillable.state = "cargo";
            nearestDrillable.shell.visible = false;
            nearestDrillable.core.visible = true;
            nearestDrillable.beacon.intensity = 9;
            messageRef.current = `${cargoData[nearestDrillable.kind].name} extracted. It is now a logistics problem.`;
            sound("pickup");
          }
          if (heatRef.current >= 100) {
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
            messageRef.current = "Drill grudgingly operational.";
          }
        }

        const interactPressed = keys.has("KeyE");
        if (interactPressed && !interactLatchRef.current) {
          if (carryingRef.current !== null) {
            const held = deposits.find((deposit) => deposit.id === carryingRef.current);
            if (held) {
              if (astronaut.position.distanceTo(SHIP_POSITION) < 7.2) {
                held.state = "secured";
                held.group.visible = false;
                const earned = Math.round(cargoData[held.kind].value * held.condition);
                scoreRef.current += earned;
                carryingRef.current = null;
                scene.attach(held.group);
                messageRef.current = `${cargoData[held.kind].name} secured for ¢${earned}. S.P.A.C.E. owns it now.`;
                sound("secure");
              } else {
                scene.attach(held.group);
                const dropDirection = new THREE.Vector3(0, 0, -2.3).applyQuaternion(
                  astronaut.quaternion,
                );
                held.group.position.copy(astronaut.position).add(dropDirection);
                held.group.position.y = 0.62;
                carryingRef.current = null;
                messageRef.current = `${cargoData[held.kind].name} placed gently-ish.`;
              }
            }
          } else {
            const nearbyCargo = deposits
              .filter((deposit) => deposit.state === "cargo")
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
              carriedAnchor.add(nearbyCargo.group);
              nearbyCargo.group.position.set(0, 0, 0);
              nearbyCargo.group.scale.setScalar(nearbyCargo.kind === "platinum" ? 0.9 : 0.72);
              messageRef.current = `${cargoData[nearbyCargo.kind].name} acquired. Momentum is now a group project.`;
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

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(astronaut.quaternion);
      const desiredCamera = astronaut.position
        .clone()
        .addScaledVector(forward, -10.5)
        .add(new THREE.Vector3(0, 8.3 + playerHeight * 0.2, 0));
      camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 4.5));
      const lookAt = astronaut.position
        .clone()
        .add(new THREE.Vector3(0, 3.1, 0))
        .addScaledVector(forward, 2.6);
      camera.lookAt(lookAt);

      const visor = astronaut.userData.visor as THREE.Mesh;
      const visorMaterial = visor.material as THREE.MeshPhysicalMaterial;
      visorMaterial.emissiveIntensity = 0.72 + Math.sin(now * 0.002) * 0.08;

      if (hudTimer >= 0.09) {
        hudTimer = 0;
        const held = deposits.find((deposit) => deposit.id === carryingRef.current);
        setSnapshot({
          phase: phaseRef.current,
          time: timeRef.current,
          score: scoreRef.current,
          heat: heatRef.current,
          overheated: overheatedRef.current,
          carrying: held ? cargoData[held.kind].name : null,
          message: messageRef.current,
          scanCooldown: scanCooldownRef.current,
          depositsSecured: deposits.filter((deposit) => deposit.state === "secured").length,
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
      resetRuntimeRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
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
  }, [sound]);

  const resetMission = useCallback(() => {
    resetRuntimeRef.current?.();
    phaseRef.current = "active";
    messageRef.current =
      "Mission live. Find something expensive and remain technically alive.";
    setSnapshot({
      phase: "active",
      time: MISSION_SECONDS,
      score: 0,
      heat: 0,
      overheated: false,
      carrying: null,
      message: messageRef.current,
      scanCooldown: 0,
      depositsSecured: 0,
    });
    sound("launch");
  }, [sound]);

  const percent = Math.min(100, (snapshot.score / CONTRACT_TARGET) * 100);
  const urgent = snapshot.phase === "active" && snapshot.time <= 30;

  return (
    <main className={styles.shell}>
      <div
        ref={mountRef}
        className={styles.canvas}
        role="img"
        aria-label="Playable third-person 3D Practice Moon extraction mission"
      />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>MG</span>
          <div>
            <p>MOON GOONS</p>
            <span>S.P.A.C.E. FIELD TEST // BUILD 003 // 3D SLICE</span>
          </div>
        </div>
        <div className={`${styles.clock} ${urgent ? styles.urgent : ""}`}>
          <span>DEPARTURE WINDOW</span>
          <strong>{formatTime(snapshot.time)}</strong>
        </div>
      </header>

      {snapshot.phase === "active" && (
        <>
          <aside className={styles.missionPanel}>
            <div className={styles.panelCode}>
              <span>ACTIVE CONTRACT</span>
              <b>SP-03</b>
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
              <span>{snapshot.depositsSecured} samples secured</span>
              <span>{snapshot.carrying ?? "Hands regrettably empty"}</span>
            </div>
          </aside>

          <aside className={styles.toolPanel}>
            <div className={styles.toolHeading}>
              <span className={styles.toolIcon}>DR</span>
              <div>
                <strong>ISSUE DRILL</strong>
                <small>
                  {snapshot.overheated ? "THERMAL LOCKOUT" : "QUESTIONABLY OPERATIONAL"}
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
            <div className={styles.scanStatus}>
              <span>SCANNER Q</span>
              <strong>
                {snapshot.scanCooldown <= 0
                  ? "READY"
                  : `CHARGING ${snapshot.scanCooldown.toFixed(1)}s`}
              </strong>
            </div>
          </aside>

          <div className={styles.controls} aria-label="Game controls">
            <div>
              <kbd>W / S</kbd>
              <span>FORWARD / REVERSE</span>
            </div>
            <div>
              <kbd>A / D</kbd>
              <span>TURN</span>
            </div>
            <div>
              <kbd>SPACE</kbd>
              <span>MOON HOP</span>
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
              <kbd>E</kbd>
              <span>GRAB / DEPOSIT</span>
            </div>
          </div>

          <div className={styles.radio}>
            <span>FIELD COMMS</span>
            <p>{snapshot.message}</p>
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
            <p className={styles.kicker}>3D AESTHETIC VERTICAL SLICE // PRACTICE MOON</p>
            <h1>
              SUIT UP.
              <br />
              <em>TRY NOT TO FLOAT.</em>
            </h1>
            <p className={styles.lede}>
              Explore a fully 3D Practice Moon, find buried material, manage your drill,
              and haul ¢{CONTRACT_TARGET} back to the warm yellow lights of the ship.
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
                <p>Hold F beside a signal. The modeled drill will object thermally.</p>
              </div>
              <div>
                <span>03</span>
                <strong>ESCAPE</strong>
                <p>Grab cargo with E and follow the ship’s warm landing lights home.</p>
              </div>
            </div>
            <button type="button" onClick={resetMission}>
              ACCEPT LIABILITY + ENTER 3D
            </button>
            <small>Keyboard recommended · Sound begins after deployment</small>
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
                <span>DRILL HEAT</span>
                <strong>{Math.round(snapshot.heat)}%</strong>
              </div>
              <div>
                <span>SAFETY RATING</span>
                <strong>{snapshot.phase === "success" ? "C−" : "PENDING"}</strong>
              </div>
            </div>
            <button type="button" onClick={resetMission}>
              FILE MINIMAL PAPERWORK + RETRY
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
