interface Citation {
  ref: string;
  finding: string;
  note: string;
  url: string;
}

interface Section {
  tier: "supported" | "promising" | "tradition";
  heading: string;
  intro: string;
  citations: Citation[];
}

const TIER_LABELS: Record<Section["tier"], string> = {
  supported: "Well supported",
  promising: "Promising · not certain",
  tradition: "Tradition · not validated science",
};

const SECTIONS: Section[] = [
  {
    tier: "supported",
    heading: "Sound & music for relaxation",
    intro:
      "The strongest evidence: listening to calming music and sound helps lower stress and anxiety. This is the honest foundation of what Serenade does.",
    citations: [
      {
        ref: "de Witte et al. (2020), Health Psychology Review",
        finding:
          "Meta-analysis of ~104 RCTs: music interventions significantly reduced stress, both physiological (cortisol, heart rate) and psychological.",
        note: "Strong evidence for music in general — not specific to binaural beats.",
        url: "https://pubmed.ncbi.nlm.nih.gov/31167611/",
      },
      {
        ref: "Harney et al. (2023), Psychology of Music",
        finding:
          "A review of 24 controlled studies supports music listening as an effective way to reduce anxiety.",
        note: "Effect sizes vary by context; the evidence is heterogeneous.",
        url: "https://journals.sagepub.com/doi/10.1177/10298649211046979",
      },
      {
        ref: "RAS meta-analysis in Parkinson's (2022), Frontiers in Neurology",
        finding:
          "Rhythmic auditory stimulation improved walking speed in Parkinson's patients — evidence that brain and body synchronize to auditory rhythm.",
        note: "A different application (movement synchronization), not entrainment for mood.",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9053573/",
      },
    ],
  },
  {
    tier: "promising",
    heading: "Binaural beats & auditory beat stimulation",
    intro:
      "Several studies show binaural beats help with anxiety and cognition. But whether they truly 'entrain' brainwaves is still debated.",
    citations: [
      {
        ref: "Garcia-Argibay et al. (2019), Psychological Research",
        finding:
          "Meta-analysis of 22 studies found a moderate overall effect (g = 0.45); the strongest anti-anxiety effect was in the theta/delta range.",
        note: "The strongest supporting evidence, but the number of anxiety studies is small.",
        url: "https://pubmed.ncbi.nlm.nih.gov/30073406/",
      },
      {
        ref: "Padmanabhan et al. (2005), Anaesthesia",
        finding:
          "RCT: pre-operative anxiety dropped 26% in the binaural-beat group vs 11% for plain audio vs 4% with no intervention.",
        note: "Small sample, specific context (acute pre-surgery anxiety).",
        url: "https://pubmed.ncbi.nlm.nih.gov/16115248/",
      },
      {
        ref: "Ingendoh et al. (2023), PLOS ONE — the critical view",
        finding:
          "A review of 14 EEG studies: 5 support entrainment, 8 contradict it, 1 mixed. The core mechanism isn't consistently proven.",
        note: "The most important citation: the felt effect may come via calming music, expectation, or slowed breathing — not neural entrainment.",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10198548/",
      },
      {
        ref: "Iaccarino (2016, Nature) & Martorell (2019, Cell) — 40 Hz gamma",
        finding:
          "40 Hz stimulation reduced Alzheimer's pathology and improved memory in mouse models.",
        note: "MOUSE models, intense light+sound for Alzheimer's pathology. Not evidence that 40 Hz audio gives neurological benefits to healthy humans.",
        url: "https://www.cell.com/cell/fulltext/S0092-8674(19)30163-1",
      },
    ],
  },
  {
    tier: "tradition",
    heading: "Solfeggio & Schumann resonance",
    intro:
      "We include these frequencies because they're often requested — but honestly: both are rooted in tradition/folklore, not validated science.",
    citations: [
      {
        ref: "Solfeggio (e.g. 528 Hz) — Akimoto et al. (2018), Health (SCIRP)",
        finding:
          "A small study (n=9) reported 528 Hz music lowered cortisol compared to 440 Hz tuning.",
        note: "The origin of solfeggio is modern folklore (proposed by Joseph Puleo in the 1990s), not ancient tradition. Tiny sample, low-impact journal, not replicated. 'DNA repair' claims are baseless.",
        url: "https://www.scirp.org/journal/paperinformation?paperid=87146",
      },
      {
        ref: "Schumann resonance (7.83 Hz)",
        finding:
          "The Earth-ionosphere electromagnetic resonance is real physics; its correlation with human physiology is very weak.",
        note: "Claims of 'aligning the brain / healing' are wellness speculation, not this app's mechanism.",
        url: "https://en.wikipedia.org/wiki/Schumann_resonances",
      },
    ],
  },
];

export function Science() {
  return (
    <div className="science">
      <header className="science-head">
        <h1>The science behind Serenade</h1>
        <p>
          We honestly separate three levels of evidence — what's well
          supported, what's still early research, and what's pure tradition.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <section className={`science-section tier-${section.tier}`} key={section.heading}>
          <span className="tier-badge">{TIER_LABELS[section.tier]}</span>
          <h2>{section.heading}</h2>
          <p className="section-intro">{section.intro}</p>
          <div className="cite-list">
            {section.citations.map((c) => (
              <article className="cite" key={c.ref}>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="cite-ref">
                  {c.ref} ↗
                </a>
                <p className="cite-finding">{c.finding}</p>
                <p className="cite-note">{c.note}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <aside className="disclaimer">
        <strong>Important.</strong> This audio content is intended for
        relaxation, focus, and comfort. It is not a medical device and is not
        meant to diagnose, treat, cure, or prevent any disease. If you
        experience anxiety, sleep problems, or other health conditions, consult
        a professional. Claims about specific frequencies (e.g. solfeggio,
        Schumann resonance) are rooted in tradition and have not been
        scientifically validated.
      </aside>
    </div>
  );
}
