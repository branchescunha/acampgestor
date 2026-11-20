import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { getPageMetadata, SITE_URL } from '../../utils/pageMetadata.js'

const root = new URL('../../../', import.meta.url)
const read = path => readFileSync(new URL(path, root))

test('somente a landing recebe canonical e indexacao, sem URLs privadas nos metadados', () => {
  assert.equal(SITE_URL, 'https://acampgestor.vercel.app')
  assert.equal(getPageMetadata('/').canonical, `${SITE_URL}/`)
  assert.equal(getPageMetadata('/').robots, 'index,follow')
  for (const path of ['/login', '/cadastro', '/admin', '/gestor', '/acampamento/gestor/inspecoes', '/convite/token-privado', '/acampamento-publico']) {
    const metadata = getPageMetadata(path)
    assert.equal(metadata.canonical, null)
    assert.match(metadata.robots, /noindex/)
    assert.ok(!JSON.stringify(metadata).includes('token-privado'))
  }
})

test('manifesto configura instalacao sem offline/cache de dados privados', () => {
  const manifest = JSON.parse(read('public/site.webmanifest'))
  assert.equal(manifest.name, 'AcampGestor')
  assert.equal(manifest.short_name, 'AcampGestor')
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.lang, 'pt-BR')
  for (const size of [192, 512]) for (const purpose of ['any', 'maskable']) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}` && icon.purpose === purpose)
    assert.ok(icon)
    assert.equal(icon.type, 'image/png')
    assert.ok(existsSync(new URL(`public${icon.src}`, root)))
  }
  assert.ok(!manifest.service_worker)
})

test('PNGs sao imagens reais com dimensoes declaradas e ICO contem imagens PNG validas', () => {
  const images = { 'favicon-16x16.png': [16, 16], 'favicon-32x32.png': [32, 32], 'apple-touch-icon.png': [180, 180], 'android-chrome-192x192.png': [192, 192], 'android-chrome-512x512.png': [512, 512], 'maskable-icon-192x192.png': [192, 192], 'maskable-icon-512x512.png': [512, 512], 'og-image.png': [1200, 630] }
  for (const [name, [width, height]] of Object.entries(images)) {
    const png = read(`public/${name}`)
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name)
    assert.equal(png.readUInt32BE(16), width, name)
    assert.equal(png.readUInt32BE(20), height, name)
  }
  const ico = read('public/favicon.ico')
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 3)
  for (let i = 0; i < 3; i++) {
    const offset = ico.readUInt32LE(6 + i * 16 + 12)
    const length = ico.readUInt32LE(6 + i * 16 + 8)
    assert.ok(offset + length <= ico.length)
    assert.equal(ico.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a')
  }
})

test('metadados referenciam assets existentes, sitemap lista apenas a pagina publica institucional', () => {
  const html = read('index.html').toString('utf8')
  for (const name of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'site.webmanifest', 'og-image.png']) assert.ok(html.includes(name), name)
  assert.match(html, /twitter:card/)
  assert.match(html, /og:image:width/)
  const urls = [...read('public/sitemap.xml').toString('utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])
  assert.deepEqual(urls, [`${SITE_URL}/`])
  const robots = read('public/robots.txt').toString('utf8')
  for (const path of ['/admin', '/gestor', '/login', '/cadastro', '/*/gestor', '/*/admin']) assert.ok(robots.includes(`Disallow: ${path}`))
  const config = JSON.parse(read('vercel.json'))
  assert.ok(config.headers.some(rule => rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))))
})

test('versao 2.0.1 consistente sem renomear pacote; imagens do README existem', () => {
  const pkg = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(pkg.name, 'acamp-gestor')
  assert.equal(pkg.version, '2.0.1')
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages[''].version, pkg.version)
  const readme = read('README.md').toString('utf8')
  for (const [, path] of readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(existsSync(new URL(path, root)), path)
  assert.match(readme, /André Vinícius Branches Cunha/)
  assert.doesNotMatch(readme, /^## Como executar/m)
})
