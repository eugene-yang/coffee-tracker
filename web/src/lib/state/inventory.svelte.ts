// Inventory view-model: derived bag views, search index and the current query (per device).
import {
  DEFAULT_DOSE_G,
  DEFAULT_REST_WINDOW,
  REST_WINDOW_SETTING,
  buildBagViews,
  type RestWindow,
  type SortKey,
} from '../domain/inventory'
import { AliasIndex, EMPTY_FILTER, buildIndex, search, type InventoryFilter } from '../domain/search'
import { aliases, bagEvents, bags, coffees, photos, roasters, settingValue } from './live.svelte'

export const DOSE_SETTING = 'default_dose_g'

class InventoryState {
  // Ages and freshness move with the clock; refresh every 10 minutes
  now = $state(new Date())

  rest = $derived(settingValue<RestWindow>(REST_WINDOW_SETTING, DEFAULT_REST_WINDOW))
  doseG = $derived(settingValue<number>(DOSE_SETTING, DEFAULT_DOSE_G))

  views = $derived(
    buildBagViews(
      { bags: bags.rows, coffees: coffees.rows, roasters: roasters.rows, events: bagEvents.rows, photos: photos.rows },
      { now: this.now, rest: this.rest, doseG: this.doseG },
    ),
  )
  byId = $derived(new Map(this.views.map((v) => [v.id, v])))
  aliasIndex = $derived(new AliasIndex(aliases.rows))
  index = $derived(buildIndex(this.views, this.aliasIndex))

  // Query state (not synced): search text, chips, sort
  text = $state('')
  filter = $state<InventoryFilter>({ ...EMPTY_FILTER })
  sort = $state<SortKey>('smart')

  hits = $derived(search(this.index, this.text))

  // Bags pending deletion (undo toast still showing)
  hidden = $state(new Set<string>())

  constructor() {
    setInterval(() => (this.now = new Date()), 10 * 60_000)
  }

  setHidden = (id: string, hide: boolean) => {
    const next = new Set(this.hidden)
    if (hide) next.add(id)
    else next.delete(id)
    this.hidden = next
  }

  clear() {
    this.text = ''
    this.filter = { ...EMPTY_FILTER }
  }
}

export const inventory = new InventoryState()
