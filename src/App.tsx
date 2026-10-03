import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  ChevronLeft, Clock3, CreditCard, Heart, Leaf, MapPin, Minus,
  Plus, RotateCcw, Search, ShoppingBag, Sparkles, Sprout, Sun,
  Users, X,
} from 'lucide-react'
import {
  CROPS, DEMO_GROWER, DEMO_RESIDENT, STORAGE_KEY,
  addListing, availableWindows, cancelReservation, closeListing, collectReservation,
  formatMoney, hasPickupToday, isListingAvailable, reserveProduce, restoreDemoState, seedDemo,
  type DemoState, type Listing, type Reservation,
} from './domain'

type Page = 'explore' | 'pickups' | 'garden'
type Persona = 'neighbor' | 'grower'
type ModalState =
  | { kind: 'listing'; listingId: string; quantity?: number; windowId?: string }
  | { kind: 'checkout'; listingId: string; quantity: number; windowId: string; tipCents: number }
  | { kind: 'confirmation'; reservationId: string }
  | { kind: 'new-listing' }
  | { kind: 'reset' }
  | null

function getInitialDemo() {
  try {
    return { ...restoreDemoState(localStorage.getItem(STORAGE_KEY)), storageDisabled: false }
  } catch {
    return { state: seedDemo(), recovered: false, storageDisabled: true }
  }
}

function pickupLabel(window: Listing['pickupWindows'][number]) {
  const date = new Date(window.startAt)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const day = date.toDateString() === today.toDateString() ? 'Today'
    : date.toDateString() === tomorrow.toDateString() ? 'Tomorrow'
    : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time(window.startAt)} – ${time(window.endAt)}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function Logo({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="Homegrown home">
    <span className="brand-mark"><Sprout size={26} strokeWidth={2.2} /></span>
    <span className="brand-name">homegrown<span>.</span></span>
  </button>
}

function Modal({ children, onClose, title, wide = false }: { children: ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab') return
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
      ) ?? []).filter(element => element.getClientRects().length > 0)
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [])
  return <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <button className="modal-close icon-button" onClick={onClose} aria-label="Close dialog"><X size={22} /></button>
      {children}
    </div>
  </div>
}

