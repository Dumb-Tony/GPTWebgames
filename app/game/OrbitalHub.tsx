"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  headingVectorsFromYaw,
  primaryGamepad,
  readStandardGamepad,
} from "./gamepad";
import {
  formatKeyboardCode,
  renderPixelRatioCap,
  type ControlSettings,
  type KeyboardBindings,
} from "./gameRules";
import styles from "./game.module.css";

export type HubStationId = "contracts" | "equipment" | "crew" | "maintenance";

type HubStation = {
  id: HubStationId;
  name: string;
  code: string;
  action: string;
  color: number;
  position: THREE.Vector3;
  rotation: number;
};

const HUB_STATIONS: HubStation[] = [
  {
    id: "contracts",
    name: "Contract Control",
    code: "OPS-01",
    action: "SELECT CONTRACT + LAUNCH",
    color: 0xffd85a,
    position: new THREE.Vector3(-4.8, 0, -5.2),
    rotation: 0,
  },
  {
    id: "equipment",
    name: "Equipment Cage",
    code: "EQP-02",
    action: "BUY + INSTALL MODULES",
    color: 0x8ee07d,
    position: new THREE.Vector3(0, 0, -5.5),
    rotation: 0,
  },
  {
    id: "crew",
    name: "Crew Link Uplink",
    code: "COM-03",
    action: "CREATE + JOIN CREW",
    color: 0x6ee7e4,
    position: new THREE.Vector3(4.8, 0, -5.2),
    rotation: 0,
  },
  {
    id: "maintenance",
    name: "Maintenance Bench",
    code: "FIX-04",
    action: "REVIEW REPAIR INVOICE",
    color: 0xff865e,
    position: new THREE.Vector3(7.1, 0, 2.4),
    rotation: -Math.PI / 2,
  },
];

function material(
  color: number,
  options: THREE.MeshStandardMaterialParameters = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.28,
    ...options,
  });
}

function createHubGoon() {
  const goon = new THREE.Group();
  const suit = material(0xe6dfbd, { roughness: 0.62 });
  const trim = material(0xffd85a, { roughness: 0.48, metalness: 0.38 });
  const dark = material(0x171c2b, { roughness: 0.5, metalness: 0.42 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.9, 6, 12), suit);
  torso.position.y = 1.55;
  torso.castShadow = true;
  goon.add(torso);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.42), dark);
  pack.position.set(0, 1.65, 0.48);
  pack.castShadow = true;
  goon.add(pack);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 18, 14),
    material(0xe9e4ca, { roughness: 0.48 }),
  );
  helmet.position.y = 2.55;
  helmet.castShadow = true;
  goon.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 18, 12, 0, Math.PI * 2, 0.15, 1.22),
    new THREE.MeshPhysicalMaterial({
      color: 0x132b40,
      emissive: 0x0d8795,
      emissiveIntensity: 0.55,
      metalness: 0.28,
      roughness: 0.16,
      clearcoat: 1,
    }),
  );
  visor.position.set(0, 2.56, -0.2);
  visor.rotation.x = -0.06;
  goon.add(visor);

  const makeLimb = (x: number, arm: boolean) => {
    const limb = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(arm ? 0.13 : 0.16, arm ? 0.68 : 0.76, 5, 8),
      suit,
    );
    mesh.position.y = arm ? -0.28 : -0.42;
    mesh.castShadow = true;
    limb.add(mesh);
    limb.position.set(x, arm ? 1.95 : 0.95, 0);
    if (arm) limb.rotation.z = x < 0 ? -0.11 : 0.11;
    goon.add(limb);
    return limb;
  };

  const leftArm = makeLimb(-0.66, true);
  const rightArm = makeLimb(0.66, true);
  const leftLeg = makeLimb(-0.27, false);
  const rightLeg = makeLimb(0.27, false);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.075, 8, 18), trim);
  belt.position.y = 1.24;
  belt.rotation.x = Math.PI / 2;
  goon.add(belt);

  goon.userData.leftArm = leftArm;
  goon.userData.rightArm = rightArm;
  goon.userData.leftLeg = leftLeg;
  goon.userData.rightLeg = rightLeg;
  goon.userData.visor = visor;
  return goon;
}

