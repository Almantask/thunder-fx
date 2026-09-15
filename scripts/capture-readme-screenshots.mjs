/**
 * Capture README screenshots of the Thunder FX browser studio (mock engine).
 *
 * Usage (dev server on :1420):
 *   npm install --no-save playwright-core
 *   node scripts/capture-readme-screenshots.mjs
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.THUNDER_FX_URL ?? 'http://localhost:1420'
const OUT = path.resolve('docs/screenshots')
const SETUP_KEY = 'thunder-fx.first-watch.complete'

async function ready(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(8, 8)
  await page.waitForTimeout(200)
}

async function shot(page, name) {
  await ready(page)
  const dest = path.join(OUT, name)
  await page.screenshot({ path: dest, type: 'png' })
  console.log('wrote', dest)
}

async function skipSetup(page) {
  await page.evaluate((key) => localStorage.setItem(key, '1'), SETUP_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: 'Generate' }).waitFor({ timeout: 15_000 })
  await ready(page)
}

async function waitForClip(page) {
  await page.waitForFunction(() => {
    const play = document.querySelector('button[aria-label="Play trimmed clip"]')
    return play instanceof HTMLButtonElement && !play.disabled
  }, { timeout: 30_000 })
  await page.getByText(/seed \d+/).waitFor({ timeout: 15_000 })
}

async function generatePrompt(page, prompt) {
  await page.locator('#prompt').fill(prompt)
  await page.getByRole('button', { name: 'Generate sound' }).click()
  await waitForClip(page)
}

async function expandLibrary(page) {
  const expandAll = page.getByRole('button', { name: /Expand all/i })
  if (await expandAll.count()) {
    await expandAll.click()
    await page.waitForTimeout(200)
  }
  for (let i = 0; i < 10; i += 1) {
    if ((await page.getByRole('checkbox', { name: /^Select / }).count()) >= 2) return
    const closed = page.locator('button[aria-expanded="false"]')
    if ((await closed.count()) === 0) break
    await closed.first().click()
    await page.waitForTimeout(150)
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  })
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = `
      *, *::before, *::after { caret-color: transparent !important; }
      [role="tooltip"], [data-radix-popper-content-wrapper] {
        display: none !important;
        visibility: hidden !important;
      }
    `
    document.documentElement.appendChild(style)
  })

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Set up Thunder FX' }).waitFor({ timeout: 20_000 })
  await shot(page, 'setup.png')

  await skipSetup(page)
  await shot(page, 'generate.png')

  await page.getByRole('tab', { name: 'Library' }).click()
  await page.getByText(/The library is empty/i).waitFor({ timeout: 10_000 })
  await shot(page, 'library-empty.png')
  await page.getByRole('tab', { name: 'Generate' }).click()

  await page.getByRole('button', { name: 'Browse prompts' }).click()
  await page.getByRole('heading', { name: 'Browse prompts' }).waitFor()
  const combat = page.getByRole('option', { name: /^Combat/ })
  if (await combat.count()) await combat.first().click()
  const preview = page.getByRole('button', { name: 'Preview Steel sword draw' })
  if (await preview.count()) await preview.click()
  await shot(page, 'browse-prompts.png')

  const sword = page.getByRole('checkbox', { name: 'Steel sword draw' })
  const whoosh = page.getByRole('checkbox', { name: 'Sword swing whoosh' })
  if (await sword.count()) await sword.click()
  if (await whoosh.count()) await whoosh.click()
  const addSelected = page.getByRole('button', { name: /Add selected/ })
  if (await addSelected.isEnabled()) await addSelected.click()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: 'Browse prompts' }).waitFor({ state: 'hidden' }).catch(() => {})
  await page.locator('#prompt').fill(
    'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay.',
  )

  await page.getByRole('button', { name: 'Generate sound' }).click()
  await waitForClip(page)
  const shape = page.getByRole('button', { name: /SHAPE/i })
  if ((await shape.getAttribute('aria-expanded')) !== 'true') await shape.click()
  await page.getByLabel('Fade in seconds').waitFor()
  await shot(page, 'generate-clip.png')

  await generatePrompt(
    page,
    'TrackType: SFX, heavy tavern door slam on iron hinges, wooden latch impact, isolated one-shot.',
  )

  await page.getByRole('tab', { name: 'Library' }).click()
  await page.getByRole('heading', { name: 'Library' }).waitFor()
  await page.getByRole('radio', { name: /Sounds \(\d+\)/ }).waitFor({ timeout: 15_000 })
  await expandLibrary(page)
  await page.getByRole('checkbox', { name: /^Select / }).first().waitFor({ timeout: 15_000 })

  const renameButtons = page.getByRole('button', { name: 'Rename clip' })
  if ((await renameButtons.count()) >= 2) {
    await renameButtons.nth(0).click()
    const nameField = page.getByLabel('Clip name')
    await nameField.waitFor()
    await nameField.fill('Steel sword draw')
    await page.getByRole('button', { name: 'Save' }).click()
    await nameField.waitFor({ state: 'hidden' }).catch(() => {})
    await page.getByRole('button', { name: 'Rename clip' }).nth(1).click()
    await page.getByLabel('Clip name').waitFor()
    await page.getByLabel('Clip name').fill('Tavern door slam')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByLabel('Clip name').waitFor({ state: 'hidden' }).catch(() => {})
  }

  const fav = page.getByRole('button', { name: 'Add favourite' }).first()
  if (await fav.count()) await fav.click()
  const clipRating = page.getByRole('radiogroup', { name: /Rating for/ }).first()
  if (await clipRating.count()) {
    await clipRating.getByRole('radio', { name: '4 stars' }).click()
  }
  const tags = page.getByRole('button', { name: 'Edit tags' }).first()
  if (await tags.count()) {
    await tags.click()
    const tagField = page.getByLabel('Add a tag')
    await tagField.waitFor()
    await tagField.fill('foley')
    await tagField.press('Enter')
    await tagField.fill('weapon')
    await tagField.press('Enter')
    await page.getByRole('button', { name: 'Save' }).click()
    await tagField.waitFor({ state: 'hidden' }).catch(() => {})
  }
  await shot(page, 'library.png')

  const selectBoxes = page.getByRole('checkbox', { name: /^Select / })
  if ((await selectBoxes.count()) >= 2) {
    await selectBoxes.nth(0).click()
    await selectBoxes.nth(1).click()
    await page.getByRole('button', { name: 'Compare selected clips' }).click()
    await page.getByRole('heading', { name: 'Compare takes' }).waitFor({ timeout: 10_000 })
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    await shot(page, 'compare.png')
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('heading', { name: 'Compare takes' }).waitFor({ state: 'hidden', timeout: 10_000 })
  }

  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('heading', { name: 'Settings' }).waitFor()
  await shot(page, 'settings.png')

  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Search commands…').waitFor({ timeout: 10_000 })
  await shot(page, 'command-palette.png')
  await page.keyboard.press('Escape')

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
