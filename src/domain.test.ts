import { describe, expect, it } from 'vitest'
import {
  CROPS,
  DEMO_GROWER,
  DEMO_RESIDENT,
  DomainError,
  addListing,
  availableWindows,
  cancelReservation,
  closeListing,
  collectReservation,
  formatMoney,
  hasPickupToday,
  isListingAvailable,
  reserveProduce,
  restoreDemoState,
  seedDemo,
  validateDemoState,
  type DemoState,
  type ReserveInput,
} from './domain'

const now = new Date(2026, 9, 2, 12, 0, 0)

function reserveInput(state: DemoState, overrides: Partial<ReserveInput> = {}): ReserveInput {
  const listing = state.listings[0]
  return {
    listingId: listing.id,
    quantity: 2,
    pickupWindowId: availableWindows(listing, now)[0].id,
    ...overrides,
  }
}

function reserved(overrides: Partial<ReserveInput> = {}): DemoState {
  const state = seedDemo(now)
  return reserveProduce(state, reserveInput(state, overrides), now)
}

function inventoryTotal(state: DemoState, listingId = state.listings[0].id): number {
  const inventory = state.listings.find((listing) => listing.id === listingId)!.inventory
  return inventory.available + inventory.reserved + inventory.collected + inventory.withdrawn
}

describe('a free neighborhood marketplace', () => {
  it('seeds all eight crops with explicit portions and usable windows', () => {
    const state = seedDemo(now)
    expect(state.listings).toHaveLength(8)
    expect(state.listings.map((listing) => listing.crop).sort()).toEqual(CROPS.map((crop) => crop.key).sort())
    expect(state.listings.filter((listing) => listing.growerId === DEMO_GROWER.id)).toHaveLength(3)
    expect(state.listings.every((listing) => listing.portionLabel.length > 5 && isListingAvailable(listing, now))).toBe(true)
    expect(state.listings.every((listing) => listing.neighborhood === 'Maplewood')).toBe(true)
    expect(validateDemoState(state)).toBe(true)
  })

  it('offers tomorrow pickup even when today windows have ended', () => {
    const late = new Date(2026, 9, 2, 23, 59, 0)
    const state = seedDemo(late)
    expect(state.listings.every((listing) => isListingAvailable(listing, late))).toBe(true)
    expect(state.listings.every((listing) => !hasPickupToday(listing, late))).toBe(true)
  })

  it('reserves every listing for zero dollars without simulated payment', () => {
    const initial = seedDemo(now)
    for (const listing of initial.listings) {
      const state = reserveProduce(initial, {
        listingId: listing.id, quantity: 1, pickupWindowId: listing.pickupWindows[0].id,
      }, now)
      expect(state.reservations[0]).toMatchObject({ tipCents: 0, totalCents: 0, residentId: DEMO_RESIDENT.id })
      expect(validateDemoState(state)).toBe(true)
    }
  })

  it('commits optional tips in integer cents without changing the free produce amount', () => {
    const state = reserved({ tipCents: 350, simulatedPaymentComplete: true })
    expect(state.reservations[0]).toMatchObject({ quantity: 2, tipCents: 350, totalCents: 350, status: 'confirmed' })
    expect(formatMoney(state.reservations[0].totalCents)).toBe('$3.50')
    expect(validateDemoState(state)).toBe(true)
  })

  it('does not commit inventory when an optional tip checkout is abandoned', () => {
    const initial = seedDemo(now)
    const snapshot = JSON.stringify(initial)
    expect(() => reserveProduce(initial, reserveInput(initial, { tipCents: 100 }), now)).toThrow('simulated tip step')
    expect(JSON.stringify(initial)).toBe(snapshot)
    expect(initial.reservations).toHaveLength(0)
    const free = reserveProduce(initial, reserveInput(initial, { tipCents: 0 }), now)
    expect(free.reservations[0].totalCents).toBe(0)
  })

  it('rejects tips for growers who do not accept them but still permits free reservations', () => {
    const state = seedDemo(now)
    const listing = state.listings.find((item) => !item.acceptsTips)!
    const input = { listingId: listing.id, quantity: 1, pickupWindowId: listing.pickupWindows[0].id }
    expect(() => reserveProduce(state, { ...input, tipCents: 1, simulatedPaymentComplete: true }, now)).toThrow('shares without tips')
    expect(reserveProduce(state, input, now).reservations[0].totalCents).toBe(0)
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid tip cents %s', (tipCents) => {
    const state = seedDemo(now)
    expect(() => reserveProduce(state, reserveInput(state, { tipCents, simulatedPaymentComplete: true }), now)).toThrow(DomainError)
  })
})

