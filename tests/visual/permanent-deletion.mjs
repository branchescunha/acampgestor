import assert from 'node:assert/strict'
import { createMockContext } from './fixtures.mjs'
import { join } from 'node:path'

export async function permanentDeletionInteractions(
  browser,
  engine,
  baseURL,
  errors
) {
  const widths = process.env.QA_DELETION_WIDTHS ? process.env.QA_DELETION_WIDTHS.split(',').map(Number) : [390, 768, 1440]
  const roles = process.env.QA_DELETION_ROLES?.split(',') || ['admin', 'gestor']
  const themes = process.env.QA_DELETION_THEMES?.split(',') || ['light', 'dark']
  for (const role of roles) {
    for (const width of widths) {
      for (const theme of themes) {
        console.log(`${engine}: deletion ${role} ${width}px ${theme}`)
        const { context, fixture } = await createMockContext(browser, {
          role,
          width,
          baseURL,
          mobile: width === 390,
        })
        await context.addInitScript(
          (value) => localStorage.setItem('acampgestor:theme', value),
          theme
        )
        const page = await context.newPage()
        page.on('pageerror', (error) =>
          errors.push(`${engine} deletion ${role} ${width}px ${theme} ${page.url()}: ${error.message}`)
        )
        try {
          if (role === 'admin')
            fixture.data.camps[0].created_by = fixture.data.profiles.find(profile => profile.role === 'gestor').id
          await page.goto(baseURL + (role === 'admin' ? '/admin/usuarios' : '/gestor/conta'))
          const previewAccount = page.getByRole('button', { name: role === 'admin' ? 'Excluir gestor definitivamente' : 'Excluir conta definitivamente', exact: true }).first()
          await previewAccount.waitFor()
          assert.equal(
            await page.getByRole('button', { name: 'Excluir gestor definitivamente', exact: true }).count(),
            role === 'admin' ? fixture.data.profiles.filter(profile => profile.role === 'gestor').length : 0
          )
          await previewAccount.click()
          await page.getByRole('dialog').getByText(fixture.camp.name, { exact: true }).waitFor()
          await page.getByRole('dialog').getByText(/participantes,.*pontuações/).waitFor()
          await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
          fixture.blockAccountDelete = true
          await previewAccount.click()
          await page.getByText('Resolva a organização compartilhada antes da exclusão.', { exact: true }).waitFor()
          assert.equal(fixture.authWrites.length, 0)
          fixture.blockAccountDelete = false
          await page.goto(
            baseURL + (role === 'admin' ? '/admin/acampamentos' : '/gestor')
          )
          await page.waitForFunction(
            (value) => document.documentElement.dataset.theme === value,
            theme
          )
          const removeCamp = page
            .getByRole('button', {
              name: 'Excluir definitivamente',
              exact: true,
            })
            .first()
          await removeCamp.click()
          let dialog = page.getByRole('dialog')
          let submit = dialog.getByRole('button', {
            name: 'Excluir definitivamente',
            exact: true,
          })
          assert.equal(await submit.isDisabled(), true)
          await dialog.getByLabel('Confirmação da exclusão').fill('wrong')
          assert.equal(await submit.isDisabled(), true)
          await dialog
            .getByRole('button', { name: 'Cancelar', exact: true })
            .click()
          assert.equal(fixture.writes.length, 0)
          await removeCamp.click()
          await dialog
            .getByLabel('Confirmação da exclusão')
            .fill(fixture.camp.name)
          await submit.click()
          await page.waitForFunction(
            () => !document.querySelector('[role="dialog"]')
          )
          await page
            .getByText(
              role === 'admin'
                ? 'Nenhum acampamento ativo ou em rascunho.'
                : 'Nenhum acampamento disponível para sua conta.',
              { exact: true }
            )
            .filter({ visible: true })
            .first()
            .waitFor()
          assert.equal(
            fixture.writes.filter(
              (write) => write.table === 'delete_camp_permanently'
            ).length,
            1
          )

          await page.goto(
            baseURL + (role === 'admin' ? '/admin/usuarios' : '/gestor/conta')
          )
          const removeAccount = page
            .getByRole('button', {
              name:
                role === 'admin'
                  ? 'Excluir gestor definitivamente'
                  : 'Excluir conta definitivamente',
              exact: true,
            })
            .first()
          await removeAccount.click()
          dialog = page.getByRole('dialog')
          submit = dialog.getByRole('button', {
            name: 'Excluir conta definitivamente',
            exact: true,
          })
          assert.equal(await submit.isDisabled(), true)
          await dialog
            .getByLabel('Confirmação da exclusão')
            .fill('EXCLUIR CONTA')
          if (role === 'gestor') {
            assert.equal(await submit.isDisabled(), true)
            await dialog
              .getByLabel('Senha atual', { exact: true })
              .fill('Fixture-password123!')
          }
          assert.equal(await submit.isEnabled(), true)
          const metrics = await dialog.evaluate((element) => ({
            width: element.scrollWidth,
            available: element.clientWidth,
          }))
          assert.ok(
            metrics.width <= metrics.available + 1,
            `${engine} ${width} ${theme}: dialog overflow`
          )
          if (process.env.QA_VISUAL_OUTPUT)
            await dialog.screenshot({
              path: join(
                process.env.QA_VISUAL_OUTPUT,
                `${engine}-${role}-${width}-${theme}-delete-account.png`
              ),
            })
          await dialog
            .getByRole('button', { name: 'Cancelar', exact: true })
            .click()
          assert.equal(fixture.authWrites.length, 0)
          fixture.failAuthDelete = true
          await removeAccount.click()
          await dialog
            .getByLabel('Confirmação da exclusão')
            .fill('EXCLUIR CONTA')
          if (role === 'gestor')
            await dialog
              .getByLabel('Senha atual', { exact: true })
              .fill('Fixture-password123!')
          await submit.click()
          await page
            .getByText(
              'Remoção no Auth pendente. Retome a exclusão pelo ADMIN.',
              { exact: true }
            )
            .waitFor()
          assert.equal(fixture.authWrites.length, 1)
          if (role === 'admin') {
            fixture.failAuthDelete = false
            await removeAccount.click()
            await dialog
              .getByText(
                'A limpeza dos dados já terminou. Falta concluir a remoção no Auth.',
                { exact: true }
              )
              .waitFor()
            await dialog
              .getByLabel('Confirmação da exclusão')
              .fill('EXCLUIR CONTA')
            await submit.click()
            await page
              .getByText(
                'Conta e dados exclusivos removidos definitivamente.',
                { exact: true }
              )
              .waitFor()
            assert.equal(
              fixture.data.profiles.filter(
                (profile) => profile.role === 'admin'
              ).length,
              1
            )
          } else {
            fixture.failAuthDelete = false
            await removeAccount.click()
            await dialog
              .getByLabel('Confirmação da exclusão')
              .fill('EXCLUIR CONTA')
            await dialog
              .getByLabel('Senha atual', { exact: true })
              .fill('Fixture-password123!')
            await submit.click()
            await page.waitForURL(baseURL + '/')
            await page.getByRole('heading', { name: 'Gestão de acampamentos com equipes, pontuação e ranking público.', exact: true }).waitFor()
            await page.waitForFunction(() => !localStorage.getItem('sb-visualqa-auth-token'))
            assert.equal(
              fixture.data.profiles.some(
                (profile) => profile.id === fixture.user.id
              ),
              false
            )
          }
        } catch (error) {
          if (process.env.QA_VISUAL_OUTPUT)
            await page.screenshot({ path: join(process.env.QA_VISUAL_OUTPUT, `${engine}-${role}-${width}-${theme}-failure.png`), fullPage: true })
          throw error
        } finally {
          await context.close()
        }
      }
    }
  }
  console.log(
    `${engine}: permanent deletion, ${widths.length * roles.length * themes.length} role/width/theme combinations approved (mock only)`
  )
}
