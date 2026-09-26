import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Landing } from "./ui/Landing";
import { Home } from "./ui/Home";
import { Player, SessionComplete } from "./ui/Player";

// Dynamic on purpose: views off the pick-a-goal-and-listen path are
// code-split, so the first load only ships what starting a session needs.
const Builder = lazy(() => import("./ui/Builder").then((m) => ({ default: m.Builder })));
const Dashboard = lazy(() => import("./ui/Dashboard").then((m) => ({ default: m.Dashboard })));
const Library = lazy(() => import("./ui/Library").then((m) => ({ default: m.Library })));
const Science = lazy(() => import("./ui/Science").then((m) => ({ default: m.Science })));
const Privacy = lazy(() => import("./ui/Privacy").then((m) => ({ default: m.Privacy })));
const Upgrade = lazy(() => import("./ui/Upgrade").then((m) => ({ default: m.Upgrade })));
const PersonalUrl = lazy(() =>
  import("./ui/PersonalUrl").then((m) => ({ default: m.PersonalUrl })),
);
const AccountSheet = lazy(() =>
  import("./ui/Account").then((m) => ({ default: m.AccountSheet })),
);
import { useSession } from "./ui/useSession";
import { stopBuilderPlayback } from "./ui/builderEngine";
import { isAudioBlocked, resumeAudio, subscribeAudio } from "./ui/audioContext";
import type { SessionConfig } from "./audio/session";
import { useEntitlement } from "./lib/useEntitlement";
import { loadProgress, recordSessionCompleted } from "./state/progress";
import { parsePersonalUrlPath } from "../supabase/functions/_shared/accountRules.ts";

type View =
  | "landing"
  | "home"
  | "player"
  | "library"
  | "dashboard"
  | "studio"
  | "science"
  | "upgrade"
  | "privacy"
  | "personal";

/** A session counts as completed when at least 5 minutes were listened. */
const COMPLETION_MIN_SEC = 300;

