import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('ranking publico nao renderiza entradas para login, cadastro ou administracao, inclusive no estado indisponivel', () => {
  const source = readFileSync(new URL('../../pages/PublicCampRanking.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /(?:to|href)\s*=\s*["']\/(?:login|cadastro|admin|gestor)/)
  assert.doesNotMatch(source, /Área administrativa|Criar conta de gestor/)
})
