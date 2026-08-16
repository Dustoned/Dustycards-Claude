import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModalCardData } from "@/components/card-modal/types";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  cardModalProps: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/CardModal", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.cardModalProps = props;
    return createElement("div", { "data-testid": "shared-card-detail" });
  },
}));

import CardDetailRoutePage from "@/components/CardDetailRoutePage";

const card = {
  id: "card-1",
  game: "pokemon",
  name: "Eevee",
} as ModalCardData;

describe("CardDetailRoutePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cardModalProps = null;
  });

  it("uses the central CardModal and keeps in-detail links independent from Back", () => {
    const html = renderToStaticMarkup(
      createElement(CardDetailRoutePage, {
        card,
        backHref: "/movers/signal-radar?game=pokemon",
        backLabel: "Back to Signal Radar",
      }),
    );

    expect(html).toContain("data-testid=\"shared-card-detail\"");
    expect(mocks.cardModalProps).toMatchObject({
      card,
      backLabel: "Back to Signal Radar",
      onClose: expect.any(Function),
      onNavigate: expect.any(Function),
    });

    (mocks.cardModalProps?.onNavigate as () => void)();
    expect(mocks.replace).not.toHaveBeenCalled();
    (mocks.cardModalProps?.onClose as () => void)();
    expect(mocks.replace).toHaveBeenCalledWith(
      "/movers/signal-radar?game=pokemon",
    );
  });
});
