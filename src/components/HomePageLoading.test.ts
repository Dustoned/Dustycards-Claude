import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePageLoading from "@/components/HomePageLoading";

describe("HomePageLoading", () => {
  it("renders an accessible, content-shaped Home fallback", () => {
    const markup = renderToStaticMarkup(createElement(HomePageLoading));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading your collection overview"');
    expect(markup).toContain("Your collection totals and market insights are loading.");
    expect(markup).toContain("home-insight-panels");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<button");
  });
});
