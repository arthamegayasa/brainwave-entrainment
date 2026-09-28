import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Landing } from "./ui/Landing";
import { Home } from "./ui/Home";
import { Player, SessionComplete } from "./ui/Player";
import { MiniPlayer } from "./ui/MiniPlayer";

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
import { goToAddress, subscribeAddress, useBackLayer } from "./ui/backNavigation";
import { PAGES, pageAt } from "./ui/pages";
import type { Page } from "./ui/pages";
import type { SessionConfig } from "./audio/session";
import type { AudioKind } from "./state/listening";
import { useEntitlement } from "./lib/useEntitlement";
import { loadProgress } from "./state/progress";
import { startListeningSync } from "./lib/listening";
import { parsePersonalUrlPath } from "../supabase/functions/_shared/accountRules.ts";

/** A page, or a view without an address of its own: the Player shows over a page. */
type View = Page | "player" | "personal";

/** Landing's browser tab title, from index.html; other pages show their name. */
const HOME_TITLE = document.title;

/** The view an address opens: its page, the Personal URL (ADR-016), or Landing for any other path. */
function viewAt(pathname: string): View {
  return pageAt(pathname) ?? (parsePersonalUrlPath(pathname) !== null ? "personal" : "landing");
}

/** A view where Plays are chosen. */
type ChoiceView = "home" | "library";

/**
 * The view where a Play of this kind is chosen: Sessions for a Preset, the
 * Library for Custom Audio and saved sessions. Its Player belongs to that
 * tab, and it returns there when it ends.
 */
function chosenIn(kind: AudioKind): ChoiceView {
  return kind === "preset" ? "home" : "library";
}

