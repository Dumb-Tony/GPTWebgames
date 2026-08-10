export type MissionGuideState = {
  moved: boolean;
  scanned: boolean;
  drilled: boolean;
  carried: boolean;
  score: number;
  target: number;
};

export type MissionGuideStep = {
  id: "move" | "scan" | "drill" | "carry" | "secure" | "return";
  number: number;
  label: string;
  keyboard: string;
  controller: string;
  detail: string;
};

export const GUIDE_STEPS: MissionGuideStep[] = [
  {
    id: "move",
    number: 1,
    label: "GET YOUR MOON LEGS",
    keyboard: "WASD + MOUSE",
    controller: "LEFT + RIGHT STICKS",
    detail: "Move away from the lander and look around. Low gravity rewards commitment.",
  },
  {
    id: "scan",
    number: 2,
    label: "FIND A SIGNAL",
    keyboard: "Q",
    controller: "Y / TRIANGLE",
    detail: "Pulse the scanner. Cyan beacons mark financially interesting rocks.",
  },
  {
    id: "drill",
    number: 3,
    label: "EXTRACT THE SAMPLE",
    keyboard: "HOLD F",
    controller: "HOLD RIGHT TRIGGER",
    detail: "Stand near a beacon and drill. Stop before the tool cooks or jams.",
  },
  {
    id: "carry",
    number: 4,
    label: "PICK UP THE PROBLEM",
    keyboard: "E",
    controller: "X / SQUARE",
    detail: "Grab the loose sample. Its weight changes movement and momentum.",
  },
  {
    id: "secure",
    number: 5,
    label: "LOAD THE CARGO BAY",
    keyboard: "E AT SHIP",
    controller: "X / SQUARE AT SHIP",
    detail: "Carry or throw samples into the glowing receiver until the quota is met.",
  },
  {
    id: "return",
    number: 6,
    label: "GET HOME",
    keyboard: "E AT LANDER",
    controller: "X / SQUARE AT LANDER",
    detail: "The contract is funded. Return to the lander and launch before conditions worsen.",
  },
];

export function getMissionGuideStep(state: MissionGuideState) {
  if (!state.moved) return GUIDE_STEPS[0];
  if (!state.scanned) return GUIDE_STEPS[1];
  if (!state.drilled) return GUIDE_STEPS[2];
  if (!state.carried) return GUIDE_STEPS[3];
  if (state.score < state.target) return GUIDE_STEPS[4];
  return GUIDE_STEPS[5];
}
