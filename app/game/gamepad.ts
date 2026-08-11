export const GAMEPAD_DEADZONE = 0.16;

export type GamepadLike = {
  connected?: boolean;
  mapping?: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value?: number }[];
};

export type StandardGamepadInput = {
  connected: boolean;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  interact: boolean;
  scan: boolean;
  drill: boolean;
  repair: boolean;
  tether: boolean;
  magnet: boolean;
  stabilize: boolean;
  throwCargo: boolean;
  menu: boolean;
  pingHelp: boolean;
  pingCargo: boolean;
  pingDanger: boolean;
  pingShip: boolean;
};

export const EMPTY_GAMEPAD_INPUT: StandardGamepadInput = {
  connected: false,
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  jump: false,
  interact: false,
  scan: false,
  drill: false,
  repair: false,
  tether: false,
  magnet: false,
  stabilize: false,
  throwCargo: false,
  menu: false,
  pingHelp: false,
  pingCargo: false,
  pingDanger: false,
  pingShip: false,
};

function applyDeadzone(value: number, deadzone = GAMEPAD_DEADZONE) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

function pressed(gamepad: GamepadLike, index: number) {
  const button = gamepad.buttons[index];
  return Boolean(button && (button.pressed || Number(button.value) >= 0.55));
}

export function readStandardGamepad(
  gamepad: GamepadLike | null | undefined,
): StandardGamepadInput {
  if (!gamepad || gamepad.connected === false) return EMPTY_GAMEPAD_INPUT;
  return {
    connected: true,
    moveX: applyDeadzone(gamepad.axes[0] ?? 0),
    moveY: applyDeadzone(gamepad.axes[1] ?? 0),
    lookX: applyDeadzone(gamepad.axes[2] ?? 0),
    lookY: applyDeadzone(gamepad.axes[3] ?? 0),
    jump: pressed(gamepad, 0),
    repair: pressed(gamepad, 1),
    interact: pressed(gamepad, 2),
    scan: pressed(gamepad, 3),
    tether: pressed(gamepad, 4),
    magnet: pressed(gamepad, 6),
    stabilize: pressed(gamepad, 11),
    throwCargo: pressed(gamepad, 5),
    drill: pressed(gamepad, 7),
    menu: pressed(gamepad, 9),
    pingHelp: pressed(gamepad, 12),
    pingCargo: pressed(gamepad, 15),
    pingDanger: pressed(gamepad, 13),
    pingShip: pressed(gamepad, 14),
  };
}

export function primaryGamepad(
  gamepads: ArrayLike<Gamepad | null> | null | undefined,
) {
  if (!gamepads) return null;
  for (let index = 0; index < gamepads.length; index += 1) {
    const gamepad = gamepads[index];
    if (gamepad?.connected) return gamepad;
  }
  return null;
}

export function headingVectorsFromYaw(yaw: number) {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  return {
    forwardX: -Math.sin(safeYaw),
    forwardZ: -Math.cos(safeYaw),
    rightX: Math.cos(safeYaw),
    rightZ: -Math.sin(safeYaw),
  };
}
