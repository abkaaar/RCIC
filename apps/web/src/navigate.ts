/** Client-side navigation helper (shared to avoid App ↔ Room import cycles). */
export function navigate(path: string): void {
  history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
