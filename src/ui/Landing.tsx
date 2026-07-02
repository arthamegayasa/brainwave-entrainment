interface LandingProps {
  onEnter: () => void;
  onScience: () => void;
}

const STEPS = [
  {
    emoji: "🎯",
    title: "Choose a goal",
    body: "Deep sleep, meditation, focus, or calming anxiety — you pick the outcome, not a frequency number.",
  },
  {
    emoji: "🌊",
    title: "The sound guides you gradually",
    body: "A session isn't a static tone: the frequency eases down along a curve, accompanying your brain toward the target state.",
  },
  {
    emoji: "🎧",
    title: "Listen and let go",
    body: "Binaural beats on headphones or isochronic tones on speakers, blended with purely synthesized rain, ocean, and wind.",
  },
];

const FEATURES = [
  {
    title: "8 ready-made goal sessions",
    body: "From Deep Sleep to Power Nap — each session is designed with its own frequency curve and solfeggio carrier.",
  },
  {
    title: "Multi-layer Studio",
    body: "Build your own session like a sound designer: an entrainment method per layer, a harmonic frequency finder, a custom curve, export & share.",
  },
  {
    title: "Audio synthesized in real time",
    body: "No MP3 files — frequencies precise to 0.01 Hz, unlimited duration, and fully offline.",
  },
  {
    title: "Scientifically honest",
    body: "We separate strong evidence, early research, and tradition — complete with real study citations on the Science page.",
  },
];

export function Landing({ onEnter, onScience }: LandingProps) {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-orb" aria-hidden>
          <div className="orb-halo" />
          <div className="orb" />
          <div className="orb-ring" />
        </div>
        <h1>
          Find calm,
          <br />
          <em>one frequency</em> at a time
        </h1>
        <p className="landing-lede">
          Serenade synthesizes binaural beats, isochronic tones, solfeggio, and
          natural atmospheres — then guides them along a frequency curve
          designed for relaxation, sleep, and focus.
        </p>
        <div className="landing-cta">
          <button className="start-btn compact" onClick={onEnter}>
            Start a Free Session
          </button>
          <button className="pill-btn" onClick={onScience}>
            See the Science
          </button>
        </div>
        <p className="landing-note">
          Free, no account, right in your browser. Use headphones for the best
          experience.
        </p>
      </section>

      <section className="landing-steps">
        {STEPS.map((s) => (
          <div className="step-card" key={s.title}>
            <span className="emoji" aria-hidden>
              {s.emoji}
            </span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-features">
        <h2>Designed like an instrument, not just a playlist</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-honesty">
        <h2>Our claims are honest</h2>
        <p>
          Calming music and sound are proven to aid relaxation. Binaural beats
          show promising results for anxiety in early research — but the
          "brainwave entrainment" mechanism itself hasn't been consistently
          proven. We present all of it as it is, with real study citations —
          including the ones with mixed results.
        </p>
        <button className="pill-btn" onClick={onScience}>
          Read the research summary →
        </button>
      </section>
    </div>
  );
}
