"use client";

import { Eye, EyeOff } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "dustycards:collection-prices-hidden";
const STORAGE_EVENT = "dustycards:collection-price-privacy-change";
const CURRENCY_TEXT_PATTERN = /(?:[+-]\s*)?[\u20ac\u0024\u00a3]\s*[\d.,]/u;
const FINANCIAL_ZONE_SELECTOR = "[data-collection-summary-financial]";

interface CollectionPricePrivacyValue {
  pricesHidden: boolean;
  togglePrices: () => void;
}

const CollectionPricePrivacyContext =
  createContext<CollectionPricePrivacyValue>({
    pricesHidden: false,
    togglePrices: () => {},
  });

function readStoredVisibility(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeToVisibility(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

export function CollectionPricePrivacyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pricesHidden = useSyncExternalStore(
    subscribeToVisibility,
    readStoredVisibility,
    () => false,
  );
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scopeElement = scopeRef.current;
    if (!scopeElement) return;
    const stableScope: HTMLDivElement = scopeElement;

    let scheduledFrame = 0;
    const pendingNodes = new Set<Node>();

    function clearMarkedPrices() {
      stableScope
        .querySelectorAll<HTMLElement>("[data-collection-money]")
        .forEach((element) => {
          delete element.dataset.collectionMoney;
        });
    }

    function refreshElement(parent: HTMLElement) {
      if (
        parent.closest("[data-collection-price-privacy-control]") ||
        parent.closest("script, style")
      ) {
        return;
      }

      const containsCurrency = Array.from(parent.childNodes).some(
        (child) =>
          child.nodeType === Node.TEXT_NODE &&
          CURRENCY_TEXT_PATTERN.test(child.textContent ?? ""),
      );
      if (containsCurrency) {
        parent.dataset.collectionMoney = "true";
      } else {
        delete parent.dataset.collectionMoney;
      }
    }

    function refreshTextNode(textNode: Node) {
      const parent = textNode.parentElement;
      if (parent) refreshElement(parent);
    }

    function scanNode(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        refreshTextNode(node);
        return;
      }

      if (node instanceof HTMLElement) refreshElement(node);

      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode) {
        refreshTextNode(textNode);
        textNode = walker.nextNode();
      }
    }

    function flushPendingNodes() {
      scheduledFrame = 0;
      pendingNodes.forEach(scanNode);
      pendingNodes.clear();
    }

    function scheduleMarking(node: Node) {
      pendingNodes.add(node);
      if (scheduledFrame) return;
      scheduledFrame = window.requestAnimationFrame(flushPendingNodes);
    }

    function scheduleFinancialZones(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent?.closest(FINANCIAL_ZONE_SELECTOR)) scheduleMarking(node);
        return;
      }
      if (!(node instanceof HTMLElement)) return;

      if (node.closest(FINANCIAL_ZONE_SELECTOR)) scheduleMarking(node);
      node
        .querySelectorAll<HTMLElement>(FINANCIAL_ZONE_SELECTOR)
        .forEach(scheduleMarking);
    }

    if (!pricesHidden) {
      clearMarkedPrices();
      return;
    }

    stableScope
      .querySelectorAll<HTMLElement>(FINANCIAL_ZONE_SELECTOR)
      .forEach(scheduleMarking);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          scheduleFinancialZones(mutation.target);
          return;
        }
        scheduleFinancialZones(mutation.target);
        mutation.addedNodes.forEach(scheduleFinancialZones);
      });
    });
    observer.observe(stableScope, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame);
      clearMarkedPrices();
    };
  }, [pricesHidden]);

  const togglePrices = useCallback(() => {
    const next = !readStoredVisibility();
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {}
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, []);

  return (
    <CollectionPricePrivacyContext.Provider
      value={{ pricesHidden, togglePrices }}
    >
      <div
        ref={scopeRef}
        className="contents"
        data-collection-price-privacy-scope
        data-collection-prices-hidden={pricesHidden ? "true" : "false"}
      >
        {children}
      </div>
    </CollectionPricePrivacyContext.Provider>
  );
}

export function CollectionPriceVisibilityButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { pricesHidden, togglePrices } = useContext(
    CollectionPricePrivacyContext,
  );
  const Icon = pricesHidden ? EyeOff : Eye;
  const label = pricesHidden
    ? "Show collection prices"
    : "Hide collection prices";

  return (
    <button
      type="button"
      onClick={togglePrices}
      aria-label={label}
      aria-pressed={pricesHidden}
      title={label}
      data-collection-price-privacy-control
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.72)] font-semibold text-[rgb(var(--dc-text-primary-rgb)/0.68)] shadow-[inset_0_1px_0_var(--dc-sheen)] transition hover:border-[rgb(var(--dc-primary-rgb)/0.3)] hover:bg-[rgb(var(--dc-primary-rgb)/0.09)] hover:text-[var(--dc-text-primary)] ${
        compact ? "h-9 w-9" : "min-h-10 px-3 text-xs"
      }`}
    >
      <Icon className="h-4 w-4" />
      {compact ? null : (
        <span>{pricesHidden ? "Prices hidden" : "Hide prices"}</span>
      )}
    </button>
  );
}
