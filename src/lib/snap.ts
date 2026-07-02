import { MIDTRANS_CLIENT_KEY, MIDTRANS_IS_SANDBOX } from "./supabase";

/** Midtrans Snap.js result callbacks (subset we use). */
export interface SnapCallbacks {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}

interface SnapGlobal {
  pay: (token: string, callbacks?: SnapCallbacks) => void;
}

declare global {
  interface Window {
    snap?: SnapGlobal;
  }
}

let loadPromise: Promise<void> | null = null;

/** Lazily inject Snap.js with the (public) client key. */
export function loadSnap(): Promise<void> {
  if (window.snap) return Promise.resolve();
  if (loadPromise) return loadPromise;
  if (!MIDTRANS_CLIENT_KEY) return Promise.reject(new Error("Midtrans client key missing"));
  const clientKey = MIDTRANS_CLIENT_KEY;

  const src = MIDTRANS_IS_SANDBOX
    ? "https://app.sandbox.midtrans.com/snap/snap.js"
    : "https://app.midtrans.com/snap/snap.js";

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.setAttribute("data-client-key", clientKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Snap.js"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function openSnap(token: string, callbacks?: SnapCallbacks): void {
  window.snap?.pay(token, callbacks);
}
