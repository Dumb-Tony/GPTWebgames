"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./game.module.css";

const WORLD = { width: 2400, height: 1400 };
const SHIP = { x: 310, y: 700, radius: 160 };
const CONTRACT_TARGET = 900;
const MISSION_SECONDS = 180;

type Phase = "briefing" | "active" | "success" | "failed";
type CargoKind = "ferric" | "glass" | "platinum";
type DepositState = "hidden" | "revealed" | "extracting" | "cargo" | "secured";

type Deposit = {
  id: number;
  x: number;
  y: number;
  kind: CargoKind;
  state: DepositState;
  progress: number;
  scanGlow: number;
  condition: number;
};

type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  facing: number;
  carrying: number | null;
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

const cargoData: Record<
  CargoKind,
  { name: string; value: number; mass: number; color: string; accent: string }
> = {
  ferric: {
    name: "Ferric Nodule",
    value: 180,
    mass: 0.82,
    color: "#b76d4a",
    accent: "#ffb07c",
  },
  glass: {
    name: "Lunar Glass",
    value: 320,
    mass: 0.9,
    color: "#56cad3",
    accent: "#b8ffff",
  },
  platinum: {
    name: "Platinum Core",
    value: 620,
    mass: 0.56,
    color: "#d4d8ee",
    accent: "#ffffff",
  },
};

const initialDeposits = (): Deposit[] => [
  { id: 1, x: 860, y: 440, kind: "ferric", state: "hidden", progress: 0, scanGlow: 0, condition: 1 },
  { id: 2, x: 1180, y: 920, kind: "glass", state: "hidden", progress: 0, scanGlow: 0, condition: 1 },
  { id: 3, x: 1610, y: 470, kind: "platinum", state: "hidden", progress: 0, scanGlow: 0, condition: 1 },
  { id: 4, x: 1960, y: 1030, kind: "glass", state: "hidden", progress: 0, scanGlow: 0, condition: 1 },
  { id: 5, x: 2140, y: 330, kind: "ferric", state: "hidden", progress: 0, scanGlow: 0, condition: 1 },
];

const craters = [
  { x: 580, y: 310, r: 96 },
  { x: 760, y: 1040, r: 150 },
  { x: 1300, y: 290, r: 120 },
  { x: 1430, y: 1120, r: 180 },
  { x: 1930, y: 690, r: 132 },
  { x: 2220, y: 1190, r: 105 },
];

const terrainDetails = (() => {
  let seed = 4017;
  return Array.from({ length: 120 }, (_, index) => {
    seed = (seed * 48271) % 2147483647;
    const x = 90 + (seed / 2147483647) * (WORLD.width - 180);
    seed = (seed * 48271) % 2147483647;
    const y = 90 + (seed / 2147483647) * (WORLD.height - 180);
    seed = (seed * 48271) % 2147483647;
    const size = 2 + (seed / 2147483647) * 10;
    return { id: index, x, y, size, rotation: seed * 0.001 };
  });
})();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function makeStars() {
  let seed = 8192;
  return Array.from({ length: 170 }, (_, index) => {
    seed = (seed * 16807) % 2147483647;
    const x = seed / 2147483647;
    seed = (seed * 16807) % 2147483647;
    const y = seed / 2147483647;
    seed = (seed * 16807) % 2147483647;
    const size = 0.7 + (seed / 2147483647) * 2;
    return { id: index, x, y, size };
  });
}

const stars = makeStars();

