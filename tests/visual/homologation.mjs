import assert from 'node:assert/strict'
import { createMockContext } from './fixtures.mjs'

export async function validateHomologationLayout(page, path, width) {
  if (['/admin/acampamentos', '/gestor'].includes(path)) {
    const alignment = await page.locator('form').first().evaluate((form) => {
      const button = form.querySelector('button[type="submit"]')
      const f = form.getBoundingClientRect()
      const b = button.getBoundingClientRect()
      const css = getComputedStyle(form)
      const right = f.right - parseFloat(css.paddingRight) - parseFloat(css.borderRightWidth)
      const left = f.left + parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth)
      return { rightGap: right - b.right, buttonWidth: b.width, contentWidth: right - left }
    })
    assert.ok(Math.abs(alignment.rightGap) <= 1, `${path}: submit not right aligned`)
    if (width < 640) assert.ok(Math.abs(alignment.buttonWidth - alignment.contentWidth) <= 1, `${path}: mobile submit not full width`)
  }
  if (path === '/admin/organizacoes') {
    const heights = await page.locator('form').evaluate((form) =>
      ['name', 'type', 'city', 'state', 'notes'].map(name => form.elements[name].getBoundingClientRect().height)
    )
    if (width >= 768) assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, `Organization fields have different heights: ${heights}`)
    else {
      assert.ok(Math.abs(heights[0] - heights[3]) <= 1)
      assert.ok(heights[4] > heights[3] * 1.5, 'Mobile notes must remain multiline')
    }
  }
  if (path === '/') {
    const labels = await page.locator('.landing-ranking-stats span').evaluateAll(elements =>
      elements.map(el => ({ text: el.textContent, width: el.clientWidth, contentWidth: el.scrollWidth, font: parseFloat(getComputedStyle(el).fontSize), height: el.getBoundingClientRect().height }))
    )
    assert.deepEqual(labels.map(item => item.text), ['equipes', 'participantes', 'lançamentos'])
    for (const item of labels) {
      assert.ok(item.contentWidth <= item.width + 1, `Clipped landing indicator: ${JSON.stringify(item)}`)
      assert.ok(item.font >= 12 && item.height < 22, 'Indicator text must remain readable and on one line')
    }
    for (const [name, emoji, points] of [['Equipe Leão', '🦁', '980'], ['Equipe Tubarão', '🦈', '850'], ['Equipe Águia', '🦅', '730']]) {
      assert.equal(await page.getByText(name, { exact: true }).count(), 2)
      const symbols = page.locator('span[aria-hidden="true"]').filter({ hasText: emoji })
      assert.equal(await symbols.count(), 2)
      assert.ok(await page.getByText(`${points} pts`, { exact: true }).count() === 2)
      const sizes = await symbols.evaluateAll(elements => elements.map(el => ({ width: el.clientWidth, height: el.clientHeight, sw: el.scrollWidth, sh: el.scrollHeight })))
      assert.ok(sizes.every(size => size.sw <= size.width + 1 && size.sh <= size.height + 1), `Clipped emoji: ${name}`)
    }
  }
}

export async function registrationInteractions(browser, engine, baseURL) {
  let approved = 0
  for (const [code, expected] of [
    ['signup_disabled', /temporariamente desativado/],
    ['email_provider_disabled', /e-mail.*indisponível/],
    ['over_request_rate_limit', /Aguarde/],
    ['user_already_exists', /Se já tem conta/],
    ['email_exists', /Se já tem conta/],
    ['unexpected_failure', /preparar a conta.*suporte/],
    ['signup_confirmation_required', /confirmação de e-mail/],
  ]) {
    const { context } = await createMockContext(browser, { role: null, width: 390, baseURL, mobile: true })
    try {
      let requests = 0
      await context.route('https://visualqa.supabase.co/auth/v1/signup', async route => {
        requests++
        const payload = route.request().postDataJSON()
        assert.deepEqual(Object.keys(payload.data), ['name'])
        await new Promise(resolve => setTimeout(resolve, 150))
        return code === 'signup_confirmation_required'
          ? route.fulfill({ json: { user: { id: '90000000-0000-4000-8000-000000000001' }, session: null } })
          : route.fulfill({ status: code === 'over_request_rate_limit' ? 429 : 422, headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' }, json: { code, msg: 'Sensitive server detail must not appear' } })
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${baseURL}/cadastro`)
      await page.getByLabel('Nome do responsável ou diretoria').fill('Diretoria ficticia QA')
      await page.getByLabel('E-mail', { exact: true }).fill('fixture@example.invalid')
      await page.getByLabel('Senha', { exact: true }).fill('fixture-password-123')
      await page.getByLabel('Confirmar senha').fill('fixture-password-123')
      await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
      const submit = page.getByRole('button', { name: 'Criando conta...', exact: true })
      await submit.waitFor()
      assert.equal(await submit.isDisabled(), true)
      try {
        await page.getByRole('alert').filter({ hasText: expected }).waitFor({ timeout: 5000 })
      } catch {
        throw new Error(`${engine} ${code}: requests=${requests}; alert=${await page.getByRole('alert').allTextContents()}`)
      }
      assert.equal(await page.getByRole('button', { name: 'Criar conta', exact: true }).isEnabled(), true)
      assert.equal(requests, 1, 'Simultaneous submits must not repeat signup')
      assert.doesNotMatch(await page.locator('main').innerText(), /Sensitive server detail/)
      assert.equal(new URL(page.url()).pathname, '/cadastro')
      assert.deepEqual(errors, [])
      approved++
    } finally {
      await context.close()
    }
  }
  console.log(`${engine}: ${approved} registration error/loading scenarios approved (mock API)`)
}
