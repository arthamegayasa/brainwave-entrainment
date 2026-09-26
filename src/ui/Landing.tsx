import { SceneArt } from "./SceneArt";

interface LandingProps {
  onEnter: () => void;
  onScience: () => void;
}

const STEPS = [
  {
    sceneId: "deep-sleep",
    title: "Choose a goal",
    body: "Sleeping, meditating, focusing, or calming anxiety — you pick the outcome, not a frequency number.",
  },
  {
    sceneId: "deep-meditation",
    title: "The sound guides you gradually",
    body: "A session isn't a static tone: the frequency eases down along a curve, accompanying your brain toward the target state.",
  },
  {
    sceneId: "focus",
    title: "Listen and let go",
    body: "Binaural beats on headphones or isochronic tones on speakers, blended with purely synthesized rain, ocean, and wind.",
  },
] satisfies { sceneId: string; title: string; body: string }[];

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
      <section className="landing-hero" data-parallax>
        <div className="landing-copy">
          <span className="landing-eyebrow">A space to slow down</span>
          <h1>
            Find your
            <br />
            <em>quiet horizon.</em>
          </h1>
          <p className="landing-lede">
            Choose a goal. SwaraSanti shapes binaural beats, ambient sound, and a
            gradual listening journey around it — live in your browser.
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
        </div>
        <div className="landing-scene">
          <SceneArt sceneId="landing" variant="hero" />
        </div>
      </section>

      <section className="landing-steps">
        {STEPS.map((s) => (
          <div className="step-card" key={s.title} data-parallax>
            <SceneArt sceneId={s.sceneId} variant="step" />
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
        <h2>Backed by research</h2>
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
