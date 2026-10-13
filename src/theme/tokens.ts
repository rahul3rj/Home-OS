/**
 * Design tokens — the ONLY place in the app where raw values are allowed.
 *
 * Visual language, straight out of DESIGN.md: a vivid lime CTA pill
 * (`{colors.primary}`) as the one accent, a sage-tinted page canvas
 * (`{colors.canvas-soft}`) with white cards floating on it, near-black ink type,
 * and 24px pill-rectangles for every card and button. Display headlines are set
 * at weight 900 — that heaviness is the brand's typographic voice.
 *
 * Naming here is role-first rather than hex-first, so components read as intent:
 *   canvas        <- {colors.canvas-soft}   sage page background
 *   surface       <- {colors.canvas}        white card interior
 *   text          <- {colors.ink}           primary type
 *   textMuted     <- {colors.body}          secondary type
 *   textFaint     <- {colors.mute}          captions, placeholders
 *
 * The two hard rules that survived the rebrand:
 *   1. One accent. Lime is the CTA colour. It is never a success colour and never
 *      body text — status has its own positive / warning / negative family.
 *   2. Surface contrast carries elevation. A white card on the sage canvas needs
 *      no shadow; shadows are reserved for things that float above the page.
 */

/** Light theme. Sage canvas, white cards, lime CTAs. */
export const palette = {
  // Brand accent. The single CTA colour, plus its state and tint family.
  primary: '#9FE870',
  primaryActive: '#CDFFAD',
  primaryNeutral: '#C5EDAB',
  primaryPale: '#E2F6D5',
  /** Ink on lime. Lime is far too light to take white type. */
  onPrimary: '#0E0F0C',

  // Surfaces. Canvas is the page; surface is the card that sits on it.
  canvas: '#E8EBE6',
  surface: '#FFFFFF',
  /** Inset fills — progress tracks, neutral badges, code panels. */
  surfaceMuted: '#F2F4EF',
  /** Polarity flip: dark promotional cards, the undo toast, dark sheets. */
  surfaceInverse: '#0E0F0C',
  onInverse: '#E8EBE6',
  hairline: '#D2D5CE',

  // Text.
  text: '#0E0F0C',
  textMuted: '#454745',
  textFaint: '#868685',
  /** Emphasis ink for links and headlines on light surfaces. */
  textAccent: '#163300',

  // Status. Lime is deliberately absent here: it is the CTA, not a state.
  positive: '#2EAD4B',
  positiveDeep: '#054D28',
  positivePale: '#E2F6D5',
  warning: '#FFD11A',
  warningDeep: '#B86700',
  warningContent: '#4A3B1C',
  negative: '#D03238',
  negativeDeep: '#A72027',
  negativeDarkest: '#A7000D',
  negativeBg: '#320707',
  negativePale: '#FBE9E9',

  // Tertiary accents, for illustration content only.
  accentOrange: '#FFC091',
  accentCyan: '#38C8FF',
} as const;

/**
 * Dark theme. The same roles with the polarity flipped: the canvas darkens to a
 * near-black sage, cards lift one step, and lime stays exactly as bright because
 * it is the brand's CTA in both modes.
 */
export const darkPalette = {
  primary: '#9FE870',
  primaryActive: '#B4F394',
  primaryNeutral: '#C5EDAB',
  primaryPale: '#223A16',
  onPrimary: '#0E0F0C',

  canvas: '#101208',
  surface: '#1B1D14',
  surfaceMuted: '#25281D',
  surfaceInverse: '#E8EBE6',
  onInverse: '#101208',
  hairline: '#3A3E30',

  text: '#F4F6F1',
  textMuted: '#B9BDB2',
  textFaint: '#8A8F84',
  textAccent: '#CDFFAD',

  positive: '#5FD08A',
  positiveDeep: '#CDFFAD',
  positivePale: '#12301B',
  warning: '#FFD11A',
  warningDeep: '#FFE07A',
  warningContent: '#FFF6DA',
  negative: '#F4787E',
  negativeDeep: '#FFA3A8',
  negativeDarkest: '#FFB4B8',
  negativeBg: '#2A0D0E',
  negativePale: '#33100F',

  accentOrange: '#FFC091',
  accentCyan: '#38C8FF',
} as const;

