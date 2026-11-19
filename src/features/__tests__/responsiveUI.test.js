import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

test('all date forms use the shared native field with padding outside the input', () => {
  const css = read('src/index.css')
  assert.match(css, /\.date-field-input[\s\S]*?padding: 0;/)
  for (const path of [
    'src/pages/Camps.jsx',
    'src/pages/Participants.jsx',
    'src/components/CreateCampForm.jsx',
  ]) {
    const source = read(path)
    assert.match(source, /import DateField/)
    assert.doesNotMatch(source, /<input\s[^>]*type="date"/s)
  }
})

test('table actions reserve desktop space and can wrap without breaking words', () => {
  const css = read('src/index.css')
  assert.match(
    read('src/components/ResponsiveTable.jsx'),
    /record-actions-cell/
  )
  assert.match(css, /\.record-actions-row\s*\{[^}]*flex-wrap: wrap/)
  assert.match(css, /\.record-action\s*\{[^}]*overflow-wrap: normal/)
})

test('camp archive filtering preserves records, order and draft camps', async () => {
  const { filterCampsByArchive } = await import('../camps/campList.js')
  const camps = [
    { id: '1', status: 'active' },
    { id: '2', status: 'archived' },
    { id: '3', status: 'draft' },
  ]
  assert.deepEqual(filterCampsByArchive(camps, false), [camps[0], camps[2]])
  assert.deepEqual(filterCampsByArchive(camps, true), [camps[1]])
  assert.deepEqual(filterCampsByArchive([], true), [])
  assert.equal(camps.length, 3)
  assert.equal(camps[1].status, 'archived')
})

test('symbol presentation accommodates multiple graphemes without changing stored text', () => {
  const component = read('src/components/EntitySymbol.jsx')
  const css = read('src/index.css')
  assert.match(component, /countGraphemes\(symbol\)/)
  assert.match(component, /\{symbol\}/)
  assert.doesNotMatch(component, /\.slice\(|\.substring\(/)
  assert.match(css, /\.entity-symbol-2\s*\{[^}]*font-size: 16px/)
  assert.match(css, /\.entity-symbol-3\s*\{[^}]*font-size: 12px/)
})
