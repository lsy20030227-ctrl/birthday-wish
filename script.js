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
});

// Intl understands both time zones and New York's daylight-saving changes.
const chinaClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: true
});
const newYorkClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true
});
const offsetClock = (timeZone) => new Intl.DateTimeFormat('en-US', {
  timeZone, timeZoneName: 'shortOffset'
});
const chinaOffset = offsetClock('Asia/Shanghai');
const newYorkOffset = offsetClock('America/New_York');
function offsetHours(formatter, date) {
  const zone = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName').value;
  const match = zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  return (match[1] === '+' ? 1 : -1) * (Number(match[2]) + Number(match[3] || 0) / 60);
}
function updateClocks() {
  const now = new Date();
  get('china-time').textContent = chinaClock.format(now);
  get('new-york-time').textContent = newYorkClock.format(now);
  get('china-time').dateTime = now.toISOString();
  get('new-york-time').dateTime = now.toISOString();
  const hoursApart = Math.abs(offsetHours(chinaOffset, now) - offsetHours(newYorkOffset, now));
  get('time-apart').textContent = `${hoursApart} HOURS APART`;
}
updateClocks();
window.setInterval(updateClocks, 1000);
// Refresh immediately when returning to a tab that was asleep.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateClocks();
});

// The third heart click reveals the secret. Closing resets the count.
let heartClicks = 0;
const heart = get('secret-heart');
heart.addEventListener('click', () => {
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
