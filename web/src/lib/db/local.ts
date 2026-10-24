// Local IndexedDB store: the UI's source of truth. Every write goes through mutate(),
// which updates the row immediately and queues an op in the outbox for the next sync.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { uuidv7 } from './uuid'

export const SYNC_TABLES = ['user', 'setting'] as const
export type TableName = (typeof SYNC_TABLES)[number]

export interface Row {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  updated_by?: string | null
  seq?: number
  [field: string]: unknown
}

export interface Op {
  op_id: string
  table: TableName
  id: string
  kind: 'upsert' | 'delete'
  patch: Record<string, unknown>
  client_ts: string
  by: string | null
}

interface CoffeeDB extends DBSchema {
  user: { key: string; value: Row }
  setting: { key: string; value: Row }
  outbox: { key: number; value: Op & { n?: number } }
  meta: { key: string; value: unknown }
}

type Listener = (table: TableName | 'outbox') => void

let dbPromise: Promise<IDBPDatabase<CoffeeDB>> | null = null
const listeners = new Set<Listener>()
let clockOffsetMs = 0
let actorId: () => string | null = () => null

export function initDb(name = 'coffee'): Promise<IDBPDatabase<CoffeeDB>> {
  dbPromise = openDB<CoffeeDB>(name, 1, {
    upgrade(db) {
      for (const t of SYNC_TABLES) db.createObjectStore(t, { keyPath: 'id' })
      db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true })
      db.createObjectStore('meta')
    },
  })
  dbPromise.then(async (db) => {
    clockOffsetMs = ((await db.get('meta', 'clock_offset_ms')) as number | undefined) ?? 0
  })
  return dbPromise
}

export function db(): Promise<IDBPDatabase<CoffeeDB>> {
  return dbPromise ?? initDb()
}

/** Who gets recorded as updated_by on local writes. */
export function setActor(fn: () => string | null): void {
  actorId = fn
}

export function onChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emit(table: TableName | 'outbox'): void {
  for (const fn of listeners) fn(table)
}

/** Current time corrected by the server clock offset (the station's clock may drift). */
export function nowIso(): string {
  return new Date(Date.now() + clockOffsetMs).toISOString()
}

export async function setClockOffset(serverTime: string): Promise<void> {
  clockOffsetMs = Date.parse(serverTime) - Date.now()
  await (await db()).put('meta', clockOffsetMs, 'clock_offset_ms')
}

export function applyOp(existing: Row | undefined, op: Op): Row {
  const base = existing ?? { id: op.id, created_at: op.client_ts, updated_at: op.client_ts, deleted_at: null }
  if (op.kind === 'delete') return { ...base, deleted_at: base.deleted_at ?? op.client_ts, updated_at: op.client_ts }
  return { ...base, ...op.patch, id: op.id, updated_at: op.client_ts }
}

export async function mutate(
  table: TableName,
  id: string,
  patch: Record<string, unknown>,
  kind: Op['kind'] = 'upsert',
): Promise<Row> {
  const op: Op = { op_id: uuidv7(), table, id, kind, patch, client_ts: nowIso(), by: actorId() }
  const tx = (await db()).transaction([table, 'outbox'], 'readwrite')
  const row = applyOp(await tx.objectStore(table).get(id), op)
  await Promise.all([tx.objectStore(table).put(row), tx.objectStore('outbox').add(op), tx.done])
  emit(table)
  emit('outbox')
  return row
}

export function remove(table: TableName, id: string): Promise<Row> {
  return mutate(table, id, {}, 'delete')
}

export async function listRows(table: TableName): Promise<Row[]> {
  const rows = await (await db()).getAll(table)
  return rows.filter((r) => !r.deleted_at)
}

export async function getRow(table: TableName, id: string): Promise<Row | undefined> {
  const row = await (await db()).get(table, id)
  return row && !row.deleted_at ? row : undefined
}

export async function pendingCount(): Promise<number> {
  return (await db()).count('outbox')
}
