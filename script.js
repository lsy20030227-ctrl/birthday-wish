// Small helpers keep the sequence readable. No libraries or build tools needed.
const get = (id) => document.getElementById(id);
const pause = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionTime = (milliseconds) => motionPreference.matches ? 0 : milliseconds;
const opening = get('opening');
const voucherScreen = get('voucher-screen');
const reservation = get('reservation');
const finalScreen = get('final-screen');
const secretModal = get('secret-modal');
let currentScreen = opening;

// One visible screen at a time. Focus follows the new heading for keyboard users.
async function showScreen(nextScreen, headingId) {
  const previousScreen = currentScreen;
  if (previousScreen === voucherScreen) dismissHeartHint();
  previousScreen.inert = true;
  previousScreen.classList.add('leaving');
  await pause(motionTime(500));
  previousScreen.hidden = true;
  previousScreen.classList.remove('leaving');
  nextScreen.hidden = false;
  nextScreen.inert = false;
  nextScreen.classList.add('entering');
  currentScreen = nextScreen;
  window.scrollTo({ top: 0, behavior: 'instant' });
  get(headingId).focus({ preventScroll: true });
}

// Open flap, lift paper, then cross into the voucher at about 1.4 seconds.
get('open-button').addEventListener('click', async () => {
  get('open-button').disabled = true;
  get('envelope').classList.add('is-open');
  await pause(motionTime(900));
  await showScreen(voucherScreen, 'voucher-title');
  requestVisitorLocation();
  scheduleHeartHint();
});

// Jinan is fixed. The visitor's coordinates require browser permission.
const createClock = (timeZone) => new Intl.DateTimeFormat('en-US', {
  timeZone, hour: '2-digit', minute: '2-digit', hour12: true
});
const chinaClock = createClock('Asia/Shanghai');
let visitorClock = createClock('America/New_York');
let locationRequested = false;

function updateClocks() {
  const now = new Date();
  get('china-time').textContent = chinaClock.format(now);
  get('your-time').textContent = visitorClock.format(now);
  get('china-time').dateTime = now.toISOString();
  get('your-time').dateTime = now.toISOString();
}

function useNewYorkFallback() {
  visitorClock = createClock('America/New_York');
  get('your-city').hidden = false;
  get('your-coordinates').textContent = '40.71° N · 74.01° W';
  updateClocks();
}

function formatCoordinates(latitude, longitude) {
  return `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'} · ` +
    `${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
}

async function showVisitorLocation(position) {
  const { latitude, longitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    useNewYorkFallback();
    return;
  }
  // Geolocation supplies coordinates, not a time zone. Open-Meteo resolves
  // those coordinates to an IANA zone; no address lookup or location storage.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Time zone lookup unavailable');
    const data = await response.json();
    if (typeof data.timezone !== 'string' || !data.timezone) throw new Error('Missing time zone');
    // Validate the returned zone before changing any visible location details.
    const clock = createClock(data.timezone);
    visitorClock = clock;
    get('your-city').hidden = true;
    get('your-coordinates').textContent = formatCoordinates(latitude, longitude);
    updateClocks();
  } catch (error) {
    useNewYorkFallback();
  } finally {
    window.clearTimeout(timeout);
  }
}

function requestVisitorLocation() {
  if (locationRequested) return;
  locationRequested = true;
  if (!navigator.geolocation) {
    useNewYorkFallback();
    return;
  }
  try {
    navigator.geolocation.getCurrentPosition(showVisitorLocation, useNewYorkFallback, {
      enableHighAccuracy: false, timeout: 10000, maximumAge: 0
    });
  } catch (error) {
    useNewYorkFallback();
  }
}
updateClocks();
window.setInterval(updateClocks, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateClocks();
});

// The third heart click reveals the secret. Closing resets the count.
let heartClicks = 0;
const heart = get('secret-heart');
heart.addEventListener('click', (event) => {
  event.stopPropagation(); // The secret heart never triggers a tear.
  heartClicks += 1;
  heart.classList.remove('pulse-one', 'pulse-two');
  if (heartClicks < 3) {
    heart.classList.add(heartClicks === 1 ? 'pulse-one' : 'pulse-two');
  } else {
    heartClicks = 0;
    secretModal.showModal();
  }
});
get('close-secret').addEventListener('click', () => secretModal.close());
secretModal.addEventListener('click', (event) => {
  // Only close when the click is outside the card, not on its padding.
  const bounds = secretModal.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) secretModal.close();
});
secretModal.addEventListener('close', () => {
  heartClicks = 0;
  heart.focus({ preventScroll: true });
});

// Reserve, pause for both messages, and finish quietly. Reloading replays the gift.
get('keep-button').addEventListener('click', async () => {
  get('keep-button').disabled = true;
  heart.disabled = true;
  get('voucher-group').classList.add('is-reserving');
  await showScreen(reservation, 'reservation-title');
  await pause(1400);
  // Insert text into an existing live region so the update is announced.
  get('redeem-message').textContent = "Come find me whenever you're ready to redeem it.";
  get('redeem-message').classList.add('visible');
  await pause(3600);
  await showScreen(finalScreen, 'final-title');
});

// Independent hint timing; the existing three-click secret is unchanged.
const heartHint = get('heart-hint');
let hintScheduled = false;
let hintCancelled = false;
let hintTimer;

function dismissHeartHint() {
  hintCancelled = true;
  window.clearTimeout(hintTimer);
  heartHint.classList.remove('is-visible');
  heartHint.setAttribute('aria-hidden', 'true');
}

async function scheduleHeartHint() {
  if (hintScheduled) return;
  hintScheduled = true;
  // Wait for the actual entrance animation; reduced motion has no animation.
  await Promise.all(voucherScreen.getAnimations().map((animation) =>
    animation.finished.catch(() => {})
  ));
  if (hintCancelled) return;
  hintTimer = window.setTimeout(() => {
    if (hintCancelled || currentScreen !== voucherScreen) return;
    heartHint.setAttribute('aria-hidden', 'false');
    heartHint.classList.add('is-visible');
    // Allow the fade-in, then keep the text visible for 4.5 seconds.
    hintTimer = window.setTimeout(dismissHeartHint, motionTime(600) + 4500);
  }, 4000);
}

// One tear per visit. Only the separate perforation button starts this sequence.
const tearLine = get('tear-line');
const ticketStub = get('ticket-stub');
const stubSlot = get('stub-slot');
const tearConfirmation = get('tear-confirmation');
let stubTorn = false;

tearLine.addEventListener('click', async () => {
  if (stubTorn) return;
  stubTorn = true;
  tearLine.disabled = true;
  heart.disabled = true;
  ticketStub.inert = true;
  dismissHeartHint(); // A hint about the removed heart would no longer be useful.
  stubSlot.style.height = `${stubSlot.getBoundingClientRect().height}px`;
  ticketStub.classList.add('is-tearing');
  await pause(motionTime(800));
  ticketStub.hidden = true;
  tearLine.hidden = true;
  stubSlot.style.height = '0px';
  // Move focus off the disappearing control, without interrupting another action.
  if (currentScreen === voucherScreen && !voucherScreen.inert &&
      (document.activeElement === tearLine || document.activeElement === document.body)) {
    get('keep-button').focus({ preventScroll: true });
  }
  await pause(motionTime(400));
  if (currentScreen !== voucherScreen || voucherScreen.inert) return;
  tearConfirmation.textContent = 'Got it. ♡';
  tearConfirmation.classList.add('is-visible');
  await pause(1800);
  tearConfirmation.classList.remove('is-visible');
  await pause(motionTime(350));
  tearConfirmation.textContent = '';
});
