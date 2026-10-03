export const STORAGE_KEY = 'homegrown.demo.v1'
export const DEMO_VERSION = 1 as const

export const DEMO_RESIDENT = { id: 'resident-alex', name: 'Alex Morgan' } as const
export const DEMO_GROWER = { id: 'grower-maya', name: 'Maya Chen' } as const

export const CROPS = [
  { key: 'tomatoes', label: 'Tomatoes' },
  { key: 'zucchini', label: 'Zucchini' },
  { key: 'greens', label: 'Leafy greens' },
  { key: 'carrots', label: 'Carrots' },
  { key: 'peppers', label: 'Peppers' },
  { key: 'herbs', label: 'Fresh herbs' },
  { key: 'cucumbers', label: 'Cucumbers' },
  { key: 'radishes', label: 'Radishes' },
] as const

export type CropKey = (typeof CROPS)[number]['key']
export type Now = Date | number | string

export interface PickupWindow {
  id: string
  label: string
  startAt: string
  endAt: string
}

export interface Inventory {
  available: number
  reserved: number
  collected: number
  withdrawn: number
}

export interface Listing {
  id: string
  crop: CropKey
  title: string
  description: string
  portionLabel: string
  acceptsTips: boolean
  distanceMiles: number
  neighborhood: string
  growerName: string
  growerId: string
  publicPickupArea: string
  privatePickupAddress: string
  pickupInstructions: string
  pickupWindows: PickupWindow[]
  inventory: Inventory
  status: 'open' | 'closed'
  createdAt: string
}

export interface Reservation {
  id: string
  listingId: string
  residentId: string
  residentName: string
  title: string
  portionLabel: string
  quantity: number
  pickupWindowId: string
  tipCents: number
  totalCents: number
  status: 'confirmed' | 'cancelled' | 'collected'
  createdAt: string
  cancelledAt?: string
  collectedAt?: string
}

export interface DemoState {
  version: typeof DEMO_VERSION
  listings: Listing[]
  reservations: Reservation[]
}

export interface ReserveInput {
  listingId: string
  quantity: number
  pickupWindowId: string
  tipCents?: number
  simulatedPaymentComplete?: boolean
}

export interface AddListingInput {
  crop: CropKey
  title: string
  description: string
  portionLabel: string
  acceptsTips?: boolean
  totalPortions: number
  pickupWindows: PickupWindow[]
  publicPickupArea?: string
  privatePickupAddress?: string
  pickupInstructions?: string
}

export class DomainError extends Error {
  readonly code: string

