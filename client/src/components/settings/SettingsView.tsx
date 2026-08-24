import { Segmented, SettingsGroup, SettingsRow } from './SettingsRow';
import { useSettings } from '../../hooks/useSettings';
import { FONT_SCALES, THEMES, type Landing, type ThemeId } from '../../lib/settings';

/**
 * Preview colors per theme — board / strip / accent, in that order. A mirror of
 * the `[data-theme]` blocks in shared/theme.css, kept here because it is
 * presentation: the swatch has to paint a palette that is NOT currently applied,
 * so it cannot read the live custom properties.
 */
const SWATCHES: Record<ThemeId, [string, string, string]> = {
  midnight: ['#0c1220', '#182238', '#55d0dd'],
  graphite: ['#111214', '#1f2124', '#6fc5cf'],
  amber: ['#0a0805', '#1a150c', '#ffb03a'],
  nightshift: ['#07120d', '#12251b', '#4fe09a'],
  daylight: ['#e8e3d7', '#fbf8f1', '#136d78']
};

const DENSITIES = [
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'compact' as const, label: 'Compact' }
];

/**
 * The landing choices, with copy rather than section ids. "Where I left off" is
 * first because it is the default and reads as the absence of a choice; the two
 * named sections below it are the override.
 */
const LANDINGS: { value: Landing; label: string }[] = [
  { value: 'last', label: 'Where I left off' },
  { value: 'guides', label: 'Guides' },
  { value: 'settings', label: 'Settings' }
];

const ON_OFF = [
  { value: 'off' as const, label: 'Off' },
  { value: 'on' as const, label: 'On' }
];

/** The three fixation stops offered. The stored range is wider — see below. */
const STRENGTHS = [
  { value: 0.3, label: '30%' },
  { value: 0.5, label: '50%' },
  { value: 0.7, label: '70%' }
];

const FREQUENCIES = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' }
];

/**
 * The Settings section: two groups, both this device only (localStorage).
 *
 * Segmented pickers rather than the in-guide panel's range sliders — three named
 * stops read better on a phone, and `Segmented` already carries the disabled
 * affordance for a switch that would flip and do nothing. The *stored* range is
 * the aid's full 0.2–0.8 and 1–5 though, so a value set from a guide's own panel
 * slider is preserved rather than snapped when this page next renders; it simply
 * shows no stop as active.
 */
export default function SettingsView() {
  const { settings, update } = useSettings();

  return (
    <div className="set">
      <SettingsGroup title="Display · this device">
        <div className="set-row">
          <div className="set-label">
            <span className="set-name">Theme</span>
            <span className="set-hint">{THEMES.find((t) => t.id === settings.theme)?.hint}</span>
          </div>
        </div>
        <div className="set-themes" style={{ marginTop: 5 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === settings.theme ? 'set-theme on' : 'set-theme'}
              aria-pressed={t.id === settings.theme}
              onClick={() => update({ theme: t.id })}
            >
              <span className="set-swatch">
                <i style={{ background: SWATCHES[t.id][0] }} />
                <i style={{ background: SWATCHES[t.id][1] }} />
                <i style={{ background: SWATCHES[t.id][2] }} />
              </span>
              <span className="set-theme-name">{t.label}</span>
            </button>
          ))}
        </div>

        <SettingsRow
          name="Density"
          hint="Compact tightens padding and the gaps between cards — more guides per screen."
        >
          <Segmented
            value={settings.density}
            options={DENSITIES}
            onChange={(density) => update({ density })}
          />
        </SettingsRow>

        <SettingsRow
          name="Text size"
          hint="Scales the whole board, not just type — the rail, the cards and the spacing move with it. The guide inside the viewer keeps its own size; pinch it instead."
        >
          <Segmented
            value={settings.fontScale}
            options={FONT_SCALES.map((v) => ({ value: v, label: `${v}%` }))}
            onChange={(fontScale) => update({ fontScale })}
          />
        </SettingsRow>

        <SettingsRow
          name="Opens on"
          hint="Which section this device lands on when you load the page."
        >
          <select
            value={settings.landing}
            aria-label="Opens on"
            onChange={(e) => update({ landing: e.target.value as Landing })}
          >
            {LANDINGS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Reading">
        <SettingsRow
          name="Bionic reading"
          hint="Bolds the opening letters of a word to give the eye a fixation point. Applies to the guide you are reading, including one already open."
        >
          <Segmented
            value={settings.bionicOn ? 'on' : 'off'}
            options={ON_OFF}
            onChange={(v) => update({ bionicOn: v === 'on' })}
          />
        </SettingsRow>

        <SettingsRow
          name="Fixation"
          hint="How much of each word is bolded. Never the whole word — a fully bold word carries no fixation point."
        >
          <Segmented
            value={settings.bionicStrength}
            options={STRENGTHS}
            onChange={(bionicStrength) => update({ bionicStrength })}
            disabled={!settings.bionicOn}
          />
        </SettingsRow>

        <SettingsRow
          name="Every"
          hint="Bold every Nth word. Higher values thin the effect out — the rhythm stays regular across paragraphs."
        >
          <Segmented
            value={settings.bionicFreq}
            options={FREQUENCIES}
            onChange={(bionicFreq) => update({ bionicFreq })}
            disabled={!settings.bionicOn}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