function EmptyState({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="empty-state">
    <span className="empty-icon"><Sprout size={36} /></span>
    <h2>{title}</h2><p>{description}</p>
    <button className="button primary" onClick={onAction}>{action}<ArrowRight size={18} /></button>
  </div>
}

function ProduceCard({ listing, now, onClick }: { listing: Listing; now: Date; onClick: () => void }) {
  return <button type="button" className="produce-card" onClick={onClick} aria-label={`View ${listing.title} from ${listing.growerName}`}>
    <div className="produce-image">
      <img src={`/images/${listing.crop}.jpg`} alt={listing.title} loading="lazy" />
      <div className="produce-badges"><span className="badge free">Free to share</span>
        {hasPickupToday(listing, now) && <span className="badge today"><Sun size={12} />Today</span>}
      </div>
    </div>
    <div className="produce-body">
      <div className="produce-grower"><span className="grower-avatar">{listing.growerName.split(' ').map(name => name[0]).join('')}</span>{listing.growerName}'s garden</div>
      <h3 className="produce-title">{listing.title}</h3>
      <p className="produce-portion">{listing.portionLabel}</p>
      <div className="produce-availability"><span />{listing.inventory.available} portions to share</div>
      <div className="produce-footer"><span className="produce-distance"><MapPin size={14} />{listing.distanceMiles.toFixed(1)} miles away</span><span className="card-arrow"><ArrowUpRight size={19} /></span></div>
    </div>
  </button>
}

export default function App() {
  const [initial] = useState(getInitialDemo)
  const [state, setState] = useState<DemoState>(initial.state)
  const [page, setPage] = useState<Page>('explore')
  const [persona, setPersona] = useState<Persona>('neighbor')
  const [modal, setModal] = useState<ModalState>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [todayOnly, setTodayOnly] = useState(false)
  const [distance, setDistance] = useState('5')
  const [pickupTab, setPickupTab] = useState('upcoming')
  const [toast, setToast] = useState(initial.recovered ? 'Your saved demo was restored to a fresh harvest.' : '')
  const [storageDisabled, setStorageDisabled] = useState(initial.storageDisabled)
  const [now, setNow] = useState(() => new Date())
  const harvestRef = useRef<HTMLElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
    catch { setStorageDisabled(true) }
  }, [state])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 6500)
    return () => clearTimeout(timer)
  }, [toast])

  function navigate(nextPage: Page) {
    setPersona(nextPage === 'garden' ? 'grower' : 'neighbor')
    setPage(nextPage); setModal(null); window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function update(action: (current: DemoState) => DemoState, success?: string) {
    const nextState = action(stateRef.current)
    stateRef.current = nextState
    setState(nextState)
    if (success) setToast(success)
    return nextState
  }
  function confirmReservation(listingId: string, quantity: number, windowId: string, tipCents: number, paymentComplete = false) {
    const previousState = stateRef.current
    const next = update(current => reserveProduce(current, {
      listingId, quantity, pickupWindowId: windowId, tipCents, simulatedPaymentComplete: paymentComplete,
    }))
    const reservation = next.reservations.find(item => !previousState.reservations.some(previous => previous.id === item.id))
    if (reservation) setModal({ kind: 'confirmation', reservationId: reservation.id })
  }
  function cancel(id: string) {
    try { update(current => cancelReservation(current, id), 'Pickup cancelled. Your garden neighbor has been updated.') }
    catch (error) { setToast(errorMessage(error)) }
  }
  function collect(id: string) {
    try { update(current => collectReservation(current, id), 'Picked up. A little less waste, a little more good food.') }
    catch (error) { setToast(errorMessage(error)) }
  }
  function startPosting() { navigate('garden'); setModal({ kind: 'new-listing' }) }

  const filtered = useMemo(() => state.listings.filter(listing => {
    const text = `${listing.title} ${listing.description} ${listing.crop} ${listing.growerName}`.toLowerCase()
    const leafy = listing.crop === 'greens' || listing.crop === 'herbs'
    return isListingAvailable(listing, now) && text.includes(search.trim().toLowerCase())
      && listing.distanceMiles <= Number(distance)
      && (!todayOnly || hasPickupToday(listing, now))
      && (category === 'all' || (category === 'leafy' ? leafy : !leafy))
  }), [state.listings, search, category, distance, todayOnly, now])
  const allAvailable = state.listings.filter(listing => isListingAvailable(listing, now))
  const residentReservations = state.reservations.filter(reservation => reservation.residentId === DEMO_RESIDENT.id)
  const upcomingCount = residentReservations.filter(reservation => reservation.status === 'confirmed').length
  const gardenListings = state.listings.filter(listing => listing.growerId === DEMO_GROWER.id)
  const gardenReservations = state.reservations.filter(reservation => gardenListings.some(listing => listing.id === reservation.listingId))
  const shownPickups = residentReservations.filter(reservation => pickupTab === 'upcoming' ? reservation.status === 'confirmed' : reservation.status !== 'confirmed')
  const activeListing = modal && 'listingId' in modal ? state.listings.find(listing => listing.id === modal.listingId) : undefined
  const confirmedReservation = modal?.kind === 'confirmation' ? state.reservations.find(reservation => reservation.id === modal.reservationId) : undefined

  const navItems = [
    { page: 'explore' as const, label: 'Explore', icon: Leaf },
    { page: 'pickups' as const, label: 'My pickups', icon: ShoppingBag },
    { page: 'garden' as const, label: 'My garden', icon: Sprout },
  ]
  return <>
    <div className="top-banner"><div className="banner-inner"><span><Sprout size={15} />A little extra in your garden. A little goodness for your neighbor.</span><span><Sparkles size={13} />Demo neighborhood</span></div></div>
    <header className="site-header"><div className="header-inner">
      <Logo onClick={() => navigate('explore')} />
      <nav className="desktop-nav" aria-label="Main navigation">{navItems.map(item => <button key={item.page} className={`nav-button${page === item.page ? ' active' : ''}`} onClick={() => navigate(item.page)} aria-current={page === item.page ? 'page' : undefined}><item.icon size={17} />{item.label}{item.page === 'pickups' && upcomingCount > 0 && <span className="nav-count">{upcomingCount}</span>}</button>)}</nav>
      <div className="header-actions"><label className="role-switch"><span>Demo role</span><select aria-label="Demo role" value={persona} onChange={event => {
        const nextPersona = event.target.value as Persona
        setPersona(nextPersona); navigate(nextPersona === 'grower' ? 'garden' : 'explore')
      }}><option value="neighbor">Neighbor</option><option value="grower">Grower</option></select><ChevronDown size={14} /></label><span className="avatar" aria-label={persona === 'neighbor' ? DEMO_RESIDENT.name : DEMO_GROWER.name}>{persona === 'neighbor' ? 'AM' : 'MC'}</span><button className="icon-button reset-button" onClick={() => setModal({ kind: 'reset' })} aria-label="Reset demo" title="Reset demo"><RotateCcw size={17} /></button></div>
    </div></header>

    <main className="app-main">
      {storageDisabled && <div className="notice warning" role="status">Your browser cannot save this demo. You can still explore; changes will last until you leave this page.</div>}
      {page === 'explore' && <div className="explore-page">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-copy"><div className="eyebrow"><span />THE BEST THINGS GROW CLOSE TO HOME</div><h1 className="hero-title" id="hero-heading">Good food.<br /><span>Great neighbors.</span></h1><p className="hero-description">Your neighbor's extra harvest could be your next meal.<br className="desktop-break" /> Discover fresh, homegrown goodness—shared for free.</p><div className="hero-actions"><button className="button primary" onClick={() => harvestRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}>Explore the harvest<ArrowDown size={18} /></button><button className="button secondary" onClick={startPosting}>Share your surplus<ArrowUpRight size={18} /></button></div><div className="hero-trust"><span className="neighbor-faces"><i>MC</i><i>JE</i><i>SR</i></span><span>Little gardens. Big-hearted neighbors.<br /><strong>All produce is free. Tips are always optional.</strong></span></div></div>
          <div className="hero-visual" aria-hidden="true"><div className="hero-photo-wrap"><img className="hero-photo" src="/images/garden.jpg" alt="" /></div><div className="hero-sticker"><Sprout size={28} /><span>grown here.<br />shared here.</span><svg className="sticker-ring" viewBox="0 0 160 160"><circle cx="80" cy="80" r="73" fill="none" /></svg></div><div className="hero-note"><Heart size={24} /><span>A little extra.<br /><strong>A lot of good.</strong></span></div><svg className="hero-doodle" viewBox="0 0 100 100" fill="none"><path d="M49 8v16M79 21 68 32M91 50H75M78 79 67 68M49 91V75M20 78l12-11M8 49h16M20 20l12 12" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /><circle cx="49" cy="49" r="16" stroke="currentColor" strokeWidth="5" /></svg></div>
        </section>

        <div className="neighborhood-strip"><div className="neighborhood-intro"><span className="neighborhood-icon"><MapPin size={21} /></span><div><p className="neighborhood-title">Rooted in Maplewood</p><p className="neighborhood-subtitle">Our fictional neighborhood. Real possibilities.</p></div></div><span className="neighborhood-change"><Leaf size={16} />Fresh food belongs close to everyone.</span></div>

        <section ref={harvestRef} className="harvest-section" aria-labelledby="harvest-heading"><div className="section-heading"><div><p className="section-kicker">THE NEIGHBORHOOD HARVEST</p><h2 id="harvest-heading">Fresh from around you<span>.</span></h2></div><p>Good things don't need to travel far.</p></div>
          <div className="filter-toolbar"><label className="search-field"><Search size={19} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find tomatoes, herbs, a neighbor…" aria-label="Search produce or growers" /></label><div className="category-filters">{[{ value: 'all', label: 'All produce' }, { value: 'vegetables', label: 'Vegetables' }, { value: 'leafy', label: 'Herbs & greens' }].map(item => <button key={item.value} className={`filter-chip${category === item.value ? ' selected' : ''}`} aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div><button className={`filter-chip today-filter${todayOnly ? ' selected' : ''}`} aria-pressed={todayOnly} onClick={() => setTodayOnly(!todayOnly)}><Sun size={16} />Pickup today</button><label className="select-filter"><MapPin size={15} /><select value={distance} onChange={event => setDistance(event.target.value)} aria-label="Maximum distance"><option value="1">Within 1 mile</option><option value="2">Within 2 miles</option><option value="5">Within 5 miles</option></select><ChevronDown size={13} /></label></div>
          <div className="result-meta" role="status"><span><strong>{filtered.length}</strong> little harvest{filtered.length === 1 ? '' : 's'} ready to share</span><span>Sample listings · Illustrative distances</span></div>
          {filtered.length > 0 ? <div className="listings-grid">{filtered.map(listing => <ProduceCard key={listing.id} listing={listing} now={now} onClick={() => setModal({ kind: 'listing', listingId: listing.id })} />)}</div> : <EmptyState title="Nothing growing in this search just yet." description="Try a different vegetable, a wider distance, or another pickup day." action="Clear filters" onAction={() => { setSearch(''); setCategory('all'); setTodayOnly(false); setDistance('5') }} />}
        </section>

        <section className="community-callout"><div className="community-copy"><p className="section-kicker">A LITTLE ABUNDANCE GOES A LONG WAY</p><h2>Too many tomatoes?<br />That's a good problem.</h2><p>Give your extra harvest a happy home. Share a little,<br className="desktop-break" /> waste a little less, and get to know who grows nearby.</p><button className="button primary" onClick={startPosting}>Share what you've grown<Plus size={18} /></button></div><div className="community-art" aria-hidden="true"><div className="community-sun"><Sun size={70} strokeWidth={1.5} /></div><Sprout size={142} strokeWidth={1.2} /><span>good food.<br />good company.</span></div></section>
      </div>}

      {page === 'pickups' && <section className="pickups-page"><div className="page-header"><div><p className="section-kicker">FROM THEIR GARDEN TO YOUR KITCHEN</p><h1 className="page-title">Your next little harvest<span>.</span></h1><p className="page-subtitle">Hello, Alex. Here's what's waiting for you around the corner.</p></div><button className="button secondary" onClick={() => navigate('explore')}>Find more produce<ArrowUpRight size={18} /></button></div><div className="section-tabs" role="tablist" aria-label="Pickup status">{[{ key: 'upcoming', title: `Upcoming (${upcomingCount})` }, { key: 'history', title: 'Past pickups' }].map(tab => <button role="tab" aria-selected={pickupTab === tab.key} className={`tab-button${pickupTab === tab.key ? ' active' : ''}`} key={tab.key} onClick={() => setPickupTab(tab.key)}>{tab.title}</button>)}</div>
        {shownPickups.length === 0 ? <EmptyState title={pickupTab === 'upcoming' ? 'Your basket is full of possibilities.' : 'Good things start with one pickup.'} description={pickupTab === 'upcoming' ? 'Reserve something fresh from a neighbor, then find all the pickup details here.' : 'Collected and cancelled pickups will appear here.'} action="Explore the harvest" onAction={() => navigate('explore')} /> : <div className="pickups-list">{shownPickups.map(reservation => {
          const listing = state.listings.find(item => item.id === reservation.listingId)!
          const window = listing.pickupWindows.find(item => item.id === reservation.pickupWindowId)!
          return <article className="pickup-card" key={reservation.id}><img className="pickup-thumb" src={`/images/${listing.crop}.jpg`} alt={listing.title} /><div className="pickup-content"><div className="pickup-heading"><h2>{reservation.title}</h2><span className={`status-pill ${reservation.status}`}>{reservation.status === 'confirmed' ? 'Ready for pickup' : reservation.status === 'collected' ? 'Collected' : 'Cancelled'}</span></div><p className="pickup-meta">{reservation.quantity} portion{reservation.quantity !== 1 ? 's' : ''} · {listing.portionLabel} · From {listing.growerName}</p><div className="pickup-details"><span><Clock3 size={16} />{pickupLabel(window)}</span>{reservation.status !== 'cancelled' && <><span><MapPin size={16} />{listing.privatePickupAddress}</span><p>{listing.pickupInstructions}</p></>}</div><div className="tip-label"><Heart size={15} />{reservation.tipCents ? `${formatMoney(reservation.tipCents)} thank-you tip · simulated` : 'Shared for free. No tip added.'}</div>{reservation.status === 'confirmed' && new Date(window.endAt) < now && <p className="notice warning">This pickup window has ended. You can still record a completed collection or cancel your reservation.</p>}</div>{reservation.status === 'confirmed' && <div className="pickup-actions"><button className="button primary small" onClick={() => collect(reservation.id)}><Check size={16} />Mark collected</button><button className="button secondary small" onClick={() => cancel(reservation.id)}>Cancel pickup</button></div>}</article>
        })}</div>}
      </section>}

      {page === 'garden' && <section className="garden-page"><div className="page-header"><div><p className="section-kicker">YOUR EXTRA CAN MAKE SOMEONE'S DAY</p><h1 className="page-title">A little garden. A lot of good<span>.</span></h1><p className="page-subtitle">Welcome, Maya. Here's what your garden is sharing with the neighborhood.</p></div><button className="button primary" onClick={startPosting}><Plus size={19} />Share a harvest</button></div><div className="garden-summary"><div className="stat-card"><span><Sprout size={20} />Ready to share</span><strong>{gardenListings.filter(listing => isListingAvailable(listing, now)).reduce((sum, listing) => sum + listing.inventory.available, 0)}<small> portions</small></strong></div><div className="stat-card"><span><ShoppingBag size={20} />Neighbors coming by</span><strong>{gardenReservations.filter(item => item.status === 'confirmed').length}<small> pickups</small></strong></div><div className="stat-card"><span><Heart size={20} />Shared with a smile</span><strong>{gardenListings.reduce((sum, listing) => sum + listing.inventory.collected, 0)}<small> portions</small></strong></div></div><div className="section-heading garden-section-heading"><h2>Your harvests</h2><span>Free produce. Optional gratitude.</span></div><div className="garden-grid">{gardenListings.map(listing => <article className="garden-card" key={listing.id}><img className="garden-thumb" src={`/images/${listing.crop}.jpg`} alt={listing.title} /><div className="garden-content"><div className="pickup-heading"><h3>{listing.title}</h3><span className={`status-pill ${isListingAvailable(listing, now) ? 'confirmed' : 'cancelled'}`}>{listing.status === 'closed' ? 'Closed' : isListingAvailable(listing, now) ? 'Sharing now' : 'Unavailable'}</span></div><p>{listing.portionLabel}</p><div className="inventory-row"><span><strong>{listing.inventory.available}</strong> available</span><span><strong>{listing.inventory.reserved}</strong> reserved</span><span><strong>{listing.inventory.collected}</strong> collected</span></div><p className="tip-label"><Heart size={14} />{listing.acceptsTips ? 'Optional tips welcome' : 'No tips, just sharing'}</p><div className="garden-actions"><button className="button secondary small" onClick={() => { navigate('explore'); setModal({ kind: 'listing', listingId: listing.id }) }}>View as neighbor<ArrowUpRight size={15} /></button>{listing.status === 'open' && <button className="button small close-listing-button" onClick={() => { update(current => closeListing(current, listing.id), 'Listing closed. Existing pickups are still confirmed.') }}>Close listing</button>}</div></div></article>)}</div><div className="section-heading garden-section-heading"><h2>Who's picking up</h2><span>Shared reservations, kept in sync.</span></div>{gardenReservations.filter(item => item.status === 'confirmed').length === 0 ? <div className="grower-reservations empty-reservations"><Users size={28} /><p>No upcoming pickups yet. Switch to the Neighbor role and reserve one of Maya's harvests to try both sides.</p></div> : <div className="grower-reservations">{gardenReservations.filter(item => item.status === 'confirmed').map(reservation => {
          const listing = gardenListings.find(item => item.id === reservation.listingId)!
          const window = listing.pickupWindows.find(item => item.id === reservation.pickupWindowId)!
          return <article className="grower-reservation" key={reservation.id}><span className="avatar">AM</span><div><strong>{reservation.residentName}</strong><p>{reservation.quantity} portion{reservation.quantity !== 1 ? 's' : ''} of {reservation.title}</p><span><Clock3 size={14} />{pickupLabel(window)}</span></div><span className="tip-label">{reservation.tipCents ? `${formatMoney(reservation.tipCents)} simulated tip` : 'No tip added'}</span><button className="button primary small" onClick={() => collect(reservation.id)}><Check size={16} />Mark collected</button></article>
        })}</div>}
      </section>}

      <footer className="footer"><Logo onClick={() => navigate('explore')} /><p>More sharing. Less waste. A little closer to home.</p><span>{allAvailable.length} sample harvests · No real payments</span><button className="reset-footer" aria-label="Reset demo data" onClick={() => setModal({ kind: 'reset' })}><RotateCcw size={13} />Reset demo</button></footer>
    </main>

    <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map(item => <button key={item.page} className={`nav-button${page === item.page ? ' active' : ''}`} onClick={() => navigate(item.page)} aria-current={page === item.page ? 'page' : undefined}><item.icon size={21} /><span>{item.label}{item.page === 'pickups' && upcomingCount > 0 && ` (${upcomingCount})`}</span></button>)}</nav>
    {toast && <div className="toast" role="status"><CheckCircle2 size={20} /><span>{toast}</span><button className="toast-action" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={17} /></button></div>}

    {modal?.kind === 'listing' && activeListing && <Modal title={activeListing.title} wide onClose={() => setModal(null)}><ListingDetail key={activeListing.id} listing={activeListing} now={now} initialQuantity={modal.quantity} initialWindowId={modal.windowId} onReserve={confirmReservation} onTipCheckout={(quantity, windowId, tipCents) => setModal({ kind: 'checkout', listingId: activeListing.id, quantity, windowId, tipCents })} /></Modal>}
    {modal?.kind === 'checkout' && activeListing && <Modal title="A little thank-you" onClose={() => setModal(null)}><TipCheckout listing={activeListing} quantity={modal.quantity} windowId={modal.windowId} tipCents={modal.tipCents} onBack={() => setModal({ kind: 'listing', listingId: activeListing.id, quantity: modal.quantity, windowId: modal.windowId })} onConfirm={() => confirmReservation(activeListing.id, modal.quantity, modal.windowId, modal.tipCents, true)} onNoTip={() => confirmReservation(activeListing.id, modal.quantity, modal.windowId, 0)} /></Modal>}
    {modal?.kind === 'confirmation' && confirmedReservation && <Modal title="Your harvest is reserved" onClose={() => setModal(null)}><Confirmation reservation={confirmedReservation} listing={state.listings.find(item => item.id === confirmedReservation.listingId)!} onPickups={() => { setPickupTab('upcoming'); navigate('pickups') }} onExplore={() => setModal(null)} /></Modal>}
    {modal?.kind === 'new-listing' && <Modal title="Share your harvest" onClose={() => setModal(null)}><NewListing onSave={input => { update(current => addListing(current, input), 'Your harvest is ready for the neighborhood.'); navigate('garden') }} /></Modal>}
    {modal?.kind === 'reset' && <Modal title="Start a fresh demo" onClose={() => setModal(null)}><div className="modal-content"><span className="success-icon"><RotateCcw size={30} /></span><h2 className="modal-title">A fresh start?</h2><p className="modal-description">This resets your sample listings, pickups, and tips on this browser. You'll be back to a neighborhood full of fresh possibilities.</p><div className="reset-actions"><button className="button primary full" onClick={() => { const fresh = seedDemo(); stateRef.current = fresh; setState(fresh); setSearch(''); setCategory('all'); setTodayOnly(false); setDistance('5'); setPersona('neighbor'); setPickupTab('upcoming'); navigate('explore'); setToast('A fresh harvest, just for this demo.') }}>Reset demo</button><button className="button secondary full" onClick={() => setModal(null)}>Keep exploring</button></div></div></Modal>}
  </>
}

