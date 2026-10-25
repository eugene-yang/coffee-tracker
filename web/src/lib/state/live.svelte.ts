// Reactive views over local tables; reload whenever that table changes (local write or pull).
import { listRows, onChange, type Row, type TableName } from '../db/local'
import type {
  Alias,
  Bag,
  BagEvent,
  Brew,
  Brewer,
  BrewTaster,
  Coffee,
  Extraction,
  Grinder,
  Photo,
  Recipe,
  Roaster,
  Setting,
  Tasting,
  User,
} from '../domain/types'

export type { User, Setting } from '../domain/types'

/**
 * Rows deleted with an undo toast still showing ("table:id"). Deletes sync as tombstones and can't be
 * reverted, so they only happen once the toast closes; until then these rows are hidden everywhere.
 */
export const pendingDeletes = $state({ keys: new Set<string>() })

export class LiveTable<T extends Row = Row> {
  private all = $state<T[]>([])
  rows = $derived(this.all.filter((r) => !pendingDeletes.keys.has(`${this.table}:${r.id}`)))
  loaded = $state(false)
  byId = $derived(new Map(this.rows.map((r) => [r.id, r])))

  constructor(private table: TableName) {
    onChange((t) => {
      if (t === table) this.load()
    })
    this.load()
  }

  async load(): Promise<void> {
    this.all = (await listRows(this.table)) as T[]
    this.loaded = true
  }

  get(id: string | null | undefined): T | undefined {
    return id ? this.byId.get(id) : undefined
  }
}

export const users = new LiveTable<User>('user')
export const settings = new LiveTable<Setting>('setting')
export const roasters = new LiveTable<Roaster>('roaster')
export const coffees = new LiveTable<Coffee>('coffee')
export const bags = new LiveTable<Bag>('bag')
export const bagEvents = new LiveTable<BagEvent>('bag_event')
export const photos = new LiveTable<Photo>('photo')
export const extractions = new LiveTable<Extraction>('extraction')
export const aliases = new LiveTable<Alias>('alias')
export const grinders = new LiveTable<Grinder>('grinder')
export const brewers = new LiveTable<Brewer>('brewer')
export const recipes = new LiveTable<Recipe>('recipe')
export const brews = new LiveTable<Brew>('brew')
export const brewTasters = new LiveTable<BrewTaster>('brew_taster')
export const tastings = new LiveTable<Tasting>('tasting')

/** Equipment that isn't hidden (retired): what new brews and recipes are offered. Old brews keep their names. */
export const kit = {
  get brewers(): Brewer[] {
    return brewers.rows.filter((b) => !b.hidden_at)
  },
  get grinders(): Grinder[] {
    return grinders.rows.filter((g) => !g.hidden_at)
  },
}

export function settingValue<T>(id: string, fallback: T): T {
  return (settings.get(id)?.value as T | undefined) ?? fallback
}
