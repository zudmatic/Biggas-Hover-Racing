/** The current character-selection design is the only supported presentation. */
export function createEntryTheme(root: HTMLElement) {
  root.dataset.entryTheme = 'figma';
  try {
    localStorage.removeItem('biggas-hover-racing-entry-theme-v2');
    localStorage.removeItem('biggas-hover-racing-entry-theme');
  } catch { /* The current design also works when storage is unavailable. */ }
}
