import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";
import { useState } from "react";
import { Landing } from "./ui/Landing";
import { Home } from "./ui/Home";
import { Player } from "./ui/Player";
import { Builder } from "./ui/Builder";
import { Science } from "./ui/Science";
import { Upgrade } from "./ui/Upgrade";
import { useSession } from "./ui/useSession";
import type { SessionConfig } from "./audio/session";

type View = "landing" | "home" | "player" | "studio" | "science" | "upgrade";

const NAV: Array<{ id: View; label: string }> = [
  { id: "home", label: "Sesi" },
  { id: "studio", label: "Studio" },
  { id: "science", label: "Sains" },
  { id: "upgrade", label: "Premium" },
];

function App() {
  const [view, setView] = useState<View>("landing");
  const session = useSession(() => setView("home"));

  const handleStart = async (config: SessionConfig) => {
    await session.start(config);
    setView("player");
  };

  const handleExit = () => {
    session.stop();
    setView("home");
  };

  const navCurrent = (id: View): boolean => {
    if (id === "home") return view === "home" || view === "player" || view === "landing";
    return view === id;
  };

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setView("landing")}
          aria-label="Serenade beranda"
        >
          <span className="mark" aria-hidden />
          Serenade
        </button>
        <nav className="topnav">
          {NAV.map((item) => (
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
      {view === "home" && <Home onStart={(c) => void handleStart(c)} />}
      {view === "player" && session.state.active && (
        <Player session={session} onExit={handleExit} />
      )}
      {view === "studio" && <Builder />}
      {view === "science" && <Science />}
      {view === "upgrade" && <Upgrade />}

      <footer className="foot">
        Alat relaksasi &amp; meditasi — bukan perangkat medis.{" "}
        <button className="link-btn" onClick={() => setView("science")}>
          Pelajari sainsnya
        </button>
      </footer>
    </div>
  );
}

export default App;
