import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb, listRows, mutate, pendingCount, remove, type Op, type Row } from './local'
import { syncOnce, type PullResponse, type PushResult, type Transport } from './sync'

// In-memory stand-in for the server's push/pull semantics
class FakeServer implements Transport {
  seq = 0
  applied = new Set<string>()
  rows = new Map<string, { table: string; row: Row }>()
  reject = new Set<string>()
  offline = false

  async push(ops: Op[]) {
    if (this.offline) throw new TypeError('Failed to fetch')
    const results: PushResult[] = ops.map((op) => {
      if (this.applied.has(op.op_id)) return { op_id: op.op_id, status: 'duplicate' }
      if (this.reject.has(op.op_id)) return { op_id: op.op_id, status: 'rejected', error: 'nope' }
      const key = `${op.table}:${op.id}`
      const now = new Date().toISOString()
      const prev = this.rows.get(key)?.row ?? { id: op.id, created_at: op.client_ts, deleted_at: null }
      const row = { ...prev, ...(op.kind === 'delete' ? { deleted_at: now } : op.patch), updated_at: now, seq: ++this.seq } as Row
      this.rows.set(key, { table: op.table, row })
      this.applied.add(op.op_id)
      return { op_id: op.op_id, status: 'applied' }
    })
    return { results, server_time: new Date().toISOString() }
  }

  async pull(since: number): Promise<PullResponse> {
    if (this.offline) throw new TypeError('Failed to fetch')
    const rows = [...this.rows.values()].filter((r) => r.row.seq! > since).sort((a, b) => a.row.seq! - b.row.seq!)
    const page = rows.slice(0, 2)
    return { rows: page, next: page.at(-1)?.row.seq ?? since, has_more: rows.length > 2, server_time: new Date().toISOString() }
  }

  /** Simulate a change made on another device. */
  remote(table: string, id: string, patch: Record<string, unknown>) {
    const key = `${table}:${id}`
    const prev = this.rows.get(key)?.row ?? { id, created_at: 'x', deleted_at: null }
    this.rows.set(key, { table, row: { ...prev, ...patch, updated_at: 'x', seq: ++this.seq } as Row })
  }
}

let n = 0
beforeEach(async () => {
  await initDb(`test-${++n}`)
})

describe('local writes', () => {
  it('updates the row immediately and queues an op', async () => {
    await mutate('user', 'u1', { name: 'Eugene' })
    expect((await listRows('user')).map((r) => r.name)).toEqual(['Eugene'])
    expect(await pendingCount()).toBe(1)
  })

  it('hides deleted rows but keeps the tombstone locally', async () => {
    await mutate('user', 'u1', { name: 'Ana' })
    await remove('user', 'u1')
    expect(await listRows('user')).toEqual([])
    expect((await (await db()).get('user', 'u1'))?.deleted_at).toBeTruthy()
  })
})

describe('sync', () => {
  it('pushes the outbox and clears it', async () => {
    const server = new FakeServer()
    await mutate('user', 'u1', { name: 'Eugene' })
    await mutate('user', 'u1', { color: '#fff' })
    await syncOnce(server)
    expect(await pendingCount()).toBe(0)
    expect(server.rows.get('user:u1')?.row).toMatchObject({ name: 'Eugene', color: '#fff' })
  })

  it('keeps the outbox when the server is unreachable', async () => {
    const server = new FakeServer()
    server.offline = true
    await mutate('user', 'u1', { name: 'Offline' })
    await expect(syncOnce(server)).rejects.toThrow()
    expect(await pendingCount()).toBe(1)
    server.offline = false
    await syncOnce(server)
    expect(await pendingCount()).toBe(0)
  })

  it('pulls remote changes across pages', async () => {
    const server = new FakeServer()
    for (const id of ['a', 'b', 'c', 'd', 'e']) server.remote('user', id, { name: id })
    await syncOnce(server)
    expect((await listRows('user')).map((r) => r.name).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(await (await db()).get('meta', 'cursor')).toBe(5)
  })

  it('re-applies pending local edits on top of pulled rows', async () => {
    const server = new FakeServer()
    server.remote('user', 'u1', { name: 'Remote', color: '#000' })
    server.offline = true
    await mutate('user', 'u1', { color: '#abc' })
    server.offline = false
    // Pull only (as if the push had failed midway): the local color must survive
    const { pullChanges } = await import('./sync')
    await pullChanges(server)
    expect((await listRows('user'))[0]).toMatchObject({ name: 'Remote', color: '#abc' })
  })

  it('drops rejected ops instead of retrying forever', async () => {
    const server = new FakeServer()
    await mutate('user', 'u1', { name: 'x' })
    const [op] = await (await db()).getAll('outbox')
    server.reject.add(op.op_id)
    await syncOnce(server)
    expect(await pendingCount()).toBe(0)
  })

  it('treats a retried push as a no-op', async () => {
    const server = new FakeServer()
    await mutate('user', 'u1', { name: 'once' })
    const ops = (await (await db()).getAll('outbox')).map(({ n: _n, ...op }) => op)
    await server.push(ops) // first attempt reached the server but the response was lost
    await syncOnce(server)
    expect(server.seq).toBe(1)
  })
})
