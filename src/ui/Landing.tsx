interface LandingProps {
  onEnter: () => void;
  onScience: () => void;
}

const STEPS = [
  {
    emoji: "🎯",
    title: "Pilih tujuan",
    body: "Tidur nyenyak, meditasi, fokus, atau redakan cemas — kamu memilih hasil, bukan angka frekuensi.",
  },
  {
    emoji: "🌊",
    title: "Suara dituntun bertahap",
    body: "Sesi bukan nada statis: frekuensi turun perlahan mengikuti kurva, menemani otakmu menuju kondisi tujuan.",
  },
  {
    emoji: "🎧",
    title: "Dengarkan & lepaskan",
    body: "Binaural beats di headphone atau isochronic tones di speaker, berpadu dengan hujan, ombak, dan angin yang disintesis murni.",
  },
];

const FEATURES = [
  {
    title: "8 sesi tujuan siap pakai",
    body: "Dari Tidur Nyenyak sampai Power Nap — tiap sesi dirancang dengan kurva frekuensi dan carrier solfeggio-nya sendiri.",
  },
  {
    title: "Studio multi-layer",
    body: "Rakit sesimu sendiri seperti sound designer: metode entrainment per layer, frequency finder harmonis, kurva custom, export & bagikan.",
  },
  {
    title: "Audio disintesis real-time",
    body: "Tanpa file MP3 — frekuensi presisi hingga 0.01 Hz, durasi tak terbatas, dan bekerja sepenuhnya offline.",
  },
  {
    title: "Jujur secara ilmiah",
    body: "Kami memisahkan bukti kuat, riset awal, dan tradisi — lengkap dengan sitasi studi asli di halaman Sains.",
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
          Temukan tenang,
          <br />
          <em>satu frekuensi</em> pada satu waktu
        </h1>
        <p className="landing-lede">
          Serenade menyintesis binaural beats, isochronic tones, solfeggio, dan
          suasana alam — lalu menuntunnya mengikuti kurva frekuensi yang
          dirancang untuk relaksasi, tidur, dan fokus.
        </p>
        <div className="landing-cta">
          <button className="start-btn compact" onClick={onEnter}>
            Mulai Sesi Gratis
          </button>
          <button className="pill-btn" onClick={onScience}>
            Lihat Sainsnya
          </button>
        </div>
        <p className="landing-note">
          Gratis, tanpa akun, langsung di browser. Gunakan headphone untuk
          pengalaman terbaik.
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
        <h2>Dirancang seperti instrumen, bukan sekadar playlist</h2>
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
        <h2>Klaim kami jujur</h2>
        <p>
          Musik dan suara menenangkan terbukti membantu relaksasi. Binaural
          beats menunjukkan hasil menjanjikan untuk kecemasan pada riset awal —
          tetapi mekanisme "entrainment gelombang otak" belum terbukti
          konsisten. Kami menyajikan semuanya apa adanya, dengan sitasi studi
          asli — termasuk yang hasilnya campuran.
        </p>
        <button className="pill-btn" onClick={onScience}>
          Baca ringkasan risetnya →
        </button>
      </section>
    </div>
  );
}