function ListingDetail({ listing, now, initialQuantity, initialWindowId, onReserve, onTipCheckout }: { listing: Listing; now: Date; initialQuantity?: number; initialWindowId?: string; onReserve: (id: string, quantity: number, windowId: string, tipCents: number) => void; onTipCheckout: (quantity: number, windowId: string, tipCents: number) => void }) {
  const windows = availableWindows(listing, now)
  const [quantity, setQuantity] = useState(initialQuantity ?? 1)
  const [windowId, setWindowId] = useState(initialWindowId ?? windows[0]?.id ?? '')
  const [tipOption, setTipOption] = useState('0')
  const [customTip, setCustomTip] = useState('')
  const [error, setError] = useState('')
  const submittingRef = useRef(false)
  const available = isListingAvailable(listing, now)
  const tipCents = tipOption === 'custom' ? Math.round(Number(customTip) * 100) : Number(tipOption)
  function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (submittingRef.current) return
    if (tipOption === 'custom' && (!/^\d+(\.\d{1,2})?$/.test(customTip) || tipCents > 10000)) { setError('Enter an optional tip between $0 and $100, with up to two decimal places.'); return }
    try {
      submittingRef.current = true
      if (tipCents > 0) onTipCheckout(quantity, windowId, tipCents)
      else onReserve(listing.id, quantity, windowId, 0)
    } catch (error) { submittingRef.current = false; setError(errorMessage(error)) }
  }
  return <div className="modal-layout"><div className="modal-image"><img src={`/images/${listing.crop}.jpg`} alt={listing.title} /><span className="badge free">Fresh. Neighbor-grown. Free.</span></div><div className="modal-content"><div className="modal-eyebrow"><MapPin size={15} />{listing.neighborhood} · {listing.distanceMiles.toFixed(1)} miles away</div><h2 className="modal-title">{listing.title}</h2><p className="modal-description">{listing.description}</p><div className="detail-grid"><div className="detail-item"><span className="detail-label">One portion</span><strong className="detail-value">{listing.portionLabel}</strong></div><div className="detail-item"><span className="detail-label">Ready to share</span><strong className="detail-value">{listing.inventory.available} portions</strong></div></div><div className="grower-note"><span className="grower-avatar">{listing.growerName.split(' ').map(part => part[0]).join('')}</span><div><strong>Grown by {listing.growerName}</strong><p>{listing.publicPickupArea}. Exact pickup details come with your reservation.</p></div></div>
    {available ? <form className="booking-panel" onSubmit={submit}><label className="field-label" htmlFor="quantity">A little, or a little more?</label><div className="quantity-row"><div className="quantity-control"><button type="button" aria-label="Decrease portions" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}><Minus size={17} /></button><input className="quantity-value" id="quantity" aria-label="Number of portions" type="number" min={1} max={listing.inventory.available} value={quantity} onChange={event => setQuantity(Number(event.target.value))} required /><button type="button" aria-label="Increase portions" disabled={quantity >= listing.inventory.available} onClick={() => setQuantity(quantity + 1)}><Plus size={17} /></button></div><span>portion{quantity !== 1 ? 's' : ''} · always free</span></div><fieldset className="pickup-fieldset"><legend className="field-label">When can you come by?</legend><div className="pickup-options">{windows.map(window => <label className={`pickup-option${windowId === window.id ? ' selected' : ''}`} key={window.id}><input type="radio" name="pickup-window" checked={windowId === window.id} onChange={() => setWindowId(window.id)} value={window.id} /><Clock3 size={16} /><span>{pickupLabel(window)}</span></label>)}</div></fieldset>
      {listing.acceptsTips && <fieldset className="tip-fieldset"><legend className="field-label">Leave a little thank-you?<span>Completely optional.</span></legend><div className="tip-options">{[{ value: '0', label: 'No tip' }, { value: '200', label: '$2' }, { value: '500', label: '$5' }, { value: 'custom', label: 'Other' }].map(option => <button type="button" key={option.value} className={`tip-option${tipOption === option.value ? ' selected' : ''}`} aria-pressed={tipOption === option.value} onClick={() => setTipOption(option.value)}>{option.label}</button>)}</div>{tipOption === 'custom' && <label className="custom-tip-label">Optional tip amount ($)<input className="input" type="number" value={customTip} onChange={event => setCustomTip(event.target.value)} min="0" max="100" step="0.01" placeholder="0.00" aria-label="Optional custom tip amount" /></label>}</fieldset>}
      {error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit">{tipCents > 0 ? `Continue with ${formatMoney(tipCents)} tip` : 'Reserve for free'}<ArrowRight size={18} /></button><p className="booking-footnote"><Heart size={13} />No tip needed. Every neighbor is welcome.</p>
    </form> : <div className="notice warning">{listing.status === 'closed' ? 'This harvest is closed for new reservations.' : 'This harvest is no longer available. Explore another neighbor’s garden.'} Existing confirmed pickups remain valid.</div>}
  </div></div>
}

