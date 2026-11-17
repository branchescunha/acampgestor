import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTheme, readTheme, resolveTheme, saveTheme, THEME_STORAGE_KEY } from '../theme.js'

test('tema salvo valido tem prioridade sobre a preferencia do sistema', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})
test('tema ausente ou invalido segue a preferencia do sistema', () => {
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme('invalid', false), 'light')
})
test('leitura de tema utiliza apenas sua chave propria', () => {
  assert.equal(readTheme({ getItem(key) { assert.equal(key, THEME_STORAGE_KEY); return 'dark' } }, false), 'dark')
})
test('armazenamento bloqueado nao impede carregar a interface', () => {
  assert.equal(readTheme({ getItem() { throw new Error('blocked') } }, false), 'light')
  assert.equal(saveTheme({ setItem() { throw new Error('blocked') } }, 'dark'), false)
})
test('preferencia valida persiste sem tocar em autenticacao ou acampamento ativo', () => {
  const writes = []
  assert.equal(saveTheme({ setItem(...args) { writes.push(args) } }, 'light'), true)
  assert.deepEqual(writes, [[THEME_STORAGE_KEY, 'light']])
})
test('tema invalido nunca e persistido', () => {
  assert.equal(saveTheme({ setItem() { assert.fail('unexpected write') } }, 'invalid'), false)
})
test('aplicacao atualiza atributo, color-scheme e cor do navegador', () => {
  const meta = { setAttribute(key, value) { this[key] = value } }
  const doc = { documentElement: { dataset: {}, style: {} }, querySelector() { return meta } }
  applyTheme(doc, 'light')
  assert.equal(doc.documentElement.dataset.theme, 'light')
  assert.equal(doc.documentElement.style.colorScheme, 'light')
  assert.equal(meta.content, '#f4f6f8')
  applyTheme(doc, 'dark')
  assert.equal(doc.documentElement.dataset.theme, 'dark')
  assert.equal(meta.content, '#101215')
})