export function MoonGoonsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const phaseRef = useRef<Phase>("briefing");
  const timeRef = useRef(MISSION_SECONDS);
  const scoreRef = useRef(0);
  const heatRef = useRef(0);
  const overheatedRef = useRef(false);
  const scanCooldownRef = useRef(0);
  const depositsRef = useRef(initialDeposits());
  const messageRef = useRef("Awaiting a legally sufficient level of consent.");
  const playerRef = useRef<Player>({
    x: 500,
    y: 700,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    facing: 0,
    carrying: null,
  });
  const lastInteractRef = useRef(false);
  const lastScanRef = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    phase: "briefing",
    time: MISSION_SECONDS,
    score: 0,
    heat: 0,
    overheated: false,
    carrying: null,
    message: messageRef.current,
    scanCooldown: 0,
    depositsSecured: 0,
  });

  const sound = useCallback((tone: "scan" | "pickup" | "secure" | "warning" | "launch") => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      const settings = {
        scan: [420, 780, 0.25],
        pickup: [280, 390, 0.12],
        secure: [440, 880, 0.28],
        warning: [180, 130, 0.22],
        launch: [120, 360, 0.5],
      }[tone];
      oscillator.type = tone === "warning" ? "square" : "sine";
      oscillator.frequency.setValueAtTime(settings[0], now);
      oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + settings[2]);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + settings[2]);
      oscillator.addEventListener("ended", () => context.close());
    } catch {
      // Audio is optional; browsers can reject contexts before first interaction.
    }
  }, []);

  const resetMission = useCallback(() => {
    playerRef.current = {
      x: 500,
      y: 700,
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      facing: 0,
      carrying: null,
    };
    depositsRef.current = initialDeposits();
    phaseRef.current = "active";
    timeRef.current = MISSION_SECONDS;
    scoreRef.current = 0;
    heatRef.current = 0;
    overheatedRef.current = false;
    scanCooldownRef.current = 0;
    messageRef.current = "Mission live. Find something expensive and remain technically alive.";
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      keysRef.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.code);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let previous = performance.now();
    let hudAccumulator = 0;
    let warningPlayed = false;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      hudAccumulator += dt;
      const phase = phaseRef.current;
      const player = playerRef.current;
      const keys = keysRef.current;

      if (phase === "active") {
        timeRef.current = Math.max(0, timeRef.current - dt);
        scanCooldownRef.current = Math.max(0, scanCooldownRef.current - dt);

        if (timeRef.current <= 30 && !warningPlayed) {
          warningPlayed = true;
          messageRef.current = "FINAL DEPARTURE. The ship has stopped accepting excuses.";
          sound("warning");
        }

        let inputX = 0;
        let inputY = 0;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) inputX -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) inputX += 1;
        if (keys.has("KeyW") || keys.has("ArrowUp")) inputY -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) inputY += 1;
        if (inputX || inputY) {
          const length = Math.hypot(inputX, inputY);
          inputX /= length;
          inputY /= length;
          player.facing = Math.atan2(inputY, inputX);
        }

        const carried = depositsRef.current.find((item) => item.id === player.carrying);
        const massMultiplier = carried ? cargoData[carried.kind].mass : 1;
        const airborneMultiplier = player.z > 0 ? 0.42 : 1;
        const acceleration = 820 * massMultiplier * airborneMultiplier;
        player.vx += inputX * acceleration * dt;
        player.vy += inputY * acceleration * dt;
        const drag = player.z > 0 ? 0.992 : 0.86;
        player.vx *= Math.pow(drag, dt * 60);
        player.vy *= Math.pow(drag, dt * 60);
        const maxSpeed = 280 * massMultiplier;
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > maxSpeed) {
          player.vx = (player.vx / speed) * maxSpeed;
          player.vy = (player.vy / speed) * maxSpeed;
        }
        player.x = clamp(player.x + player.vx * dt, 80, WORLD.width - 80);
        player.y = clamp(player.y + player.vy * dt, 90, WORLD.height - 90);

        if (keys.has("Space") && player.z <= 0.01) {
          player.vz = carried?.kind === "platinum" ? 225 : 315;
          player.z = 0.1;
        }
        if (player.z > 0 || player.vz > 0) {
          player.vz -= 210 * dt;
          player.z += player.vz * dt;
          if (player.z <= 0) {
            player.z = 0;
            player.vz = 0;
          }
        }

        const scanPressed = keys.has("KeyQ");
        if (scanPressed && !lastScanRef.current && scanCooldownRef.current <= 0) {
          scanCooldownRef.current = 4;
          let revealed = 0;
          depositsRef.current.forEach((deposit) => {
            if (
              deposit.state === "hidden" &&
              distance(player.x, player.y, deposit.x, deposit.y) < 520
            ) {
              deposit.state = "revealed";
              deposit.scanGlow = 1;
              revealed += 1;
            }
          });
          messageRef.current =
            revealed > 0
              ? `Scanner confirms ${revealed} financially interesting signal${revealed === 1 ? "" : "s"}.`
              : "Scanner found dust, regret, and no nearby deposits.";
          sound("scan");
        }
        lastScanRef.current = scanPressed;

        depositsRef.current.forEach((deposit) => {
          deposit.scanGlow = Math.max(0, deposit.scanGlow - dt * 0.45);
        });

        const nearbyDeposit = depositsRef.current
          .filter((deposit) => deposit.state === "revealed" || deposit.state === "extracting")
          .sort(
            (a, b) =>
              distance(player.x, player.y, a.x, a.y) -
              distance(player.x, player.y, b.x, b.y),
          )[0];
        const drilling =
          keys.has("KeyF") &&
          nearbyDeposit &&
          distance(player.x, player.y, nearbyDeposit.x, nearbyDeposit.y) < 115 &&
          player.z < 24 &&
          player.carrying === null &&
          !overheatedRef.current;

        if (drilling && nearbyDeposit) {
          nearbyDeposit.state = "extracting";
          nearbyDeposit.progress += dt * (heatRef.current > 72 ? 16 : 24);
          heatRef.current += dt * 34;
          const recoil = 16 * dt;
          player.vx -= Math.cos(player.facing) * recoil;
          player.vy -= Math.sin(player.facing) * recoil;
          if (nearbyDeposit.progress >= 100) {
            nearbyDeposit.progress = 100;
            nearbyDeposit.state = "cargo";
            messageRef.current = `${cargoData[nearbyDeposit.kind].name} extracted. Try not to improve it with impact damage.`;
            sound("pickup");
          }
          if (heatRef.current >= 100) {
            heatRef.current = 100;
            overheatedRef.current = true;
            messageRef.current = "DRILL OVERHEATED. Engineering recommends less drilling.";
            sound("warning");
          }
        } else {
          heatRef.current = Math.max(0, heatRef.current - dt * 25);
          if (overheatedRef.current && heatRef.current <= 34) {
            overheatedRef.current = false;
            messageRef.current = "Drill grudgingly operational.";
          }
        }

        const interactPressed = keys.has("KeyE");
        if (interactPressed && !lastInteractRef.current) {
          if (player.carrying !== null) {
            const held = depositsRef.current.find((item) => item.id === player.carrying);
            if (held) {
              if (distance(player.x, player.y, SHIP.x, SHIP.y) < SHIP.radius) {
                held.state = "secured";
                const earned = Math.round(cargoData[held.kind].value * held.condition);
                scoreRef.current += earned;
                player.carrying = null;
                messageRef.current = `${cargoData[held.kind].name} secured for ¢${earned}. S.P.A.C.E. owns it now.`;
                sound("secure");
              } else {
                held.x = player.x + Math.cos(player.facing) * 56;
                held.y = player.y + Math.sin(player.facing) * 56;
                player.carrying = null;
                messageRef.current = `${cargoData[held.kind].name} placed gently-ish.`;
              }
            }
          } else {
            const cargo = depositsRef.current
              .filter((deposit) => deposit.state === "cargo")
              .sort(
                (a, b) =>
                  distance(player.x, player.y, a.x, a.y) -
                  distance(player.x, player.y, b.x, b.y),
              )[0];
            if (cargo && distance(player.x, player.y, cargo.x, cargo.y) < 105) {
              player.carrying = cargo.id;
              messageRef.current = `${cargoData[cargo.kind].name} acquired. Momentum is now a group project.`;
              sound("pickup");
            } else if (
              distance(player.x, player.y, SHIP.x, SHIP.y) < SHIP.radius &&
              scoreRef.current >= CONTRACT_TARGET
            ) {
              phaseRef.current = "success";
              messageRef.current = "Contract met. Launching before anyone finds more work.";
              sound("launch");
            }
          }
        }
        lastInteractRef.current = interactPressed;

        if (carried) {
          carried.x = player.x + Math.cos(player.facing) * 45;
          carried.y = player.y + Math.sin(player.facing) * 45;
        }

        if (timeRef.current <= 0) {
          const aboard = distance(player.x, player.y, SHIP.x, SHIP.y) < SHIP.radius;
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

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      const cameraX = clamp(player.x, width / 2, WORLD.width - width / 2);
      const cameraY = clamp(player.y, height / 2, WORLD.height - height / 2);
      const ox = width / 2 - cameraX;
      const oy = height / 2 - cameraY;

      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#080b17");
      gradient.addColorStop(1, "#151528");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const nebula = context.createRadialGradient(
        width * 0.78,
        height * 0.12,
        0,
        width * 0.78,
        height * 0.12,
        width * 0.5,
      );
      nebula.addColorStop(0, "rgba(40, 118, 134, .18)");
      nebula.addColorStop(0.45, "rgba(56, 48, 96, .08)");
      nebula.addColorStop(1, "rgba(6, 9, 20, 0)");
      context.fillStyle = nebula;
      context.fillRect(0, 0, width, height);
      stars.forEach((star) => {
        context.globalAlpha = 0.4 + star.size * 0.15;
        context.fillStyle = "#eef1d7";
        context.fillRect(
          (star.x * width + ox * 0.03 + width) % width,
          (star.y * height + oy * 0.03 + height) % height,
          star.size,
          star.size,
        );
      });
      context.globalAlpha = 1;
      context.fillStyle = "#263d5d";
      context.beginPath();
      context.arc(width * 0.86 + ox * 0.008, height * 0.14 + oy * 0.008, 46, 0, Math.PI * 2);
      context.fill();
      const planetLight = context.createRadialGradient(
        width * 0.84,
        height * 0.12,
        4,
        width * 0.86,
        height * 0.14,
        46,
      );
      planetLight.addColorStop(0, "rgba(135, 223, 219, .8)");
      planetLight.addColorStop(0.38, "rgba(68, 119, 147, .7)");
      planetLight.addColorStop(1, "rgba(13, 22, 43, .9)");
      context.fillStyle = planetLight;
      context.beginPath();
      context.arc(width * 0.86 + ox * 0.008, height * 0.14 + oy * 0.008, 46, 0, Math.PI * 2);
      context.fill();

      context.save();
      context.translate(ox, oy);
      const moonGradient = context.createRadialGradient(
        WORLD.width * 0.45,
        WORLD.height * 0.35,
        120,
        WORLD.width * 0.5,
        WORLD.height * 0.5,
        1450,
      );
      moonGradient.addColorStop(0, "#5f6170");
      moonGradient.addColorStop(0.58, "#414452");
      moonGradient.addColorStop(1, "#2b2e3c");
      context.fillStyle = moonGradient;
      context.beginPath();
      context.roundRect(30, 30, WORLD.width - 60, WORLD.height - 60, 170);
      context.fill();
      context.strokeStyle = "rgba(255,255,255,.08)";
      context.lineWidth = 3;
      context.stroke();

      context.strokeStyle = "rgba(244,241,220,.045)";
      context.lineWidth = 1;
      for (let x = 120; x < WORLD.width; x += 110) {
        context.beginPath();
        context.moveTo(x, 65);
        context.lineTo(x - 70, WORLD.height - 65);
        context.stroke();
      }

      craters.forEach((crater) => {
        const craterGradient = context.createRadialGradient(
          crater.x - crater.r * 0.25,
          crater.y - crater.r * 0.25,
          crater.r * 0.1,
          crater.x,
          crater.y,
          crater.r,
        );
        craterGradient.addColorStop(0, "rgba(27,29,41,.82)");
        craterGradient.addColorStop(0.62, "rgba(39,41,54,.75)");
        craterGradient.addColorStop(0.83, "rgba(135,136,146,.32)");
        craterGradient.addColorStop(1, "rgba(34,36,48,.15)");
        context.fillStyle = craterGradient;
        context.beginPath();
        context.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
        context.fill();
      });

      terrainDetails.forEach((detail) => {
        context.save();
        context.translate(detail.x, detail.y);
        context.rotate(detail.rotation);
        context.fillStyle = detail.size > 8 ? "rgba(28,31,43,.78)" : "rgba(215,216,214,.13)";
        context.beginPath();
        context.moveTo(-detail.size, detail.size * 0.45);
        context.lineTo(-detail.size * 0.4, -detail.size * 0.8);
        context.lineTo(detail.size * 0.8, -detail.size * 0.25);
        context.lineTo(detail.size, detail.size * 0.65);
        context.closePath();
        context.fill();
        context.restore();
      });

      // Abandoned company rover: an environmental toy and visual landmark.
      context.save();
      context.translate(1030, 680);
      context.rotate(-0.12);
      context.fillStyle = "#d8d3b9";
      context.beginPath();
      context.roundRect(-55, -28, 110, 48, 11);
      context.fill();
      context.fillStyle = "#d9a92b";
      context.fillRect(-50, 3, 100, 15);
      context.fillStyle = "#182635";
      context.fillRect(-31, -21, 54, 20);
      context.strokeStyle = "#e8c34d";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(34, -24);
      context.lineTo(57, -63);
      context.lineTo(67, -63);
      context.stroke();
      context.fillStyle = "#ff6c61";
      context.fillRect(60, -70, 15, 12);
      [-42, 38].forEach((wheelX) => {
        context.fillStyle = "#151824";
        context.beginPath();
        context.arc(wheelX, 24, 19, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#777a82";
        context.lineWidth = 4;
        context.stroke();
      });
      context.restore();

      // Landing ship and cargo bay.
      context.save();
      context.translate(SHIP.x, SHIP.y);
      context.fillStyle = "rgba(110,231,228,.09)";
      context.beginPath();
      context.arc(0, 0, SHIP.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(110,231,228,.48)";
      context.lineWidth = 3;
      context.setLineDash([12, 10]);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#e9e6cf";
      context.beginPath();
      context.moveTo(-84, -74);
      context.lineTo(46, -104);
      context.lineTo(104, -32);
      context.lineTo(94, 78);
      context.lineTo(-66, 96);
      context.lineTo(-112, 28);
      context.closePath();
      context.fill();
      context.fillStyle = "#8e917f";
      context.beginPath();
      context.moveTo(-90, 69);
      context.lineTo(-128, 126);
      context.lineTo(-105, 126);
      context.lineTo(-61, 81);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(71, 66);
      context.lineTo(119, 117);
      context.lineTo(140, 108);
      context.lineTo(92, 48);
      context.closePath();
      context.fill();
      context.fillStyle = "#1d5260";
      context.fillRect(-62, -47, 96, 54);
      context.fillStyle = "#ffd85a";
      context.fillRect(-84, 22, 172, 44);
      context.fillStyle = "#111827";
      context.font = "700 18px Arial";
      context.textAlign = "center";
      context.fillText("CARGO", 2, 51);
      context.fillStyle = "#ff865e";
      context.fillRect(68, -50, 22, 20);
      context.fillRect(-102, -18, 20, 20);
      context.strokeStyle = "#d8d3b9";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(35, -100);
      context.lineTo(46, -148);
      context.stroke();
      context.fillStyle = "#6ee7e4";
      context.beginPath();
      context.arc(47, -153, 7, 0, Math.PI * 2);
      context.fill();
      context.restore();

      depositsRef.current.forEach((deposit) => {
        if (deposit.state === "hidden" || deposit.state === "secured") return;
        const data = cargoData[deposit.kind];
        const pulse = 1 + Math.sin(now / 160 + deposit.id) * 0.08;
        if (deposit.state === "revealed" || deposit.state === "extracting") {
          context.strokeStyle = `rgba(110,231,228,${0.25 + deposit.scanGlow * 0.55})`;
          context.lineWidth = 3;
          context.beginPath();
          context.arc(deposit.x, deposit.y, 49 * pulse, 0, Math.PI * 2);
          context.stroke();
          context.fillStyle = "#292b36";
          context.beginPath();
          context.arc(deposit.x, deposit.y, 31, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = data.color;
          context.beginPath();
          context.moveTo(deposit.x - 18, deposit.y + 11);
          context.lineTo(deposit.x - 9, deposit.y - 19);
          context.lineTo(deposit.x + 14, deposit.y - 12);
          context.lineTo(deposit.x + 23, deposit.y + 14);
          context.closePath();
          context.fill();
          if (deposit.progress > 0) {
            context.fillStyle = "rgba(6,9,20,.8)";
            context.fillRect(deposit.x - 40, deposit.y + 48, 80, 8);
            context.fillStyle = deposit.progress > 75 ? "#ff865e" : "#6ee7e4";
            context.fillRect(deposit.x - 40, deposit.y + 48, 80 * (deposit.progress / 100), 8);
          }
          if (deposit.scanGlow > 0.15 || distance(player.x, player.y, deposit.x, deposit.y) < 180) {
            context.fillStyle = "rgba(7,10,20,.86)";
            context.fillRect(deposit.x - 58, deposit.y - 70, 116, 25);
            context.strokeStyle = "rgba(110,231,228,.5)";
            context.strokeRect(deposit.x - 58, deposit.y - 70, 116, 25);
            context.fillStyle = "#d9ffff";
            context.font = "700 10px monospace";
            context.textAlign = "center";
            context.fillText(data.name.toUpperCase(), deposit.x, deposit.y - 53);
          }
        } else if (deposit.state === "cargo") {
          context.save();
          context.translate(deposit.x, deposit.y);
          context.rotate(now / 2400 + deposit.id);
          context.shadowColor = data.accent;
          context.shadowBlur = 18;
          context.fillStyle = data.color;
          context.beginPath();
          const radius = deposit.kind === "platinum" ? 34 : 26;
          for (let i = 0; i < 6; i += 1) {
            const angle = (Math.PI * 2 * i) / 6;
            const x = Math.cos(angle) * radius * (i % 2 ? 0.78 : 1);
            const y = Math.sin(angle) * radius;
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.closePath();
          context.fill();
          context.restore();
        }
      });

      const visualDrillTarget = depositsRef.current
        .filter((deposit) => deposit.state === "revealed" || deposit.state === "extracting")
        .sort(
          (a, b) =>
            distance(player.x, player.y, a.x, a.y) -
            distance(player.x, player.y, b.x, b.y),
        )[0];
      if (
        phase === "active" &&
        keys.has("KeyF") &&
        visualDrillTarget &&
        distance(player.x, player.y, visualDrillTarget.x, visualDrillTarget.y) < 115 &&
        !overheatedRef.current
      ) {
        const sparkPhase = now * 0.02;
        context.strokeStyle = "rgba(255,134,94,.9)";
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(player.x, player.y - player.z * 0.34);
        context.lineTo(visualDrillTarget.x, visualDrillTarget.y);
        context.stroke();
        context.strokeStyle = "rgba(255,216,90,.45)";
        context.lineWidth = 2;
        for (let spark = 0; spark < 5; spark += 1) {
          const angle = sparkPhase + spark * 1.26;
          context.beginPath();
          context.moveTo(visualDrillTarget.x, visualDrillTarget.y);
          context.lineTo(
            visualDrillTarget.x + Math.cos(angle) * 24,
            visualDrillTarget.y + Math.sin(angle) * 24,
          );
          context.stroke();
        }
      }

      // Player shadow, body, helmet, and carried sample.
      context.save();
      context.translate(player.x, player.y);
      context.globalAlpha = clamp(0.5 - player.z / 700, 0.15, 0.5);
      context.fillStyle = "#090b13";
      context.beginPath();
      context.ellipse(0, 18, 28 + player.z * 0.04, 14 + player.z * 0.02, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.translate(0, -player.z * 0.34);
      context.rotate(player.facing + Math.PI / 2);
      context.fillStyle = "#f4e85f";
      context.beginPath();
      context.roundRect(-20, -28, 40, 57, 13);
      context.fill();
      context.fillStyle = "#202a35";
      context.beginPath();
      context.roundRect(-24, -4, 8, 25, 3);
      context.fill();
      context.beginPath();
      context.roundRect(16, -4, 8, 25, 3);
      context.fill();
      context.fillStyle = "#cf4059";
      context.fillRect(-23, 4, 7, 19);
      context.fillRect(16, 4, 7, 19);
      context.fillStyle = "#d8f5f3";
      context.beginPath();
      context.arc(0, -25, 19, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#173144";
      context.beginPath();
      context.arc(0, -27, 14, Math.PI, Math.PI * 2);
      context.fill();
      context.fillStyle = "#6ee7e4";
      context.fillRect(-4, -40, 8, 4);
      context.fillStyle = "#f7f2d8";
      context.font = "900 8px Arial";
      context.textAlign = "center";
      context.fillText("07", 0, 18);
      context.restore();

      if (scanCooldownRef.current > 3.45) {
        const scanProgress = (4 - scanCooldownRef.current) / 0.55;
        context.strokeStyle = `rgba(110,231,228,${1 - scanProgress})`;
        context.lineWidth = 5;
        context.beginPath();
        context.arc(player.x, player.y, 520 * scanProgress, 0, Math.PI * 2);
        context.stroke();
      }

      context.restore();

      if (phase === "active") {
        const returnAngle = Math.atan2(SHIP.y - player.y, SHIP.x - player.x);
        const shipOffscreen =
          SHIP.x + ox < 70 ||
          SHIP.x + ox > width - 70 ||
          SHIP.y + oy < 70 ||
          SHIP.y + oy > height - 70;
        if (shipOffscreen) {
          const edgeX = width / 2 + Math.cos(returnAngle) * Math.min(width, height) * 0.37;
          const edgeY = height / 2 + Math.sin(returnAngle) * Math.min(width, height) * 0.37;
          context.save();
          context.translate(edgeX, edgeY);
          context.rotate(returnAngle);
          context.fillStyle = "#ffd85a";
          context.beginPath();
          context.moveTo(20, 0);
          context.lineTo(-13, -12);
          context.lineTo(-7, 0);
          context.lineTo(-13, 12);
          context.closePath();
          context.fill();
          context.restore();
        }
      }

      if (hudAccumulator > 0.08) {
        hudAccumulator = 0;
        const held = depositsRef.current.find((item) => item.id === player.carrying);
        setSnapshot({
          phase: phaseRef.current,
          time: timeRef.current,
          score: scoreRef.current,
          heat: heatRef.current,
          overheated: overheatedRef.current,
          carrying: held ? cargoData[held.kind].name : null,
          message: messageRef.current,
          scanCooldown: scanCooldownRef.current,
          depositsSecured: depositsRef.current.filter((item) => item.state === "secured").length,
        });
      }

      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [sound]);

  const nearShip = useCallback(
    () => distance(playerRef.current.x, playerRef.current.y, SHIP.x, SHIP.y) < SHIP.radius,
    [],
  );

  const manualLaunch = () => {
    if (phaseRef.current !== "active" || scoreRef.current < CONTRACT_TARGET || !nearShip()) return;
    phaseRef.current = "success";
    messageRef.current = "Launch authorized. Liability transferred to orbital operations.";
    sound("launch");
  };

  const percent = Math.min(100, (snapshot.score / CONTRACT_TARGET) * 100);
  const urgent = snapshot.phase === "active" && snapshot.time <= 30;

  return (
    <main className={styles.shell}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Playable top-down Practice Moon extraction mission"
      />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>MG</span>
          <div>
            <p>MOON GOONS</p>
            <span>S.P.A.C.E. FIELD TEST // BUILD 001</span>
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
            <div className={styles.panelCode}><span>ACTIVE CONTRACT</span><b>SP-01</b></div>
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
                <small>{snapshot.overheated ? "THERMAL LOCKOUT" : "QUESTIONABLY OPERATIONAL"}</small>
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
            <div><kbd>WASD</kbd><span>MOVE</span></div>
            <div><kbd>SPACE</kbd><span>MOON HOP</span></div>
            <div><kbd>Q</kbd><span>SCAN</span></div>
            <div><kbd>F</kbd><span>HOLD TO DRILL</span></div>
            <div><kbd>E</kbd><span>GRAB / DEPOSIT</span></div>
          </div>

          <div className={styles.radio}>
            <span>FIELD COMMS</span>
            <p>{snapshot.message}</p>
          </div>

          {snapshot.score >= CONTRACT_TARGET && (
            <button className={styles.launchButton} type="button" onClick={manualLaunch}>
              RETURN TO THE SHIP + PRESS E TO LAUNCH
            </button>
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
            <p className={styles.kicker}>FIELD ORIENTATION // PRACTICE MOON</p>
            <h1>
              GOOD SCIENCE.
              <br />
              <em>BAD EQUIPMENT.</em>
            </h1>
            <p className={styles.lede}>
              Find valuable deposits, drill them out, and haul ¢{CONTRACT_TARGET} back to the
              ship before the launch window closes. The company has reviewed this mission and
              found it cheaper than training.
            </p>
            <div className={styles.briefGrid}>
              <div>
                <span>01</span>
                <strong>SCAN</strong>
                <p>Pulse nearby terrain with Q to reveal buried material.</p>
              </div>
              <div>
                <span>02</span>
                <strong>EXTRACT</strong>
                <p>Hold F near a signal. Let go before the drill cooks itself.</p>
              </div>
              <div>
                <span>03</span>
                <strong>ESCAPE</strong>
                <p>Grab cargo with E, return it to the yellow ship bay, and launch.</p>
              </div>
            </div>
            <button type="button" onClick={resetMission}>
              ACCEPT LIABILITY + DEPLOY
            </button>
            <small>Keyboard recommended · Sound begins after deployment</small>
          </div>
        </section>
      )}

      {(snapshot.phase === "success" || snapshot.phase === "failed") && (
        <section className={styles.overlay}>
          <div className={`${styles.resultsCard} ${snapshot.phase === "failed" ? styles.failure : ""}`}>
            <p className={styles.kicker}>MISSION DEBRIEF // AUTOMATICALLY GENERATED</p>
            <span className={styles.resultSeal}>
              {snapshot.phase === "success" ? "ACCEPTABLE" : "LEARNING EVENT"}
            </span>
            <h1>{snapshot.phase === "success" ? "SCIENCE SECURED." : "SHIP DEPARTED."}</h1>
            <p className={styles.lede}>{snapshot.message}</p>
            <div className={styles.resultGrid}>
              <div><span>CARGO VALUE</span><strong>¢{snapshot.score}</strong></div>
              <div><span>SAMPLES</span><strong>{snapshot.depositsSecured}</strong></div>
              <div><span>DRILL HEAT</span><strong>{Math.round(snapshot.heat)}%</strong></div>
              <div><span>SAFETY RATING</span><strong>{snapshot.phase === "success" ? "C−" : "PENDING"}</strong></div>
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