/** 4px grid, plus a 2px hairline step. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

/**
 * The brand never uses a sharp corner on UI.
 *
 * `xl` (24px) is the canonical card AND button radius — the pill-rectangle that
 * gives the brand its friendliness. `pill` is a true capsule for status chips and
 * circular icon containers.
 */
export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  /** The brand's signature radius. Cards, buttons, sheets, dialogs, toasts. */
  xl: 24,
  pill: 9999,
  full: 9999,
} as const;

/**
 * Weight 900 for display, weight 600 for everything else.
 *
 * DESIGN.md's display face is the proprietary Wise Sans; the documented
 * open-source substitute is Inter at 900. Inter is bundled via
 * `@expo-google-fonts/inter` and loaded in `src/app/_layout.tsx` — display at
 * `Inter_900Black`, sub-display/labels at `Inter_600SemiBold`, body at
 * `Inter_400Regular`. Before the fonts load the system face renders instead,
 * so weight + size still carry the hierarchy on the very first paint.
 *
 * Line heights are the DESIGN.md ratios, so nothing needs a local override.
 */
export const type = {
  /** `{typography.display-md}` — hero and screen-defining headlines. */
  display: {
    fontFamily: 'Inter_900Black',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  /** `{typography.display-xs}` — screen and card headlines. */
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  /** `{typography.body-lg}` at 600 — lead paragraphs and card subheads. */
  subtitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, fontWeight: '600', lineHeight: 24 },
  /** `{typography.body-md}` — default body. */
  body: { fontFamily: 'Inter_400Regular', fontSize: 16, fontWeight: '400', lineHeight: 24 },
  /** `{typography.button-md}` / `{typography.body-md-strong}` — button labels. */
  bodyStrong: { fontFamily: 'Inter_600SemiBold', fontSize: 16, fontWeight: '600', lineHeight: 24 },
  /** `{typography.body-sm-strong}` — form labels and nav-weight captions. */
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  /** `{typography.caption}` — fine print. */
  caption: { fontFamily: 'Inter_400Regular', fontSize: 12, fontWeight: '400', lineHeight: 16 },
} as const;

/** Minimum interactive target. Both platforms' minimums in one number. */
export const HIT_SIZE = 48;

/**
 * Elevation.
 *
 * Level 0 (flat) and Level 1 (a 1px ink hairline) are the default and need no
 * token. Level 2 — the soft card — is just a white card on the sage canvas, so
 * the surface contrast IS the elevation. These three are only for things that
 * genuinely float above the page: sheets, dialogs, toasts, the FAB.
 *
 * `boxShadow` rather than shadowColor/shadowOpacity/shadowRadius, which React
 * Native 0.86 deprecates and the web renderer warns about.
 */
export const shadow = {
  card: { boxShadow: '0px 1px 2px rgba(14, 15, 12, 0.04)' },
  raised: { boxShadow: '0px 8px 24px rgba(14, 15, 12, 0.12)' },
  floating: { boxShadow: '0px 10px 30px rgba(14, 15, 12, 0.20)' },
} as const;

export type ThemeName = 'light' | 'dark';

/**
 * Widened to `string` on purpose. `as const` would pin each value to its
 * literal, which makes the dark palette unassignable.
 */
export type ThemeColors = Record<keyof typeof palette, string>;

/** The complete resolved theme a screen consumes. */
export type Theme = {
  name: ThemeName;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  shadow: typeof shadow;
};

/**
 * React Native's `hitSlop` never extends past a parent's bounds, so it only ever
 * supplements a control already sized to at least HIT_SIZE.
 */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export const lightTheme: Theme = {
  name: 'light',
  colors: palette,
  spacing,
  radius,
  type,
  hitSlop,
  shadow,
};

export const darkTheme: Theme = {
  name: 'dark',
  colors: darkPalette,
  spacing,
  radius,
  type,
  hitSlop,
  shadow,
};

/**
 * Avatar tints, indexed by profiles.avatar_index.
 * Drawn only from the brand's own dark inks, so every one of them takes white
 * initials well above 4.5:1 and the family roster never turns into a fruit salad.
 */
export const avatarTints = [
  '#0E0F0C',
  '#163300',
  '#054D28',
  '#4A3B1C',
  '#B86700',
  '#D03238',
  '#A72027',
  '#A7000D',
] as const;
