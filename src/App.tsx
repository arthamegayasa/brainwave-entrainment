import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";
import { useState } from "react";
import { Home } from "./ui/Home";
import { Player } from "./ui/Player";
import { Builder } from "./ui/Builder";
import { useSession } from "./ui/useSession";
import type { SessionConfig } from "./audio/session";

type View = "home" | "player" | "studio";

function App() {
  const [view, setView] = useState<View>("home");
  const session = useSession(() => setView("home"));

  const handleStart = async (config: SessionConfig) => {
    await session.start(config);
    setView("player");
  };

  const handleExit = () => {
    session.stop();
    setView("home");
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden />
          Serenade
        </div>
        <nav className="topnav">
          <button
            className={view === "home" || view === "player" ? "current" : ""}
            onClick={() => setView(session.state.active ? "player" : "home")}
          >
            Sesi
          </button>
          <button
            className={view === "studio" ? "current" : ""}
            onClick={() => setView("studio")}
          >
            Studio
          </button>
        </nav>
      </header>

      {view === "home" && <Home onStart={(c) => void handleStart(c)} />}
      {view === "player" && session.state.active && (
        <Player session={session} onExit={handleExit} />
      )}
      {view === "studio" && <Builder />}

      <footer className="foot">
        Alat relaksasi & meditasi — bukan perangkat medis.
      </footer>
    </div>
  );
}

export default App;
