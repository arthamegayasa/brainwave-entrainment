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
  supported: "Terdukung baik",
  promising: "Menjanjikan · belum pasti",
  tradition: "Tradisi · bukan sains tervalidasi",
};

const SECTIONS: Section[] = [
  {
    tier: "supported",
    heading: "Suara & musik untuk relaksasi",
    intro:
      "Bukti terkuat: mendengarkan musik dan suara menenangkan membantu menurunkan stres dan kecemasan. Ini fondasi jujur dari apa yang Serenade lakukan.",
    citations: [
      {
        ref: "de Witte dkk. (2020), Health Psychology Review",
        finding:
          "Meta-analisis ~104 RCT: intervensi musik menurunkan stres secara signifikan, baik fisiologis (kortisol, denyut jantung) maupun psikologis.",
        note: "Bukti kuat untuk musik secara umum — bukan khusus binaural beats.",
        url: "https://pubmed.ncbi.nlm.nih.gov/31167611/",
      },
      {
        ref: "Harney dkk. (2023), Psychology of Music",
        finding:
          "Review 24 studi terkontrol mendukung mendengarkan musik sebagai cara efektif menurunkan kecemasan.",
        note: "Besaran efek bervariasi menurut konteks; buktinya heterogen.",
        url: "https://journals.sagepub.com/doi/10.1177/10298649211046979",
      },
      {
        ref: "Meta-analisis RAS pada Parkinson (2022), Frontiers in Neurology",
        finding:
          "Stimulasi ritmik auditori memperbaiki kecepatan berjalan pasien Parkinson — bukti otak & tubuh menyelaraskan diri dengan ritme suara.",
        note: "Aplikasi berbeda (sinkronisasi gerak), bukan entrainment untuk mood.",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9053573/",
      },
    ],
  },
  {
    tier: "promising",
    heading: "Binaural beats & stimulasi beat auditori",
    intro:
      "Beberapa studi menunjukkan binaural beats membantu kecemasan dan kognisi. Tetapi apakah ia benar-benar 'meng-entrain' gelombang otak masih diperdebatkan.",
    citations: [
      {
        ref: "Garcia-Argibay dkk. (2019), Psychological Research",
        finding:
          "Meta-analisis 22 studi menemukan efek keseluruhan sedang (g = 0.45); efek anti-kecemasan terkuat di rentang theta/delta.",
        note: "Bukti pendukung terkuat, tapi jumlah studi kecemasan masih kecil.",
        url: "https://pubmed.ncbi.nlm.nih.gov/30073406/",
      },
      {
        ref: "Padmanabhan dkk. (2005), Anaesthesia",
        finding:
          "RCT: kecemasan pra-operasi turun 26% pada grup binaural beat vs 11% audio biasa vs 4% tanpa intervensi.",
        note: "Sampel kecil, konteks spesifik (kecemasan akut pra-bedah).",
        url: "https://pubmed.ncbi.nlm.nih.gov/16115248/",
      },
      {
        ref: "Ingendoh dkk. (2023), PLOS ONE — sisi kritis",
        finding:
          "Review 14 studi EEG: 5 mendukung entrainment, 8 kontradiktif, 1 campuran. Mekanisme inti belum terbukti konsisten.",
        note: "Sitasi paling penting: efek yang dirasakan mungkin lewat musik menenangkan, ekspektasi, atau napas melambat — bukan entrainment saraf.",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10198548/",
      },
      {
        ref: "Iaccarino (2016, Nature) & Martorell (2019, Cell) — 40 Hz gamma",
        finding:
          "Stimulasi 40 Hz mengurangi patologi Alzheimer dan memperbaiki memori pada model tikus.",
        note: "Model TIKUS, cahaya+suara intensif untuk patologi Alzheimer. Bukan bukti bahwa audio 40 Hz memberi manfaat neurologis pada manusia sehat.",
        url: "https://www.cell.com/cell/fulltext/S0092-8674(19)30163-1",
      },
    ],
  },
  {
    tier: "tradition",
    heading: "Solfeggio & Schumann resonance",
    intro:
      "Kami menyertakan frekuensi ini karena sering diminta — tetapi jujur: keduanya berakar pada tradisi/folklore, bukan sains tervalidasi.",
    citations: [
      {
        ref: "Solfeggio (mis. 528 Hz) — Akimoto dkk. (2018), Health (SCIRP)",
        finding:
          "Studi kecil (n=9) melaporkan musik 528 Hz menurunkan kortisol dibanding tuning 440 Hz.",
        note: "Asal solfeggio adalah folklore modern (diusulkan Joseph Puleo, 1990-an), bukan tradisi kuno. Sampel sangat kecil, jurnal berdampak rendah, belum direplikasi. Klaim 'perbaikan DNA' tak berdasar.",
        url: "https://www.scirp.org/journal/paperinformation?paperid=87146",
      },
      {
        ref: "Schumann resonance (7.83 Hz)",
        finding:
          "Resonansi elektromagnetik Bumi-ionosfer adalah fisika nyata; korelasinya dengan fisiologi manusia sangat lemah.",
        note: "Klaim 'menyelaraskan otak / menyembuhkan' adalah spekulasi wellness, bukan mekanisme aplikasi ini.",
        url: "https://en.wikipedia.org/wiki/Schumann_resonances",
      },
    ],
  },
];

export function Science() {
  return (
    <div className="science">
      <header className="science-head">
        <h1>Sains di balik Serenade</h1>
        <p>
          Kami memisahkan tiga tingkat bukti secara jujur — apa yang terdukung
          baik, apa yang masih riset awal, dan apa yang murni tradisi.
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
        <strong>Penting.</strong> Konten audio ini ditujukan untuk relaksasi,
        fokus, dan kenyamanan. Ini bukan alat medis dan tidak dimaksudkan untuk
        mendiagnosis, mengobati, menyembuhkan, atau mencegah penyakit apa pun.
        Jika kamu mengalami kecemasan, gangguan tidur, atau kondisi kesehatan
        lain, konsultasikan dengan tenaga profesional. Klaim seputar frekuensi
        tertentu (mis. solfeggio, Schumann resonance) berakar pada tradisi dan
        belum tervalidasi secara ilmiah.
      </aside>
    </div>
  );
}
