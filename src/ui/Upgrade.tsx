import { useState } from "react";
import { ALL_UNLOCKED, getTier, setTier, PRICING } from "../state/tier";
import type { BillingPeriod } from "../state/tier";
import { useEntitlement } from "../lib/useEntitlement";
import { supabase } from "../lib/supabase";
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

// Professional gain framing (D-06): what the practice gains, patients free.
const CLINICIAN = [
  "Everything in Premium",
  "Patient dashboard — up to 30 patients",
  "Audio Bank with categories & filters",
  "Assign custom audio to any patient",
  "Curate which sessions each patient sees",
  "Your patients listen free",
];

const PRICES = PRICING.IDR;

export function Upgrade() {
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const ent = useEntitlement();
  const sessions = totalSessions();
  const streak = currentStreakDays();

  const premiumPlan = period === "annual" ? PRICES.annual : PRICES.monthly;
  const clinicianPlan =
    period === "annual" ? PRICES.clinician.annual : PRICES.clinician.monthly;

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

      {/* Page-level billing toggle — drives BOTH paid cards' period. */}
      <div
        className="billing-toggle page-toggle"
        role="tablist"
        aria-label="Billing period"
      >
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

      <div className="plans three">
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

          <div className="plan-price">
            {period === "annual" && (
              <span className="price-anchor">{PRICES.anchorAnnual.price}</span>
            )}
            {premiumPlan.price}
            <span>{premiumPlan.per}</span>
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
            <PlanCheckout plan="premium" period={period} ent={ent} />
          ) : (
            <LocalActivate />
          )}
        </div>

        <div className="plan clinician">
          <div className="plan-badge pro">For professionals</div>
          <div className="plan-name">Clinician</div>

          <div className="plan-price">
            {period === "annual" && (
              <span className="price-anchor">
                {PRICES.clinician.annual.anchor.price}
              </span>
            )}
            {clinicianPlan.price}
            <span>{clinicianPlan.per}</span>
          </div>
          <div className="plan-subprice">
            {period === "annual"
              ? `≈ ${PRICES.clinician.annual.perMonth}/month · billed annually`
              : "Billed monthly · cancel anytime"}
          </div>

          <ul>
            {CLINICIAN.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>

          {ent.configured ? (
            <PlanCheckout plan="clinician" period={period} ent={ent} />
          ) : (
            <p className="plan-note">
              Available once payments are configured in this build.
            </p>
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

/**
 * Real Midtrans checkout for a paid plan: magic-link sign-in → Snap payment →
 * entitlement (+ clinician role promotion via the webhook for plan
 * 'clinician'). The sign-in branch is shared between both paid cards.
 */
function PlanCheckout({
  plan,
  period,
  ent,
}: {
  plan: "premium" | "clinician";
  period: BillingPeriod;
  ent: ReturnType<typeof useEntitlement>;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (ent.loading) {
    return <p className="plan-note">Loading…</p>;
  }

  // Active states: clinician card keys off the ROLE (clinician/admin);
  // premium card keys off the entitlement (clinician tier counts as premium).
  const active = plan === "clinician" ? ent.isClinician : ent.isPremium;
  if (active) {
    return (
      <>
        <button className="start-btn compact" disabled>
          {plan === "clinician" ? "Clinician active ✓" : "Premium active ✓"}
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

  // Signed out → magic-link form (shared).
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

  const prices = plan === "clinician" ? PRICES.clinician : PRICES;
  const priceLabel =
    period === "annual" ? prices.annual.price : prices.monthly.price;

  // Signed in, not on this plan → subscribe via Snap.
  const subscribe = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { token } = await createCheckout(plan, period);
      await loadSnap();
      openSnap(token, {
        onSuccess: () => {
          setMsg("Payment received — activating…");
          // A clinician purchase changes profiles.role server-side, which gates
          // the App's nav (Dashboard/Studio) via a SEPARATE useEntitlement
          // instance. refreshSession() fires onAuthStateChange, and every
          // instance re-fetches on it — so the whole app re-gates, not just
          // this page. Two attempts cover a webhook that lands a bit late.
          const sync = () => {
            void ent.refresh();
            void supabase?.auth.refreshSession();
          };
          setTimeout(sync, 2500);
          setTimeout(sync, 6000);
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
        {busy ? "Starting…" : `Subscribe — ${priceLabel}`}
      </button>
      {msg && <p className="plan-note">{msg}</p>}
      <p className="plan-note">
        Signed in as {ent.email}.{" "}
        <button className="link-btn" onClick={() => void signOut()}>Sign out</button>
      </p>
    </>
  );
}