function TipCheckout({ listing, quantity, windowId, tipCents, onConfirm, onBack, onNoTip }: { listing: Listing; quantity: number; windowId: string; tipCents: number; onConfirm: () => void; onBack: () => void; onNoTip: () => void }) {
  const [error, setError] = useState('')
  const submittingRef = useRef(false)
  function confirm(action: () => void) {
    if (submittingRef.current) return
    setError(''); submittingRef.current = true
    try { action() } catch (error) { submittingRef.current = false; setError(errorMessage(error)) }
  }
  const window = listing.pickupWindows.find(item => item.id === windowId)!
  return <div className="modal-content checkout-content"><button className="back-button" onClick={onBack}><ChevronLeft size={17} />Back to your harvest</button><span className="success-icon tip-success-icon"><Heart size={31} /></span><p className="section-kicker">A LITTLE GRATITUDE</p><h2 className="modal-title">A thank-you for {listing.growerName.split(' ')[0]}.</h2><p className="modal-description">The harvest is free. Your optional tip is a little appreciation for the hands that grew it.</p><div className="checkout-summary"><div className="checkout-produce"><img src={`/images/${listing.crop}.jpg`} alt={listing.title} /><div><strong>{listing.title}</strong><p>{quantity} portion{quantity !== 1 ? 's' : ''} · {listing.portionLabel}</p><span><Clock3 size={14} />{pickupLabel(window)}</span></div></div><div className="checkout-line"><span>Neighbor-grown produce</span><strong>Free</strong></div><div className="checkout-line"><span>Optional grower tip</span><strong>{formatMoney(tipCents)}</strong></div><div className="checkout-total"><span>Demo total</span><strong>{formatMoney(tipCents)}</strong></div></div><div className="demo-payment"><span className="payment-icon"><CreditCard size={24} /></span><div><strong>Demo payment only</strong><p>No card details needed. No money will be charged.</p></div></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" onClick={() => confirm(onConfirm)}>Simulate tip & reserve<ArrowRight size={18} /></button><button className="button secondary full no-tip-button" onClick={() => confirm(onNoTip)}>Reserve without a tip</button></div>
}

