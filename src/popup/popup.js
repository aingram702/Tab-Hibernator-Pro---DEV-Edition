import { sendBg, applyTheme, fmtMB } from '../lib/ui.js';

const $ = (id) => document.getElementById(id);
let snap = null;

async function refresh() {
  snap = await sendBg({ type: 'THP_getSnapshot' });
  if (!snap) return;
  const { settings, stats, suspendedNow, active } = snap;

  applyTheme(settings);
  $('ver').textContent = 'v' + (chrome.runtime.getManifest().version || '1.0.0');

  // master toggle + status line
  $('enabled').checked = settings.enabled;
  const sl = $('statusline');
  const st = $('statustext');
  if (settings.enabled) {
    sl.classList.remove('paused');
    st.textContent = `monitoring — freeze after ${settings.idleMinutes}m idle`;
  } else {
    sl.classList.add('paused');
    st.textContent = 'paused — no tabs will be hibernated';
  }

  // stats
  $('frozenNow').textContent = suspendedNow;
  const ramNow = suspendedNow * settings.tabMemoryMB;
  $('ramNow').innerHTML = fmtMB(ramNow).replace(/ (\w+)$/, '<span class="unit">$1</span>');
  $('lifetime').textContent = stats.hibernatedTotal;

  renderCurrent(active, settings);
}

function renderCurrent(active, settings) {
  const chip = $('curChip');
  const wlBtn = $('wlBtn');
  const wlLabel = $('wlLabel');

  if (!active) {
    $('curTitle').textContent = 'No active tab';
    $('curHost').textContent = '—';
    chip.className = 'chip'; chip.textContent = '—';
    wlBtn.disabled = true;
    return;
  }

  $('curTitle').textContent = active.title || active.url || '—';
  $('curHost').textContent = active.host || active.url || '';
  $('curFav').src = active.favIconUrl || '../../icons/icon16.png';
  $('curFav').onerror = () => { $('curFav').src = '../../icons/icon16.png'; };

  let cls = 'chip', label = 'eligible';
  if (active.isSuspended) { cls += ' local'; label = 'hibernated'; }
  else if (active.isLocalDev) { cls += ' local'; label = 'local dev'; }
  else if (active.isWhitelisted) { cls += ' ok'; label = 'protected'; }
  else if (!/^https?:/i.test(active.url || '')) { cls += ''; label = 'system page'; }
  chip.className = cls;
  chip.textContent = label;

  // whitelist toggle reflects only the user's custom list membership by host
  const host = active.host || '';
  const inList = host && (settings.whitelist || [])
    .some(p => p.trim().toLowerCase() === host.toLowerCase());
  wlBtn.classList.toggle('active', inList);
  wlLabel.textContent = inList ? `✓ ${host} is protected` : 'Never hibernate this site';
  wlBtn.disabled = !host || !/^https?:/i.test(active.url || '');
}

function flash(el) {
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ---- events ----------------------------------------------------------------
$('enabled').addEventListener('change', async () => {
  await sendBg({ type: 'THP_toggleEnabled' });
  refresh();
});

$('btnHibernate').addEventListener('click', async () => {
  const r = await sendBg({ type: 'THP_hibernateCurrent' });
  flash($('btnHibernate'));
  if (r && r.ok) setTimeout(() => window.close(), 220);
  else refresh();
});

$('btnOthers').addEventListener('click', async () => {
  await sendBg({ type: 'THP_hibernateOthers' });
  flash($('btnOthers'));
  setTimeout(refresh, 300);
});

$('btnWake').addEventListener('click', async () => {
  await sendBg({ type: 'THP_restoreAll' });
  flash($('btnWake'));
  setTimeout(refresh, 300);
});

$('wlBtn').addEventListener('click', async () => {
  await sendBg({ type: 'THP_toggleWhitelistCurrent' });
  refresh();
});

$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// show the real bound shortcut if the user changed it
chrome.commands?.getAll?.((cmds) => {
  const c = (cmds || []).find(x => x.name === 'hibernate-current');
  if (c && c.shortcut) $('kbdHint').textContent = c.shortcut;
});

refresh();