function createStation(station: HubStation) {
  const group = new THREE.Group();
  group.position.copy(station.position);
  group.rotation.y = station.rotation;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.28, 1.3),
    material(0x252c3d, { metalness: 0.58 }),
  );
  base.position.y = 0.14;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 1.45, 0.72),
    material(0x31394c, { metalness: 0.46 }),
  );
  pedestal.position.set(0, 0.95, -0.08);
  pedestal.rotation.x = -0.11;
  pedestal.castShadow = true;
  group.add(pedestal);

  const screenMaterial = new THREE.MeshBasicMaterial({
    color: station.color,
    transparent: true,
    opacity: 0.7,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.82), screenMaterial);
  screen.position.set(0, 1.23, -0.46);
  screen.rotation.x = -0.11;
  group.add(screen);

  const scanLines = new THREE.Group();
  for (let index = 0; index < 4; index += 1) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18 - index * 0.12, 0.035),
      new THREE.MeshBasicMaterial({ color: 0x071017, transparent: true, opacity: 0.7 }),
    );
    line.position.set(-0.08, 1.46 - index * 0.17, -0.468);
    line.rotation.x = -0.11;
    scanLines.add(line);
  }
  group.add(scanLines);

  const lamp = new THREE.PointLight(station.color, 2.8, 5.5, 2);
  lamp.position.set(0, 1.5, -0.55);
  group.add(lamp);

  group.userData.screen = screen;
  group.userData.screenMaterial = screenMaterial;
  group.userData.lamp = lamp;
  return group;
}