describe('reservation and inventory lifecycle', () => {
  it('returns a new state and preserves the source while moving availability to reserved', () => {
    const initial = seedDemo(now)
    const next = reserveProduce(initial, reserveInput(initial), now)
    expect(next).not.toBe(initial)
    expect(initial.listings[0].inventory).toEqual({ available: 6, reserved: 0, collected: 0, withdrawn: 0 })
    expect(next.listings[0].inventory).toEqual({ available: 4, reserved: 2, collected: 0, withdrawn: 0 })
    expect(next.reservations[0]).toMatchObject({ title: initial.listings[0].title, portionLabel: initial.listings[0].portionLabel })
    expect(inventoryTotal(next)).toBe(inventoryTotal(initial))
  })

  it.each([0, -1, 0.5, NaN, Infinity])('rejects invalid quantity %s', (quantity) => {
    const state = seedDemo(now)
    expect(() => reserveProduce(state, reserveInput(state, { quantity }), now)).toThrow('whole number of portions')
  })

  it('rechecks stock against the latest state at final confirmation', () => {
    const initial = seedDemo(now)
    const input = reserveInput(initial, { quantity: 4 })
    const state = reserveProduce(initial, input, now)
    expect(() => reserveProduce(state, input, now)).toThrow('Only 2 portions remain')
    expect(state.reservations).toHaveLength(1)
    const all = reserveProduce(state, { ...input, quantity: 2 }, now)
    expect(all.listings[0].inventory.available).toBe(0)
    expect(isListingAvailable(all.listings[0], now)).toBe(false)
  })

  it('rechecks the exact selected pickup window, including its end boundary', () => {
    const state = seedDemo(now)
    const input = reserveInput(state)
    const window = state.listings[0].pickupWindows[0]
    expect(() => reserveProduce(state, input, new Date(window.endAt))).toThrow('pickup window has ended')
    expect(() => reserveProduce(state, { ...input, pickupWindowId: 'missing' }, now)).toThrow('pickup window has ended')
    expect(reserveProduce(state, input, new Date(Date.parse(window.endAt) - 1)).reservations).toHaveLength(1)
  })

  it('restores cancelled portions when the selected window is valid and listing remains open', () => {
    const initial = reserved()
    const id = initial.reservations[0].id
    const state = cancelReservation(initial, id, now)
    expect(state.listings[0].inventory).toEqual({ available: 6, reserved: 0, collected: 0, withdrawn: 0 })
    expect(state.reservations[0].status).toBe('cancelled')
    expect(cancelReservation(state, id, now)).toBe(state)
    expect(inventoryTotal(state)).toBe(6)
    expect(validateDemoState(state)).toBe(true)
  })

  it('withdraws cancelled portions after their selected window expires, even when another window remains', () => {
    const initial = reserved()
    const expiredAt = new Date(initial.listings[0].pickupWindows[0].endAt)
    const state = cancelReservation(initial, initial.reservations[0].id, expiredAt)
    expect(state.listings[0].inventory).toEqual({ available: 4, reserved: 0, collected: 0, withdrawn: 2 })
    expect(isListingAvailable(state.listings[0], expiredAt)).toBe(true)
    expect(validateDemoState(state)).toBe(true)
  })

  it('closes availability while preserving confirmed pickup and its collection', () => {
    const initial = reserved({ tipCents: 250, simulatedPaymentComplete: true })
    const closed = closeListing(initial, initial.listings[0].id)
    expect(closed.listings[0].inventory).toEqual({ available: 0, reserved: 2, collected: 0, withdrawn: 4 })
    expect(closed.reservations[0]).toEqual(initial.reservations[0])
    expect(closeListing(closed, closed.listings[0].id)).toBe(closed)
    expect(() => reserveProduce(closed, reserveInput(initial), now)).toThrow('closed the listing')
    const collected = collectReservation(closed, closed.reservations[0].id, now)
    expect(collected.listings[0].inventory).toEqual({ available: 0, reserved: 0, collected: 2, withdrawn: 4 })
    expect(collected.reservations[0].totalCents).toBe(250)
    expect(validateDemoState(collected)).toBe(true)
  })

  it('withdraws cancellation on a closed listing without reopening its stock', () => {
    const initial = reserved()
    const closed = closeListing(initial, initial.listings[0].id)
    const state = cancelReservation(closed, closed.reservations[0].id, now)
    expect(state.listings[0].inventory).toEqual({ available: 0, reserved: 0, collected: 0, withdrawn: 6 })
    expect(inventoryTotal(state)).toBe(6)
    expect(validateDemoState(state)).toBe(true)
  })

  it('marks collection once across the resident and grower views, and prevents later cancellation', () => {
    const initial = reserved()
    const id = initial.reservations[0].id
    const state = collectReservation(initial, id, now)
    expect(state.listings[0].inventory).toEqual({ available: 4, reserved: 0, collected: 2, withdrawn: 0 })
    expect(collectReservation(state, id, now)).toBe(state)
    expect(() => cancelReservation(state, id, now)).toThrow('already been collected')
    expect(validateDemoState(state)).toBe(true)
  })

  it('rejects collection of cancelled reservations', () => {
    const initial = reserved()
    const id = initial.reservations[0].id
    const cancelled = cancelReservation(initial, id, now)
    expect(() => collectReservation(cancelled, id, now)).toThrow('was cancelled')
  })

  it('handles missing records with friendly errors', () => {
    const state = seedDemo(now)
    expect(() => reserveProduce(state, { ...reserveInput(state), listingId: 'missing' }, now)).toThrow('no longer available')
    expect(() => closeListing(state, 'missing')).toThrow('no longer available')
    expect(() => cancelReservation(state, 'missing', now)).toThrow('could not find that pickup')
    expect(() => collectReservation(state, 'missing', now)).toThrow('could not find that pickup')
  })

  it('creates distinct identifiers for multiple transactions in the same millisecond', () => {
    const first = reserved({ quantity: 1 })
    const second = reserveProduce(first, reserveInput(first, { quantity: 1 }), now)
    expect(new Set(second.reservations.map((item) => item.id)).size).toBe(2)
  })
})

