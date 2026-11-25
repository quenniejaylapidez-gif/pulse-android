import type { ThemeId } from '../types/pulse';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  swatches: {
    primaryBg: string;
    secondaryBg: string;
    cardBg: string;
    primaryAccent: string;
    secondaryAccent: string;
    mainText: string;
    border: string;
  };
}

export const PULSE_THEMES: ThemeMeta[] = [
  {
    id: 'midnight-mint',
    name: 'Midnight Mint',
    description: 'Deep midnight navy with electric mint and icy blue highlights.',
    isDark: true,
    swatches: {
      primaryBg: '#101923',
      secondaryBg: '#182735',
      cardBg: '#202F3D',
      primaryAccent: '#B9F36B',
      secondaryAccent: '#65CDF5',
      mainText: '#F4F7F5',
      border: '#344452',
    },
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    description: 'Abyssal marine slate paired with aqua mint and crisp sky tones.',
    isDark: true,
    swatches: {
      primaryBg: '#0B1622',
      secondaryBg: '#122336',
      cardBg: '#1A3047',
      primaryAccent: '#4FE3B5',
      secondaryAccent: '#68C8FF',
      mainText: '#F2F7FB',
      border: '#2D4660',
    },
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    description: 'Deep woodland slate with bright botanical lime and sage cyan.',
    isDark: true,
    swatches: {
      primaryBg: '#0D1913',
      secondaryBg: '#15271E',
      cardBg: '#1D3428',
      primaryAccent: '#B4F05E',
      secondaryAccent: '#68DFC7',
      mainText: '#F3F8F4',
      border: '#2F4B3B',
    },
  },
  {
    id: 'light',
    name: 'Light Mode',
    description: 'Clean daylight canvas with high-contrast athletic green and ocean cyan.',
    isDark: false,
    swatches: {
      primaryBg: '#F3F6F4',
      secondaryBg: '#E6ECE8',
      cardBg: '#FFFFFF',
      primaryAccent: '#257A19',
      secondaryAccent: '#0E7490',
      mainText: '#101923',
      border: '#CBD6DF',
    },
  },
];

export const THEME_META_MAP: Record<ThemeId, ThemeMeta> = PULSE_THEMES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ThemeId, ThemeMeta>
);

export function applyDocumentTheme(theme: ThemeId): void {
  if (typeof document === 'undefined') return;
  const meta = THEME_META_MAP[theme] ?? THEME_META_MAP['midnight-mint'];
  document.documentElement.setAttribute('data-theme', meta.id);
  const themeMetaTag = document.querySelector('meta[name="theme-color"]');
  if (themeMetaTag) {
    themeMetaTag.setAttribute('content', meta.swatches.primaryBg);
  }
}
