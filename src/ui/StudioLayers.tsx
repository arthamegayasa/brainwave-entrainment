import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ENTRAINMENT_TYPES, isEntrainment } from "../audio/builder";
import type { BuilderLayerSpec, BuilderLayerType, EntrainmentLayerType, Journey } from "../audio/builder";
import { findRelated } from "../audio/freqfinder";
import { SOUND_LABELS } from "../audio/constants";
import { AMBIENT_KINDS } from "../audio/types";
import { MAX_LAYERS } from "../state/customPresets";
import { BAND_COLORS, bandForHz } from "./bands";
import { BandChip, RangeField } from "./StudioField";

/** 24 px line icons, drawn in the layer's colour. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const LAYER_META: Record<BuilderLayerType, { label: string; hint: string; icon: ReactNode }> = {
  binaural: {
    label: "Binaural",
    hint: "A different tone in each ear. Needs headphones.",
    icon: (
      <Glyph>
        <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
        <rect x="3" y="14" width="4" height="6" rx="1.5" />
        <rect x="17" y="14" width="4" height="6" rx="1.5" />
      </Glyph>
    ),
  },
  isochronic: {
    label: "Isochronic",
    hint: "One tone pulsed at the Beat. Works on speakers.",
    icon: (
      <Glyph>
        <path d="M2 16h2.5V8h3v8h3V8h3v8h3V8h3v8H22" />
      </Glyph>
    ),
  },
  monaural: {
    label: "Monaural",
    hint: "Two tones mixed before they reach you. Works on speakers.",
    icon: (
      <Glyph>
        <path d="M2 12c5-9 15-9 20 0M2 12c5 9 15 9 20 0" opacity="0.45" />
        <path d="M5 12c1-3 2-3 3 0s2 3 3 0 2-3 3 0 2 3 3 0 1.5-2 2-2" />
      </Glyph>
    ),
  },
  pure: {
    label: "Pure Tone",
    hint: "One steady tone, without a Beat.",
    icon: (
      <Glyph>
        <path d="M2 12c1.7-5 3.3-5 5 0s3.3 5 5 0 3.3-5 5 0 3.3 5 5 0" />
      </Glyph>
    ),
  },
  rain: {
    label: SOUND_LABELS.rain,
    hint: "Soft, even rainfall.",
    icon: (
      <Glyph>
        <path d="M7 14.5a4 4 0 0 1 .4-8A5 5 0 0 1 17 8a3.3 3.3 0 0 1 0 6.5z" />
        <path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" />
      </Glyph>
    ),
  },
  ocean: {
    label: SOUND_LABELS.ocean,
    hint: "Slow waves rolling in.",
    icon: (
      <Glyph>
        <path d="M2 9c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2" />
        <path d="M2 14c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2" />
        <path d="M2 19c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2" opacity="0.5" />
      </Glyph>
    ),
  },
  wind: {
    label: SOUND_LABELS.wind,
    hint: "A soft breeze through pine trees.",
    icon: (
      <Glyph>
        <path d="M3 9h11a3 3 0 1 0-3-3" />
        <path d="M3 13h15a3 3 0 1 1-3 3" />
        <path d="M3 17h6" />
      </Glyph>
    ),
  },
  stream: {
    label: SOUND_LABELS.stream,
    hint: "A small brook over smooth stones.",
    icon: (
      <Glyph>
        <path d="M12 3c2.3 3 3.5 5 3.5 6.6a3.5 3.5 0 0 1-7 0C8.5 8 9.7 6 12 3z" />
        <path d="M2 17c2 0 3-1.5 5-1.5s3 1.5 5 1.5 3-1.5 5-1.5 3 1.5 5 1.5" />
        <path d="M2 21c2 0 3-1.5 5-1.5s3 1.5 5 1.5 3-1.5 5-1.5 3 1.5 5 1.5" opacity="0.5" />
      </Glyph>
    ),
  },
  forest: {
    label: SOUND_LABELS.forest,
    hint: "Morning birdsong and rustling leaves.",
    icon: (
      <Glyph>
        <path d="M12 3l5 7h-3l4 6H6l4-6H7z" />
        <path d="M12 16v5" />
      </Glyph>
    ),
  },
  night: {
    label: SOUND_LABELS.night,
    hint: "Soft crickets on a warm night.",
    icon: (
      <Glyph>
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        <path d="M18 3v3M16.5 4.5h3" />
      </Glyph>
    ),
  },
  brown: {
    label: SOUND_LABELS.brown,
    hint: "Deep, even noise that masks the room.",
    icon: (
      <Glyph>
        <path d="M2 12l2-3 2 6 2-8 2 7 2-4 2 6 2-7 2 5 2-3 2 1" />
      </Glyph>
    ),
  },
};

/**
 * Grouped layer types for the type menu and the Add palette. Values must
 * stay byte-identical to BuilderLayerType members — saved custom presets
 * store these strings. "pure" is a static tone (createSolfeggioLayer), NOT
 * entrainment, so it gets its own group.
 */
