import {
  getSettings, saveSettings, resetSettings,
  DEFAULTS, DEV_DOMAIN_PRESETS, ACCENTS,
} from '../lib/settings.js';
import { applyTheme, sendBg } from '../lib/ui.js';

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

const IDLE_PRESETS = [
  { m: 5, label: '5m' }, { m: 15, label: '15m' }, { m: 30, label: '30m' },
  { m: 60, label: '1h' }, { m: 120, label: '2h' }, { m: 360, label: '6h' },
];

const PROTECTION_RULES = [
  { key: 'neverSuspendPinned', title: 'Never hibernate pinned tabs',
    desc: 'Your always-open pins stay live.' },
  { key: 'neverSuspendAudible', title: 'Never hibernate tabs playing audio',
    desc: 'Music, calls, and video keep running.' },
  { key: 'neverSuspendUnsavedForms', title: 'Never hibernate tabs with unsaved input',
    desc: 'Protects text you have typed into forms and editors.' },
  { key: 'neverSuspendOffline', title: 'Pause hibernation while offline',
    desc: 'Avoids freezing tabs you can’t reload without a connection.' },
  { key: 'neverSuspendActiveInWindow', title: 'Never hibernate the active tab of any window',
    desc: 'Protects the visible tab in every window, not just the focused one.' },
];

// ---- render -----------------------------------------------------------------
function renderPresets() {
  const wrap = $('presets');
  wrap.innerHTML = '';
  for (const p of IDLE_PRESETS) {
    const b = document.createElement('button');
    b.className = 'btn preset' + (settings.idleMinutes === p.m ? ' active' : '');
    b.textContent = p.label;
    b.addEventListener('click', () => { update({ idleMinutes: p.m }); });
    wrap.appendChild(b);
  }
  $('idleMinutes').value = settings.idleMinutes;
}

function renderRules() {
  const wrap = $('rules');
  wrap.innerHTML = '';
  for (const r of PROTECTION_RULES) {
    const label = document.createElement('label');
    label.className = 'rule';
    label.innerHTML = `
      <span class="switch"><input type="checkbox"><span class="track"></span></span>
      <span class="rule-txt"><b>${r.title}</b><span class="faint">${r.desc}</span></span>`;
    const input = label.querySelector('input');
    input.checked = !!settings[r.key];
    input.addEventListener('change', () => update({ [r.key]: input.checked }));
    wrap.appendChild(label);
  }
}

function renderDevDomains() {
  const wrap = $('devDomains');
  wrap.innerHTML = '';
  wrap.classList.toggle('disabled', !settings.devDomainsEnabled);
  const set = new Set(settings.devDomains || []);
  for (const d of DEV_DOMAIN_PRESETS) {
    const el = document.createElement('label');
    el.className = 'domain' + (set.has(d.pattern) ? ' checked' : '');
    el.innerHTML = `
      <input type="checkbox" ${set.has(d.pattern) ? 'checked' : ''}>
      <span>${d.label}</span><span class="pat">${d.pattern}</span>`;
    const input = el.querySelector('input');
    input.addEventListener('change', () => {
      const next = new Set(settings.devDomains || []);
      if (input.checked) next.add(d.pattern); else next.delete(d.pattern);
      update({ devDomains: [...next] });
    });
    wrap.appendChild(el);
  }
}

function renderAccents() {
  const wrap = $('accents');
  wrap.innerHTML = '';
  for (const [key, a] of Object.entries(ACCENTS)) {
    const el = document.createElement('button');
    el.className = 'swatch' + (settings.accent === key ? ' active' : '');
    el.style.color = a.hex;
    el.innerHTML = `<span class="dot" style="background:${a.hex}"></span>
      <span style="color:var(--txt)">${a.name}</span>`;
    el.addEventListener('click', () => update({ accent: key }));
    wrap.appendChild(el);
  }
}