function App() {
  const [personalUrl] = useState(() => parsePersonalUrlPath(window.location.pathname));
  const [view, setView] = useState<View>(() => viewAt(window.location.pathname));
  /** The completion card, shown in the view where its Play was chosen until dismissed. */
  const [completed, setCompleted] = useState<{ name: string; view: ChoiceView } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const ent = useEntitlement();
  const session = useSession();
  const play = useNowPlaying();
  /** Where ⌄ and Back return: the view the Player was opened from. */
  const playerFrom = useRef<Exclude<View, "player">>("home");
  /** The page on screen, or the Personal URL; the Player keeps the one it was opened from. */
  const shown = view === "player" ? playerFrom.current : view;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  /** Set by a redirect: the page it leaves must not stay in the history. */
  const replaceEntry = useRef(false);

  // Journey step 1 (goal gradient): discovering the app counts immediately.
  useEffect(() => {
    loadProgress();
  }, []);

  // Listening History (ADR-017): Plays and Downloads of the signed-in User
  // queued on this device go to the server now and whenever it is back online.
  useEffect(() => startListeningSync(), []);

  // The address and the browser tab follow the page on screen (ADR-027). An
  // address that names no page (the Personal URL, a mistyped path) or names
  // it another way ("/library/") gives way in place, so neither Back nor a
  // reload returns to it; the Personal URL page keeps its own.
  useEffect(() => {
    document.title =
      shown === "landing" || shown === "personal" ? HOME_TITLE : `${PAGES[shown].name} — SwaraSanti`;
    if (shown === "personal") return;
    const here = window.location.pathname;
    const named = Object.values(PAGES).some(({ path }) => path === here);
    goToAddress(PAGES[shown].path, replaceEntry.current || !named);
    replaceEntry.current = false;
  }, [shown]);

  // Back or Forward onto another page's entry shows that page. Layer entries
  // carry the address of the page under them, so Back through a sheet or the
  // Player changes nothing here.
  useEffect(
    () =>
      subscribeAddress((pathname) => {
        const next = viewAt(pathname);
        if (next !== shownRef.current) setView(next);
      }),
    [],
  );

  // A Clinician page opened without Clinician powers (a shared link, a role
  // taken away) gives way to the Library once the account is known.
  useEffect(() => {
    if ((view === "dashboard" || view === "studio") && !ent.loading && !ent.isClinician) {
      replaceEntry.current = true;
      setView("library");
    }
  }, [view, ent.loading, ent.isClinician]);

  // A Play that ends naturally, or is ended from the Player, returns to where
  // it was chosen: Sessions for a Preset, the Library for Custom Audio. The
  // completion card shows when it counts as a completed session; Now Playing
  // has already credited the weekly streak.
  useEffect(
    () =>
      subscribeNowPlaying((event) => {
        if (event.type !== "stop" && event.type !== "end") return;
        const { audio, naturalEnd, completedAt } = event.ending;
        if (!naturalEnd && viewRef.current !== "player") return;
        const chosen = chosenIn(audio.kind);
        setCompleted(completedAt ? { name: audio.name, view: chosen } : null);
        setView(chosen);
      }),
    [],
  );

  const openPlayer = () => {
    if (viewRef.current !== "player") playerFrom.current = viewRef.current;
    setView("player");
  };

  /** The Player shrinks into the Mini-player; the Play keeps playing. */
  const minimizePlayer = () => setView(playerFrom.current);
  useBackLayer(view === "player", minimizePlayer);

  const handleStart = (config: SessionConfig) => {
    stopBuilderPlayback(); // one pair of ears: custom audio and Studio previews stop first
    setCompleted(null);
    session.start(config);
    openPlayer();
  };

  // The running Play follows the User through the app, except on its own
  // Player and on Landing.
  const miniPlayer = play !== null && view !== "player" && view !== "landing";

  // Dashboard + Studio appear in the nav only for clinicians/admins.
  const nav: Page[] = [
    "home",
    "library",
    ...(ent.isClinician ? (["dashboard", "studio"] as const) : []),
    "science",
    "upgrade",
  ];

  const navCurrent = (id: View): boolean => {
    if (view === "player") return play !== null && id === chosenIn(play.audio.kind);
    if (id === "home") return view === "home" || view === "landing";
    if (id === "library")
      return (
        view === "library" ||
        ((view === "studio" || view === "dashboard") && !ent.isClinician)
      );
    return view === id;
  };

  const goUpgrade = () => setView("upgrade");

  const completionCard = completed && (
    <SessionComplete
      name={completed.name}
      doneLabel={completed.view === "home" ? "Back to sessions" : "Back to Library"}
      onDone={() => setCompleted(null)}
    />
  );
  const library = (
    <Library
      onSignIn={() => setAccountOpen(true)}
      onBeforePlay={stopPlay}
      onOpenPlayer={openPlayer}
    />
  );

  return (
    <div
      className={`shell${view === "player" && play !== null ? " shell-player" : ""}${
        miniPlayer ? " shell-mini-player" : ""
      }`}
    >
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
          {nav.map((id) => (
            <button
              key={id}
              className={navCurrent(id) ? "current" : ""}
              onClick={() => setView(id)}
            >
              {PAGES[id].name}
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

      {view === "landing" && (
        <Landing onEnter={() => setView("home")} onScience={() => setView("science")} />
      )}
      {view === "home" &&
        (completed?.view === "home" ? (
          completionCard
        ) : (
          <Home onStart={handleStart} onUpgrade={goUpgrade} />
        ))}
      {view === "player" && play !== null && (
        <Player session={session} onMinimize={minimizePlayer} />
      )}
      <Suspense fallback={null}>
        {view === "personal" && personalUrl !== null && (
          <PersonalUrl
            username={personalUrl.username}
            onEnter={() => setView("library")}
            onLeave={() => setView("landing")}
          />
        )}
        {view === "library" && (completed?.view === "library" ? completionCard : library)}
        {/* Until the account is known, non-clinicians on dashboard/studio see the Library. */}
        {view === "dashboard" && (ent.isClinician ? <Dashboard /> : library)}
        {view === "studio" && (ent.isClinician ? <Builder onBeforePlay={stopPlay} /> : library)}
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

      {miniPlayer && <MiniPlayer onOpen={openPlayer} />}
    </div>
  );
}

export default App;
