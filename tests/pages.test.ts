import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGES, pageAt } from "../src/ui/pages";
import type { Page } from "../src/ui/pages";

const pages = Object.keys(PAGES) as Page[];

describe("page addresses", () => {
  it("each page's address opens it, with or without a trailing slash; other paths open none", () => {
    for (const page of pages) {
      expect(pageAt(PAGES[page].path)).toBe(page);
      expect(pageAt(`${PAGES[page].path}/`)).toBe(page);
    }
    expect(pageAt("/player")).toBeNull();
    expect(pageAt("/p/ivan-moon")).toBeNull();
    expect(pageAt("/library/extra")).toBeNull();
    expect(pageAt("/Library")).toBeNull();
  });

  // `vite preview` answers any path with the app, so only this catches a page
  // the host would answer with a 404 on a reload or a shared link.
  it("the host serves the app at every page's address", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const served = vercel.rewrites
      .filter((rewrite) => rewrite.destination === "/index.html")
      .map((rewrite) => rewrite.source);
    for (const page of pages) {
      if (PAGES[page].path !== "/") expect(served).toContain(PAGES[page].path);
    }
  });
});