describe('grower publishing', () => {
  const publishInput = {
    crop: 'tomatoes' as const,
    title: ' More tomatoes ',
    description: ' A basket from my garden. ',
    portionLabel: ' 1 bag · 6 tomatoes ',
    totalPortions: 3,
    pickupWindows: seedDemo(now).listings[0].pickupWindows,
  }

  it('publishes a free harvest for the demo grower with explicit portions', () => {
    const initial = seedDemo(now)
    const state = addListing(initial, publishInput, now)
    expect(state.listings).toHaveLength(9)
    expect(initial.listings).toHaveLength(8)
    expect(state.listings[0]).toMatchObject({
      title: 'More tomatoes', portionLabel: '1 bag · 6 tomatoes', growerId: DEMO_GROWER.id,
      acceptsTips: true, inventory: { available: 3, reserved: 0, collected: 0, withdrawn: 0 },
    })
    expect(validateDemoState(state)).toBe(true)
    expect(reserveProduce(state, reserveInput(state, { quantity: 3 }), now).reservations[0].totalCents).toBe(0)
  })

  it('allows the grower to decline optional tips', () => {
    const state = addListing(seedDemo(now), { ...publishInput, acceptsTips: false }, now)
    expect(state.listings[0].acceptsTips).toBe(false)
  })

  it('rejects missing details, invalid inventory, malformed or expired windows', () => {
    const state = seedDemo(now)
    expect(() => addListing(state, { ...publishInput, title: ' ' }, now)).toThrow('title, garden notes')
    expect(() => addListing(state, { ...publishInput, totalPortions: 1.5 }, now)).toThrow('whole number')
    expect(() => addListing(state, { ...publishInput, pickupWindows: [] }, now)).toThrow('pickup window')
    expect(() => addListing(state, { ...publishInput, pickupWindows: [publishInput.pickupWindows[0], publishInput.pickupWindows[0]] }, now)).toThrow('pickup window')
    expect(() => addListing(state, { ...publishInput, pickupWindows: [{ ...publishInput.pickupWindows[0], startAt: 'no-date' }] }, now)).toThrow('pickup window')
    expect(() => addListing(state, { ...publishInput, pickupWindows: [publishInput.pickupWindows[0]] }, publishInput.pickupWindows[0].endAt)).toThrow('pickup window')
  })
})

