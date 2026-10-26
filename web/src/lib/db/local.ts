// Local IndexedDB store: the UI's source of truth. Every write goes through mutate(),
// which updates the row immediately and queues an op in the outbox for the next sync.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { uuidv7 } from './uuid'

export const SYNC_TABLES = [
  'user',
  'setting',
  'roaster',
  'coffee',
  'bag',
  'bag_event',
  'photo',
  'extraction',
  'alias',
  'grinder',
  'brewer',
  'recipe',
  'brew',
  'brew_taster',
  'tasting',
  'dismissal',
] as const
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
  // restore: sending back a full local copy after the server was restored from a backup (never queued)
  kind: 'upsert' | 'delete' | 'restore'
  patch: Record<string, unknown>
  client_ts: string
  by: string | null
}

type SyncStores = { [T in TableName]: { key: string; value: Row } }

interface CoffeeDB extends DBSchema, SyncStores {
  outbox: { key: number; value: Op & { n?: number } }
  meta: { key: string; value: unknown }
  // Captured photos waiting to be uploaded (key: photo id)
  photo_blob: { key: string; value: Blob }
}

type Listener = (table: TableName | 'outbox' | 'photo_blob') => void

let dbPromise: Promise<IDBPDatabase<CoffeeDB>> | null = null
const listeners = new Set<Listener>()
let clockOffsetMs = 0
const storageFullListeners = new Set<() => void>()
let actorId: () => string | null = () => null

export function initDb(name = 'coffee'): Promise<IDBPDatabase<CoffeeDB>> {
  dbPromise = openDB<CoffeeDB>(name, 5, {
    upgrade(db) {
      // Additive: create whatever stores this version knows about and the old one didn't
      const has = (s: string) => db.objectStoreNames.contains(s as never)
      for (const t of SYNC_TABLES) if (!has(t)) db.createObjectStore(t, { keyPath: 'id' })
      if (!has('outbox')) db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true })
      if (!has('meta')) db.createObjectStore('meta')
      if (!has('photo_blob')) db.createObjectStore('photo_blob')
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

/** The device ran out of storage for this app (the one case the UI may block for). */
export function onStorageFull(fn: () => void): () => void {
  storageFullListeners.add(fn)
  return () => storageFullListeners.delete(fn)
}

export function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)
}

/** Report quota errors from a write, then rethrow. */
export function reportStorageFull(e: unknown): never {
  if (isQuotaError(e)) for (const fn of storageFullListeners) fn()
  throw e
}

export function onChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emit(table: TableName | 'outbox' | 'photo_blob'): void {
  for (const fn of listeners) fn(table)
}

/** Current time corrected by the server clock offset (the station's clock may drift). */
export function nowIso(): string {
  return new Date(nowMs()).toISOString()
}

export function nowMs(): number {
  return Date.now() + clockOffsetMs
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
  kind: 'upsert' | 'delete' = 'upsert',
): Promise<Row> {
  const op: Op = { op_id: uuidv7(), table, id, kind, patch, client_ts: nowIso(), by: actorId() }
  const tx = (await db()).transaction([table, 'outbox'], 'readwrite')
  const row = applyOp(await tx.objectStore(table).get(id), op)
  await Promise.all([tx.objectStore(table).put(row), tx.objectStore('outbox').add(op), tx.done]).catch(reportStorageFull)
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
  const d = await db()
  return (await d.count('outbox')) + (await d.count('photo_blob'))
}

export async function savePhotoBlob(id: string, blob: Blob): Promise<void> {
  await (await db()).put('photo_blob', blob, id).catch(reportStorageFull)
  emit('photo_blob')
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  return (await db()).get('photo_blob', id)
}
