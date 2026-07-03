import { getSettings, isSafeNavUrl } from '../lib/settings.js';
import { applyTheme, fmtMB, sendBg } from '../lib/ui.js';

const params = new URLSearchParams(location.search);
const uri = params.get('uri') || '';
const title = params.get('title') || uri || 'Hibernated tab';
const favicon = params.get('favicon') || '';

// SECURITY: never navigate to (or trust) anything but a real http(s) page.
// The suspended page runs in the extension origin, so a javascript:/data:
// `uri` would otherwise execute with chrome.* privileges on wake.
const safeUri = isSafeNavUrl(uri) ? uri : '';
const safeFavicon = /^https?:\/\//i.test(favicon) || /^data:image\//i.test(favicon)
  ? favicon : '';

const $ = (id) => document.getElementById(id);
let waking = false;

function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }

async function init() {
  const settings = await getSettings();
  applyTheme(settings);

  // reflect the original tab so it's recognizable in the tab strip
  document.title = '❄ ' + title;
  $('title').textContent = title;          // textContent → no HTML injection
  $('url').textContent = uri;
  $('url').title = uri;

  if (safeFavicon) {
    $('fav').src = safeFavicon;
    $('favlink').href = safeFavicon;
    $('fav').onerror = () => { $('fav').src = '../../icons/icon32.png'; };
  }

  $('est').textContent = `~${fmtMB(settings.tabMemoryMB)} of RAM reclaimed while frozen`;

  if (!safeUri) {
    // unrecognized/unsafe address: disable waking and tell the user
    $('unsafe').hidden = false;
    $('restore').disabled = true;
    $('hint').hidden = true;
    return;
  }

  // "never freeze this site" shortcut
  const host = hostOf(safeUri);
  if (host) {
    const wl = $('wlSite');
    wl.hidden = false;
    wl.textContent = `⛔ never freeze ${host}`;
    wl.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendBg({ type: 'THP_whitelistUrl', url: safeUri });
      wl.textContent = `✓ ${host} protected — waking…`;
      setTimeout(wake, 500);
    });
  }

  // Auto-wake when the user actually switches to this tab.
  if (settings.autoRestoreOnFocus) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
    window.addEventListener('focus', wake);
  }
}

function wake() {
  if (waking || !safeUri) return;
  waking = true;
  document.body.classList.add('waking');
  // small delay lets the wake animation play
  setTimeout(() => { location.replace(safeUri); }, 160);
}

$('stage').addEventListener('click', wake);
$('restore').addEventListener('click', (e) => { e.stopPropagation(); wake(); });
$('openSettings').addEventListener('click', (e) => {
  e.stopPropagation();
  chrome.runtime.openOptionsPage();
});
document.addEventListener('keydown', (e) => {
  if (['Enter', ' ', 'Spacebar'].includes(e.key)) { e.preventDefault(); wake(); }
});

$('stage').focus();
init();