function Confirmation({ reservation, listing, onPickups, onExplore }: { reservation: Reservation; listing: Listing; onPickups: () => void; onExplore: () => void }) {
  const window = listing.pickupWindows.find(item => item.id === reservation.pickupWindowId)!
  return <div className="modal-content confirmation-content"><span className="success-icon"><CheckCircle2 size={38} /></span><p className="section-kicker">GOOD FOOD IS COMING YOUR WAY</p><h2 className="modal-title">Your harvest is reserved!</h2><p className="modal-description">{listing.growerName.split(' ')[0]}'s extra has a happy new home. Here's everything you need for pickup.</p><div className="confirmation-details"><h3>{reservation.quantity} portion{reservation.quantity !== 1 ? 's' : ''} of {reservation.title}</h3><p>{listing.portionLabel}</p><div><Clock3 size={19} /><span><strong>Your pickup window</strong>{pickupLabel(window)}</span></div><div><MapPin size={19} /><span><strong>Demo pickup address</strong>{listing.privatePickupAddress}</span></div><p className="pickup-instructions">{listing.pickupInstructions}</p><div className="tip-label"><Heart size={16} />{reservation.tipCents ? `${formatMoney(reservation.tipCents)} optional tip · simulated, not charged` : 'Shared for free. No tip needed.'}</div></div><button className="button primary full" onClick={onPickups}>View my pickups<ShoppingBag size={18} /></button><button className="button secondary full no-tip-button" onClick={onExplore}>Keep exploring</button></div>
}

