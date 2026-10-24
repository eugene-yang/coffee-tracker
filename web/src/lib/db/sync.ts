// Sync client: push the outbox, then pull rows changed since our cursor.
// Pending local ops are re-applied on top of pulled rows so unsynced edits survive.
import { SYNC_TABLES, applyOp, db, emit, nowIso, setClockOffset, type Op, type Row, type TableName } from './local'
import { uuidv7 } from './uuid'

export interface PushResult {
  op_id: string
  status: 'applied' | 'duplicate' | 'rejected'
  error?: string | null
}

export interface PullResponse {
  rows: { table: string; row: Row }[]
  next: number
  has_more: boolean
  server_time: string
  epoch?: number // changes when the server's database is restored from a backup
}

export interface Transport {
  push(ops: Op[]): Promise<{ results: PushResult[]; server_time: string }>
  pull(since: number): Promise<PullResponse>
  /** Resolves true when stored, false when the server refuses the file for good (not an image).
   *  Throws ServerError when the server failed (keep the photo, retry later), anything else when unreachable. */
  uploadPhoto(id: string, blob: Blob): Promise<boolean>
}

/** The server answered but failed (5xx): not a reason to stop syncing everything else. */
export class ServerError extends Error {}

const API = `${import.meta.env.BASE_URL}api`

export const httpTransport: Transport = {
  async push(ops) {
    const res = await fetch(`${API}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    })
    if (!res.ok) throw new Error(`push failed: ${res.status}`)
    return res.json()
  },
  async pull(since) {
    const res = await fetch(`${API}/sync/pull?since=${since}`)
    if (!res.ok) throw new Error(`pull failed: ${res.status}`)
    return res.json()
  },
  async uploadPhoto(id, blob) {
    const res = await fetch(`${API}/photos/${id}`, { method: 'PUT', body: blob })
    if (res.status === 400) return false
    if (!res.ok) throw new ServerError(`photo upload failed: ${res.status}`)
    return true
  },
}

/** Upload captured photos before pushing the rows that reference them. */
export async function uploadPhotos(transport: Transport): Promise<void> {
  const d = await db()
  for (const id of await d.getAllKeys('photo_blob')) {
    const blob = await d.get('photo_blob', id)
    try {
      if (blob && !(await transport.uploadPhoto(id, blob))) console.warn('sync: photo refused by server', id)
    } catch (e) {
      // One photo the server chokes on must not hold back every other change: keep it, retry next sync
      if (!(e instanceof ServerError)) throw e
      console.warn('sync: photo upload failed, will retry', id, e.message)
      continue
    }
    await d.delete('photo_blob', id)
    emit('photo_blob')
  }
}

const PUSH_BATCH = 200

export async function pushOutbox(transport: Transport): Promise<void> {
  const d = await db()
  for (;;) {
    const entries = await d.getAll('outbox', null, PUSH_BATCH)
    if (entries.length === 0) return
    const ops = entries.map(({ n: _n, ...op }) => op)
    const { results } = await transport.push(ops)
    const done = new Set(results.map((r) => r.op_id))
    for (const r of results) if (r.status === 'rejected') console.warn('sync: op rejected', r.op_id, r.error)

    const tx = d.transaction('outbox', 'readwrite')
    await Promise.all([...entries.filter((e) => done.has(e.op_id)).map((e) => tx.store.delete(e.n!)), tx.done])
    emit('outbox')
    if (done.size < entries.length) throw new Error('push: server did not acknowledge every op')
  }
}

/**
 * The server was restored from a backup: send back every local row. The server keeps whichever copy
 * is newer, so whatever this device has from after the backup is not lost.
 */
export async function healServer(transport: Transport): Promise<void> {
  const d = await db()
  let batch: Op[] = []
  const flush = async () => {
    if (!batch.length) return
    const { results } = await transport.push(batch)
    for (const r of results) if (r.status === 'rejected') console.warn('sync: restore op rejected', r.op_id, r.error)
    batch = []
  }
  for (const table of SYNC_TABLES) {
    for (const { id, seq: _seq, ...patch } of await d.getAll(table)) {
      if (typeof patch.updated_at !== 'string') continue
      batch.push({ op_id: uuidv7(), table, id, kind: 'restore', patch, client_ts: nowIso(), by: (patch.updated_by as string | null) ?? null })
      if (batch.length >= PUSH_BATCH) await flush()
    }
  }
  await flush()
}

export async function pullChanges(transport: Transport): Promise<void> {
  const d = await db()
  let cursor = ((await d.get('meta', 'cursor')) as number | undefined) ?? 0
  for (;;) {
    const res = await transport.pull(cursor)
    if (res.epoch !== undefined) {
      const known = (await d.get('meta', 'epoch')) as number | undefined
      if (known !== undefined && known !== res.epoch) {
        // Restored server: our cursor points past its history. Heal it, then pull everything again.
        await healServer(transport)
        await d.put('meta', 0, 'cursor')
        await d.put('meta', res.epoch, 'epoch')
        cursor = 0
        continue
      }
      if (known === undefined) await d.put('meta', res.epoch, 'epoch')
    }
    const touched = new Set<TableName>()
    const tx = d.transaction([...SYNC_TABLES, 'outbox', 'meta'], 'readwrite')
    const pending = await tx.objectStore('outbox').getAll()
    for (const { table, row } of res.rows) {
      if (!(SYNC_TABLES as readonly string[]).includes(table)) continue // table from a newer server
      const t = table as TableName
      let merged = row
      for (const op of pending) if (op.table === t && op.id === row.id) merged = applyOp(merged, op)
      await tx.objectStore(t).put(merged)
      touched.add(t)
    }
    await tx.objectStore('meta').put(res.next, 'cursor')
    await tx.done
    await setClockOffset(res.server_time)
    for (const t of touched) emit(t)
    cursor = res.next
    if (!res.has_more) return
  }
}

export async function syncOnce(transport: Transport = httpTransport): Promise<void> {
  await uploadPhotos(transport)
  await pushOutbox(transport)
  await pullChanges(transport)
}
