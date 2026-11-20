import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadCampResultHistory } from '../eventOperations.js'

function harness(records, failAt = -1) {
  const calls = []
  const failure = { message: 'Synthetic page failure' }
  return {
    calls, failure,
    client: {
      from(table) {
        const filters = []
        const orders = []
        return {
          select(columns) { this.columns = columns; return this },
          eq(column, value) { filters.push([column, value]); return this },
          is(column, value) { filters.push([column, value]); return this },
          order(column, options) { orders.push([column, options?.ascending !== false]); return this },
          async range(start, end) {
            calls.push({ table, columns: this.columns, filters, orders, start, end })
            if (start === failAt) return { data: null, error: failure }
            const rows = records.filter(row => filters.every(([column, value]) => row[column] === value))
              .sort((a, b) => {
                for (const [column, ascending] of orders) {
                  const comparison = String(a[column]).localeCompare(String(b[column]))
                  if (comparison) return ascending ? comparison : -comparison
                }
                return 0
              })
            return { data: rows.slice(start, end + 1), error: null }
          },
        }
      },
    },
  }
}

for (const table of ['gymkhana_events', 'room_inspections']) {
  test(`${table}: retrieves every page with camp/deletion filters and deterministic ordering`, async () => {
    const records = Array.from({ length: 205 }, (_, index) => ({
      id: String(204 - index).padStart(3, '0'), camp_id: 'camp-a',
      created_at: index % 2 ? '2026-11-19T12:00:00Z' : '2026-11-20T12:00:00Z', deleted_at: null,
    }))
    records.push({ ...records[0], id: 'foreign', camp_id: 'camp-b' })
    records.push({ ...records[0], id: 'cancelled', deleted_at: '2026-11-20T13:00:00Z' })
    const { client, calls } = harness(records)
    const result = await loadCampResultHistory(client, table, 'camp-a', 'id,created_at')
    assert.equal(result.error, null)
    assert.equal(result.data.length, 205)
    assert.equal(new Set(result.data.map(row => row.id)).size, 205)
    assert.deepEqual(calls.map(call => [call.start, call.end]), [[0, 99], [100, 199], [200, 299]])
    assert.ok(calls.every(call => call.table === table && call.columns === 'id,created_at'))
    for (const call of calls) {
      assert.deepEqual(call.filters, [['camp_id', 'camp-a'], ['deleted_at', null]])
      assert.deepEqual(call.orders, [['created_at', false], ['id', true]])
    }
    assert.ok(result.data.every(row => row.camp_id === 'camp-a' && row.deleted_at === null))
  })
}

test('result history rejects partial data if a later page fails', async () => {
  const records = Array.from({ length: 101 }, (_, id) => ({ id, camp_id: 'camp-a', deleted_at: null }))
  const { client, calls, failure } = harness(records, 100)
  assert.deepEqual(await loadCampResultHistory(client, 'gymkhana_events', 'camp-a', 'id'), {
    data: null, error: failure,
  })
  assert.equal(calls.length, 2)
})

test('result history never queries without camp scope and supports empty results', async () => {
  const { client, calls } = harness([])
  assert.deepEqual(await loadCampResultHistory(client, 'room_inspections', null, 'id'), { data: [], error: null })
  assert.equal(calls.length, 0)
  assert.deepEqual(await loadCampResultHistory(client, 'room_inspections', 'camp-a', 'id'), { data: [], error: null })
  assert.equal(calls.length, 1)
})

test('Gymkhana and Inspections use the paginated loader rather than a truncated direct query', () => {
  for (const [page, table] of [['Gymkhana', 'gymkhana_events'], ['Inspections', 'room_inspections']]) {
    const source = readFileSync(new URL(`../../pages/${page}.jsx`, import.meta.url), 'utf8')
    assert.match(source, new RegExp(`loadCampResultHistory\\(\\s*supabase,\\s*'${table}',\\s*activeCampId`))
  }
})