function App() {
  // The Personal URL (/p/<username>, ADR-016) is the only view with its own
  // path; every other view lives in state.
  const [personalUrl] = useState(() => parsePersonalUrlPath(window.location.pathname));
  const [view, setView] = useState<View>(personalUrl === null ? "landing" : "personal");
  const [completed, setCompleted] = useState<{ presetName: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const activePresetRef = useRef<{ id: string; name: string } | null>(null);
  const ent = useEntitlement();
  const audioBlocked = useSyncExternalStore(subscribeAudio, isAudioBlocked);

  // Journey step 1 (goal gradient): discovering the app counts immediately.
  useEffect(() => {
    loadProgress();
  }, []);

  // Once the app leaves the Personal URL page, the address returns to "/", so
  // a reload opens the app as usual instead of the password page again.
  useEffect(() => {
    if (view !== "personal" && parsePersonalUrlPath(window.location.pathname) !== null) {
      window.history.replaceState(null, "", "/");
    }
  }, [view]);

  const session = useSession((endedAt) => {
    // Natural end — the engine finished the full session. Credit it at the
    // end on the audio clock, not whenever this poll callback finally runs:
    // a locked phone can hold the tab for hours, and an overnight sleep
    // session must not land on the next morning's streak day.
    const active = activePresetRef.current;
    if (active) {
      recordSessionCompleted(active.id, endedAt);
      setCompleted({ presetName: active.name });
      activePresetRef.current = null;
    }
    setView("home");
  });

  const handleStart = (config: SessionConfig) => {
    stopBuilderPlayback(); // one pair of ears: custom audio stops first
    setCompleted(null);
    session.start(config);
    activePresetRef.current = { id: config.preset.id, name: config.preset.name };
    setView("player");
  };

  const handleExit = () => {
    // Manual stop still counts when >= 5 minutes were listened (goal gradient).
    const active = activePresetRef.current;
    if (active && session.state.progress.elapsedSec >= COMPLETION_MIN_SEC) {
      recordSessionCompleted(active.id);
      setCompleted({ presetName: active.name });
    }
    activePresetRef.current = null;
    session.stop();
    setView("home");
  };

  // Library/Studio playback shares the user's ears with preset sessions:
  // starting custom audio stops the preset session (the reverse happens in
  // handleStart). Listening >= 5 minutes still earns the completion.
  const handleCustomAudioStarts = () => {
    const active = activePresetRef.current;
    if (
      active &&
      session.state.active &&
      session.state.progress.elapsedSec >= COMPLETION_MIN_SEC
    ) {
      recordSessionCompleted(active.id);
    }
    activePresetRef.current = null;
    if (session.state.active) session.stop();
  };

  // Dashboard + Studio appear in the nav only for clinicians/admins (D-06).
  const nav: Array<{ id: View; label: string }> = [
    { id: "home", label: "Sessions" },
    { id: "library", label: "Library" },
    ...(ent.isClinician
      ? [
          { id: "dashboard" as View, label: "Dashboard" },
          { id: "studio" as View, label: "Studio" },
        ]
      : []),
    { id: "science", label: "Science" },
    { id: "upgrade", label: "Premium" },
  ];

  const navCurrent = (id: View): boolean => {
    if (id === "home") return view === "home" || view === "player" || view === "landing";
    if (id === "library")
      return (
        view === "library" ||
        ((view === "studio" || view === "dashboard") && !ent.isClinician)
      );
    return view === id;
  };

  const goUpgrade = () => setView("upgrade");

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setView("landing")}
          aria-label="Serenade home"
        >
          <span className="mark" aria-hidden />
          Serenade
        </button>
        <nav className="topnav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={navCurrent(item.id) ? "current" : ""}
              onClick={() =>
                setView(
                  item.id === "home" && session.state.active ? "player" : item.id,
                )
              }
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          className="account-btn"
          aria-label="Account"
          onClick={() => setAccountOpen((v) => !v)}
        >
          {ent.signedIn && ent.accountName ? (
            ent.accountName.charAt(0).toUpperCase()
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6V21H4v-.5z" />
            </svg>
          )}
        </button>
      </header>

      {audioBlocked && (
        <div className="audio-paused" role="alert">
          <span>
            Your device paused the audio — a call, alarm, or another app took
            over. Your session is waiting where it stopped.
          </span>
          <button className="start-btn compact" onClick={resumeAudio}>
            Resume audio
          </button>
        </div>
      )}

      {view === "landing" && (
        <Landing onEnter={() => setView("home")} onScience={() => setView("science")} />
      )}
      {view === "home" &&
        (completed ? (
          <SessionComplete
            presetName={completed.presetName}
            onDone={() => setCompleted(null)}
          />
        ) : (
          <Home onStart={handleStart} onUpgrade={goUpgrade} />
        ))}
      {view === "player" && session.state.active && (
        <Player session={session} onExit={handleExit} />
      )}
      <Suspense fallback={null}>
        {view === "personal" && personalUrl !== null && (
          <PersonalUrl
            username={personalUrl.username}
            onEnter={() => setView("library")}
            onLeave={() => setView("landing")}
          />
        )}
        {view === "library" && (
          <Library
            onSignIn={() => setAccountOpen(true)}
            onBeforePlay={handleCustomAudioStarts}
          />
        )}
        {/* Non-clinicians landing on dashboard/studio get the Library (D-06 fallback). */}
        {view === "dashboard" &&
          (ent.isClinician ? (
            <Dashboard />
          ) : (
            <Library
              onSignIn={() => setAccountOpen(true)}
              onBeforePlay={handleCustomAudioStarts}
            />
          ))}
        {view === "studio" &&
          (ent.isClinician ? (
            <Builder onBeforePlay={handleCustomAudioStarts} />
          ) : (
            <Library
              onSignIn={() => setAccountOpen(true)}
              onBeforePlay={handleCustomAudioStarts}
            />
          ))}
        {view === "science" && <Science />}
        {view === "privacy" && <Privacy />}
        {view === "upgrade" && (
          <Upgrade
            onSignIn={() => setAccountOpen(true)}
            onOpenPrivacy={() => setView("privacy")}
          />
        )}

        {accountOpen && (
          <AccountSheet
            onClose={() => setAccountOpen(false)}
            onManagePlan={() => {
              setAccountOpen(false);
              setView("upgrade");
            }}
            onOpenPrivacy={() => {
              setAccountOpen(false);
              setView("privacy");
            }}
          />
        )}
      </Suspense>

      <footer className="foot">
        A relaxation &amp; meditation tool — not a medical device.{" "}
        <button className="link-btn" onClick={() => setView("science")}>
          Learn the science
        </button>{" "}
        ·{" "}
        <button className="link-btn" onClick={() => setView("privacy")}>
          Privacy policy
        </button>
      </footer>
    </div>
  );
}

export default App;
