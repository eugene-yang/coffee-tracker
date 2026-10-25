// Minimal history router: the current app path plus in-app link interception.
// App paths always start with "/"; BASE is prepended for hosting under a subpath (preview build).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function toAppPath(pathname: string): string {
  return pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname
}

/** URL for an app path, e.g. href('/settings'). */
export function href(path: string): string {
  return BASE + path
}

export const route = $state({ path: toAppPath(window.location.pathname) })

export function navigate(path: string): void {
  if (path === route.path) return
  history.pushState(null, '', href(path))
  route.path = path
  window.scrollTo(0, 0)
  document.querySelector('[data-scroll]')?.scrollTo(0, 0) // the phone layout scrolls inside <main>
}

/** Change the URL without a new history entry (e.g. once a screen's record has an id). */
export function replace(path: string): void {
  history.replaceState(null, '', href(path))
  route.path = path
}

export function startRouter(): void {
  window.addEventListener('popstate', () => (route.path = toAppPath(window.location.pathname)))
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a')
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    const url = new URL(a.href, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE)) return
    const path = toAppPath(url.pathname)
    if (path.startsWith('/api/')) return
    e.preventDefault()
    navigate(path)
  })
}