  constructor(message: string, code = 'INVALID_INPUT') {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

function dateValue(now: Now = new Date()): Date {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now)
  if (!Number.isFinite(date.getTime())) {
    throw new DomainError('Please choose a valid date and time.', 'INVALID_DATE')
  }
  return date
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function positiveInteger(value: unknown): value is number {
  return nonnegativeInteger(value) && value > 0
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCrop(value: unknown): value is CropKey {
  return CROPS.some((crop) => crop.key === value)
}

function isValidWindow(value: unknown): value is PickupWindow {
  return isObject(value)
    && nonemptyString(value.id)
    && nonemptyString(value.label)
    && validDate(value.startAt)
    && validDate(value.endAt)
    && Date.parse(value.startAt) < Date.parse(value.endAt)
}

export function isWindowAvailable(window: PickupWindow, now: Now = new Date()): boolean {
  return isValidWindow(window) && Date.parse(window.endAt) > dateValue(now).getTime()
}

export function availableWindows(listing: Listing, now: Now = new Date()): PickupWindow[] {
  const instant = dateValue(now)
  return listing.pickupWindows.filter((window) => isWindowAvailable(window, instant))
}

export function isListingAvailable(listing: Listing, now: Now = new Date()): boolean {
  return listing.status === 'open'
    && listing.inventory.available > 0
    && availableWindows(listing, now).length > 0
}

export function hasPickupToday(listing: Listing, now: Now = new Date()): boolean {
  const today = dateValue(now)
  return availableWindows(listing, today).some((window) => {
    const start = new Date(window.startAt)
    return start.getFullYear() === today.getFullYear()
      && start.getMonth() === today.getMonth()
      && start.getDate() === today.getDate()
  })
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(cents / 100)
}

function requireListing(state: DemoState, id: string): Listing {
  const listing = state.listings.find((item) => item.id === id)
  if (!listing) throw new DomainError('This produce listing is no longer available.', 'NOT_FOUND')
  return listing
}

function requireReservation(state: DemoState, id: string): Reservation {
  const reservation = state.reservations.find((item) => item.id === id)
  if (!reservation) throw new DomainError('We could not find that pickup.', 'NOT_FOUND')
  return reservation
}

function replaceListing(state: DemoState, updated: Listing): DemoState {
  return { ...state, listings: state.listings.map((item) => item.id === updated.id ? updated : item) }
}

function uniqueId(prefix: string, now: Date, existingIds: string[]): string {
  const stem = `${prefix}-${now.getTime()}`
  let suffix = existingIds.length + 1
  while (existingIds.includes(`${stem}-${suffix}`)) suffix += 1
  return `${stem}-${suffix}`
}

export function reserveProduce(
  state: DemoState,
  input: ReserveInput,
  now: Now = new Date(),
): DemoState {
  const instant = dateValue(now)
  const listing = requireListing(state, input.listingId)
  if (!positiveInteger(input.quantity)) {
    throw new DomainError('Choose a whole number of portions, at least one.', 'INVALID_QUANTITY')
  }
  if (listing.status !== 'open') {
    throw new DomainError('This grower has closed the listing. Try another harvest.', 'UNAVAILABLE')
  }
  const window = listing.pickupWindows.find((item) => item.id === input.pickupWindowId)
  if (!window || !isWindowAvailable(window, instant)) {
    throw new DomainError('That pickup window has ended. Choose an available time.', 'INVALID_WINDOW')
  }
  if (input.quantity > listing.inventory.available) {
    throw new DomainError(`Only ${listing.inventory.available} portions remain. Try a smaller quantity.`, 'INSUFFICIENT_STOCK')
  }
  const tipCents = input.tipCents ?? 0
  if (!nonnegativeInteger(tipCents)) {
    throw new DomainError('Enter an optional tip in whole cents, or choose $0.', 'INVALID_TIP')
  }
  if (tipCents > 0 && !listing.acceptsTips) {
    throw new DomainError('This grower shares without tips. You can reserve for free.', 'TIPS_NOT_ACCEPTED')
  }
  if (tipCents > 0 && input.simulatedPaymentComplete !== true) {
    throw new DomainError('Complete the simulated tip step, or reserve with no tip.', 'PAYMENT_REQUIRED')
  }
  const reservation: Reservation = {
    id: uniqueId('pickup', instant, state.reservations.map((item) => item.id)),
    listingId: listing.id,
    residentId: DEMO_RESIDENT.id,
    residentName: DEMO_RESIDENT.name,
    title: listing.title,
    portionLabel: listing.portionLabel,
    quantity: input.quantity,
    pickupWindowId: window.id,
    tipCents,
    totalCents: tipCents,
    status: 'confirmed',
    createdAt: instant.toISOString(),
  }
  const next = replaceListing(state, {
    ...listing,
    inventory: {
      ...listing.inventory,
      available: listing.inventory.available - input.quantity,
      reserved: listing.inventory.reserved + input.quantity,
    },
  })
  return { ...next, reservations: [...next.reservations, reservation] }
}

export function cancelReservation(
  state: DemoState,
  id: string,
  now: Now = new Date(),
): DemoState {
  const instant = dateValue(now)
  const reservation = requireReservation(state, id)
  if (reservation.status === 'cancelled') return state
  if (reservation.status === 'collected') {
    throw new DomainError('This pickup has already been collected and cannot be cancelled.', 'ALREADY_COLLECTED')
  }
  const listing = requireListing(state, reservation.listingId)
  const window = listing.pickupWindows.find((item) => item.id === reservation.pickupWindowId)
  const restore = listing.status === 'open' && !!window && isWindowAvailable(window, instant)
  const next = replaceListing(state, {
    ...listing,
    inventory: {
      ...listing.inventory,
      reserved: listing.inventory.reserved - reservation.quantity,
      available: listing.inventory.available + (restore ? reservation.quantity : 0),
      withdrawn: listing.inventory.withdrawn + (restore ? 0 : reservation.quantity),
    },
  })
  return {
    ...next,
    reservations: next.reservations.map((item) => item.id === id
      ? { ...item, status: 'cancelled', cancelledAt: instant.toISOString() }
      : item),
  }
}

export function collectReservation(
  state: DemoState,
  id: string,
  now: Now = new Date(),
): DemoState {
  const reservation = requireReservation(state, id)
  if (reservation.status === 'collected') return state
  if (reservation.status === 'cancelled') {
    throw new DomainError('This pickup was cancelled and cannot be marked collected.', 'CANCELLED')
  }
  const listing = requireListing(state, reservation.listingId)
  const next = replaceListing(state, {
    ...listing,
    inventory: {
      ...listing.inventory,
      reserved: listing.inventory.reserved - reservation.quantity,
      collected: listing.inventory.collected + reservation.quantity,
    },
  })
  return {
    ...next,
    reservations: next.reservations.map((item) => item.id === id
      ? { ...item, status: 'collected', collectedAt: dateValue(now).toISOString() }
      : item),
  }
}

export function closeListing(state: DemoState, id: string): DemoState {
  const listing = requireListing(state, id)
  if (listing.status === 'closed') return state
  return replaceListing(state, {
    ...listing,
    status: 'closed',
    inventory: {
      ...listing.inventory,
      available: 0,
      withdrawn: listing.inventory.withdrawn + listing.inventory.available,
    },
  })
}

export function addListing(
  state: DemoState,
  input: AddListingInput,
  now: Now = new Date(),
): DemoState {
  const instant = dateValue(now)
  if (!isCrop(input.crop)) throw new DomainError('Choose a produce photo.', 'INVALID_CROP')
  if (!nonemptyString(input.title) || !nonemptyString(input.description) || !nonemptyString(input.portionLabel)) {
    throw new DomainError('Add a title, garden notes, and a clear portion description.', 'MISSING_DETAILS')
  }
  if (!positiveInteger(input.totalPortions)) {
    throw new DomainError('Enter a whole number of portions, at least one.', 'INVALID_QUANTITY')
  }
  if (input.acceptsTips !== undefined && typeof input.acceptsTips !== 'boolean') {
    throw new DomainError('Choose whether you accept optional tips.', 'INVALID_INPUT')
  }
  if (!Array.isArray(input.pickupWindows) || input.pickupWindows.length === 0
    || !input.pickupWindows.every(isValidWindow)
    || new Set(input.pickupWindows.map((window) => window.id)).size !== input.pickupWindows.length
    || input.pickupWindows.some((window) => !isWindowAvailable(window, instant))) {
    throw new DomainError('Choose at least one valid, upcoming pickup window.', 'INVALID_WINDOW')
  }
  const listing: Listing = {
    id: uniqueId('harvest', instant, state.listings.map((item) => item.id)),
    crop: input.crop,
    title: input.title.trim(),
    description: input.description.trim(),
    portionLabel: input.portionLabel.trim(),
    acceptsTips: input.acceptsTips ?? true,
    distanceMiles: 0.3,
    neighborhood: 'Maplewood',
    growerName: DEMO_GROWER.name,
    growerId: DEMO_GROWER.id,
    publicPickupArea: input.publicPickupArea?.trim() || 'Maple Street · West Maplewood',
    privatePickupAddress: input.privatePickupAddress?.trim() || '24 Maple Street, Maplewood',
    pickupInstructions: input.pickupInstructions?.trim() || 'Your bag will be on the front porch, labeled Alex. Please take only your reserved portions.',
    pickupWindows: input.pickupWindows.map((window) => ({ ...window })),
    inventory: { available: input.totalPortions, reserved: 0, collected: 0, withdrawn: 0 },
    status: 'open',
    createdAt: instant.toISOString(),
  }
  return { ...state, listings: [listing, ...state.listings] }
}

function seedWindows(now: Date, suffix: string, todayHours: [number, number] = [16, 20]): PickupWindow[] {
  const todayStart = new Date(now)
  todayStart.setHours(todayHours[0], 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(todayHours[1], 0, 0, 0)
  const tomorrowStart = new Date(now)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  tomorrowStart.setHours(10, 0, 0, 0)
  const tomorrowEnd = new Date(tomorrowStart)
  tomorrowEnd.setHours(18, 0, 0, 0)
  return [
    { id: `${suffix}-today`, label: 'Today · 4–8 PM', startAt: todayStart.toISOString(), endAt: todayEnd.toISOString() },
    { id: `${suffix}-tomorrow`, label: 'Tomorrow · 10 AM–6 PM', startAt: tomorrowStart.toISOString(), endAt: tomorrowEnd.toISOString() },
  ]
}

export function seedDemo(now: Now = new Date()): DemoState {
  const instant = dateValue(now)
  const growers = {
    maya: { name: 'Maya Chen', id: DEMO_GROWER.id, area: 'Maple Street · West Maplewood', address: '24 Maple Street, Maplewood' },
    jordan: { name: 'Jordan Ellis', id: 'grower-jordan', area: 'Cedar Avenue · Central Maplewood', address: '18 Cedar Avenue, Maplewood' },
    sam: { name: 'Sam Rivera', id: 'grower-sam', area: 'Birch Lane · East Maplewood', address: '7 Birch Lane, Maplewood' },
    ava: { name: 'Ava Patel', id: 'grower-ava', area: 'Oak Court · North Maplewood', address: '12 Oak Court, Maplewood' },
  }
  const seeds: Array<{
    id: string; crop: CropKey; title: string; description: string; portion: string;
    grower: keyof typeof growers; distance: number; count: number; tips: boolean;
  }> = [
    { id: 'cherry-tomatoes', crop: 'tomatoes', title: 'Sun-sweet cherry tomatoes', description: 'A happy little jungle of tomatoes took over my raised beds. Picked this morning, sweet enough to snack on straight from the bag.', portion: '1 pint · about 20 tomatoes', grower: 'maya', distance: 0.3, count: 6, tips: true },
    { id: 'garden-zucchini', crop: 'zucchini', title: 'The zucchini abundance', description: 'Our plants are very enthusiastic this year. Tender, medium-sized zucchini for a quick sauté, a tray bake, or sharing with a friend.', portion: '1 bag · 2 medium zucchini', grower: 'maya', distance: 0.3, count: 5, tips: false },
    { id: 'leafy-greens', crop: 'greens', title: 'A little leafy goodness', description: 'A mix of kale and chard from my backyard. Rinsed once; please wash again before cooking. Lovely in soups or with garlic.', portion: '1 bunch · about 8 leaves', grower: 'jordan', distance: 0.6, count: 4, tips: true },
    { id: 'rainbow-carrots', crop: 'carrots', title: 'Freshly pulled carrots', description: 'Crunchy orange and purple carrots, still with their tops. A few are delightfully wonky. Grown in a small home garden.', portion: '1 bunch · 6 carrots', grower: 'sam', distance: 1.1, count: 3, tips: true },
    { id: 'sweet-peppers', crop: 'peppers', title: 'Sweet garden peppers', description: 'Red, yellow, and a few green bell peppers. Sweet rather than spicy. Ready for fajitas, salads, or an easy sheet-pan dinner.', portion: '1 bag · 3 peppers', grower: 'ava', distance: 1.5, count: 4, tips: true },
    { id: 'kitchen-herbs', crop: 'herbs', title: 'Your kitchen herb bundle', description: 'A fragrant handful of basil, mint, and parsley from my herb patch. I will cut your bundle shortly before pickup.', portion: '1 bundle · 3 small herb bunches', grower: 'maya', distance: 0.3, count: 7, tips: true },
    { id: 'crisp-cucumbers', crop: 'cucumbers', title: 'Cool, crisp cucumbers', description: 'Our cucumber vines went all out. These are small, crisp garden cucumbers, great sliced up or made into quick pickles.', portion: '1 bag · 3 cucumbers', grower: 'jordan', distance: 0.8, count: 5, tips: false },
    { id: 'peppery-radishes', crop: 'radishes', title: 'Peppery little radishes', description: 'A fresh, colorful bunch with a little bite. Try them in a salad or roasted. The greens are edible too—give everything a good wash.', portion: '1 bunch · 8 radishes', grower: 'sam', distance: 1.2, count: 4, tips: true },
  ]
  return {
    version: DEMO_VERSION,
    reservations: [],
    listings: seeds.map((seed) => {
      const grower = growers[seed.grower]
      return {
        id: seed.id,
        crop: seed.crop,
        title: seed.title,
        description: seed.description,
        portionLabel: seed.portion,
        acceptsTips: seed.tips,
        distanceMiles: seed.distance,
        neighborhood: 'Maplewood',
        growerName: grower.name,
        growerId: grower.id,
        publicPickupArea: grower.area,
        privatePickupAddress: grower.address,
        pickupInstructions: 'Your produce will be in a labeled bag on the front porch. Please take only your reserved portions. All people and addresses in this demo are fictional.',
        pickupWindows: seedWindows(instant, seed.id),
        inventory: { available: seed.count, reserved: 0, collected: 0, withdrawn: 0 },
        status: 'open',
        createdAt: instant.toISOString(),
      }
    }),
  }
}

function isValidListing(value: unknown): value is Listing {
  if (!isObject(value)) return false
  const stringFields = ['id', 'title', 'description', 'portionLabel', 'neighborhood', 'growerName', 'growerId', 'publicPickupArea', 'privatePickupAddress', 'pickupInstructions']
  if (!stringFields.every((key) => nonemptyString(value[key]))
    || !isCrop(value.crop)
    || typeof value.acceptsTips !== 'boolean'
    || typeof value.distanceMiles !== 'number' || !Number.isFinite(value.distanceMiles) || value.distanceMiles < 0
    || !validDate(value.createdAt)
    || !['open', 'closed'].includes(value.status as string)
    || !Array.isArray(value.pickupWindows) || value.pickupWindows.length === 0
    || !value.pickupWindows.every(isValidWindow)
    || new Set(value.pickupWindows.map((window) => window.id)).size !== value.pickupWindows.length
    || !isObject(value.inventory)) return false
  const inventory = value.inventory
  const counts = ['available', 'reserved', 'collected', 'withdrawn']
  if (!counts.every((key) => nonnegativeInteger(inventory[key]))) return false
  const total = counts.reduce((sum, key) => sum + (inventory[key] as number), 0)
  return Number.isSafeInteger(total) && total > 0
    && (value.status !== 'closed' || inventory.available === 0)
}

function isValidReservation(value: unknown): value is Reservation {
  if (!isObject(value)) return false
  return ['id', 'listingId', 'residentId', 'residentName', 'title', 'portionLabel', 'pickupWindowId'].every((key) => nonemptyString(value[key]))
    && positiveInteger(value.quantity)
    && nonnegativeInteger(value.tipCents)
    && value.totalCents === value.tipCents
    && validDate(value.createdAt)
    && ['confirmed', 'cancelled', 'collected'].includes(value.status as string)
    && (value.status !== 'cancelled' || validDate(value.cancelledAt))
    && (value.status !== 'collected' || validDate(value.collectedAt))
    && (value.status !== 'confirmed' || (value.cancelledAt === undefined && value.collectedAt === undefined))
    && (value.status !== 'cancelled' || value.collectedAt === undefined)
    && (value.status !== 'collected' || value.cancelledAt === undefined)
}

export function validateDemoState(value: unknown): value is DemoState {
  if (!isObject(value) || value.version !== DEMO_VERSION
    || !Array.isArray(value.listings) || !Array.isArray(value.reservations)
    || !value.listings.every(isValidListing)
    || !value.reservations.every(isValidReservation)
    || new Set(value.listings.map((listing) => listing.id)).size !== value.listings.length
    || new Set(value.reservations.map((reservation) => reservation.id)).size !== value.reservations.length) return false
  const listings = value.listings as Listing[]
  const reservations = value.reservations as Reservation[]
  if (reservations.some((reservation) => {
    const listing = listings.find((item) => item.id === reservation.listingId)
    return !listing || !listing.pickupWindows.some((window) => window.id === reservation.pickupWindowId)
      || (!listing.acceptsTips && reservation.tipCents > 0)
  })) return false
  return listings.every((listing) => {
    const matching = reservations.filter((reservation) => reservation.listingId === listing.id)
    const reserved = matching.filter((reservation) => reservation.status === 'confirmed').reduce((sum, item) => sum + item.quantity, 0)
    const collected = matching.filter((reservation) => reservation.status === 'collected').reduce((sum, item) => sum + item.quantity, 0)
    return listing.inventory.reserved === reserved && listing.inventory.collected === collected
  })
}

export function restoreDemoState(
  raw: string | null,
  now: Now = new Date(),
): { state: DemoState; recovered: boolean } {
  if (raw === null) return { state: seedDemo(now), recovered: false }
  try {
    const value: unknown = JSON.parse(raw)
    if (validateDemoState(value)) return { state: value, recovered: false }
  } catch {
    // Invalid or outdated saved demos should never prevent opening the prototype.
  }
  return { state: seedDemo(now), recovered: true }
}
