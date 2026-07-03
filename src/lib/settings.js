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

export async function getSettings() {
  const raw = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULTS, ...(raw[SETTINGS_KEY] || {}) };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
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

// Match a URL against a single whitelist pattern.
// Supports bare hostnames/substrings and `*` globs.
export function matchesPattern(url, pattern) {
  if (!pattern) return false;
  const p = pattern.trim().toLowerCase();
  if (!p) return false;
  const target = url.toLowerCase();
  if (p.includes('*')) {
    const re = new RegExp(
      '^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
    );
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
