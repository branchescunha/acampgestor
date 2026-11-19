import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createMockContext } from './fixtures.mjs'
import { accountNavigationInteractions } from './account-navigation.mjs'

const require = createRequire(import.meta.url)
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const widths = process.env.QA_WIDTHS
  ? process.env.QA_WIDTHS.split(',').map(Number)
  : [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920]
const phase = process.env.QA_PHASE || 'all'
const baseURL = 'http://127.0.0.1:5191'
const output =
  process.env.QA_VISUAL_OUTPUT ||
  join(tmpdir(), `acampgestor-responsive-${Date.now()}`)
const results = []
const errors = []
const routes = {
  public: [
    '/',
    '/login',
    '/cadastro',
    '/recuperar-senha',
    '/redefinir-senha',
    '/qa-unificado',
    '/inexistente',
  ],
  admin: [
    '/admin',
    '/admin/acampamentos',
    '/admin/usuarios',
    '/admin/organizacoes',
    '/admin/conta',
  ],
  gestor: [
    '/gestor',
    '/qa-unificado/gestor',
    ...[
      'equipes',
      'quartos',
      'participantes',
      'pontuacao',
      'gincana',
      'inspecoes',
      'historico',
      'conta',
      'exportacao',
    ].map((path) => `/qa-unificado/gestor/${path}`),
  ],
}

async function ready(page, path) {
  await page.goto(baseURL + path)
  await page.locator('h1:visible').first().waitFor()
  await page.waitForTimeout(100)
  assert.equal(
    new URL(page.url()).pathname,
    path,
    `Unexpected redirect from ${path}`
  )
}

async function measure(page) {
  return page.evaluate(() => {
    const visible = (el) =>
      el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return {
        x: r.x,
        right: r.right,
        y: r.y,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }
    const dates = [
      ...document.querySelectorAll(
        'input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"], input[type="week"]'
      ),
    ]
      .filter(visible)
      .map((el) => {
        const parent = el.closest('.date-field')
        const r = rect(el)
        const p = parent ? rect(parent) : rect(el.parentElement)
        const style = getComputedStyle(el)
        return {
          ...r,
          name: el.name,
          parent: p,
          padding: style.padding,
          overflow:
            r.x < p.x - 1 || r.right > p.right + 1 || p.right > innerWidth + 1,
        }
      })
    const actions = [...document.querySelectorAll('.record-actions button')]
      .filter(visible)
      .map((el) => ({
        ...rect(el),
        text: el.textContent.trim(),
        clipped:
          el.scrollWidth > el.clientWidth + 1 ||
          el.scrollHeight > el.clientHeight + 1,
      }))
    const symbols = [...document.querySelectorAll('.entity-symbol')]
      .filter(visible)
      .map((el) => ({
        ...rect(el),
        parent: rect(el.parentElement),
        clipped:
          !el.classList.contains('entity-symbol-legacy') &&
          (el.scrollWidth > el.clientWidth + 1 ||
            el.scrollHeight > el.clientHeight + 1),
      }))
    const tables = [...document.querySelectorAll('.records-table-view')]
      .filter(visible)
      .map((el) => ({ width: el.clientWidth, contentWidth: el.scrollWidth }))
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      dates,
      actions,
      symbols,
      tables,
    }
  })
}

function validate(metrics, label) {
  assert.ok(
    metrics.overflow <= 1,
    `${label}: document overflow ${metrics.overflow}`
  )
  for (const date of metrics.dates) {
    assert.equal(
      date.overflow,
      false,
      `${label}: date outside wrapper/form: ${JSON.stringify(date)}`
    )
    assert.equal(
      date.padding,
      '0px',
      `${label}: native temporal input must not own padding`
    )
  }
  for (const action of metrics.actions) {
    assert.ok(
      action.width >= 72 && action.height >= 44 && action.height <= 70,
      `${label}: unusable action ${JSON.stringify(action)}`
    )
    assert.equal(
      action.clipped,
      false,
      `${label}: clipped action ${action.text}`
    )
  }
  for (const symbol of metrics.symbols) {
    assert.equal(symbol.clipped, false, `${label}: valid symbol is clipped`)
    assert.ok(
      symbol.x >= symbol.parent.x - 1 &&
        symbol.right <= symbol.parent.right + 1,
      `${label}: symbol escapes frame`
    )
  }
  if (label.endsWith('/admin/acampamentos')) {
    for (const table of metrics.tables)
      assert.ok(
        table.contentWidth <= table.width + 1,
        `${label}: camp actions require horizontal scrolling`
      )
  }
}

