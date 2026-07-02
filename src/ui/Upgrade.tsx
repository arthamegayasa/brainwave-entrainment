import { useState } from "react";
import { ALL_UNLOCKED, getTier, setTier, PRICING } from "../state/tier";
import type { BillingPeriod } from "../state/tier";

const FREE = [
  "8 ready-made goal sessions",
  "Binaural, isochronic, monaural & solfeggio",
  "4 synthesized natural ambiences",
  "15–60 minute durations",
];

const PREMIUM = [
  "Everything in Free",
  "Unlimited multi-layer Studio",
  "Harmonic frequency finder",
  "Custom session curves + export/import",
  "Unlimited duration (∞)",
  "Premium sessions (Energy, Creativity, Power Nap)",
];

const PRICES = PRICING.IDR;

export function Upgrade() {
  const [tier, setLocalTier] = useState(getTier());
  const [period, setPeriod] = useState<BillingPeriod>("annual");

  const activate = () => {
    setTier("premium");
    setLocalTier("premium");
  };

  const plan = period === "annual" ? PRICES.annual : PRICES.monthly;

  return (
    <section className="upgrade">
      <header className="upgrade-head">
        <h1>Unlock your full potential</h1>
        <p>
          Serenade Premium unlocks the Studio, frequency finder, custom curves,
          and unlimited duration.
        </p>
      </header>

      {ALL_UNLOCKED && (
        <div className="early-banner">
          🎁 <strong>Early access:</strong> every premium feature is unlocked
          free during launch. Enjoy it fully.
        </div>
      )}

      <div className="plans">
        <div className="plan">
          <div className="plan-name">Free</div>
          <div className="plan-price">
            {PRICES.symbol}0<span>/forever</span>
          </div>
          <ul>
            {FREE.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button className="pill-btn" disabled>
            Current plan
          </button>
        </div>

        <div className="plan featured">
          <div className="plan-badge">Most popular</div>
          <div className="plan-name">Premium</div>

          <div className="billing-toggle" role="tablist" aria-label="Billing period">
            <button
              role="tab"
              aria-selected={period === "monthly"}
              className={period === "monthly" ? "selected" : ""}
              onClick={() => setPeriod("monthly")}
            >
              Monthly
            </button>
            <button
              role="tab"
              aria-selected={period === "annual"}
              className={period === "annual" ? "selected" : ""}
              onClick={() => setPeriod("annual")}
            >
              Annual
              <span className="save-pill">Save {PRICES.annual.savePercent}%</span>
            </button>
          </div>

          <div className="plan-price">
            {plan.price}
            <span>{plan.per}</span>
          </div>
          <div className="plan-subprice">
            {period === "annual"
              ? `≈ ${PRICES.annual.perMonth}/month · billed annually`
              : "Billed monthly · cancel anytime"}
          </div>

          <ul>
            {PREMIUM.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button className="start-btn compact" onClick={activate}>
            {tier === "premium" ? "Premium active ✓" : "Activate Premium"}
          </button>
          <p className="plan-note">
            Payments aren't wired up in this version — the button activates
            premium mode locally so you can try every feature.
          </p>
        </div>
      </div>
    </section>
  );
}