const LAYER_TYPE_GROUPS: Array<{ label: string; types: BuilderLayerType[] }> = [
  { label: "Entrainment", types: ["binaural", "isochronic", "monaural"] },
  { label: "Tone", types: ["pure"] },
  { label: "Ambience", types: [...AMBIENT_KINDS] },
];

/** What each entrainment type needs to be heard, under its name on the main Beat. */
const TYPE_NEEDS: Record<EntrainmentLayerType, string> = {
  binaural: "Headphones",
  isochronic: "Speakers",
  monaural: "Speakers",
};

interface LayerCardProps {
  layer: BuilderLayerSpec;
  /** 0-based position, shown 1-based. */
  index: number;
  /** The Journey a following Beat moves along. */
  journey: Journey;
  /** The main Beat: its entrainment type comes first, and it stays entrainment. */
  main?: boolean;
  onPatch: (patch: Partial<BuilderLayerSpec>) => void;
  onRemove: () => void;
}

/**
 * One layer: its type, then only the controls that type uses. Entrainment
 * layers take the colour of their Beat's band; a tone and ambience have their
 * own colours (App.css), outside the band palette. The main Beat picks its
 * entrainment type, then whether it follows the Journey, before its Carrier.
 */
export function LayerCard({ layer, index, journey, main = false, onPatch, onRemove }: LayerCardProps) {
  const [showFinder, setShowFinder] = useState(false);
  const beatLabelId = useId();
  const typeLabelId = useId();
  const entrainment = isEntrainment(layer.type);
  const tonal = entrainment || layer.type === "pure";
  const meta = LAYER_META[layer.type];
  const beatHz = layer.beatMode === "fixed" ? layer.fixedBeatHz : journey.points[journey.holdAt].hz;
  const kind = entrainment ? "entrainment" : layer.type === "pure" ? "tone" : "ambience";
  const path = `${[journey.startHz, ...journey.points.map((p) => p.hz)].join(" → ")} Hz`;

  const entrainmentType = main && entrainment && (
    <div className="layer-entrainment">
      <span className="rf-label" id={typeLabelId}>
        Entrainment
      </span>
      <div className="entrainment-options" role="group" aria-labelledby={typeLabelId}>
        {ENTRAINMENT_TYPES.map((type) => (
          <button key={type} aria-pressed={layer.type === type} onClick={() => onPatch({ type })}>
            <span className="entrainment-icon" aria-hidden>
              {LAYER_META[type].icon}
            </span>
            <span className="entrainment-name">{LAYER_META[type].label}</span>
            <span className="entrainment-needs">{TYPE_NEEDS[type]}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const beat = entrainment && (
    <div className="layer-beat">
      <div className="rf-head">
        <span className="rf-label" id={beatLabelId}>
          Beat
        </span>
        <div className="seg-mini" role="group" aria-labelledby={beatLabelId}>
          <button aria-pressed={layer.beatMode === "follow"} onClick={() => onPatch({ beatMode: "follow" })}>
            Follow journey
          </button>
          <button aria-pressed={layer.beatMode === "fixed"} onClick={() => onPatch({ beatMode: "fixed" })}>
            Fixed
          </button>
        </div>
      </div>
      {layer.beatMode === "fixed" ? (
        <RangeField
          label="Fixed Beat"
          unit="Hz"
          value={layer.fixedBeatHz}
          min={0.5}
          max={50}
          step={0.1}
          log
          tone="var(--layer)"
          aside={<BandChip hz={layer.fixedBeatHz} />}
          onChange={(fixedBeatHz) => onPatch({ fixedBeatHz })}
        />
      ) : (
        <p className="layer-note">
          {main ? "Follows the Journey below" : "Moves with the Journey"}: {path}
        </p>
      )}
    </div>
  );

  const sound = (
    <>
      {tonal && (
        <RangeField
          label={layer.type === "pure" ? "Tone" : "Carrier"}
          unit="Hz"
          value={layer.carrierHz}
          min={20}
          max={1500}
          step={1}
          inputStep={0.01}
          log
          tone="var(--layer)"
          aside={
            <button
              className={`rf-aside-btn${showFinder ? " is-open" : ""}`}
              aria-expanded={showFinder}
              onClick={() => setShowFinder((v) => !v)}
            >
              Related
            </button>
          }
          onChange={(carrierHz) => onPatch({ carrierHz })}
        />
      )}

      {showFinder && tonal && (
        <div className="finder" role="group" aria-label="Related frequencies">
          {findRelated(layer.carrierHz)
            .slice(0, 6)
            .map((s) => (
              <button
                key={s.hz}
                className="finder-option"
                onClick={() => {
                  onPatch({ carrierHz: s.hz });
                  setShowFinder(false);
                }}
              >
                <strong>{s.hz} Hz</strong>
                <span>{s.relation}</span>
              </button>
            ))}
        </div>
      )}

      <RangeField
        label="Volume"
        unit="%"
        value={Math.round(layer.gain * 100)}
        min={0}
        max={100}
        step={1}
        readOnlyValue
        tone="var(--layer)"
        onChange={(v) => onPatch({ gain: v / 100 })}
      />
    </>
  );

  return (
    <article
      className={`layer-card is-${kind}${main ? " is-main" : ""}`}
      style={entrainment ? ({ "--layer": BAND_COLORS[bandForHz(beatHz)] } as CSSProperties) : undefined}
      aria-label={`Layer ${index + 1}: ${meta.label}${main ? " (main Beat)" : ""}`}
    >
      <header className="layer-head">
        <span className="layer-icon" aria-hidden>
          {meta.icon}
        </span>
        <div className="layer-title">
          <span className="layer-index">
            Layer {index + 1}
            {main && " · Main Beat"}
          </span>
          {main ? (
            <h3 className="layer-name">{meta.label}</h3>
          ) : (
            <select
              className="select layer-type"
              value={layer.type}
              aria-label="Layer type"
              onChange={(e) => onPatch({ type: e.target.value as BuilderLayerType })}
            >
              {LAYER_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>
                      {LAYER_META[t].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        <button className="layer-remove" aria-label={`Remove layer ${index + 1}`} onClick={onRemove}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {main ? (
        <div className="layer-main-grid">
          <div className="layer-col">
            {entrainmentType}
            <p className="layer-hint">{meta.hint}</p>
            {beat}
          </div>
          <div className="layer-col">{sound}</div>
        </div>
      ) : (
        <>
          <p className="layer-hint">{meta.hint}</p>
          {beat}
          {sound}
        </>
      )}
    </article>
  );
}

/** Step 1 without a main Beat: one button per entrainment type, disabled once the session holds MAX_LAYERS. */
export function MainBeatEmpty({ count, onAdd }: { count: number; onAdd: (type: EntrainmentLayerType) => void }) {
  return (
    <div className="beat-empty" role="group" aria-label="Add a main Beat">
      <p>No Beat yet, so this session is sound only. Choose how to deliver one:</p>
      <div className="layer-add-options">
        {ENTRAINMENT_TYPES.map((type) => (
          <button
            key={type}
            className="layer-add-option"
            disabled={count >= MAX_LAYERS}
            aria-label={`Add ${LAYER_META[type].label} as the main Beat`}
            onClick={() => onAdd(type)}
          >
            <span className="layer-add-icon" aria-hidden>
              {LAYER_META[type].icon}
            </span>
            {LAYER_META[type].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One button per layer type, grouped, disabled once the session holds MAX_LAYERS. */
export function AddLayer({ count, onAdd }: { count: number; onAdd: (type: BuilderLayerType) => void }) {
  const titleId = useId();
  const full = count >= MAX_LAYERS;
  return (
    <div className="layer-add" role="group" aria-labelledby={titleId}>
      <div className="layer-add-head">
        <span className="layer-add-title" id={titleId}>
          Add a layer
        </span>
        <span className="layer-add-count">
          {count} / {MAX_LAYERS}
        </span>
      </div>
      <div className="layer-add-groups">
        {LAYER_TYPE_GROUPS.map((group) => (
          <div key={group.label} className="layer-add-group">
            <span className="layer-add-group-name">{group.label}</span>
            <div className="layer-add-options">
              {group.types.map((type) => (
                <button
                  key={type}
                  className="layer-add-option"
                  disabled={full}
                  aria-label={`Add ${LAYER_META[type].label} layer`}
                  onClick={() => onAdd(type)}
                >
                  <span className="layer-add-icon" aria-hidden>
                    {LAYER_META[type].icon}
                  </span>
                  {LAYER_META[type].label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {full && <p className="layer-add-full">A session holds up to {MAX_LAYERS} layers.</p>}
    </div>
  );
}
