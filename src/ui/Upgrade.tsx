import { useState } from "react";
import { ALL_UNLOCKED, getTier, setTier, PRICING } from "../state/tier";
import type { BillingPeriod } from "../state/tier";
import { useEntitlement } from "../lib/useEntitlement";
import { supabase } from "../lib/supabase";
import { createCheckout } from "../lib/payments";
import { loadSnap, openSnap } from "../lib/snap";
import { currentStreakDays, totalSessions } from "../state/progress";

const FREE = [
  "8 ready-made goal sessions",
  "Binaural, isochronic, monaural & solfeggio",
  "6 natural ambiences + brown noise",
  "15–60 minute durations",
];

// Loss-aversion framing: protect/keep wording, not gain wording.
const PREMIUM = [
  "Everything in Free",
  "Keep unlimited session length (∞)",
  "Keep every goal session — including Boosting Energy, Creative Flow & Power Nap",
  "Keep the full multi-layer Studio",
  "Keep custom curves + export/import",
  "Keep the harmonic frequency finder",
];

// Professional gain framing: what the practice gains, patients free.
const CLINICIAN = [
  "Everything in Premium",
  "Patient dashboard — up to 30 patients",
  "Audio Bank with categories & filters",
  "Assign custom audio to any patient",
  "Curate which sessions each patient sees",
  "Your patients listen free",
];

const PRICES = PRICING.IDR;

export function Upgrade({
  onSignIn,
  onOpenPrivacy,
}: {
  onSignIn: () => void;
  /** Navigate to the privacy policy, linked from the signed-out checkout. */
  onOpenPrivacy: () => void;
}) {
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const ent = useEntitlement();
  const sessions = totalSessions();
  const streak = currentStreakDays();

  const premiumPlan = period === "annual" ? PRICES.annual : PRICES.monthly;
  const clinicianPlan =
    period === "annual" ? PRICES.clinician.annual : PRICES.clinician.monthly;

  // Each role sees only its own paid plan (roles overlap): a Patient sees
  // Premium, a Clinician (or the Admin) sees Clinician, a Clinician who is
  // also a Patient sees both; only a Regular User sees Free and all plans.
  const isPatient = ent.link !== null;
  const showFree = !isPatient && !ent.isClinician;
  const showPremium = isPatient || !ent.isClinician;
  const showClinician = ent.isClinician || !isPatient;
  const cardCount = [showFree, showPremium, showClinician].filter(Boolean).length;
  const plansClass =
    cardCount === 3 ? "plans three" : cardCount === 1 ? "plans one" : "plans";
  // The annual pill quotes Premium's saving unless Clinician is the only plan.
  const savePercent = showPremium
    ? PRICES.annual.savePercent
    : PRICES.clinician.annual.savePercent;

  return (
    <section className="upgrade">
      <header className="upgrade-head">
        {showPremium ? (
          <>
            <h1>Unlock your full potential</h1>
            <p>
              SwaraSanti Premium unlocks the Studio, frequency finder, custom
              curves, and unlimited duration.
            </p>
          </>
        ) : (
          <>
            <h1>Grow your practice</h1>
            <p>
              SwaraSanti Clinician gives you a patient dashboard, an Audio Bank,
              and per-patient session curation — and your patients listen free.
            </p>
          </>
        )}
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

      {/* Page-level billing toggle — drives every paid card shown. */}
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
          <span className="save-pill">Save {savePercent}%</span>
        </button>
      </div>

      <div className={plansClass}>
        {showFree && (
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
        )}

        {showPremium && (
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
              <PlanCheckout
                plan="premium"
                period={period}
                ent={ent}
                onSignIn={onSignIn}
                onOpenPrivacy={onOpenPrivacy}
              />
            ) : (
              <LocalActivate />
            )}
          </div>
        )}

        {showClinician && (
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
              <PlanCheckout
                plan="clinician"
                period={period}
                ent={ent}
                onSignIn={onSignIn}
                onOpenPrivacy={onOpenPrivacy}
              />
            ) : (
              <p className="plan-note">
                Available once payments are configured in this build.
              </p>
            )}
          </div>
        )}
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
 * Real Midtrans checkout for a paid plan: sign-in via the Account sheet →
 * Snap payment → entitlement (+ clinician role promotion via the webhook for
 * plan 'clinician'). Identity actions (sign-in/sign-out) live in the Account
 * sheet — this card is purely a checkout surface.
 */
function PlanCheckout({
  plan,
  period,
  ent,
  onSignIn,
  onOpenPrivacy,
}: {
  plan: "premium" | "clinician";
  period: BillingPeriod;
  ent: ReturnType<typeof useEntitlement>;
  onSignIn: () => void;
  onOpenPrivacy: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (ent.loading) {
    return <p className="plan-note">Loading…</p>;
  }

  // Active states: clinician card keys off the ROLE (clinician/admin);
  // premium card keys off isPremium: an active subscription (the clinician
  // tier counts) or the Premium grant from the Patient's Clinician.
  const active = plan === "clinician" ? ent.isClinician : ent.isPremium;
  if (active) {
    return (
      <>
        <button className="start-btn compact" disabled>
          {plan === "clinician" ? "Clinician active ✓" : "Premium active ✓"}
        </button>
        <p className="plan-note">
          Signed in as {ent.accountName}
          {ent.entitlement?.currentPeriodEnd
            ? ` · renews ${new Date(ent.entitlement.currentPeriodEnd).toLocaleDateString()}`
            : ""}
          .
        </p>
      </>
    );
  }

  // Signed out → the Account sheet owns the sign-in form (shared).
  if (!ent.signedIn) {
    return (
      <>
        <button className="start-btn compact" onClick={onSignIn}>
          Sign in to subscribe
        </button>
        <p className="plan-note">
          No password needed — we'll email you a link.{" "}
          <button className="link-btn" onClick={onOpenPrivacy}>
            Privacy policy
          </button>
        </p>
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
      <p className="plan-note">Signed in as {ent.accountName}.</p>
    </>
  );
}
