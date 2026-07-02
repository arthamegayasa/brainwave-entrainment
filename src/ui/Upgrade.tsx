import { useState } from "react";
import { ALL_UNLOCKED, getTier, setTier } from "../state/tier";

const FREE = [
  "8 sesi tujuan siap pakai",
  "Binaural, isochronic, monaural & solfeggio",
  "4 suasana alam tersintesis",
  "Durasi 15–60 menit",
];

const PREMIUM = [
  "Semua fitur Free",
  "Studio multi-layer tanpa batas",
  "Frequency finder harmonis",
  "Kurva sesi custom + export/import",
  "Durasi tak terbatas (∞)",
  "Sesi premium (Energi, Kreativitas, Power Nap)",
];

export function Upgrade() {
  const [tier, setLocalTier] = useState(getTier());

  const activate = () => {
    setTier("premium");
    setLocalTier("premium");
  };

  return (
    <section className="upgrade">
      <header className="upgrade-head">
        <h1>Buka seluruh potensimu</h1>
        <p>
          Serenade Premium membuka Studio, frequency finder, kurva custom, dan
          durasi tak terbatas.
        </p>
      </header>

      {ALL_UNLOCKED && (
        <div className="early-banner">
          🎁 <strong>Akses awal:</strong> semua fitur premium terbuka gratis
          selama masa peluncuran. Nikmati sepenuhnya.
        </div>
      )}

      <div className="plans">
        <div className="plan">
          <div className="plan-name">Free</div>
          <div className="plan-price">
            Rp0<span>/selamanya</span>
          </div>
          <ul>
            {FREE.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button className="pill-btn" disabled>
            Paket saat ini
          </button>
        </div>

        <div className="plan featured">
          <div className="plan-badge">Paling populer</div>
          <div className="plan-name">Premium</div>
          <div className="plan-price">
            Rp49rb<span>/bulan</span>
          </div>
          <ul>
            {PREMIUM.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button className="start-btn compact" onClick={activate}>
            {tier === "premium" ? "Premium aktif ✓" : "Aktifkan Premium"}
          </button>
          <p className="plan-note">
            Pembayaran belum aktif di versi ini — tombol mengaktifkan mode
            premium secara lokal untuk mencoba semua fitur.
          </p>
        </div>
      </div>
    </section>
  );
}
