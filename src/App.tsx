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
import { stopPlay, subscribeNowPlaying, useNowPlaying } from "./ui/nowPlaying";
import { isAudioBlocked, resumeAudio, subscribeAudio } from "./ui/audioContext";
import type { SessionConfig } from "./audio/session";
import { useEntitlement } from "./lib/useEntitlement";
import { loadProgress } from "./state/progress";
import { startListeningSync } from "./lib/listening";
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

function App() {
  // The Personal URL (/p/<username>, ADR-016) is the only view with its own
  // path; every other view lives in state.
  const [personalUrl] = useState(() => parsePersonalUrlPath(window.location.pathname));
  const [view, setView] = useState<View>(personalUrl === null ? "landing" : "personal");
  const [completed, setCompleted] = useState<{ presetName: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const ent = useEntitlement();
  const audioBlocked = useSyncExternalStore(subscribeAudio, isAudioBlocked);
  const session = useSession();
  const presetPlaying = useNowPlaying()?.audio.kind === "preset";

  // Journey step 1 (goal gradient): discovering the app counts immediately.
  useEffect(() => {
    loadProgress();
  }, []);

  // Listening History (ADR-017): Plays and Downloads of the signed-in User
  // queued on this device go to the server now and whenever it is back online.
  useEffect(() => startListeningSync(), []);

  // Once the app leaves the Personal URL page, the address returns to "/", so
  // a reload opens the app as usual instead of the password page again.
  useEffect(() => {
    if (view !== "personal" && parsePersonalUrlPath(window.location.pathname) !== null) {
      window.history.replaceState(null, "", "/");
    }
  }, [view]);

  // A Preset Play that ends naturally, or is ended from the Player, returns
  // to Sessions; the completion card shows when it counts as a completed
  // session. Now Playing has already credited the weekly streak.
  useEffect(
    () =>
      subscribeNowPlaying((event) => {
        if (event.type !== "stop" && event.type !== "end") return;
        const { audio, naturalEnd, completedAt } = event.ending;
        if (audio.kind !== "preset" || (!naturalEnd && viewRef.current !== "player")) return;
        if (completedAt) setCompleted({ presetName: audio.name });
        setView("home");
      }),
    [],
  );

  const handleStart = (config: SessionConfig) => {
    stopBuilderPlayback(); // one pair of ears: custom audio and Studio previews stop first
    setCompleted(null);
    session.start(config);
    setView("player");
  };

  // Dashboard + Studio appear in the nav only for clinicians/admins.
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
    <div className={`shell${view === "player" && presetPlaying ? " shell-player" : ""}`}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setView("landing")}
          aria-label="SwaraSanti home"
        >
          <span className="mark" aria-hidden />
          SwaraSanti
        </button>
        <nav className="topnav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={navCurrent(item.id) ? "current" : ""}
              onClick={() =>
                setView(
                  item.id === "home" && presetPlaying ? "player" : item.id,
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

      {audioBlocked && view !== "player" && (
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
      {view === "player" && presetPlaying && <Player session={session} />}
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
            onBeforePlay={stopPlay}
          />
        )}
        {/* Non-clinicians landing on dashboard/studio get the Library (fallback). */}
        {view === "dashboard" &&
          (ent.isClinician ? (
            <Dashboard />
          ) : (
            <Library
              onSignIn={() => setAccountOpen(true)}
              onBeforePlay={stopPlay}
            />
          ))}
        {view === "studio" &&
          (ent.isClinician ? (
            <Builder onBeforePlay={stopPlay} />
          ) : (
            <Library
              onSignIn={() => setAccountOpen(true)}
              onBeforePlay={stopPlay}
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
        A relaxation &amp; meditation tool.{" "}
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
