// iOS Home Screen apps can lay out against a viewport shorter than the screen, leaving a strip under
// anything pinned to the bottom (WebKit bug 292603). The app fills the whole screen there, so the
// strip's height is the screen height minus the layout viewport; bottom-pinned elements use it as
// --viewport-gap to reach the real bottom edge. Safari tabs and Android are left alone (gap 0).

function measure(): number {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone !== true) return 0
  // iOS keeps screen.width/height in portrait
  const landscape = window.matchMedia('(orientation: landscape)').matches
  const long = Math.max(screen.width, screen.height)
  const short = Math.min(screen.width, screen.height)
  const [screenW, screenH] = landscape ? [long, short] : [short, long]
  // A window narrower than the screen (iPad Split View, Stage Manager) isn't full screen
  if (Math.abs(window.innerWidth - screenW) > 1) return 0
  return Math.max(0, screenH - window.innerHeight)
}

export function trackViewportGap(): void {
  const apply = () => document.documentElement.style.setProperty('--viewport-gap', `${measure()}px`)
  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 300))
}
