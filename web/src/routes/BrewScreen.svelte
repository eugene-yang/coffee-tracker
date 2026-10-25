<script lang="ts">
  // One brew: setup (Brew again / recipe / freestyle, steppers) → timer → time check → saved; anyone can rate it after
  import { onDestroy, onMount, untrack } from 'svelte'
  import BrewerArt from '../components/BrewerArt.svelte'
  import RecipeForm from '../components/RecipeForm.svelte'
  import Stepper from '../components/Stepper.svelte'
  import {
    brewAgainSource,
    brewerLabel,
    cuesBetween,
    formatClock,
    isEspresso,
    latestRecipes,
    paramSummary,
    paramsOf,
    ratio,
    stepGrind,
    stepLine,
    timerView,
  } from '../lib/domain/brew'
  import { beep, unlockAudio } from '../lib/sound'
  import { allowSleepAfter, keepAwake } from '../lib/wakelock'
  import { brewState, undoBrew } from '../lib/state/brew.svelte'
  import { currentLayout, device } from '../lib/state/device.svelte'
  import { inventory } from '../lib/state/inventory.svelte'
  import { brewers, brews, kit, recipes, users } from '../lib/state/live.svelte'
  import { href, navigate, route } from '../lib/state/router.svelte'
  import { showToast } from '../lib/state/toast.svelte'

  const bagId = $derived(route.path.split('/')[2] ?? '')
  const view = $derived(inventory.byId.get(bagId))
  const layout = $derived(currentLayout())
  const draft = $derived(brewState.draft)
  const p = $derived(draft?.params)

  // No draft, or an unstarted one for another bag → set up this bag, copying the last brew when possible.
  // A brew already timing for another bag is never replaced silently.
  $effect(() => {
    const id = bagId
    untrack(() => {
      const d = brewState.draft
      if (id && (!d || (d.bagId !== id && d.phase === 'setup'))) brewState.prepare(id, device.userId)
    })
  })
  // An unstarted setup left from before the household's brewers were added (or with one since
  // removed) picks one of them now, so the brew is linked to real equipment
  $effect(() => {
    const owned = kit.brewers
    untrack(() => {
      const d = brewState.draft
      if (d?.bagId === bagId && d.phase === 'setup' && owned.length && !owned.some((b) => b.id === d.params.brewer_id))
        brewState.prepare(bagId, d.brewerUserId ?? device.userId)
    })
  })
  const otherBrew = $derived(draft && draft.bagId !== bagId && draft.phase !== 'setup' ? draft : null)

  let adjusting = $state(false)
  let pickingRecipe = $state(false)
  let saved = $state<{ id: string } | null>(null)
  let savingRecipe = $state(false)

  // Only the household's own equipment is offered; every brew is linked to the brewer and grinder used
  const brewerName = $derived(p ? brewerLabel(p, brewers.rows) : '')
  const kitRecipes = $derived(
    latestRecipes(recipes.rows).filter((r) => (r.brewer_id ? r.brewer_id === p?.brewer_id : r.method === p?.method)),
  )
  const hasAgain = $derived(!!brewAgainSource(brews.rows, bagId, device.userId, p?.method, p?.brewer_id))
  const missingKit = $derived([!kit.brewers.length && 'brewer', !kit.grinders.length && 'grinder'].filter(Boolean).join(' and '))
  const brewerUserId = $derived(draft?.brewerUserId ?? device.userId)
  // Every brew is someone's: no brewing until this device (or the station's "Who's brewing?") has a person
  const brewingAs = $derived(users.get(brewerUserId))

  function chooseBrewer(id: string) {
    if (!draft || p?.brewer_id === id) return
    brewState.prepare(bagId, brewerUserId, { brewerId: id })
  }

  // ---- timer: elapsed is derived from the start timestamp on every tick
  let now = $state(Date.now())
  let lastElapsed = 0
  let flash = $state(false)
  let tick: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    keepAwake()
    tick = setInterval(() => {
      now = Date.now()
      if (brewState.draft?.phase !== 'running') return
      const e = brewState.elapsedS(now)
      const cues = cuesBetween(brewState.draft.params.steps, lastElapsed, e)
      if (cues.length) {
        beep(2)
        flash = true
        setTimeout(() => (flash = false), 600)
      }
      lastElapsed = e
    }, 250)
  })
  onDestroy(() => {
    clearInterval(tick)
    allowSleepAfter()
  })

  const elapsed = $derived(draft ? brewState.elapsedS(now) : 0)
  const tv = $derived(timerView(p?.steps ?? [], elapsed))

  function start() {
    unlockAudio() // the Start tap is the gesture iOS needs before any sound
    lastElapsed = 0
    brewState.start()
  }

  async function finish() {
    const espresso = isEspresso(p?.method)
    const params = p ? $state.snapshot(p) : null
    const id = await brewState.finish()
    saved = { id }
    allowSleepAfter()
    showToast('Brew saved', () => {
      undoBrew(id)
      saved = null
    })
    if (espresso && params) lastEspresso = params
  }

  // Espresso dial-in: pull another shot with the same settings (adjust grind before Start)
  let lastEspresso = $state<typeof p | null>(null)
  function pullAnother() {
    brewState.prepare(bagId, device.userId, { brewerId: lastEspresso?.brewer_id, method: 'espresso' })
    if (lastEspresso) brewState.update(lastEspresso)
    lastEspresso = null
    saved = null
    adjusting = true
  }

  function discard() {
    const snapshot = $state.snapshot(brewState.draft)
    brewState.discard()
    showToast('Brew discarded', () => snapshot && brewState.restore(snapshot))
    navigate('/')
  }

  const savedBrew = $derived(saved ? brews.get(saved.id) : undefined)
