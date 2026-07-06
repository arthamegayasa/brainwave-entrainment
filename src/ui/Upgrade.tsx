import { useState } from "react";
import { ALL_UNLOCKED, getTier, setTier, PRICING } from "../state/tier";
import type { BillingPeriod } from "../state/tier";
import { useEntitlement } from "../lib/useEntitlement";
import { createCheckout, signInWithEmail, signOut } from "../lib/payments";
import { loadSnap, openSnap } from "../lib/snap";
import { currentStreakDays, totalSessions } from "../state/progress";

const FREE = [
  "8 ready-made goal sessions",
  "Binaural, isochronic, monaural & solfeggio",
  "4 synthesized natural ambiences",
  "15–60 minute durations",
];

// Loss-aversion framing (D-05): protect/keep wording, not gain wording.
const PREMIUM = [
  "Everything in Free",
  "Keep unlimited session length (∞)",
  "Keep every goal session — including Boosting Energy, Creative Flow & Power Nap",
  "Keep the full multi-layer Studio",
  "Keep custom curves + export/import",
  "Keep the harmonic frequency finder",
];

const PRICES = PRICING.IDR;

export function Upgrade() {
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const plan = period === "annual" ? PRICES.annual : PRICES.monthly;
  const ent = useEntitlement();
  const sessions = totalSessions();
  const streak = currentStreakDays();

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

      {sessions >= 1 && (
        <div className="stakes-block">
          {streak >= 2
            ? `You've built a ${streak}-day streak — keep it alive.`
            : `You've completed ${sessions} ${sessions === 1 ? "session" : "sessions"} — keep the momentum going.`}
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
            {period === "annual" && (
              <span className="price-anchor">{PRICES.anchorAnnual.price}</span>
            )}
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

          {ent.configured ? (
            <PremiumCheckout period={period} ent={ent} />
          ) : (
            <LocalActivate />
          )}
        </div>
      </div>
    </section>
  );
}

/** Fallback when no payment backend is wired: local-only premium toggle. */
function LocalActivate() {
  const [tier, setLocalTier] = useState(getTier());
  return (
    <>
      <button
        className="start-btn compact"
        onClick={() => {
          setTier("premium");
          setLocalTier("premium");
        }}
      >
        {tier === "premium" ? "Premium active ✓" : "Activate Premium"}
      </button>
      <p className="plan-note">
        Payments aren't configured in this build — the button activates premium
        mode locally so you can try every feature.
      </p>
    </>
  );
}

/** Real Midtrans checkout: magic-link sign-in → Snap payment → entitlement. */
function PremiumCheckout({
  period,
  ent,
}: {
  period: BillingPeriod;
  ent: ReturnType<typeof useEntitlement>;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (ent.loading) {
    return <p className="plan-note">Loading…</p>;
  }

  if (ent.isPremium) {
    return (
      <>
        <button className="start-btn compact" disabled>
          Premium active ✓
        </button>
        <p className="plan-note">
          Signed in as {ent.email}
          {ent.entitlement?.currentPeriodEnd
            ? ` · renews ${new Date(ent.entitlement.currentPeriodEnd).toLocaleDateString()}`
            : ""}
          . <button className="link-btn" onClick={() => void signOut()}>Sign out</button>
        </p>
      </>
    );
  }

  // Signed out → magic-link form.
  if (!ent.email) {
    const sendLink = async () => {
      if (!email.trim()) return;
      setBusy(true);
      setMsg(null);
      try {
        await signInWithEmail(email.trim());
        setMsg("Check your email for a sign-in link, then return here.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not send the link");
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        <div className="save-row">
          <input
            className="text-input"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email for sign-in"
          />
          <button className="chip" disabled={busy} onClick={() => void sendLink()}>
            {busy ? "Sending…" : "Sign in"}
          </button>
        </div>
        {msg && <p className="plan-note">{msg}</p>}
        <p className="plan-note">Sign in to subscribe — no password needed.</p>
      </>
    );
  }

  // Signed in, not premium → subscribe via Snap.
  const subscribe = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { token } = await createCheckout(period);
      await loadSnap();
      openSnap(token, {
        onSuccess: () => {
          setMsg("Payment received — activating…");
          setTimeout(() => void ent.refresh(), 2500);
        },
        onPending: () => setMsg("Payment pending. We'll activate once it settles."),
        onError: () => setMsg("Payment failed. Please try again."),
        onClose: () => setMsg("Checkout closed before completing."),
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="start-btn compact" disabled={busy} onClick={() => void subscribe()}>
        {busy ? "Starting…" : `Subscribe — ${period === "annual" ? PRICES.annual.price : PRICES.monthly.price}`}
      </button>
      {msg && <p className="plan-note">{msg}</p>}
      <p className="plan-note">
        Signed in as {ent.email}.{" "}
        <button className="link-btn" onClick={() => void signOut()}>Sign out</button>
      </p>
    </>
  );
}
