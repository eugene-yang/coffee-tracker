// Reactive views over local tables; reload whenever that table changes (local write or pull).
import { listRows, onChange, type Row, type TableName } from '../db/local'
import type { Alias, Bag, BagEvent, Coffee, Extraction, Photo, Roaster, Setting, User } from '../domain/types'

export type { User, Setting } from '../domain/types'

export class LiveTable<T extends Row = Row> {
  rows = $state<T[]>([])
  loaded = $state(false)
  byId = $derived(new Map(this.rows.map((r) => [r.id, r])))

  constructor(private table: TableName) {
    onChange((t) => {
      if (t === table) this.load()
    })
    this.load()
  }

  async load(): Promise<void> {
    this.rows = (await listRows(this.table)) as T[]
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

export function settingValue<T>(id: string, fallback: T): T {
  return (settings.get(id)?.value as T | undefined) ?? fallback
}
