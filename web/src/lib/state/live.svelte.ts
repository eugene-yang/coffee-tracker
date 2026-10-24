// Reactive views over local tables; reload whenever that table changes (local write or pull).
import { listRows, onChange, type Row, type TableName } from '../db/local'

export class LiveTable<T extends Row = Row> {
  rows = $state<T[]>([])
  loaded = $state(false)

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
    return id ? this.rows.find((r) => r.id === id) : undefined
  }
}

export interface User extends Row {
  name: string | null
  color: string | null
  avatar: string | null
}

export interface Setting extends Row {
  value: unknown
}

export const users = new LiveTable<User>('user')
export const settings = new LiveTable<Setting>('setting')

export function settingValue<T>(id: string, fallback: T): T {
  return (settings.get(id)?.value as T | undefined) ?? fallback
}
