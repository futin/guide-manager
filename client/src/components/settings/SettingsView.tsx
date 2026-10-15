import { Segmented, SettingsGroup, SettingsRow, Switch } from './SettingsRow';
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
 * The landing choices, with copy rather than section ids. "Last used" is
 * first because it is the default and reads as the absence of a choice; the two
 * named sections below it are the override.
 */
const LANDINGS: { value: Landing; label: string }[] = [
  { value: 'last', label: 'Last used' },
  { value: 'guides', label: 'Guides' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'settings', label: 'Settings' }
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
 * The text-size stops, plus the stored value when it is not one of them. The stored range is wider than the four stops (`LIMITS.fontScale`), and a
 * controlled `<select>` whose value matches no option shows its first option instead — the row would claim 90% while the board drew something else.
 * Listing the odd value keeps the select honest, the same way the segmented pickers below show no stop rather than a wrong one.
 */
function scaleOptions(current: number): number[] {
  return FONT_SCALES.includes(current) ? FONT_SCALES : [...FONT_SCALES, current].sort((a, b) => a - b);
}

/**
 * The Settings section: a band, then three cards — Appearance, Reading aid, Startup — every value this device only (localStorage, as the band says).
 *
 * Two columns from 768 px, hand-balanced rather than flowed: Appearance alone on the left, Reading aid over Startup on the right. Auto-flow (grid
 * auto-placement or CSS columns) would put Reading aid beside Appearance and Startup under Appearance, leaving the tall left card's neighbour short and a
 * hole under it; two explicit column wrappers keep the pairing whatever the hints wrap to. Below 768 the wrappers stack in source order, which is the
 * reading order too.
 *
 * Segmented pickers rather than the in-guide panel's range sliders — three named stops read better on a phone, and `Segmented` already carries the
 * disabled affordance for a picker that would flip and do nothing. The *stored* range is the aid's full 0.2–0.8 and 1–5 though, so a value set from a
 * guide's own panel slider is preserved rather than snapped when this page next renders; it simply shows no stop as active.
 */
export default function SettingsView() {
  const { settings, update } = useSettings();

  return (
    <div className="set">
      <header className="band">
        <h1>Settings</h1>
        <p>Stored in this browser · each device keeps its own</p>
      </header>

      <div className="set-cols">
        <div className="set-col">
          <SettingsGroup title="Appearance">
            {/* The hint is the picked theme's, so the row says what the ringed swatch is rather than describing all five at once. */}
            <SettingsRow name="Theme" hint={THEMES.find((t) => t.id === settings.theme)?.hint} stacked>
              <div className="set-themes">
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
            </SettingsRow>

            <SettingsRow name="Density" hint="Compact tightens padding and the gaps between cards — more guides per screen.">
              <Segmented value={settings.density} options={DENSITIES} onChange={(density) => update({ density })} />
            </SettingsRow>

            {/* A select, not four segments (spec §6): four percentages side by side are wider than a half-width card has room for at 768 px. */}
            <SettingsRow
              name="Text size"
              hint="Scales the whole board, not just type — the rail, the cards and the spacing move with it. The guide inside the viewer keeps its own size; pinch it instead."
            >
              <select
                className="select"
                value={settings.fontScale}
                aria-label="Text size"
                onChange={(e) => update({ fontScale: Number(e.target.value) })}
              >
                {scaleOptions(settings.fontScale).map((v) => (
                  <option key={v} value={v}>{v}%</option>
                ))}
              </select>
            </SettingsRow>
          </SettingsGroup>
        </div>

        <div className="set-col">
          <SettingsGroup title="Reading aid">
            <SettingsRow
              name="Bionic reading"
              hint="Bolds the opening letters of a word to give the eye a fixation point. Applies to the guide you are reading, including one already open."
            >
              <Switch checked={settings.bionicOn} label="Bionic reading" onChange={(bionicOn) => update({ bionicOn })} />
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

          <SettingsGroup title="Startup">
            <SettingsRow name="Opens on" hint="Which section this device lands on when you load the page.">
              <select
                className="select"
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
        </div>
      </div>
    </div>
  );
}