export function OrbitalHub({
  credits,
  research,
  lastRepairBill,
  renderQuality,
  keyboardBindings,
  interactive,
  onOpenStation,
}: {
  credits: number;
  research: number;
  lastRepairBill: number;
  renderQuality: ControlSettings["renderQuality"];
  keyboardBindings: KeyboardBindings;
  interactive: boolean;
  onOpenStation: (station: HubStationId) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef(interactive);
  const openStationRef = useRef(onOpenStation);
  const qualityRef = useRef(renderQuality);
  const keyboardBindingsRef = useRef(keyboardBindings);
  const [mouseCaptured, setMouseCaptured] = useState(false);
  const [controllerConnected, setControllerConnected] = useState(false);
  const [nearestStation, setNearestStation] = useState<HubStation | null>(null);

  useEffect(() => {
    interactiveRef.current = interactive;
    if (!interactive && document.pointerLockElement) document.exitPointerLock();
  }, [interactive]);

  useEffect(() => {
    openStationRef.current = onOpenStation;
  }, [onOpenStation]);

  useEffect(() => {
    qualityRef.current = renderQuality;
    window.dispatchEvent(new Event("resize"));
  }, [renderQuality]);

  useEffect(() => {
    keyboardBindingsRef.current = keyboardBindings;
  }, [keyboardBindings]);

  const openFallback = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    onOpenStation("contracts");
  }, [onOpenStation]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050816);
    scene.fog = new THREE.Fog(0x080d1c, 18, 42);

    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, renderPixelRatioCap(qualityRef.current)),
    );
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "Walkable orbital operations deck");
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x9fdfe7, 0x0a0d18, 1.45));
    const key = new THREE.DirectionalLight(0xfff1cf, 2.4);
    key.position.set(-8, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(19, 0.45, 15),
      material(0x20283a, { metalness: 0.5, roughness: 0.68 }),
    );
    floor.position.y = -0.24;
    floor.receiveShadow = true;
    scene.add(floor);

    const floorGrid = new THREE.GridHelper(18, 18, 0x506075, 0x343d50);
    floorGrid.position.y = 0.005;
    floorGrid.scale.z = 0.78;
    scene.add(floorGrid);

    const yellowLane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 12.5),
      new THREE.MeshBasicMaterial({ color: 0xffd85a, transparent: true, opacity: 0.075 }),
    );
    yellowLane.rotation.x = -Math.PI / 2;
    yellowLane.position.set(0, 0.012, 0.3);
    scene.add(yellowLane);

    const wallMaterial = material(0x182033, { metalness: 0.46, roughness: 0.64 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(19, 7, 0.6), wallMaterial);
    backWall.position.set(0, 3.4, -7.35);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 15), wallMaterial);
    leftWall.position.set(-9.35, 3.4, 0);
    scene.add(leftWall);
    const rightWall = leftWall.clone();
    rightWall.position.x = 9.35;
    scene.add(rightWall);

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(19, 0.35, 15),
      material(0x101626, { metalness: 0.56 }),
    );
    ceiling.position.y = 6.85;
    scene.add(ceiling);

    for (let z = -5; z <= 5; z += 2.5) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(12.5, 0.045, 0.1),
        new THREE.MeshBasicMaterial({ color: z === 0 ? 0xffd85a : 0x6ee7e4 }),
      );
      strip.position.set(0, 6.64, z);
      scene.add(strip);
      const light = new THREE.PointLight(z === 0 ? 0xffd85a : 0x6ee7e4, 0.65, 8);
      light.position.set(0, 6.2, z);
      scene.add(light);
    }

    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 3.9, 0.42),
      material(0x30394d, { metalness: 0.72 }),
    );
    windowFrame.position.set(0, 3.7, 7.25);
    scene.add(windowFrame);
    const windowGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(7.45, 3.05),
      new THREE.MeshPhysicalMaterial({
        color: 0x071020,
        emissive: 0x06152b,
        emissiveIntensity: 0.45,
        roughness: 0.08,
        metalness: 0.15,
        transparent: true,
        opacity: 0.82,
      }),
    );
    windowGlass.position.set(0, 3.7, 7.02);
    windowGlass.rotation.y = Math.PI;
    scene.add(windowGlass);

    const starsGeometry = new THREE.BufferGeometry();
    const stars = new Float32Array(420 * 3);
    for (let index = 0; index < 420; index += 1) {
      stars[index * 3] = (Math.random() - 0.5) * 70;
      stars[index * 3 + 1] = Math.random() * 35 - 4;
      stars[index * 3 + 2] = 18 + Math.random() * 30;
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    const starfield = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({ color: 0xcff8ff, size: 0.085, sizeAttenuation: true }),
    );
    scene.add(starfield);

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(2.9, 28, 20),
      material(0x2e6c91, {
        emissive: 0x0a2946,
        emissiveIntensity: 0.72,
        roughness: 0.88,
      }),
    );
    earth.position.set(8.5, 8.6, 28);
    scene.add(earth);

    const stationGroups = new Map<HubStationId, THREE.Group>();
    HUB_STATIONS.forEach((station) => {
      const stationGroup = createStation(station);
      stationGroups.set(station.id, stationGroup);
      scene.add(stationGroup);
    });

    const airlock = new THREE.Group();
    airlock.position.set(-7.25, 0, 6.86);
    const airlockDoor = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 5.1, 0.38),
      material(0x2a3449, { metalness: 0.65 }),
    );
    airlockDoor.position.y = 2.55;
    airlock.add(airlockDoor);
    const airlockRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.13, 8, 24),
      material(0xff865e, { emissive: 0x4c160b, emissiveIntensity: 0.5 }),
    );
    airlockRing.position.set(0, 2.55, -0.24);
    airlockRing.scale.y = 1.4;
    airlock.add(airlockRing);
    scene.add(airlock);

    for (let index = 0; index < 5; index += 1) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.72 + (index % 2) * 0.18, 0.9),
        material(index % 2 === 0 ? 0x354057 : 0x4a3c30, { metalness: 0.4 }),
      );
      crate.position.set(-7.5 + (index % 2) * 1.25, crate.geometry.parameters.height / 2, -3 + Math.floor(index / 2) * 1.1);
      crate.rotation.y = (index % 3) * 0.12;
      crate.castShadow = true;
      scene.add(crate);
    }

    const goon = createHubGoon();
    goon.position.set(0, 0, 3.9);
    scene.add(goon);

    let yaw = 0;
    const velocity = new THREE.Vector3();
    let nearest: HubStation | null = null;
    let nearestUiId: HubStationId | null = null;
    let padInteractLatch = false;
    let padStatusTimer = 0;
    let lastPadConnected = false;
    let previous = performance.now();
    let animationFrame = 0;
    const keys = new Set<string>();

    const requestLock = () => {
      if (!interactiveRef.current) return;
      renderer.domElement.focus({ preventScroll: true });
      void renderer.domElement.requestPointerLock?.();
    };

    const onPointerLockChange = () => {
      setMouseCaptured(document.pointerLockElement === renderer.domElement);
    };

    const onMouseMove = (event: MouseEvent) => {
      if (
        document.pointerLockElement !== renderer.domElement ||
        !interactiveRef.current
      ) {
        return;
      }
      yaw -= event.movementX * 0.0025;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!interactiveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button")) return;
      if (Object.values(keyboardBindingsRef.current).includes(event.code)) {
        event.preventDefault();
      }
      keys.add(event.code);
      if (
        event.code === keyboardBindingsRef.current.interact &&
        !event.repeat &&
        nearest
      ) {
        event.preventDefault();
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        openStationRef.current(nearest.id);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, renderPixelRatioCap(qualityRef.current)),
      );
      camera.aspect = Math.max(0.1, width / Math.max(1, height));
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener("click", requestLock);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    onResize();

    const animate = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      const pad = readStandardGamepad(
        typeof navigator.getGamepads === "function"
          ? primaryGamepad(navigator.getGamepads())
          : null,
      );
      padStatusTimer -= dt;
      if (padStatusTimer <= 0) {
        padStatusTimer = 0.5;
        if (pad.connected !== lastPadConnected) {
          lastPadConnected = pad.connected;
          setControllerConnected(pad.connected);
        }
      }
      const activeBindings = keyboardBindingsRef.current;
      const keyboardForward =
        (keys.has(activeBindings.forward) || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has(activeBindings.backward) || keys.has("ArrowDown") ? 1 : 0);
      const keyboardStrafe =
        (keys.has(activeBindings.strafeRight) ? 1 : 0) -
        (keys.has(activeBindings.strafeLeft) ? 1 : 0);
      const forwardInput = keyboardForward || -pad.moveY;
      const strafeInput = keyboardStrafe || pad.moveX;
      const fallbackTurn =
        document.pointerLockElement === renderer.domElement
          ? 0
          : (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
      if (interactiveRef.current) yaw += fallbackTurn * dt * 2.1;
      if (interactiveRef.current && pad.connected) yaw -= pad.lookX * dt * 2.8;

      if (pad.interact && !padInteractLatch && interactiveRef.current && nearest) {
        openStationRef.current(nearest.id);
      }
      padInteractLatch = pad.interact;

      const moving = interactiveRef.current && (forwardInput !== 0 || strafeInput !== 0);
      if (moving) {
        const heading = headingVectorsFromYaw(yaw);
        const forward = new THREE.Vector3(heading.forwardX, 0, heading.forwardZ);
        const right = new THREE.Vector3(heading.rightX, 0, heading.rightZ);
        const direction = forward
          .multiplyScalar(forwardInput)
          .addScaledVector(right, strafeInput)
          .normalize();
        const targetSpeed = forwardInput < 0 ? 3.2 : 4.6;
        velocity.x = THREE.MathUtils.damp(velocity.x, direction.x * targetSpeed, 9, dt);
        velocity.z = THREE.MathUtils.damp(velocity.z, direction.z * targetSpeed, 9, dt);
      } else {
        velocity.x = THREE.MathUtils.damp(velocity.x, 0, 10, dt);
        velocity.z = THREE.MathUtils.damp(velocity.z, 0, 10, dt);
      }

      goon.position.x = THREE.MathUtils.clamp(goon.position.x + velocity.x * dt, -8.25, 8.25);
      goon.position.z = THREE.MathUtils.clamp(goon.position.z + velocity.z * dt, -5.5, 6.35);
      HUB_STATIONS.forEach((station) => {
        const separation = goon.position.clone().sub(station.position).setY(0);
        const stationRadius = station.id === "maintenance" ? 1.45 : 1.62;
        if (separation.lengthSq() > 0.001 && separation.length() < stationRadius) {
          goon.position.copy(
            station.position.clone().add(separation.normalize().multiplyScalar(stationRadius)),
          );
          goon.position.y = 0;
        }
      });
      goon.rotation.y = yaw;

      const gait = now * 0.009;
      const gaitAmount = moving ? 0.58 : 0.04;
      (goon.userData.leftLeg as THREE.Group).rotation.x = Math.sin(gait) * gaitAmount;
      (goon.userData.rightLeg as THREE.Group).rotation.x = -Math.sin(gait) * gaitAmount;
      (goon.userData.leftArm as THREE.Group).rotation.x = -Math.sin(gait) * gaitAmount * 0.7;
      (goon.userData.rightArm as THREE.Group).rotation.x = Math.sin(gait) * gaitAmount * 0.7;
      (goon.userData.visor as THREE.Mesh).rotation.y = Math.sin(now * 0.0018) * 0.035;

      nearest = [...HUB_STATIONS]
        .sort(
          (a, b) =>
            a.position.distanceToSquared(goon.position) -
            b.position.distanceToSquared(goon.position),
        )
        .find((station) => station.position.distanceTo(goon.position) <= 3.35) ?? null;
      if ((nearest?.id ?? null) !== nearestUiId) {
        nearestUiId = nearest?.id ?? null;
        setNearestStation(nearest);
      }

      stationGroups.forEach((group, id) => {
        const active = nearest?.id === id;
        const screen = group.userData.screen as THREE.Mesh;
        const screenMaterial = group.userData.screenMaterial as THREE.MeshBasicMaterial;
        const lamp = group.userData.lamp as THREE.PointLight;
        const pulse = 0.7 + Math.sin(now * 0.005 + group.position.x) * 0.14;
        screen.scale.setScalar(active ? 1.04 + Math.sin(now * 0.01) * 0.015 : 1);
        screenMaterial.opacity = active ? 0.96 : pulse;
        lamp.intensity = active ? 6 : 2.4 + pulse;
      });

      earth.rotation.y += dt * 0.045;
      starfield.rotation.y -= dt * 0.003;
      airlockRing.rotation.z += dt * 0.08;

      const heading = headingVectorsFromYaw(yaw);
      const forward = new THREE.Vector3(heading.forwardX, 0, heading.forwardZ);
      const desiredCamera = goon.position
        .clone()
        .addScaledVector(forward, -6.5)
        .add(new THREE.Vector3(0, 4.9, 0));
      desiredCamera.x = THREE.MathUtils.clamp(desiredCamera.x, -8.55, 8.55);
      desiredCamera.y = Math.min(desiredCamera.y, 6.25);
      desiredCamera.z = THREE.MathUtils.clamp(desiredCamera.z, -6.55, 6.55);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 6));
      camera.lookAt(
        goon.position.clone().add(new THREE.Vector3(0, 1.7, 0)).addScaledVector(forward, 1.5),
      );

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      renderer.domElement.removeEventListener("click", requestLock);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((entry) => entry.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <section className={styles.orbitalHub} aria-label="Walkable orbital operations hub">
      <div ref={mountRef} className={styles.hubCanvas} />
      <div className={styles.hubDeckTitle}>
        <span>S.P.A.C.E. ORBITAL SUPPORT VESSEL</span>
        <strong>THE QUESTIONABLE DECISION</strong>
        <small>{"DECK 03 // PROCUREMENT + CREW OPERATIONS"}</small>
      </div>
      <div className={styles.hubOwnership}>
        <div>
          <span>PERSONAL // THIS DEVICE</span>
          <strong>¢{credits} · R{research}</strong>
          <small>CREDITS · RESEARCH · MODULES</small>
        </div>
        <div>
          <span>CREW-SHARED // THIS RUN</span>
          <strong>CONTRACT · TIMER · CARGO</strong>
          <small>MISSION LEAD CONTROLS LAUNCH</small>
        </div>
        <div>
          <span>LAST MAINTENANCE</span>
          <strong>{lastRepairBill > 0 ? `¢${lastRepairBill} PAID` : "NO INVOICE"}</strong>
          <small>FREE LOADOUT ALWAYS AVAILABLE</small>
        </div>
      </div>
      <div className={styles.hubWayfinding} aria-hidden="true">
        {HUB_STATIONS.map((station) => (
          <span key={station.id} data-active={nearestStation?.id === station.id || undefined}>
            {station.code} {"//"} {station.name}
          </span>
        ))}
      </div>
      {!mouseCaptured && !controllerConnected && (
        <div className={styles.hubWalkControls}>
          <span>CLICK DECK TO LOCK MOUSE</span>
          <small>
            {formatKeyboardCode(keyboardBindings.forward)}/{formatKeyboardCode(keyboardBindings.backward)} MOVE · {formatKeyboardCode(keyboardBindings.strafeLeft)}/{formatKeyboardCode(keyboardBindings.strafeRight)} STRAFE · MOUSE LOOK · {formatKeyboardCode(keyboardBindings.interact)} USE
          </small>
        </div>
      )}
      <div className={`${styles.hubInteract} ${nearestStation ? styles.hubInteractReady : ""}`}>
        {nearestStation ? (
          <>
            <kbd>
              {controllerConnected
                ? "X"
                : formatKeyboardCode(keyboardBindings.interact)}
            </kbd>
            <div>
              <span>{nearestStation.code} {"//"} {nearestStation.name}</span>
              <strong>{nearestStation.action}</strong>
            </div>
          </>
        ) : (
          <>
            <span>WALK TO A LIT STATION</span>
            <strong>YOUR NEXT BAD DECISION IS INDOORS</strong>
          </>
        )}
      </div>
      <button type="button" className={styles.hubFallbackButton} onClick={openFallback}>
        OPEN OPS TERMINAL
      </button>
    </section>
  );
}
