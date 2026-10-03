import { expect, test, type Page } from '@playwright/test'
import type { DemoState } from '../src/domain'

const storageKey = 'homegrown.demo.v1'
const zucchini = 'The zucchini abundance'
const tomatoes = 'Sun-sweet cherry tomatoes'

async function storedDemo(page: Page): Promise<DemoState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey)
}

async function openHarvest(page: Page, title: string) {
  await page.getByRole('button', { name: `View ${title} from Maya Chen`, exact: true }).click()
  return page.getByRole('dialog', { name: title, exact: true })
}

async function reserveZucchini(page: Page, quantity = 2) {
  const dialog = await openHarvest(page, zucchini)
  await dialog.getByRole('spinbutton', { name: 'Number of portions' }).fill(String(quantity))
  await dialog.getByRole('radio', { name: /Tomorrow/ }).check()
  await dialog.getByRole('button', { name: 'Reserve for free', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your harvest is reserved!' })).toBeVisible()
  await page.getByRole('button', { name: 'View my pickups', exact: true }).click()
}

async function goToPickups(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('button', { name: /My pickups/ }).click()
  await expect(page.getByRole('combobox', { name: 'Demo role' })).toHaveValue('neighbor')
}

function gardenCard(page: Page, title: string) {
  return page.locator('.garden-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

test.beforeEach(async ({ page }) => {
  // Stable dates make tomorrow's pickup window deterministic without changing user data.
  await page.clock.install({ time: new Date('2026-10-02T12:00:00-07:00') })
  await page.goto('/')
  await expect(page.locator('.produce-card')).toHaveCount(8)
})

test('free reservations and cancellation keep resident and grower inventory in sync', async ({ page }) => {
  await reserveZucchini(page)
  const pickup = page.locator('.pickup-card')
  await expect(pickup).toContainText('2 portions')
  await expect(pickup).toContainText('24 Maple Street, Maplewood')
  await expect(pickup).toContainText('Shared for free. No tip added.')

  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('grower')
  await expect(gardenCard(page, zucchini).locator('.inventory-row')).toContainText('3 available')
  await expect(gardenCard(page, zucchini).locator('.inventory-row')).toContainText('2 reserved')
  await expect(page.locator('.grower-reservation')).toContainText('2 portions of The zucchini abundance')

  await goToPickups(page)
  await page.getByRole('button', { name: 'Cancel pickup', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Upcoming (0)', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Past pickups', exact: true }).click()
  await expect(page.locator('.pickup-card')).toContainText('Cancelled')
  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('grower')
  await expect(gardenCard(page, zucchini).locator('.inventory-row')).toContainText('5 available')
  await expect(gardenCard(page, zucchini).locator('.inventory-row')).toContainText('0 reserved')
  await expect(page.locator('.grower-reservation')).toHaveCount(0)
})

test('abandoning an optional tip checkout leaves stock and reservations unchanged', async ({ page }) => {
  const dialog = await openHarvest(page, tomatoes)
  await expect(dialog).not.toContainText('24 Maple Street')
  await dialog.getByRole('spinbutton', { name: 'Number of portions' }).fill('3')
  await dialog.getByRole('button', { name: '$5', exact: true }).click()
  await dialog.getByRole('button', { name: 'Continue with $5.00 tip', exact: true }).click()
  const checkout = page.getByRole('dialog', { name: 'A little thank-you', exact: true })
  await expect(checkout.locator('.checkout-total')).toContainText('$5.00')
  await expect(checkout).toContainText('3 portions')
  await checkout.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect.poll(async () => (await storedDemo(page)).reservations).toHaveLength(0)
  await expect.poll(async () => (await storedDemo(page)).listings.find(item => item.id === 'cherry-tomatoes')!.inventory.available).toBe(6)
  await expect(page.getByRole('button', { name: `View ${tomatoes} from Maya Chen`, exact: true })).toContainText('6 portions to share')
})

test('optional tips are one gratitude amount, independent of portion quantity, with no card collection', async ({ page }) => {
  const dialog = await openHarvest(page, tomatoes)
  await dialog.getByRole('spinbutton', { name: 'Number of portions' }).fill('3')
  await dialog.getByRole('radio', { name: /Tomorrow/ }).check()
  await dialog.getByRole('button', { name: '$5', exact: true }).click()
  await dialog.getByRole('button', { name: 'Continue with $5.00 tip', exact: true }).click()
  const checkout = page.getByRole('dialog', { name: 'A little thank-you', exact: true })
  await expect(checkout.locator('.checkout-total')).toContainText('$5.00')
  await expect(checkout).toContainText('No card details needed. No money will be charged.')
  await expect(checkout.locator('input')).toHaveCount(0)
  await checkout.getByRole('button', { name: 'Simulate tip & reserve', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your harvest is reserved!' })).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('3 portions of Sun-sweet cherry tomatoes')
  await expect(page.getByRole('dialog')).toContainText('$5.00 optional tip · simulated, not charged')
  await expect.poll(async () => (await storedDemo(page)).reservations[0]?.tipCents).toBe(500)
  await expect.poll(async () => (await storedDemo(page)).reservations[0]?.totalCents).toBe(500)
  await expect.poll(async () => (await storedDemo(page)).listings.find(item => item.id === 'cherry-tomatoes')!.inventory.available).toBe(3)
})

test('reserving without a tip from checkout preserves portions and the selected pickup window', async ({ page }) => {
  const dialog = await openHarvest(page, tomatoes)
  await dialog.getByRole('spinbutton', { name: 'Number of portions' }).fill('2')
  await dialog.getByRole('radio', { name: /Tomorrow/ }).check()
  await dialog.getByRole('button', { name: '$5', exact: true }).click()
  await dialog.getByRole('button', { name: 'Continue with $5.00 tip', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reserve without a tip', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your harvest is reserved!' })).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('2 portions of Sun-sweet cherry tomatoes')
  await expect(page.getByRole('dialog')).toContainText('Tomorrow')
  await expect(page.getByRole('dialog')).toContainText('Shared for free. No tip needed.')
  await expect.poll(async () => (await storedDemo(page)).reservations[0]?.quantity).toBe(2)
  await expect.poll(async () => (await storedDemo(page)).reservations[0]?.pickupWindowId).toBe('cherry-tomatoes-tomorrow')
  await expect.poll(async () => (await storedDemo(page)).reservations[0]?.tipCents).toBe(0)
})

test('a new free harvest publishes for tomorrow and persists across reload', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('grower')
  await page.getByRole('button', { name: 'Share a harvest', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share your harvest', exact: true })
  await dialog.getByRole('button', { name: 'Radishes', exact: true }).click()
  await dialog.getByLabel('Harvest name', { exact: true }).fill('Backyard radishes for a neighbor')
  await dialog.getByLabel('A little about your harvest', { exact: true }).fill('Freshly pulled this morning. Please wash before eating.')
  await dialog.getByLabel("What's in one portion?", { exact: true }).fill('1 bunch · 10 radishes')
  await dialog.getByLabel('Portions to share', { exact: true }).fill('6')
  await dialog.getByRole('combobox', { name: /Pickup day/ }).selectOption('tomorrow')
  await dialog.getByLabel('From', { exact: true }).fill('10:00')
  await dialog.getByLabel('Until', { exact: true }).fill('12:00')
  await dialog.getByLabel('Welcome optional thank-you tips').uncheck()
  await dialog.getByRole('button', { name: 'Share with the neighborhood', exact: true }).click()
  await expect(gardenCard(page, 'Backyard radishes for a neighbor')).toContainText('6 available')
  await expect(gardenCard(page, 'Backyard radishes for a neighbor')).toContainText('No tips, just sharing')
  await page.reload()
  await expect(page.locator('.produce-card')).toHaveCount(9)
  const published = page.getByRole('button', { name: 'View Backyard radishes for a neighbor from Maya Chen', exact: true })
  await expect(published).toContainText('1 bunch · 10 radishes')
  await published.click()
  await expect(page.getByRole('dialog')).toContainText('Tomorrow')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'No tip', exact: true })).toHaveCount(0)
})

test('closing a listing preserves its confirmed pickup and collection syncs both roles', async ({ page }) => {
  await reserveZucchini(page)
  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('grower')
  const card = gardenCard(page, zucchini)
  await card.getByRole('button', { name: 'Close listing', exact: true }).click()
  await expect(card).toContainText('Closed')
  await expect(card.locator('.inventory-row')).toContainText('0 available')
  await expect(page.locator('.grower-reservation')).toContainText('2 portions of The zucchini abundance')
  await page.locator('.grower-reservation').getByRole('button', { name: 'Mark collected', exact: true }).click()
  await expect(card.locator('.inventory-row')).toContainText('0 reserved')
  await expect(card.locator('.inventory-row')).toContainText('2 collected')
  await goToPickups(page)
  await page.getByRole('tab', { name: 'Past pickups', exact: true }).click()
  await expect(page.locator('.pickup-card')).toContainText('Collected')
  await expect(page.getByRole('button', { name: 'Mark collected', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('neighbor')
  await expect(page.getByRole('button', { name: `View ${zucchini} from Maya Chen`, exact: true })).toHaveCount(0)
  await expect.poll(async () => (await storedDemo(page)).listings.find(item => item.id === 'garden-zucchini')!.inventory).toEqual({ available: 0, reserved: 0, collected: 2, withdrawn: 3 })
})

test('resident collection persists and cannot be collected again from the grower view', async ({ page }) => {
  await reserveZucchini(page, 1)
  await page.getByRole('button', { name: 'Mark collected', exact: true }).click()
  await page.reload()
  await page.getByRole('combobox', { name: 'Demo role' }).selectOption('grower')
  await expect(gardenCard(page, zucchini).locator('.inventory-row')).toContainText('1 collected')
  await expect(gardenCard(page, zucchini).locator('.inventory-row')).toContainText('0 reserved')
  await expect(page.locator('.grower-reservation')).toHaveCount(0)
})

test('malformed saved state recovers and reset restores the original neighborhood', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{broken-json'), storageKey)
  await page.reload()
  await expect(page.locator('.produce-card')).toHaveCount(8)
  await expect(page.getByRole('status').filter({ hasText: 'Your saved demo was restored to a fresh harvest.' })).toBeVisible()
  await reserveZucchini(page)
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await page.getByRole('dialog', { name: 'Start a fresh demo', exact: true }).getByRole('button', { name: 'Reset demo', exact: true }).click()
  await expect(page.locator('.produce-card')).toHaveCount(8)
  await expect.poll(async () => (await storedDemo(page)).reservations).toHaveLength(0)
  await expect.poll(async () => (await storedDemo(page)).listings.find(item => item.id === 'garden-zucchini')!.inventory.available).toBe(5)
})

test('responsive layouts load every produce image and the reservation dialog keeps keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.evaluate(() => document.fonts.ready)
  const images = page.locator('img')
  await expect(images).toHaveCount(9)
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute('src', /^\/images\//)
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate(element => {
      const img = element as HTMLImageElement
      return img.complete && img.naturalWidth > 0
    })).toBe(true)
  }
  const noHorizontalOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  await expect.poll(noHorizontalOverflow).toBe(true)
  await page.getByRole('button', { name: 'Homegrown home', exact: true }).first().click()
  await page.screenshot({ path: '/private/tmp/homegrown-desktop.png' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(noHorizontalOverflow).toBe(true)
  await page.getByRole('button', { name: 'Homegrown home', exact: true }).first().click()
  await page.screenshot({ path: '/private/tmp/homegrown-mobile.png' })
  await page.setViewportSize({ width: 320, height: 800 })
  await expect.poll(noHorizontalOverflow).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })

  const opener = page.getByRole('button', { name: `View ${tomatoes} from Maya Chen`, exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: tomatoes, exact: true })
  await expect(dialog).toBeFocused()
  await expect.poll(noHorizontalOverflow).toBe(true)
  const close = dialog.getByRole('button', { name: 'Close dialog', exact: true })
  const reserve = dialog.getByRole('button', { name: 'Reserve for free', exact: true })
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(reserve).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true })
  await mobileNav.getByRole('button', { name: 'My garden', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Demo role' })).toHaveValue('grower')
  await expect(page.getByRole('heading', { name: 'A little garden. A lot of good.' })).toBeVisible()
  await mobileNav.getByRole('button', { name: 'Explore', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Demo role' })).toHaveValue('neighbor')

  await page.setViewportSize({ width: 1440, height: 1050 })
  await opener.click()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: '/private/tmp/homegrown-reservation.png' })
})
