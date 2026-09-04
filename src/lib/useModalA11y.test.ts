import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => (() => void) | void) => {
    const cleanup = effect();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));

import mountModalAccessibility from "./useModalA11y";

class TestElement {
  isConnected = true;
  children: TestElement[] = [];
  contains(element: unknown): boolean {
    return element === this || this.children.some((child) => child.contains(element));
  }
  getClientRects() { return [{}]; }
  querySelectorAll() { return this.children; }
  focus() { testDocument.activeElement = this; }
}

let testDocument: EventTarget & { activeElement: TestElement | null };
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
function flushFrames() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(0));
}
function key(key: string, shiftKey = false) {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, { key, shiftKey });
  testDocument.dispatchEvent(event);
  return event;
}
function open(dialog: TestElement, onClose = vi.fn()) {
  mountModalAccessibility({ dialogRef: { current: dialog as unknown as HTMLElement }, onClose, initialFocus: "dialog" });
  return effects.cleanups.at(-1)!;
}

beforeEach(() => {
  testDocument = Object.assign(new EventTarget(), { activeElement: null });
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
});
afterEach(() => {
  effects.cleanups.reverse().forEach((cleanup) => cleanup());
  effects.cleanups = [];
  vi.unstubAllGlobals();
});

describe("modal keyboard ownership", () => {
  it("focuses only the top dialog and closes only that dialog on Escape", () => {
    const parent = new TestElement();
    const child = new TestElement();
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    open(parent, closeParent);
    open(child, closeChild);
    flushFrames();
    expect(testDocument.activeElement).toBe(child);
    expect(key("Escape").defaultPrevented).toBe(true);
    expect(closeChild).toHaveBeenCalledOnce();
    expect(closeParent).not.toHaveBeenCalled();
  });

  it("contains Tab from the dialog, either boundary, and outside focus", () => {
    const dialog = new TestElement();
    const first = new TestElement();
    const last = new TestElement();
    dialog.children = [first, last];
    open(dialog);
    flushFrames();
    key("Tab", true);
    expect(testDocument.activeElement).toBe(last);
    key("Tab");
    expect(testDocument.activeElement).toBe(first);
    key("Tab", true);
    expect(testDocument.activeElement).toBe(last);
    new TestElement().focus();
    key("Tab");
    expect(testDocument.activeElement).toBe(first);
  });

  it("restores the nested trigger then returns keyboard ownership to its parent", () => {
    const parent = new TestElement();
    const trigger = new TestElement();
    parent.children = [trigger];
    const closeParent = vi.fn();
    open(parent, closeParent);
    flushFrames();
    trigger.focus();
    const child = new TestElement();
    const closeChild = open(child);
    flushFrames();
    child.isConnected = false;
    closeChild();
    flushFrames();
    expect(testDocument.activeElement).toBe(trigger);
    key("Escape");
    expect(closeParent).toHaveBeenCalledOnce();
  });

  it("restores a mobile action trigger portaled outside the parent dialog", () => {
    const parent = new TestElement();
    open(parent);
    flushFrames();
    const portalTrigger = new TestElement();
    portalTrigger.focus();
    const child = new TestElement();
    const closeChild = open(child);
    flushFrames();
    child.isConnected = false;
    closeChild();
    flushFrames();
    expect(testDocument.activeElement).toBe(portalTrigger);
  });
});

