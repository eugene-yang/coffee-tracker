// Sync client: push the outbox, then pull rows changed since our cursor.
// Pending local ops are re-applied on top of pulled rows so unsynced edits survive.
import { SYNC_TABLES, applyOp, db, emit, setClockOffset, type Op, type Row, type TableName } from './local'

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
}

export interface Transport {
  push(ops: Op[]): Promise<{ results: PushResult[]; server_time: string }>
  pull(since: number): Promise<PullResponse>
  /** Resolves true when stored, false when the server refuses the file for good (not an image). */
  uploadPhoto(id: string, blob: Blob): Promise<boolean>
}

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
    if (!res.ok) throw new Error(`photo upload failed: ${res.status}`)
    return true
  },
}

/** Upload captured photos before pushing the rows that reference them. */
export async function uploadPhotos(transport: Transport): Promise<void> {
  const d = await db()
  for (const id of await d.getAllKeys('photo_blob')) {
    const blob = await d.get('photo_blob', id)
    if (blob && !(await transport.uploadPhoto(id, blob))) console.warn('sync: photo refused by server', id)
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

export async function pullChanges(transport: Transport): Promise<void> {
  const d = await db()
  let cursor = ((await d.get('meta', 'cursor')) as number | undefined) ?? 0
  for (;;) {
    const res = await transport.pull(cursor)
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
