export const colors = {
  bg: '#14101c',
  surface: '#1f1a2b',
  surfaceAlt: '#2a2338',
  border: '#3a3150',
  text: '#f2eefa',
  textMuted: '#a69cba',
  accent: '#c9a227',
  add: '#2ecc71',
  discard: '#e74c3c',
  undo: '#f1c40f',
} as const;

/** Formats offered when creating a deck / filtering by legality. `null` = no restriction. */
export const FORMATS: { key: string | null; label: string }[] = [
  { key: null, label: 'Libre' },
  { key: 'standard', label: 'Estándar' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'modern', label: 'Modern' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'commander', label: 'Commander' },
];

export function formatLabel(key: string | null): string {
  return FORMATS.find((f) => f.key === key)?.label ?? 'Libre';
}
