import assert from 'node:assert/strict'
import { createMockContext } from './fixtures.mjs'

export async function accountNavigationInteractions(
  browser,
  engine,
  baseURL,
  enabled,
  errors
) {
  for (const role of ['admin', 'gestor']) {
    console.log(`${engine}: checking ${role} account (backend flag=${enabled})`)
    const { context, fixture } = await createMockContext(browser, {
      role,
      width: role === 'admin' ? 1440 : 390,
      baseURL,
      mobile: role === 'gestor',
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      errors.push(`${engine} account: ${error.message}`)
    )
    page.on('dialog', async (dialog) => {
      assert.equal(dialog.type(), 'beforeunload', 'Unexpected native dialog')
      await dialog.accept()
    })
    const accountPath =
      role === 'admin' ? '/admin/conta' : '/qa-unificado/gestor/conta'
    try {
      await page.goto(baseURL + accountPath)
      await page.getByLabel('E-mail de acesso', { exact: true }).waitFor()
      await page.waitForFunction(
        () =>
          document.getElementById('account-email')?.value ===
          'fixture@example.invalid'
      )
      assert.equal(
        await page.getByLabel('E-mail de acesso', { exact: true }).inputValue(),
        fixture.user.email
      )
      assert.equal(
        (await page
          .getByLabel('E-mail de acesso', { exact: true })
          .getAttribute('readonly')) !== null,
        true
      )
      await page
        .getByLabel('Nova senha', { exact: true })
        .fill('New-password123!')
      await page
        .getByLabel('Confirmar nova senha', { exact: true })
        .fill('different')
      await page
        .getByRole('button', { name: 'Salvar nova senha', exact: true })
        .click()
      await page
        .getByRole('alert')
        .filter({ hasText: 'As senhas não conferem.' })
        .waitFor()
      assert.equal(fixture.authWrites.length, 0)
      await page
        .getByLabel('Confirmar nova senha', { exact: true })
        .fill('New-password123!')
      await page
        .getByRole('button', { name: 'Salvar nova senha', exact: true })
        .click()
      await page
        .getByRole('status')
        .filter({ hasText: 'Senha alterada com sucesso.' })
        .waitFor()
      assert.equal(fixture.authWrites.at(-1).passwordChanged, true)
      assert.equal(
        await page.getByLabel('Nova senha', { exact: true }).inputValue(),
        ''
      )

      if (role === 'admin' || enabled) {
        await page.getByLabel('Nome', { exact: true }).fill('Nome atualizado')
        await page
          .getByRole('button', { name: 'Salvar nome', exact: true })
          .click()
        await page
          .getByRole('status')
          .filter({ hasText: 'Nome atualizado com sucesso.' })
          .waitFor()
        const write = fixture.writes.at(-1)
        assert.equal(write.table, 'profiles')
        assert.equal(write.payload.name, 'Nome atualizado')
        assert.ok(write.query.includes(fixture.user.id))
        assert.deepEqual(Object.keys(write.payload).sort(), [
          'name',
          'updated_at',
        ])
      }
      if (role === 'gestor' && enabled) {
        assert.equal(
          await page
            .getByRole('button', { name: 'Solicitar alteração de e-mail' })
            .count(),
          0
        )
        assert.equal(fixture.authWrites.some((write) => write.email), false)
      }

      // Reload must warn and remain on the same route when cancelled.
      await page
        .getByLabel('Nova senha', { exact: true })
        .fill('Unsaved-password123!')
      await page
        .getByRole('button', { name: 'Atualizar página', exact: true })
        .click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancelar', exact: true })
        .click()
      assert.equal(new URL(page.url()).pathname, accountPath)
      assert.equal(
        await page.getByLabel('Nova senha', { exact: true }).inputValue(),
        'Unsaved-password123!'
      )
      fixture.data.profiles[0].name = 'Nome recarregado do servidor'
      const navigation = page.waitForEvent('load')
      await page
        .getByRole('button', { name: 'Atualizar página', exact: true })
        .click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Descartar e atualizar', exact: true })
        .click()
      await navigation
      await page
        .getByRole('heading', { name: 'Configurações da conta' })
        .waitFor()
      assert.equal(new URL(page.url()).pathname, accountPath)
      await page.waitForFunction(() => document.getElementById('account-name')?.value === 'Nome recarregado do servidor')
      assert.equal(
        await page.getByLabel('Nova senha', { exact: true }).inputValue(),
        ''
      )

      if (role === 'admin') {
        await page.goto(baseURL + '/admin/usuarios')
        await page
          .getByText(fixture.user.email, { exact: true })
          .first()
          .waitFor()
        if (enabled) {
          const pending = page
            .locator('tr:visible')
            .filter({ hasText: 'pending@example.invalid' })
          assert.equal(await pending.getByRole('button').count(), 0)
          await pending.getByText('Sem perfil', { exact: true }).waitFor()
          const row = page
            .locator('tr')
            .filter({ hasText: 'Gestor visual' })
            .or(
              page
                .locator('.record-cards > div')
                .filter({ hasText: 'Gestor visual' })
            )
            .filter({ visible: true })
            .first()
          await row.getByRole('button', { name: 'Editar', exact: true }).click()
          await page
            .getByLabel('Nova senha do gestor', { exact: true })
            .fill('Managed-password123!')
          await page
            .getByLabel('Confirmar nova senha', { exact: true })
            .fill('Managed-password123!')
          await page
            .getByRole('button', { name: 'Redefinir senha', exact: true })
            .click()
          const before = fixture.authWrites.length
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Cancelar', exact: true })
            .click()
          assert.equal(fixture.authWrites.length, before)
          await page
            .getByRole('button', { name: 'Redefinir senha', exact: true })
            .click()
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Substituir senha', exact: true })
            .click()
          await page
            .getByRole('status')
            .filter({ hasText: 'Senha anterior substituída.' })
            .waitFor()
          assert.equal(fixture.authWrites.at(-1).action, 'reset-password')
          assert.equal(
            fixture.authWrites.at(-1).targetId,
            fixture.data.profiles[1].id
          )
          assert.equal(
            await page
              .getByLabel('Nova senha do gestor', { exact: true })
              .inputValue(),
            ''
          )
          await page
            .getByLabel('E-mail de acesso', { exact: true })
            .fill('corrected@example.invalid')
          await page
            .getByRole('button', { name: 'Corrigir e-mail', exact: true })
            .click()
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Confirmar correção', exact: true })
            .click()
          await page
            .getByRole('status')
            .filter({ hasText: 'E-mail de acesso corrigido.' })
            .waitFor()
          assert.equal(
            fixture.authWrites.at(-1).email,
            'corrected@example.invalid'
          )
        }
        await page.goto(baseURL + '/admin/organizacoes')
        await page
          .locator('.record-actions:visible')
          .first()
          .getByRole('button', { name: 'Editar', exact: true })
          .click()
        if (enabled) {
          fixture.blockOrganizationDelete = true
          await page
            .locator('.record-actions:visible')
            .first()
            .getByRole('button', { name: 'Excluir', exact: true })
            .click()
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Excluir organização', exact: true })
            .click()
          await page
            .getByRole('alert')
            .filter({ hasText: 'Exclusão bloqueada:' })
            .waitFor()
          assert.equal(fixture.data.organizations.length, 1)
          fixture.blockOrganizationDelete = false
          await page
            .locator('.record-actions:visible')
            .first()
            .getByRole('button', { name: 'Excluir', exact: true })
            .click()
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Excluir organização', exact: true })
            .click()
          await page
            .getByText('Nenhuma organização cadastrada.', { exact: true })
            .first()
            .waitFor()
          assert.equal(fixture.data.organizations.length, 0)
        } else
          assert.equal(
            await page
              .getByRole('button', { name: 'Excluir', exact: true })
              .count(),
            0
          )
      }

      // SPA route changes reset both viewport and sidebar, not same-route form edits.
      await page.goto(
        baseURL +
          (role === 'admin'
            ? '/admin/acampamentos'
            : '/qa-unificado/gestor/participantes')
      )
      await page.locator('.record-actions:visible').first().waitFor()
      await page.evaluate(() => {
        window.scrollTo(0, 500)
        const sidebar = document.getElementById('camp-navigation')
        if (sidebar) sidebar.scrollTop = 100
      })
      if (role === 'gestor')
        await page
          .locator('.app-toolbar [aria-controls="camp-navigation"]')
          .click()
      await page
        .getByRole('link', {
          name: role === 'admin' ? 'Usuários' : 'Equipes',
          exact: true,
        })
        .click()
      await page.waitForURL(
        baseURL +
          (role === 'admin'
            ? '/admin/usuarios'
            : '/qa-unificado/gestor/equipes')
      )
      await page.waitForFunction(() => window.scrollY === 0, undefined, {
        timeout: 3000,
      })
      assert.equal(await page.evaluate(() => window.scrollY), 0)
      assert.equal(
        await page.locator('#camp-navigation').evaluate((el) => el.scrollTop),
        0
      )
    } catch (error) {
      console.error(
        JSON.stringify({
          engine,
          role,
          path: new URL(page.url()).pathname,
          alerts: await page.getByRole('alert').allTextContents(),
          headings: await page.locator('h1').allTextContents(),
          javascriptErrors: errors,
        })
      )
      if (process.env.QA_VISUAL_OUTPUT)
        await page.screenshot({
          path: `${process.env.QA_VISUAL_OUTPUT}/${engine}-${role}-account-failure.png`,
          fullPage: true,
        })
      throw error
    } finally {
      await context.close()
    }
  }
  console.log(
    `${engine}: account/navigation interactions approved (backend flag=${enabled})`
  )
}
