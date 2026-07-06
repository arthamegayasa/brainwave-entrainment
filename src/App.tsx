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
import { Library } from "./ui/Library";
import { Science } from "./ui/Science";
import { Upgrade } from "./ui/Upgrade";
import { useSession } from "./ui/useSession";
import type { SessionConfig } from "./audio/session";
import { useEntitlement } from "./lib/useEntitlement";
import { loadProgress, recordSessionCompleted } from "./state/progress";

type View =
  | "landing"
  | "home"
  | "player"
  | "library"
  | "studio"
  | "science"
  | "upgrade";

/** A session counts as completed when at least 5 minutes were listened. */
const COMPLETION_MIN_SEC = 300;

function App() {
  const [view, setView] = useState<View>("landing");
  const [completed, setCompleted] = useState<{ presetName: string } | null>(null);
  const activePresetRef = useRef<{ id: string; name: string } | null>(null);
  const ent = useEntitlement();
  const role = ent.role;

  // Journey step 1 (goal gradient): discovering the app counts immediately.
  useEffect(() => {
    loadProgress();
  }, []);

  const session = useSession(() => {
    // Natural end — the engine finished the full session.
    const active = activePresetRef.current;
    if (active) {
      recordSessionCompleted(active.id);
      setCompleted({ presetName: active.name });
      activePresetRef.current = null;
    }
    setView("home");
  });

  const handleStart = async (config: SessionConfig) => {
    activePresetRef.current = { id: config.preset.id, name: config.preset.name };
    setCompleted(null);
    await session.start(config);
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

  // Studio appears in the nav only for admins (D-04).
  const nav: Array<{ id: View; label: string }> = [
    { id: "home", label: "Sessions" },
    { id: "library", label: "Library" },
    ...(role === "admin" ? [{ id: "studio" as View, label: "Studio" }] : []),
    { id: "science", label: "Science" },
    { id: "upgrade", label: "Premium" },
  ];

  const navCurrent = (id: View): boolean => {
    if (id === "home") return view === "home" || view === "player" || view === "landing";
    if (id === "library") return view === "library" || (view === "studio" && role !== "admin");
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
      {view === "library" && <Library onUpgrade={goUpgrade} />}
      {/* Non-admins landing on the studio view get the Library (D-04 fallback). */}
      {view === "studio" &&
        (role === "admin" ? <Builder /> : <Library onUpgrade={goUpgrade} />)}
      {view === "science" && <Science />}
      {view === "upgrade" && <Upgrade />}

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
