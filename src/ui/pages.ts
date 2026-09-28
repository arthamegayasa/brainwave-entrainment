/**
 * The pages with their own address (ADR-027): a reload, a bookmark, or a
 * shared link opens the same page, and Back and Forward move between pages.
 * The Player and its sheets are layers over a page and keep its address
 * (`backNavigation.ts`); the Personal URL has its own path (ADR-016).
 */
export type Page =
  | "landing"
  | "home"
  | "library"
  | "dashboard"
  | "studio"
  | "science"
  | "upgrade"
  | "privacy";

/**
 * Each page's address, and the name its nav tab and browser tab show
 * (Landing keeps the title from index.html). Every path except "/" needs a
 * rewrite in vercel.json, or the host answers a reload there with a 404.
 */
export const PAGES: Record<Page, { path: string; name: string }> = {
  landing: { path: "/", name: "Home" },
  home: { path: "/sessions", name: "Sessions" },
  library: { path: "/library", name: "Library" },
  dashboard: { path: "/dashboard", name: "Dashboard" },
  studio: { path: "/studio", name: "Studio" },
  science: { path: "/science", name: "Science" },
  upgrade: { path: "/premium", name: "Premium" },
  privacy: { path: "/privacy", name: "Privacy policy" },
};

/** The page an address opens, with or without a trailing slash; null for any other path. */
export function pageAt(pathname: string): Page | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (Object.keys(PAGES) as Page[]).find((page) => PAGES[page].path === path) ?? null;
}