describe('versioned browser persistence recovery', () => {
  it('round-trips a full lifecycle while preserving tip totals', () => {
    const initial = reserved({ tipCents: 123, simulatedPaymentComplete: true })
    const closed = closeListing(initial, initial.listings[0].id)
    const state = collectReservation(closed, closed.reservations[0].id, now)
    const restored = restoreDemoState(JSON.stringify(state), now)
    expect(restored).toEqual({ state, recovered: false })
  })

  it('does not erase valid old data just because its pickup times expired', () => {
    const state = reserved()
    const nextWeek = new Date(now)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const restored = restoreDemoState(JSON.stringify(state), nextWeek)
    expect(restored.recovered).toBe(false)
    expect(restored.state.reservations).toHaveLength(1)
    expect(isListingAvailable(restored.state.listings[0], nextWeek)).toBe(false)
  })

  it('seeds first use without reporting a recovery', () => {
    expect(restoreDemoState(null, now)).toEqual({ state: seedDemo(now), recovered: false })
  })

  it.each(['{bad json', 'null', '[]', '{}', '{"version":2,"listings":[],"reservations":[]}'])('recovers malformed or unsupported data: %s', (raw) => {
    const restored = restoreDemoState(raw, now)
    expect(restored.recovered).toBe(true)
    expect(restored.state).toEqual(seedDemo(now))
  })

  it('rejects negative, noninteger, and inconsistent inventory instead of showing phantom produce', () => {
    for (const inventory of [
      { available: -1, reserved: 0, collected: 0, withdrawn: 0 },
      { available: 1.5, reserved: 0, collected: 0, withdrawn: 0 },
      { available: 4, reserved: 2, collected: 0, withdrawn: 0 },
      { available: 4, reserved: 0, collected: 2, withdrawn: 0 },
    ]) {
      const state = seedDemo(now)
      state.listings[0].inventory = inventory
      expect(validateDemoState(state)).toBe(false)
      expect(restoreDemoState(JSON.stringify(state), now).recovered).toBe(true)
    }
  })

  it('rejects missing owners, duplicate listings/windows, orphan reservations, or altered totals', () => {
    const missingOwner = seedDemo(now)
    missingOwner.listings[0].growerId = ''
    expect(validateDemoState(missingOwner)).toBe(false)
    const duplicates = seedDemo(now)
    duplicates.listings[1].id = duplicates.listings[0].id
    expect(validateDemoState(duplicates)).toBe(false)
    const duplicateWindows = seedDemo(now)
    duplicateWindows.listings[0].pickupWindows[1].id = duplicateWindows.listings[0].pickupWindows[0].id
    expect(validateDemoState(duplicateWindows)).toBe(false)
    const orphan = reserved()
    orphan.reservations[0].listingId = 'missing'
    expect(validateDemoState(orphan)).toBe(false)
    const alteredTotal = reserved({ tipCents: 100, simulatedPaymentComplete: true })
    alteredTotal.reservations[0].totalCents = 1000
    expect(validateDemoState(alteredTotal)).toBe(false)
  })
})
