// Minimal history router: the current path plus in-app link interception.
export const route = $state({ path: window.location.pathname })

export function navigate(path: string): void {
  if (path === route.path) return
  history.pushState(null, '', path)
  route.path = path
  window.scrollTo(0, 0)
}

export function startRouter(): void {
  window.addEventListener('popstate', () => (route.path = window.location.pathname))
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a')
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    const url = new URL(a.href, window.location.href)
    if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return
    e.preventDefault()
    navigate(url.pathname)
  })
}
