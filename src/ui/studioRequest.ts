/**
 * Opening the Studio or the Audio Bank from another page: the Library, the
 * Audio Bank, or a Patient's drawer. The request waits here until the page
 * takes it (in an effect, so StrictMode's second run finds nothing), and an
 * event tells the App which page to show.
 */
export type StudioRequest =
  /** Edit a Custom Audio in place: Save updates it. */
  | { kind: "edit"; audioId: string }
  /** Start a new design from a copy of a Custom Audio or Template. */
  | { kind: "copy"; audioId: string; madeFor: string | null }
  /** Start a new design, made for one Patient or general. */
  | { kind: "new"; madeFor: string | null };

export type RequestedPage = "studio" | "dashboard";

const EVENT = "swarasanti:open-page";

let studioRequest: StudioRequest | null = null;
let audioBankRequested = false;

function show(page: RequestedPage): void {
  window.dispatchEvent(new CustomEvent<RequestedPage>(EVENT, { detail: page }));
}

/** Show the Studio with `request` open. */
export function openInStudio(request: StudioRequest): void {
  studioRequest = request;
  show("studio");
}

/** Show the Dashboard on its Audio Bank tab. */
export function openAudioBank(): void {
  audioBankRequested = true;
  show("dashboard");
}

/** The Studio's waiting request, once. */
export function takeStudioRequest(): StudioRequest | null {
  const request = studioRequest;
  studioRequest = null;
  return request;
}

/** Whether the Audio Bank tab was asked for, once. */
export function takeAudioBankRequest(): boolean {
  const requested = audioBankRequested;
  audioBankRequested = false;
  return requested;
}

/** Call `listener` with the page each request shows; returns the unsubscribe. */
export function onPageRequest(listener: (page: RequestedPage) => void): () => void {
  const handle = (event: Event) => {
    if (event instanceof CustomEvent && (event.detail === "studio" || event.detail === "dashboard")) {
      listener(event.detail);
    }
  };
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
