import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";
import { useEffect, useRef, useState } from "react";
import { Landing } from "./ui/Landing";
import { Home } from "./ui/Home";
import { Player, SessionComplete } from "./ui/Player";
import { Builder } from "./ui/Builder";
import { Dashboard } from "./ui/Dashboard";
import { Library } from "./ui/Library";
import { Science } from "./ui/Science";
import { Upgrade } from "./ui/Upgrade";
import { AccountSheet } from "./ui/Account";
import { useSession } from "./ui/useSession";
import { stopBuilderPlayback } from "./ui/builderEngine";
import type { SessionConfig } from "./audio/session";
import { useEntitlement } from "./lib/useEntitlement";
import { loadProgress, recordSessionCompleted } from "./state/progress";

type View =
  | "landing"
  | "home"
  | "player"
  | "library"
  | "dashboard"
  | "studio"
  | "science"
  | "upgrade";

/** A session counts as completed when at least 5 minutes were listened. */
const COMPLETION_MIN_SEC = 300;

function App() {
  const [view, setView] = useState<View>("landing");
  const [completed, setCompleted] = useState<{ presetName: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const activePresetRef = useRef<{
    id: string;
    name: string;
    /** Epoch ms of the scheduled end for timed sessions (null = infinite). */
    endsAt: number | null;
  } | null>(null);
  const ent = useEntitlement();

  // Journey step 1 (goal gradient): discovering the app counts immediately.
  useEffect(() => {
    loadProgress();
  }, []);

  const session = useSession(() => {
    // Natural end — the engine finished the full session.
    const active = activePresetRef.current;
    if (active) {
      // Credit timed sessions at their scheduled end, not at whenever this
      // poll callback finally runs: on a locked phone the tab can stay
      // suspended for hours past the real end, and an overnight sleep session
      // must not land on the next morning's streak day.
      const at =
        active.endsAt === null
          ? new Date()
          : new Date(Math.min(Date.now(), active.endsAt));
      recordSessionCompleted(active.id, at);
      setCompleted({ presetName: active.name });
      activePresetRef.current = null;
    }
    setView("home");
  });

  const handleStart = async (config: SessionConfig) => {
    stopBuilderPlayback(); // one pair of ears: custom audio stops first
    setCompleted(null);
    await session.start(config);
    // Assign the ref only after start() resolves: the old session's natural
    // end can fire mid-await, and it must credit the OLD preset, not this one.
    activePresetRef.current = {
      id: config.preset.id,
      name: config.preset.name,
      endsAt:
        config.durationMin === null
          ? null
          : Date.now() + config.durationMin * 60_000,
    };
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
          {ent.email ? (
            ent.email.charAt(0).toUpperCase()
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6V21H4v-.5z" />
            </svg>
          )}
        </button>
      </header>

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
          <Home onStart={(c) => void handleStart(c)} onUpgrade={goUpgrade} />
        ))}
      {view === "player" && session.state.active && (
        <Player session={session} onExit={handleExit} />
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
      {view === "upgrade" && <Upgrade onSignIn={() => setAccountOpen(true)} />}

      {accountOpen && (
        <AccountSheet
          onClose={() => setAccountOpen(false)}
          onManagePlan={() => {
            setAccountOpen(false);
            setView("upgrade");
          }}
          onOpenLibrary={() => {
            setAccountOpen(false);
            setView("library");
          }}
        />
      )}

      <footer className="foot">
        A relaxation &amp; meditation tool — not a medical device.{" "}
        <button className="link-btn" onClick={() => setView("science")}>
          Learn the science
        </button>
      </footer>
    </div>
  );
}

export default App;
