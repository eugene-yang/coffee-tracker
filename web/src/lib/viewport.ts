// iOS Home Screen apps (iOS 26) can lay out against a viewport shorter than the screen, leaving a
// strip at the bottom (WebKit bug 292603). iOS paints only the page background there and clips fixed
// elements at the viewport's edge, so nothing is moved into the strip: its height is measured as the
// screen height minus the layout viewport (--viewport-gap, used to trim the bars' safe-area padding),
// and the "ios-gap" class lets CSS paint the page background in the tab bar's color. Any iPhone model
// works; without the bug, in Safari tabs and on Android the gap is 0 and nothing changes.

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
  const apply = () => {
    const gap = measure()
    document.documentElement.style.setProperty('--viewport-gap', `${gap}px`)
    document.documentElement.classList.toggle('ios-gap', gap > 0)
  }
  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 300))
}