async function essentialInteractions(browser, engine) {
  const { context, fixture } = await createMockContext(browser, {
    role: 'gestor',
    width: 390,
    baseURL,
    mobile: true,
  })
  const page = await context.newPage()
  page.on('dialog', async (dialog) => {
    assert.equal(dialog.type(), 'beforeunload')
    await dialog.accept()
  })
  page.on('pageerror', (error) => errors.push(`${engine}: ${error.message}`))
  try {
    await ready(page, '/gestor')
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.locator('input[name="start_date"]').fill('2027-02-20')
    await page.locator('input[name="end_date"]').fill('2027-02-19')
    const writesBeforeInvalidDate = fixture.writes.length
    const nativeDate = await page
      .locator('input[name="end_date"]')
      .evaluate((el) => el.type === 'date')
    await page
      .getByRole('button', { name: 'Salvar acampamento', exact: true })
      .click()
    if (nativeDate) {
      assert.equal(
        await page
          .locator('input[name="end_date"]')
          .evaluate((el) => el.validity.rangeUnderflow),
        true
      )
    } else {
      await page
        .getByRole('alert')
        .filter({ hasText: 'A data de fim não pode ser anterior' })
        .waitFor()
    }
    assert.equal(
      fixture.writes.length,
      writesBeforeInvalidDate,
      'An invalid date range must never be submitted'
    )
    await page.locator('input[name="end_date"]').fill('2027-02-23')
    await page
      .getByRole('button', { name: 'Salvar acampamento', exact: true })
      .click()
    await page.getByRole('button', { name: 'Editar', exact: true }).waitFor()
    assert.equal(fixture.writes.at(-1).payload.start_date, '2027-02-20')
    assert.equal(fixture.writes.at(-1).payload.end_date, '2027-02-23')
    const beforeArchive = structuredClone(fixture.data)
    await page.getByRole('button', { name: 'Arquivar', exact: true }).click()
    assert.equal(fixture.writes.at(-1).payload.status, undefined)
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('button', { name: 'Arquivar', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Arquivar', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Arquivados (1)', exact: true })
      .click()
    await page.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Restaurar', exact: true })
      .click()
    await page.getByRole('button', { name: 'Ativos (1)', exact: true }).click()
    await page.getByRole('button', { name: 'Arquivar', exact: true }).waitFor()
    assert.equal(fixture.data.camps.length, 1)
    assert.equal(fixture.camp.status, 'active')
    for (const table of [
      'tribes',
      'competition_teams',
      'participants',
      'score_events',
      'gymkhana_events',
      'room_inspections',
    ])
      assert.deepEqual(fixture.data[table], beforeArchive[table])
    assert.ok(fixture.writes.every((write) => write.method !== 'DELETE'))

    await ready(page, '/qa-unificado/gestor/participantes')
    const date = page.locator('input[name="birth_date"]')
    await date.fill('2000-02-29')
    assert.equal(await date.inputValue(), '2000-02-29')
    await date.fill('1999-12-31')
    assert.equal(await date.inputValue(), '1999-12-31')
    for (const section of [
      'equipes',
      'quartos',
      'participantes',
      'pontuacao',
      'gincana',
      'inspecoes',
    ]) {
      await ready(page, `/qa-unificado/gestor/${section}`)
      const row = page.locator('.record-actions-row:visible').first()
      await row.getByRole('button', { name: 'Editar', exact: true }).click()
      const writeCount = fixture.writes.length
      await row.getByRole('button').nth(1).click()
      await page.getByRole('dialog').waitFor()
      await page.keyboard.press('Shift+Tab')
      assert.equal(
        await page
          .getByRole('dialog')
          .evaluate((el) => el.contains(document.activeElement)),
        true
      )
      await page.keyboard.press('Escape')
      assert.equal(fixture.writes.length, writeCount)
      const menu = page.locator(
        '.app-toolbar button[aria-controls="camp-navigation"]'
      )
      await menu.click()
      assert.equal(await menu.getAttribute('aria-expanded'), 'true')
      await page.keyboard.press('Escape')
      assert.equal(await menu.getAttribute('aria-expanded'), 'false')
    }
    fixture.data.public_ranking_competition_teams =
      fixture.data.competition_teams.slice(0, 1)
    await ready(page, '/qa-unificado')
    assert.equal(
      await page
        .getByLabel('Pódio', { exact: true })
        .locator('article')
        .count(),
      1
    )
    fixture.data.public_ranking_competition_teams =
      fixture.data.competition_teams.slice(0, 2)
    await ready(page, '/qa-unificado')
    assert.equal(
      await page
        .getByLabel('Pódio', { exact: true })
        .locator('article')
        .count(),
      2
    )
    fixture.failReads = true
    await ready(page, '/qa-unificado')
    await page.getByRole('alert').waitFor()
    validate(await measure(page), `${engine} public error`)
    fixture.failReads = false
    await page
      .locator('#main-content')
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click()
    await page.getByLabel('Pódio', { exact: true }).waitFor()
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 960 })
      await ready(page, '/qa-unificado/gestor/equipes')
      const before = fixture.writes.length
      await page
        .locator('.record-actions-row:visible')
        .first()
        .getByRole('button')
        .nth(1)
        .click()
      const bounds = await page.getByRole('dialog').evaluate((el) => {
        const r = el.getBoundingClientRect()
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: innerWidth,
          height: innerHeight,
        }
      })
      assert.ok(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.right <= bounds.width &&
          bounds.bottom <= bounds.height,
        `${engine} ${width}: modal escapes viewport`
      )
      await page.keyboard.press('Escape')
      assert.equal(fixture.writes.length, before)
    }
  } finally {
    await context.close()
  }

  const admin = await createMockContext(browser, {
    role: 'admin',
    width: 1440,
    baseURL,
  })
  const adminPage = await admin.context.newPage()
  adminPage.on('dialog', async (dialog) => {
    assert.equal(dialog.type(), 'beforeunload')
    await dialog.accept()
  })
  try {
    await ready(adminPage, '/admin/acampamentos')
    await adminPage.locator('input[name="start_date"]').fill('2027-01-01')
    await adminPage.locator('input[name="end_date"]').fill('2027-01-05')
    validate(await measure(adminPage), `${engine} admin filled dates`)
    await adminPage
      .getByRole('button', { name: 'Arquivar', exact: true })
      .click()
    await adminPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Arquivar', exact: true })
      .click()
    await adminPage
      .getByRole('button', { name: 'Arquivados (1)', exact: true })
      .click()
    await adminPage
      .getByRole('button', { name: 'Restaurar', exact: true })
      .click()
    await adminPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Restaurar', exact: true })
      .click()
    await adminPage
      .getByRole('button', { name: 'Ativos (1)', exact: true })
      .click()
    await adminPage
      .getByRole('button', { name: 'Arquivar', exact: true })
      .waitFor()
    assert.equal(admin.fixture.data.camps.length, 1)
    assert.equal(admin.fixture.camp.status, 'active')
    assert.ok(
      admin.fixture.writes.every(
        (write) => write.table === 'camps' && write.method === 'PATCH'
      )
    )
  } finally {
    await admin.context.close()
  }
}

