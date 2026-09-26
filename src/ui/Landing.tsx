interface LandingProps {
  onEnter: () => void;
  onScience: () => void;
}

const STEPS = [
  {
    emoji: "🎯",
    title: "Choose a goal",
    body: "Sleeping, meditating, focusing, or calming anxiety — you pick the outcome, not a frequency number.",
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
    body: "From Sleeping to Power Nap — each session is designed with its own frequency curve and solfeggio carrier.",
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
    body: "Real study citations for every kind of sound we play — including the mixed results — on the Science page.",
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
          SwaraSanti synthesizes binaural beats, isochronic tones, solfeggio, and
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
        <h2>Grounded in research</h2>
        <p>
          Our audio is grounded in published research on how sound can
          influence brain activity and well-being. Studies have shown that
          calming music can support relaxation, while auditory stimulation,
          including binaural beats, may help reduce anxiety and improve focus.
          We provide citations to the studies behind our audio so you can
          explore the evidence yourself.
        </p>
        <button className="pill-btn" onClick={onScience}>
          Read the research summary →
        </button>
      </section>
    </div>
  );
}