type NewListingInput = Parameters<typeof addListing>[1]
function NewListing({ onSave }: { onSave: (input: NewListingInput) => void }) {
  const [crop, setCrop] = useState<Listing['crop']>('tomatoes')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [portionLabel, setPortionLabel] = useState('')
  const [portions, setPortions] = useState('4')
  const [day, setDay] = useState('tomorrow')
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('19:00')
  const [acceptsTips, setAcceptsTips] = useState(true)
  const [error, setError] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    const startDate = new Date()
    if (day === 'tomorrow') startDate.setDate(startDate.getDate() + 1)
    const [startHour, startMinute] = start.split(':').map(Number)
    startDate.setHours(startHour, startMinute, 0, 0)
    const endDate = new Date(startDate)
    const [endHour, endMinute] = end.split(':').map(Number)
    endDate.setHours(endHour, endMinute, 0, 0)
    if (endDate <= startDate) { setError('Choose an end time after the start time.'); return }
    if (endDate <= new Date()) { setError('That pickup window has already ended. Choose a later time or tomorrow.'); return }
    try {
      onSave({ crop, title: title.trim(), description: description.trim(), portionLabel: portionLabel.trim(), totalPortions: Number(portions), acceptsTips,
        pickupWindows: [{ id: `window-${crypto.randomUUID()}`, label: day === 'today' ? 'Today' : 'Tomorrow', startAt: startDate.toISOString(), endAt: endDate.toISOString() }],
      })
    } catch (error) { setError(errorMessage(error)) }
  }
  return <div className="modal-content new-listing-content"><p className="section-kicker">MAKE ROOM FOR A LITTLE GENEROSITY</p><h2 className="modal-title">Share your harvest<span>.</span></h2><p className="modal-description">What has your garden been busy growing? A few simple details help a neighbor find their next meal.</p><form onSubmit={submit}><fieldset className="crop-fieldset"><legend className="field-label">Pick your produce photo</legend><div className="crop-picker">{CROPS.map(item => <button className={`crop-option${crop === item.key ? ' selected' : ''}`} key={item.key} type="button" aria-pressed={crop === item.key} onClick={() => setCrop(item.key)}><img src={`/images/${item.key}.jpg`} alt="" /><span>{item.label}</span>{crop === item.key && <Check size={14} />}</button>)}</div></fieldset><div className="form-grid"><label className="form-field form-span">Harvest name<input className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Sweet backyard cherry tomatoes" maxLength={80} required /></label><label className="form-field form-span">A little about your harvest<textarea className="textarea" value={description} onChange={event => setDescription(event.target.value)} placeholder="What's growing? Any good-to-know details or favorite ways to enjoy it?" maxLength={500} rows={3} required /></label><label className="form-field">What's in one portion?<input className="input" value={portionLabel} onChange={event => setPortionLabel(event.target.value)} placeholder="e.g. One bag, about 12 tomatoes" maxLength={100} required /></label><label className="form-field">Portions to share<input className="input" type="number" min={1} max={100} step={1} value={portions} onChange={event => setPortions(event.target.value)} required /></label><label className="form-field form-span">Pickup day<select className="input" value={day} onChange={event => setDay(event.target.value)}><option value="today">Today</option><option value="tomorrow">Tomorrow</option></select></label><label className="form-field">From<input className="input" type="time" value={start} onChange={event => setStart(event.target.value)} required /></label><label className="form-field">Until<input className="input" type="time" value={end} onChange={event => setEnd(event.target.value)} required /></label></div><div className="notice"><MapPin size={18} /><span>Pickup at Maya's demo garden in Maplewood. The fictional home address appears only after reservation.</span></div><label className="tips-toggle"><input type="checkbox" checked={acceptsTips} onChange={event => setAcceptsTips(event.target.checked)} /><span><strong>Welcome optional thank-you tips</strong><small>Your produce is always free. Neighbors can choose $0.</small></span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit">Share with the neighborhood<Sprout size={18} /></button><p className="booking-footnote">Sample listing · Saved only in this browser</p></form></div>
}
