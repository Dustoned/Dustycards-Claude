import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReadableInfoTooltip, {
  dismissReadableTooltipOnEscape,
} from "./ReadableInfoTooltip";

describe("ReadableInfoTooltip", () => {
  it("consumes Escape before closing an open tooltip", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const close = vi.fn();

    expect(
      dismissReadableTooltipOnEscape(
        { key: "Escape", preventDefault, stopPropagation },
        close
      )
    ).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores other keys", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const close = vi.fn();

    expect(
      dismissReadableTooltipOnEscape(
        { key: "Enter", preventDefault, stopPropagation },
        close
      )
    ).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps the accessible name concise instead of repeating the description", () => {
    const description = "Price direction from saved market history.";
    const markup = renderToStaticMarkup(
      createElement(ReadableInfoTooltip, { label: "Momentum", description })
    );

    expect(markup).toContain('aria-label="Momentum"');
    expect(markup).not.toContain(`aria-label="Momentum: ${description}"`);
  });
});
