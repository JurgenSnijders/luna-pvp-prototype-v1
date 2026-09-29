/** Chrome opens its help page on F1 unless the page cancels the keydown. */
export function isBrowserHelpKey(e: KeyboardEvent): boolean {
  return e.code === 'F1' || e.key === 'F1' || e.key === 'Help';
}

/**
 * Cancel F1 before any in-page control sees it.
 * Bubble listeners often skip or stop the event while a text field is focused,
 * which lets Chrome open Help. Capture runs first, including in that case.
 * Keys pressed while the address bar or tab strip is focused never reach the page.
 */
export function installBrowserHelpKeyBlock(): void {
  const block = (e: KeyboardEvent): void => {
    if (!isBrowserHelpKey(e)) return;
    e.preventDefault();
  };
  window.addEventListener('keydown', block, true);
  window.addEventListener('keyup', block, true);
}
