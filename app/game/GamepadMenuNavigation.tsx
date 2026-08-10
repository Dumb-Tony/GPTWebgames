"use client";

import { useEffect, useRef } from "react";
import { primaryGamepad, readStandardGamepad } from "./gamepad";

type MenuElement = HTMLButtonElement | HTMLInputElement | HTMLSelectElement;

function visibleMenuElements() {
  return [
    ...document.querySelectorAll<MenuElement>(
      '[data-gamepad-scope="true"] button, [data-gamepad-scope="true"] input, [data-gamepad-scope="true"] select',
    ),
  ].filter(
    (element) =>
      !element.disabled &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

function focusRelative(direction: 1 | -1) {
  const elements = visibleMenuElements();
  if (elements.length === 0) return;
  const currentIndex = elements.findIndex((element) => element === document.activeElement);
  const nextIndex =
    currentIndex < 0
      ? direction > 0
        ? 0
        : elements.length - 1
      : (currentIndex + direction + elements.length) % elements.length;
  elements[nextIndex].focus({ preventScroll: false });
}

function adjustElement(direction: 1 | -1) {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.type === "range") {
    const step = Number(active.step) || 1;
    const minimum = Number(active.min);
    const maximum = Number(active.max);
    const next = Math.min(maximum, Math.max(minimum, Number(active.value) + step * direction));
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeSetter?.call(active, String(next));
    active.dispatchEvent(new Event("input", { bubbles: true }));
    active.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (active instanceof HTMLSelectElement) {
    const next = Math.min(
      active.options.length - 1,
      Math.max(0, active.selectedIndex + direction),
    );
    active.selectedIndex = next;
    active.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

export function GamepadMenuNavigation({
  active,
  onBack,
}: {
  active: boolean;
  onBack: () => void;
}) {
  const backRef = useRef(onBack);

  useEffect(() => {
    backRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) return;
    const initial = visibleMenuElements().find(
      (element) => !element.getAttribute("aria-label")?.toLowerCase().startsWith("close"),
    );
    initial?.focus({ preventScroll: false });
    let verticalLatch = false;
    let horizontalLatch = false;
    let acceptLatch = false;
    let backLatch = false;

    const interval = window.setInterval(() => {
      const pad = readStandardGamepad(
        typeof navigator.getGamepads === "function"
          ? primaryGamepad(navigator.getGamepads())
          : null,
      );
      if (!pad.connected) return;

      const vertical = pad.pingHelp || pad.moveY < -0.62
        ? -1
        : pad.pingDanger || pad.moveY > 0.62
          ? 1
          : 0;
      if (vertical !== 0 && !verticalLatch) focusRelative(vertical as 1 | -1);
      verticalLatch = vertical !== 0;

      const horizontal = pad.pingShip || pad.moveX < -0.62
        ? -1
        : pad.pingCargo || pad.moveX > 0.62
          ? 1
          : 0;
      if (horizontal !== 0 && !horizontalLatch) {
        if (!adjustElement(horizontal as 1 | -1)) {
          focusRelative(horizontal as 1 | -1);
        }
      }
      horizontalLatch = horizontal !== 0;

      if (pad.jump && !acceptLatch) {
        const focused = document.activeElement;
        if (
          focused instanceof HTMLButtonElement ||
          focused instanceof HTMLInputElement ||
          focused instanceof HTMLSelectElement
        ) {
          focused.click();
        }
      }
      acceptLatch = pad.jump;

      if (pad.repair && !backLatch) backRef.current();
      backLatch = pad.repair;
    }, 65);

    return () => window.clearInterval(interval);
  }, [active]);

  return null;
}