await mkdir(output, { recursive: true })
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5191',
    '--strictPort',
  ],
  {
    cwd: process.cwd(),
    stdio: 'pipe',
    windowsHide: true,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://visualqa.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'visual-fixture-not-a-real-key',
      VITE_ACCOUNT_MANAGEMENT_ENABLED:
        process.env.QA_ACCOUNT_MANAGEMENT_ENABLED || 'false',
    },
  }
)
let serverOutput = ''
server.stdout.on('data', (data) => {
  serverOutput += data
})
server.stderr.on('data', (data) => {
  serverOutput += data
})
try {
  let available = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`QA Vite stopped: ${serverOutput}`)
    try {
      available = (await fetch(baseURL)).ok
    } catch {
      /* Wait for the isolated dev server. */
    }
    if (available) break
    await delay(250)
  }
  assert.ok(available, `QA Vite unavailable: ${serverOutput}`)
  const engines = (process.env.QA_BROWSERS || 'chromium,webkit').split(',')
  for (const engine of engines) {
    const browser = await playwright[engine].launch({ headless: true })
    try {
      for (const mobile of ['interactions', 'account'].includes(phase)
        ? []
        : [true, false]) {
        const groupWidths = widths.filter((width) => width <= 414 === mobile)
        if (!groupWidths.length) continue
        for (const [roleName, paths] of Object.entries(routes)) {
          const { context } = await createMockContext(browser, {
            role: roleName === 'public' ? null : roleName,
            width: groupWidths[0],
            baseURL,
            mobile,
          })
          const page = await context.newPage()
          page.on('pageerror', (error) =>
            errors.push(`${engine} ${page.url()}: ${error.message}`)
          )
          try {
            for (const path of paths) {
              await ready(page, path)
              if (path === '/gestor')
                await page
                  .getByRole('button', {
                    name: 'Novo acampamento',
                    exact: true,
                  })
                  .click()
              for (const width of groupWidths) {
                await page.setViewportSize({ width, height: 960 })
                await page.waitForTimeout(50)
                for (const theme of ['dark', 'light']) {
                  if (
                    (await page.locator('html').getAttribute('data-theme')) !==
                    theme
                  )
                    await page
                      .getByRole('button', { name: /Ativar tema/ })
                      .click()
                  const metrics = await measure(page)
                  validate(metrics, `${engine} ${width} ${theme} ${path}`)
                  if (path === '/qa-unificado') {
                    const podium = await page
                      .getByLabel('Pódio', { exact: true })
                      .locator('article')
                      .evaluateAll((els) =>
                        els.map((el) => {
                          const r = el.getBoundingClientRect()
                          return {
                            x: r.x,
                            y: r.y,
                            bottom: r.bottom,
                            height: r.height,
                          }
                        })
                      )
                    assert.ok(
                      podium[1].x < podium[0].x && podium[0].x < podium[2].x
                    )
                    assert.ok(Math.abs(podium[0].bottom - podium[2].bottom) < 1)
                    assert.equal(
                      podium[0].height - podium[1].height,
                      podium[1].height - podium[2].height
                    )
                    assert.ok(
                      podium[0].height > podium[1].height &&
                        podium[1].height > podium[2].height
                    )
                  }
                  results.push({
                    engine,
                    width,
                    role: roleName,
                    path,
                    theme,
                    ...metrics,
                  })
                  if ([390, 768, 1440].includes(width))
                    await page.screenshot({
                      path: join(
                        output,
                        `${engine}-${width}-${theme}-${path === '/' ? 'landing' : path.slice(1).replaceAll('/', '_')}.png`
                      ),
                      fullPage: true,
                    })
                }
              }
            }
          } catch (error) {
            await page
              .screenshot({
                path: join(output, `${engine}-${roleName}-failure.png`),
                fullPage: true,
              })
              .catch(() => {})
            throw error
          } finally {
            await context.close()
          }
        }
        console.log(`${engine}: ${groupWidths.join(', ')}px approved`)
      }
      if (!['layout', 'account'].includes(phase))
        await essentialInteractions(browser, engine)
      if (phase !== 'layout')
        await accountNavigationInteractions(
          browser,
          engine,
          baseURL,
          process.env.QA_ACCOUNT_MANAGEMENT_ENABLED === 'true',
          errors
        )
    } finally {
      await browser.close()
    }
  }
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      states: results.length,
      pages: new Set(results.map((item) => item.path)).size,
      widths,
      engines,
      phase,
      output,
      javascriptErrors: errors,
    })
  )
} finally {
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(
      {
        results,
        javascriptErrors: errors,
        screenshotsAreEvidenceNotPixelDiff: true,
      },
      null,
      2
    )
  )
  server.kill()
}
