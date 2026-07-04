// Shared settings, defaults, and storage helpers.
// Imported as an ES module by the service worker and by extension pages.

export const SETTINGS_KEY = 'settings';
export const STATS_KEY = 'stats';

// Rough per-tab memory estimate (MB) used for the "RAM reclaimed" readout.
// Configurable in options so power users can tune it to their machine.
export const DEFAULT_TAB_MB = 90;

// Curated dev domains that are risky/annoying to hibernate. Each has an
// `on` default so first run behaves sensibly for most developers.
export const DEV_DOMAIN_PRESETS = [
  { pattern: 'localhost', label: 'localhost', on: true },
  { pattern: '127.0.0.1', label: '127.0.0.1 / loopback', on: true },
  { pattern: 'github.com', label: 'GitHub', on: true },
  { pattern: 'gitlab.com', label: 'GitLab', on: true },
  { pattern: 'bitbucket.org', label: 'Bitbucket', on: false },
  { pattern: 'stackoverflow.com', label: 'Stack Overflow', on: false },
  { pattern: 'developer.mozilla.org', label: 'MDN Web Docs', on: false },
  { pattern: 'console.aws.amazon.com', label: 'AWS Console', on: true },
  { pattern: 'console.cloud.google.com', label: 'Google Cloud Console', on: true },
  { pattern: 'portal.azure.com', label: 'Azure Portal', on: true },
  { pattern: 'vercel.com', label: 'Vercel', on: false },
  { pattern: 'app.netlify.com', label: 'Netlify', on: false },
  { pattern: 'jira.atlassian.net', label: 'Jira', on: false },
  { pattern: 'figma.com', label: 'Figma', on: true },
  { pattern: 'codesandbox.io', label: 'CodeSandbox', on: true },
  { pattern: 'stackblitz.com', label: 'StackBlitz', on: true },
  { pattern: 'colab.research.google.com', label: 'Google Colab', on: true },
  { pattern: 'notion.so', label: 'Notion', on: false },
];

export const ACCENTS = {
  green:   { name: 'Neon Green',  hex: '#0aff9c' },
  cyan:    { name: 'Cyber Cyan',  hex: '#22d3ee' },
  amber:   { name: 'Amber CRT',   hex: '#ffb000' },
  magenta: { name: 'Synth Magenta', hex: '#ff2bd6' },
  red:     { name: 'Alert Red',   hex: '#ff4d5e' },
};

export const DEFAULTS = {
  enabled: true,
  idleMinutes: 30,
  // protection rules
  neverSuspendPinned: true,
  neverSuspendAudible: true,
  neverSuspendUnsavedForms: true,
  neverSuspendOffline: true,
  neverSuspendActiveInWindow: false, // active tab of each window, not just focused
  // dev-focused rules
  autoWhitelistLocalhost: true,
  devDomainsEnabled: true,
  devDomains: DEV_DOMAIN_PRESETS.filter(d => d.on).map(d => d.pattern),
  // custom user whitelist (one pattern per line, substring/glob match on URL)
  whitelist: [],
  // behavior
  useNativeDiscard: false, // false = branded suspended page, true = chrome.tabs.discard
  autoRestoreOnFocus: true,
  restoreScroll: true,
  showBadge: true,
  tabMemoryMB: DEFAULT_TAB_MB,
  // theme
  accent: 'green',
  scanlines: true,
};

export const DEFAULT_STATS = {
  hibernatedTotal: 0, // lifetime count
  mbSavedTotal: 0,    // lifetime MB estimate
};

// Coerce any input (corrupted storage, hand-edited import, older schema) into a
// valid settings object: clamp numbers, force booleans, validate enums, and
// drop unknown keys. This is the single guard that keeps a bad value from
// wedging the extension.
export function normalizeSettings(input) {
  const s = { ...DEFAULTS, ...(input && typeof input === 'object' ? input : {}) };
  const clampNum = (v, min, max, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  s.idleMinutes = clampNum(s.idleMinutes, 1, 1440, DEFAULTS.idleMinutes);
  s.tabMemoryMB = clampNum(s.tabMemoryMB, 10, 4096, DEFAULTS.tabMemoryMB);

  const BOOLS = [
    'enabled', 'neverSuspendPinned', 'neverSuspendAudible', 'neverSuspendUnsavedForms',
    'neverSuspendOffline', 'neverSuspendActiveInWindow', 'autoWhitelistLocalhost',
    'devDomainsEnabled', 'useNativeDiscard', 'autoRestoreOnFocus', 'restoreScroll',
    'showBadge', 'scanlines',
  ];
  for (const k of BOOLS) s[k] = !!s[k];

  const strArr = (a) => Array.isArray(a)
    ? [...new Set(a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))]
    : [];
  s.devDomains = strArr(s.devDomains);
  s.whitelist = strArr(s.whitelist);

  if (!ACCENTS[s.accent]) s.accent = DEFAULTS.accent;

  // keep only known keys so stale/injected fields don't accumulate in storage
  const clean = {};
  for (const k of Object.keys(DEFAULTS)) clean[k] = s[k];
  return clean;
}

