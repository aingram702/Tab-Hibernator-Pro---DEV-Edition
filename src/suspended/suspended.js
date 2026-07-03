import { getSettings } from '../lib/settings.js';
import { applyTheme, fmtMB } from '../lib/ui.js';

const params = new URLSearchParams(location.search);
const uri = params.get('uri') || '';
const title = params.get('title') || uri || 'Hibernated tab';
const favicon = params.get('favicon') || '';

const $ = (id) => document.getElementById(id);
let waking = false;

function hostOf(u) { try { return new URL(u).hostname; } catch { return u; } }

async function init() {
  const settings = await getSettings();
  applyTheme(settings);

  // reflect the original tab so it's recognizable in the tab strip
  document.title = '❄ ' + title;
  $('title').textContent = title;
  $('url').textContent = uri;
  $('url').title = uri;

  if (favicon) {
    $('fav').src = favicon;
    $('favlink').href = favicon;
    $('fav').onerror = () => { $('fav').src = '../../icons/icon32.png'; };
  }

  $('est').textContent = `~${fmtMB(settings.tabMemoryMB)} of RAM reclaimed while frozen`;

  // Auto-wake when the user actually switches to this tab.
  if (settings.autoRestoreOnFocus) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
    window.addEventListener('focus', wake);
  }
}

function wake() {
  if (waking || !uri) return;
  waking = true;
  document.body.classList.add('waking');
  // small delay lets the wake animation play
  setTimeout(() => { location.replace(uri); }, 160);
}

$('stage').addEventListener('click', wake);
$('restore').addEventListener('click', (e) => { e.stopPropagation(); wake(); });
document.addEventListener('keydown', (e) => {
  if (['Enter', ' ', 'Spacebar'].includes(e.key)) { e.preventDefault(); wake(); }
});

$('stage').focus();
init();
