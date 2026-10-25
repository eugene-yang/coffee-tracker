<script lang="ts">
  // TEMPORARY (preview builds only): what iOS reports to the app about the screen and viewport, to fix
  // the tab bar in the Home Screen app from real numbers. Remove once the bar is confirmed.
  import { onMount } from 'svelte'

  let lines = $state<[string, string][]>([])
  let tinted = $state(false)
  let copied = $state(false)

  // Lengths only CSS knows (viewport units, safe-area insets), read through a probe element
  function css(value: string, prop: 'height' | 'paddingTop' = 'height'): string {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none'
    probe.style[prop] = value
    document.body.append(probe)
    const px = prop === 'height' ? probe.getBoundingClientRect().height : parseFloat(getComputedStyle(probe).paddingTop)
    probe.remove()
    return `${Math.round(px * 10) / 10}`
  }

  function read() {
    const root = document.documentElement
    const nav = document.querySelector('nav[aria-label="Sections"]')?.getBoundingClientRect()
    const frame = document.querySelector('.phone')?.getBoundingClientRect()
    const vv = window.visualViewport
    const n = navigator as Navigator & { standalone?: boolean }
    lines = [
      ['iOS', /OS (\d+[_.\d]*)/.exec(navigator.userAgent)?.[1]?.replace(/_/g, '.') ?? '?'],
      ['standalone', `${n.standalone} · display-mode ${matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'}`],
      ['screen', `${screen.width} × ${screen.height} @${devicePixelRatio}x`],
      ['inner', `${innerWidth} × ${innerHeight}`],
      ['outer', `${outerWidth} × ${outerHeight}`],
      ['clientHeight', `${root.clientHeight}`],
      ['visualViewport', vv ? `${Math.round(vv.height * 10) / 10} (top ${vv.offsetTop})` : '—'],
      ['100vh / dvh / svh / lvh', ['100vh', '100dvh', '100svh', '100lvh'].map((v) => css(v)).join(' / ')],
      ['safe top / bottom', `${css('env(safe-area-inset-top)', 'paddingTop')} / ${css('env(safe-area-inset-bottom)', 'paddingTop')}`],
      ['--viewport-gap', getComputedStyle(root).getPropertyValue('--viewport-gap').trim()],
      ['--bottom-inset', css('var(--bottom-inset)', 'paddingTop')],
      ['ios-gap class', `${root.classList.contains('ios-gap')}`],
      ['frame top / bottom', frame ? `${frame.top} / ${frame.bottom}` : '—'],
      ['tab bar top / bottom', nav ? `${Math.round(nav.top)} / ${Math.round(nav.bottom)}` : '—'],
    ]
  }

  onMount(() => {
    read()
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('resize', read)
      document.documentElement.classList.remove('debug-tint')
    }
  })

  function tint() {
    tinted = !tinted
    document.documentElement.classList.toggle('debug-tint', tinted)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.map(([k, v]) => `${k}: ${v}`).join('\n'))
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      // clipboard blocked: a screenshot works too
    }
  }
</script>

<section class="stack">
  <h2>Screen readout (preview only)</h2>
  <div class="card stack">
    <dl>
      {#each lines as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
    </dl>
    <div class="row">
      <button onclick={read}>Refresh</button>
      <button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      <button class:on={tinted} onclick={tint}>Tint page background</button>
    </div>
    <p class="muted">With the tint on, anything magenta is the page itself; a strip that stays light is drawn by iOS outside the page.</p>
  </div>
</section>

<style>
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
  }
  .row {
    flex-wrap: wrap;
  }
  .on {
    border-color: var(--accent);
    color: var(--accent);
  }
  p {
    margin: 0;
    font-size: 14px;
  }
  :global(:root.debug-tint),
  :global(:root.debug-tint body) {
    background: #ff00ff !important;
  }
</style>