export async function getSettings() {
  const raw = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings(raw[SETTINGS_KEY]);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...partial });
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function resetSettings() {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...DEFAULTS } });
  return { ...DEFAULTS };
}

export async function getStats() {
  const raw = await chrome.storage.local.get(STATS_KEY);
  return { ...DEFAULT_STATS, ...(raw[STATS_KEY] || {}) };
}

export async function bumpStats({ count = 0, mb = 0 } = {}) {
  const s = await getStats();
  const next = {
    hibernatedTotal: s.hibernatedTotal + count,
    mbSavedTotal: s.mbSavedTotal + mb,
  };
  await chrome.storage.local.set({ [STATS_KEY]: next });
  return next;
}

// URL of our branded suspended page.
export function suspendedPageUrl() {
  return chrome.runtime.getURL('src/suspended/suspended.html');
}

export function isSuspendedUrl(url) {
  return typeof url === 'string' && url.startsWith(suspendedPageUrl());
}

// Pull the original target URL out of a suspended-page URL.
export function originalUrlFromSuspended(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('uri');
  } catch {
    return null;
  }
}

// Decide whether a URL is eligible to be hibernated at all (ignoring timing).
export function isHibernatableUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

// Only http(s) URLs may ever be used as a navigation target. This is the
// security gate that prevents javascript:/data:/blob:/etc. from being
// navigated to (which, in an extension-origin page, would run with chrome.*
// privileges). Kept intentionally strict.
export function isSafeNavUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Match a URL against a single whitelist pattern.
// Supports bare hostnames/substrings and `*` globs.
export function matchesPattern(url, pattern) {
  if (!pattern || typeof url !== 'string') return false;
  const p = pattern.trim().toLowerCase();
  // Bound pattern size to keep glob→regex translation cheap and non-pathological.
  if (!p || p.length > 200) return false;
  const target = url.toLowerCase();
  if (p.includes('*')) {
    // Cap wildcards so a hostile/typo'd pattern can't build a catastrophic regex.
    if ((p.match(/\*/g) || []).length > 20) return false;
    let re;
    try {
      re = new RegExp(
        '^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
      );
    } catch {
      return false;
    }
    // match against full url and hostname
    try {
      const host = new URL(url).hostname.toLowerCase();
      return re.test(target) || re.test(host);
    } catch {
      return re.test(target);
    }
  }
  return target.includes(p);
}

// ---------------------------------------------------------------------------
// tab-organizer helpers (pure) — grouping tabs by site
// ---------------------------------------------------------------------------
export const GROUP_COLORS = [
  'blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'grey',
];
// second-level labels that precede a country TLD (co.uk, com.au, …)
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'gob', 'go']);

// Collapse a hostname to its registrable-ish domain so api.stripe.com and
// dashboard.stripe.com land in the same "stripe.com" group. IP literals
// (IPv4/IPv6) are returned whole — they are the entire identity.
export function baseDomain(host) {
  host = String(host);
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const secondLast = parts[parts.length - 2];
  if (SECOND_LEVEL.has(secondLast)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

// Deterministic, stable color for a domain's tab group.
export function colorFor(domain) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

// Localhost / private-dev-server detection.
export function isLocalDevUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h.endsWith('.localhost') ||
      h.endsWith('.local') ||
      h.endsWith('.test') ||
      h === '127.0.0.1' ||
      h.startsWith('127.') ||
      h.startsWith('192.168.') ||
      h.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  } catch {
    return false;
  }
}

// Central "should this URL be protected from hibernation?" check.
export function isWhitelisted(url, settings) {
  if (!isHibernatableUrl(url)) return true;
  if (settings.autoWhitelistLocalhost && isLocalDevUrl(url)) return true;
  if (settings.devDomainsEnabled) {
    for (const d of settings.devDomains || []) {
      if (matchesPattern(url, d)) return true;
    }
  }
  for (const p of settings.whitelist || []) {
    if (matchesPattern(url, p)) return true;
  }
  return false;
}