function renderShortcuts() {
  const wrap = $('shortcuts');
  wrap.innerHTML = '';
  const names = {
    'hibernate-current': 'Hibernate current tab',
    'hibernate-others': 'Hibernate other tabs',
    'restore-all': 'Wake all tabs',
    'toggle-whitelist': 'Toggle protect this site',
  };
  chrome.commands.getAll((cmds) => {
    for (const [name, label] of Object.entries(names)) {
      const c = (cmds || []).find(x => x.name === name);
      const row = document.createElement('div');
      row.className = 'sc';
      const keys = c && c.shortcut
        ? `<span class="keys">${c.shortcut.split('+').map(k => `<kbd>${k}</kbd>`).join('')}</span>`
        : `<span class="unset">unset</span>`;
      row.innerHTML = `<span>${label}</span>${keys}`;
      wrap.appendChild(row);
    }
  });
}

function renderToggles() {
  $('enabled').checked = settings.enabled;
  $('autoWhitelistLocalhost').checked = settings.autoWhitelistLocalhost;
  $('devDomainsEnabled').checked = settings.devDomainsEnabled;
  $('useNativeDiscard').checked = settings.useNativeDiscard;
  $('autoRestoreOnFocus').checked = settings.autoRestoreOnFocus;
  $('restoreScroll').checked = settings.restoreScroll;
  $('showBadge').checked = settings.showBadge;
  $('tabMemoryMB').value = settings.tabMemoryMB;
  $('whitelist').value = (settings.whitelist || []).join('\n');
  $('scanlines').checked = settings.scanlines;
}

function renderAll() {
  applyTheme(settings);
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  renderPresets();
  renderRules();
  renderDevDomains();
  renderAccents();
  renderToggles();
}

// ---- persistence ------------------------------------------------------------
let savedTimer = null;
function flashSaved() {
  const el = $('saved');
  el.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 1200);
}

async function update(partial) {
  settings = await saveSettings(partial);
  await sendBg({ type: 'THP_saveSettings', settings }); // nudge badge/theme
  flashSaved();
  renderAll();
}

// ---- static input bindings --------------------------------------------------
function bindToggle(id) {
  $(id).addEventListener('change', () => update({ [id]: $(id).checked }));
}
['enabled', 'autoWhitelistLocalhost', 'devDomainsEnabled', 'useNativeDiscard',
 'autoRestoreOnFocus', 'restoreScroll', 'showBadge', 'scanlines'].forEach(bindToggle);

$('idleMinutes').addEventListener('change', () => {
  const v = Math.max(1, Math.min(1440, parseInt($('idleMinutes').value, 10) || 30));
  update({ idleMinutes: v });
});
$('tabMemoryMB').addEventListener('change', () => {
  const v = Math.max(10, Math.min(2000, parseInt($('tabMemoryMB').value, 10) || 90));
  update({ tabMemoryMB: v });
});

let wlTimer = null;
$('whitelist').addEventListener('input', () => {
  clearTimeout(wlTimer);
  wlTimer = setTimeout(() => {
    const lines = $('whitelist').value.split('\n').map(s => s.trim()).filter(Boolean);
    update({ whitelist: lines });
  }, 500);
});

// ---- shortcuts + data -------------------------------------------------------
$('editShortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

$('exportBtn').addEventListener('click', async () => {
  const data = JSON.stringify({ app: 'tab-hibernator-pro', v: 1, settings }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tab-hibernator-pro-settings.json';
  a.click();
  URL.revokeObjectURL(url);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = parsed.settings || parsed;
    settings = await saveSettings({ ...DEFAULTS, ...incoming });
    await sendBg({ type: 'THP_saveSettings', settings });
    flashSaved();
    renderAll();
  } catch {
    alert('Could not read that settings file.');
  }
  e.target.value = '';
});

$('resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults?')) return;
  settings = await resetSettings();
  await sendBg({ type: 'THP_saveSettings', settings });
  flashSaved();
  renderAll();
});

// ---- boot -------------------------------------------------------------------
(async () => {
  settings = await getSettings();
  renderAll();
  renderShortcuts();
})();