</script>

{#if !view}
  <p class="muted">Loading…</p>
{:else if otherBrew}
  <div class="card stack">
    <strong>A brew of {inventory.byId.get(otherBrew.bagId)?.title ?? 'another bag'} is in progress.</strong>
    <button class="primary" onclick={() => navigate(`/brew/${otherBrew.bagId}`)}>Go to it</button>
    <button onclick={() => brewState.prepare(bagId, device.userId)}>Discard it and brew this bag</button>
  </div>
{:else if saved}
  <div class="stack saved">
    <h2>Saved</h2>
    <p class="big">{view.title}</p>
    <p class="muted">Rate it once it has cooled a little — it waits {layout === 'station' ? 'in the strip under the beans' : 'on Home'}.</p>
    {#if lastEspresso}
      <button class="primary huge" onclick={pullAnother}>Pull another</button>
    {/if}
    {#if savingRecipe && savedBrew}
      <div class="card">
        <RecipeForm
          initial={{ ...paramsOf(savedBrew), name: `${view.title} · ${brewerLabel(savedBrew, brewers.rows)}`, note: '' }}
          onsaved={() => {
            savingRecipe = false
            showToast('Recipe saved')
          }}
          oncancel={() => (savingRecipe = false)}
        />
      </div>
    {:else}
      <button onclick={() => (savingRecipe = true)}>Save as recipe</button>
    {/if}
    <button class={lastEspresso ? '' : 'primary huge'} onclick={() => navigate('/')}>Back to {layout === 'station' ? 'inventory' : 'home'}</button>
  </div>
{:else if draft && p}
  <div class="brew {layout}" class:flash>
    <header class="bag">
      <span class="roaster">{view.roasterName}</span>
      <strong>{view.title}</strong>
    </header>

    {#if draft.phase === 'setup'}
      <div class="stack">
        <div class="chips" role="group" aria-label="Start from">
          {#if hasAgain}
            <button class="chip" class:on={draft.startedFrom === 'brew_again'} onclick={() => brewState.prepare(bagId, brewerUserId, { brewerId: p.brewer_id, method: p.method })}
              >↻ Brew again</button
            >
          {/if}
          <button class="chip" class:on={draft.startedFrom === 'recipe'} aria-expanded={pickingRecipe} onclick={() => (pickingRecipe = !pickingRecipe)}
            >Recipe…</button
          >
          <button
            class="chip"
            class:on={draft.startedFrom === 'freestyle'}
            onclick={() => brewState.prepare(bagId, brewerUserId, { brewerId: p.brewer_id, method: p.method, freestyle: true })}>Freestyle</button
          >
        </div>
        {#if pickingRecipe}
          <div class="chips">
            {#each kitRecipes as r (r.id)}
              <button
                class="chip"
                class:on={draft.recipeId === r.id}
                onclick={() => {
                  brewState.prepare(bagId, brewerUserId, { brewerId: p.brewer_id, recipe: r })
                  pickingRecipe = false
                }}>{r.name}</button
              >
            {:else}
              <span class="muted">No {brewerName} recipes yet — save one after a brew.</span>
            {/each}
          </div>
        {/if}

        {#if kit.brewers.length}
          <div class="chips" role="radiogroup" aria-label="Brewer">
            {#each kit.brewers as b (b.id)}
              <button class="chip brewer" role="radio" aria-checked={p.brewer_id === b.id} class:on={p.brewer_id === b.id} onclick={() => chooseBrewer(b.id)}>
                <BrewerArt illustrationKey={b.illustration} method={b.method} size={36} />{b.name}
              </button>
            {/each}
          </div>
        {/if}
        {#if kit.grinders.length > 1}
          <div class="chips" role="radiogroup" aria-label="Grinder">
            {#each kit.grinders as g (g.id)}
              <button class="chip" role="radio" aria-checked={p.grinder_id === g.id} class:on={p.grinder_id === g.id} onclick={() => brewState.update({ grinder_id: g.id })}
                >{g.name}</button
              >
            {/each}
          </div>
        {/if}

        {#if missingKit}
          <p class="muted kit-hint">Add your {missingKit} in <a href={href('/settings/equipment')}>Settings → Equipment</a> so brews are linked to it.</p>
        {/if}

        <button class="summary" aria-expanded={adjusting} onclick={() => (adjusting = !adjusting)}>
          <span class="params">{paramSummary(p) || 'Set dose and water'}</span>
          {#if ratio(p)}<span class="muted">{ratio(p)}</span>{/if}
          <span class="muted adjust">{adjusting ? 'Done' : 'Adjust'}</span>
        </button>
        {#if adjusting}
          <div class="card stack">
            <Stepper label="Dose" unit="g" step={0.5} value={p.dose_g} onchange={(v) => brewState.update({ dose_g: v })} />
            {#if isEspresso(p.method)}
              <Stepper label="Yield" unit="g" value={p.yield_g} onchange={(v) => brewState.update({ yield_g: v })} />
              <Stepper label="Target time" unit="s" value={p.time_s} onchange={(v) => brewState.update({ time_s: v })} />
            {:else}
              <Stepper label="Water" unit="g" step={5} value={p.water_g} onchange={(v) => brewState.update({ water_g: v })} />
            {/if}
            <Stepper label="Temp" unit="°C" value={p.temp_c} onchange={(v) => brewState.update({ temp_c: v })} />
            <div class="grind">
              <span class="muted">Grind</span>
              <button aria-label="Grind finer" onclick={() => brewState.update({ grind_setting: stepGrind(p.grind_setting, -1) })}>−</button>
              {#if layout === 'phone'}
                <input type="text" aria-label="Grind setting" value={p.grind_setting ?? ''} oninput={(e) => brewState.update({ grind_setting: e.currentTarget.value || null })} />
              {:else}
                <span class="value">{p.grind_setting ?? '—'}</span>
              {/if}
              <button aria-label="Grind coarser" onclick={() => brewState.update({ grind_setting: stepGrind(p.grind_setting, 1) })}>+</button>
            </div>
          </div>
        {/if}

        {#if p.steps.length}
          <ol class="steps">
            {#each p.steps as s, i (i)}<li>{stepLine(s)}</li>{/each}
          </ol>
        {/if}

        {#if !brewingAs && users.loaded}
          <p class="card who-hint">
            {#if layout === 'station'}Pick who's brewing at the top first.{:else}Add yourself in <a href={href('/settings')}>Settings</a> first, so the brew is recorded under your name.{/if}
          </p>
        {/if}
        <button class="primary huge" onclick={start} disabled={!brewingAs}>Start</button>
        <button class="link" onclick={() => brewState.stop()} disabled={!brewingAs}>Log without timer</button>
      </div>
    {:else if draft.phase === 'running'}
      <div class="timer">
        <div class="clock" aria-live="off">{formatClock(elapsed)}</div>
        {#if tv.current?.label || tv.current?.to_g}
          <div class="step">{tv.current.label ?? 'Pour'}{tv.current.to_g ? ` → ${tv.current.to_g} g` : ''}</div>
        {/if}
        {#if tv.next}
          <div class="next">
            <span class="muted">Next: {tv.next.label ?? 'Pour'}{tv.next.to_g ? ` → ${tv.next.to_g} g` : ''}</span>
            <span class="countdown">{formatClock(tv.nextInS ?? 0)}</span>
          </div>
        {/if}
        {#if draft.laps.length}
          <div class="laps muted">Laps: {draft.laps.map((l) => formatClock(l)).join(' · ')}</div>
        {/if}
        <div class="controls">
          <button class="discard" onclick={discard}>Discard</button>
          <button class="lap" onclick={() => brewState.lap()}>Lap</button>
          <button class="primary huge stop" onclick={() => brewState.stop()}>Done</button>
        </div>
      </div>
    {:else}
      <div class="stack">
        {#if draft.startedAt}<p class="big">{formatClock(p.time_s ?? 0)}</p>{/if}
        {#if isEspresso(p.method)}
          <Stepper label="Yield" unit="g" value={p.yield_g} onchange={(v) => brewState.update({ yield_g: v })} />
        {/if}
        <Stepper label="Time" unit="s" step={5} value={p.time_s} onchange={(v) => brewState.update({ time_s: v })} />
        <button class="primary huge" onclick={finish} disabled={!brewingAs}>Save brew</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .brew {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 760px;
    margin: 0 auto;
    padding-bottom: 24px;
  }
  .brew.flash {
    animation: flash 0.6s;
  }
  @keyframes flash {
    from {
      background: color-mix(in srgb, var(--accent) 35%, transparent);
    }
  }
  .bag {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .roaster {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .chip.brewer {
    padding-left: 6px;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .kit-hint {
    margin: 0;
    font-size: 14px;
  }
  .kit-hint a,
  .who-hint a {
    color: var(--accent);
  }
  .who-hint {
    margin: 0;
    border-color: var(--accent);
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    text-align: left;
  }
  .params {
    font-size: 22px;
    font-weight: 700;
    flex: 1;
  }
  .grind {
    display: grid;
    grid-template-columns: 1fr var(--tap) 96px var(--tap);
    align-items: center;
    gap: 8px;
  }
  .grind button {
    padding: 0;
    font-size: 24px;
  }
  .grind .value,
  .grind input {
    text-align: center;
    font-weight: 600;
  }
  .steps {
    margin: 0;
    padding-left: 20px;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .huge {
    min-height: 72px;
    font-size: 22px;
    font-weight: 700;
  }
  .link {
    border: none;
    background: transparent;
    color: var(--text-muted);
    min-height: 40px;
  }
  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .clock {
    font-size: 96px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .station .clock {
    font-size: 160px;
  }
  .step {
    font-size: 28px;
    font-weight: 600;
  }
  .station .step {
    font-size: 40px;
  }
  .next {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .countdown {
    font-size: 40px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .station .countdown {
    font-size: 64px;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr 2fr;
    gap: 12px;
    width: 100%;
    margin-top: 8px;
  }
  .discard {
    color: var(--text-muted);
  }
  .controls button {
    min-height: 72px;
  }
  .big {
    font-size: 32px;
    font-weight: 700;
    margin: 0;
  }
  .saved {
    max-width: 560px;
    margin: 0 auto;
  }
  .saved p {
    margin: 0;
  }
</style>
