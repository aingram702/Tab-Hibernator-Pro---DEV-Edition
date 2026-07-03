// Tab Hibernator Pro — DEV Edition · background service worker (MV3, module)
import {
  getSettings, saveSettings, getStats, bumpStats,
  suspendedPageUrl, isSuspendedUrl, originalUrlFromSuspended,
  isHibernatableUrl, isSafeNavUrl, isWhitelisted, isLocalDevUrl,
} from '../lib/settings.js';

const ALARM_NAME = 'thp-scan';
const ACTIVITY_KEY = 'lastActive';   // { [tabId]: epochMs } in session storage
const SCROLL_KEY = 'pendingScroll';  // { [tabId]: scrollY } in session storage

async function stashScroll(tabId, y) {
  if (!y) return;
  const cur = (await chrome.storage.session.get(SCROLL_KEY))[SCROLL_KEY] || {};
  cur[tabId] = y;
  await chrome.storage.session.set({ [SCROLL_KEY]: cur });
}
async function popScroll(tabId) {
  const cur = (await chrome.storage.session.get(SCROLL_KEY))[SCROLL_KEY] || {};
  const y = cur[tabId];
  if (tabId in cur) {
    delete cur[tabId];
    await chrome.storage.session.set({ [SCROLL_KEY]: cur });
  }
  return y || 0;
}

// ---------------------------------------------------------------------------
// activity tracking (time since a tab was last the active tab)
// ---------------------------------------------------------------------------
async function stampActive(tabId) {
  if (typeof tabId !== 'number') return;
  const cur = (await chrome.storage.session.get(ACTIVITY_KEY))[ACTIVITY_KEY] || {};
  cur[tabId] = Date.now();
  await chrome.storage.session.set({ [ACTIVITY_KEY]: cur });
}
async function getActivityMap() {
  return (await chrome.storage.session.get(ACTIVITY_KEY))[ACTIVITY_KEY] || {};
}
async function forgetTab(tabId) {
  const cur = await getActivityMap();
  if (tabId in cur) {
    delete cur[tabId];
    await chrome.storage.session.set({ [ACTIVITY_KEY]: cur });
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => { stampActive(tabId); });
chrome.tabs.onCreated.addListener((tab) => { if (tab.id != null) stampActive(tab.id); });
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') stampActive(tabId);
  // keep the frozen-count badge fresh as tabs navigate / get discarded
  if (info.url || info.status === 'complete' || 'discarded' in info) refreshBadge();
});
chrome.tabs.onRemoved.addListener((tabId) => { forgetTab(tabId); refreshBadge(); });
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
    if (tab) stampActive(tab.id);
  } catch { /* window gone */ }
});

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async (details) => {
  await getSettings(); // materialize defaults
  await setupContextMenus();
  await ensureAlarm();
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) if (t.id != null) stampActive(t.id);
  await refreshBadge();
  // First-run onboarding: open settings so users can see what's protected.
  if (details.reason === 'install') {
    try { await chrome.runtime.openOptionsPage(); } catch { /* ignore */ }
  }
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await refreshBadge();
});

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) scanAndHibernate();
});

// ---------------------------------------------------------------------------
// context menus
// ---------------------------------------------------------------------------
async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  const items = [
    { id: 'thp-hibernate', title: 'Hibernate this tab' },
    { id: 'thp-hibernate-others', title: 'Hibernate all other tabs' },
    { id: 'thp-restore-all', title: 'Wake all hibernated tabs' },
    { id: 'thp-sep', type: 'separator' },
    { id: 'thp-organize', title: 'Organize tabs by site' },
    { id: 'thp-ungroup', title: 'Ungroup all tabs' },
    { id: 'thp-sep2', type: 'separator' },
    { id: 'thp-whitelist-site', title: 'Never hibernate this site' },
  ];
  for (const it of items) {
    chrome.contextMenus.create({ contexts: ['action', 'page'], ...it });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'thp-hibernate': if (tab) await hibernateTab(tab, { manual: true }); break;
    case 'thp-hibernate-others': await hibernateOthers(tab); break;
    case 'thp-restore-all': await restoreAll(); break;
    case 'thp-organize': await organizeBySite(tab?.windowId); break;
    case 'thp-ungroup': await ungroupAll(tab?.windowId); break;
    case 'thp-whitelist-site': if (tab?.url) await whitelistSite(tab.url); break;
  }
});

// ---------------------------------------------------------------------------
// keyboard commands
// ---------------------------------------------------------------------------
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  switch (command) {
    case 'hibernate-current': if (tab) await hibernateTab(tab, { manual: true }); break;
    case 'hibernate-others': await hibernateOthers(tab); break;
    case 'restore-all': await restoreAll(); break;
    case 'organize-site': await organizeBySite(tab?.windowId); break;
    case 'toggle-whitelist': if (tab?.url) await toggleWhitelistSite(tab.url); break;
  }
});

// ---------------------------------------------------------------------------
// core: eligibility + hibernation
// ---------------------------------------------------------------------------
async function isTabProtected(tab, settings) {
  if (!tab || tab.id == null) return true;
  if (isSuspendedUrl(tab.url)) return true;
  if (!isHibernatableUrl(tab.url)) return true;
  if (tab.active) return true;
  if (settings.neverSuspendActiveInWindow && tab.active) return true;
  if (settings.neverSuspendPinned && tab.pinned) return true;
  if (settings.neverSuspendAudible && tab.audible) return true;
  if (isWhitelisted(tab.url, settings)) return true;
  return false;
}

async function askContentState(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'THP_getState' });
  } catch {
    return null; // no content script (e.g., not injected yet)
  }
}

// Hibernate a single tab. Returns true if it was hibernated.
async function hibernateTab(tab, { manual = false } = {}) {
  const settings = await getSettings();
  if (!manual) {
    if (await isTabProtected(tab, settings)) return false;
  } else {
    // manual still respects "can't suspend non-web pages / already suspended"
    if (isSuspendedUrl(tab.url) || !isHibernatableUrl(tab.url)) return false;
  }

  let scrollY = 0;
  if (settings.neverSuspendUnsavedForms || settings.restoreScroll) {
    const state = await askContentState(tab.id);
    if (state) {
      if (!manual && settings.neverSuspendUnsavedForms && state.dirty) return false;
      scrollY = state.scrollY || 0;
    }
  }

  if (settings.restoreScroll && scrollY) await stashScroll(tab.id, scrollY);

  if (settings.useNativeDiscard) {
    try {
      await chrome.tabs.discard(tab.id);
      await afterHibernate(settings);
      return true;
    } catch {
      return false; // fall through silently; tab may be active
    }
  }

  const url = buildSuspendedUrl(tab, scrollY);
  try {
    await chrome.tabs.update(tab.id, { url });
    await afterHibernate(settings);
    return true;
  } catch {
    return false;
  }
}

function buildSuspendedUrl(tab, scrollY) {
  const u = new URL(suspendedPageUrl());
  u.searchParams.set('uri', tab.url);
  u.searchParams.set('title', tab.title || tab.url);
  if (tab.favIconUrl) u.searchParams.set('favicon', tab.favIconUrl);
  if (scrollY) u.searchParams.set('scroll', String(Math.round(scrollY)));
  return u.toString();
}

async function afterHibernate(settings) {
  await bumpStats({ count: 1, mb: settings.tabMemoryMB });
  await refreshBadge();
}

async function scanAndHibernate() {
  const settings = await getSettings();
  if (!settings.enabled) { await refreshBadge(); return; }
  if (settings.neverSuspendOffline && navigator.onLine === false) return;
  const threshold = settings.idleMinutes * 60 * 1000;
  const now = Date.now();
  const activity = await getActivityMap();
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (await isTabProtected(tab, settings)) continue;
    const last = activity[tab.id] ?? now; // unknown => treat as just-seen
    if (now - last < threshold) continue;
    await hibernateTab(tab, { manual: false });
  }
}

async function hibernateOthers(activeTab) {
  const win = activeTab?.windowId;
  const tabs = await chrome.tabs.query(win != null ? { windowId: win } : {});
  for (const t of tabs) {
    if (activeTab && t.id === activeTab.id) continue;
    await hibernateTab(t, { manual: true });
  }
}

async function restoreAll() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (isSuspendedUrl(t.url)) {
      const orig = originalUrlFromSuspended(t.url);
      // Only ever navigate back to a real http(s) page — never to a
      // javascript:/data: payload smuggled into the suspended URL.
      if (isSafeNavUrl(orig)) {
        try { await chrome.tabs.update(t.id, { url: orig }); } catch {}
      }
    }
  }
  await refreshBadge();
}

// ---------------------------------------------------------------------------
// whitelist helpers
// ---------------------------------------------------------------------------
function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

async function whitelistSite(url) {
  const host = hostnameOf(url);
  if (!host) return;
  const s = await getSettings();
  if (!s.whitelist.includes(host)) {
    await saveSettings({ whitelist: [...s.whitelist, host] });
  }
}

async function toggleWhitelistSite(url) {
  const host = hostnameOf(url);
  if (!host) return;
  const s = await getSettings();
  const has = s.whitelist.some(p => p.trim().toLowerCase() === host);
  const next = has
    ? s.whitelist.filter(p => p.trim().toLowerCase() !== host)
    : [...s.whitelist, host];
  await saveSettings({ whitelist: next });
}

// ---------------------------------------------------------------------------
// tab organizer — one-click "group by site" using native tab groups
// ---------------------------------------------------------------------------
const GROUP_COLORS = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'grey'];
// second-level labels that precede a country TLD (co.uk, com.au, …)
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'gob', 'go']);

// Collapse a hostname to its registrable-ish domain so api.stripe.com and
// dashboard.stripe.com land in the same "stripe.com" group.
function baseDomain(host) {
  host = String(host);
  // Never fold IP literals (IPv4/IPv6) — they are the whole identity.
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const secondLast = parts[parts.length - 2];
  if (SECOND_LEVEL.has(secondLast)) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

function colorFor(domain) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

// Group every (unpinned) tab in a window by its site. Suspended tabs are
// grouped by their original site so freezing doesn't scatter your groups.
async function organizeBySite(windowId) {
  if (windowId == null) {
    const w = await chrome.windows.getCurrent();
    windowId = w.id;
  }
  const tabs = await chrome.tabs.query({ windowId, pinned: false });
  const buckets = new Map();
  for (const t of tabs) {
    let url = t.url;
    if (isSuspendedUrl(url)) url = originalUrlFromSuspended(url) || url;
    if (!isHibernatableUrl(url)) continue; // skip chrome://, extension pages, etc.
    const host = hostnameOf(url);
    if (!host) continue;
    const dom = baseDomain(host);
    if (!buckets.has(dom)) buckets.set(dom, []);
    buckets.get(dom).push(t.id);
  }
  let groups = 0;
  for (const [dom, ids] of buckets) {
    if (ids.length < 2) continue; // don't box up lone tabs
    try {
      const groupId = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: dom, color: colorFor(dom) });
      groups++;
    } catch { /* a tab may have closed mid-operation */ }
  }
  return { groups };
}

async function ungroupAll(windowId) {
  if (windowId == null) {
    const w = await chrome.windows.getCurrent();
    windowId = w.id;
  }
  const tabs = await chrome.tabs.query({ windowId });
  const grouped = tabs
    .filter(t => t.groupId != null && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
    .map(t => t.id);
  if (grouped.length) { try { await chrome.tabs.ungroup(grouped); } catch {} }
  return { ungrouped: grouped.length };
}

// ---------------------------------------------------------------------------
// badge
// ---------------------------------------------------------------------------
async function countSuspended() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(t => isSuspendedUrl(t.url) || t.discarded).length;
}

async function refreshBadge() {
  const s = await getSettings();
  const n = await countSuspended();
  // toolbar tooltip always reflects live state, even when the badge is hidden
  const title = s.enabled
    ? `Tab Hibernator Pro — monitoring · ${n} frozen · freeze after ${s.idleMinutes}m idle`
    : 'Tab Hibernator Pro — paused';
  await chrome.action.setTitle({ title });

  if (!s.showBadge) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: '#0d1117' });
  await chrome.action.setBadgeTextColor?.({ color: s.enabled ? '#0aff9c' : '#7d8b9a' });
  await chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
}

// ---------------------------------------------------------------------------
// message API (popup / options / suspended page)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'THP_getSnapshot': {
        const settings = await getSettings();
        const stats = await getStats();
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        const suspendedNow = await countSuspended();
        const allTabs = await chrome.tabs.query({});
        sendResponse({
          settings, stats, suspendedNow,
          totalTabs: allTabs.length,
          active: active ? {
            id: active.id, url: active.url, title: active.title,
            favIconUrl: active.favIconUrl,
            host: hostnameOf(active.url),
            isSuspended: isSuspendedUrl(active.url),
            isLocalDev: isLocalDevUrl(active.url),
            isWhitelisted: isWhitelisted(active.url, settings),
          } : null,
        });
        break;
      }
      case 'THP_hibernateCurrent': {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        const ok = t ? await hibernateTab(t, { manual: true }) : false;
        sendResponse({ ok });
        break;
      }
      case 'THP_hibernateOthers': {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        await hibernateOthers(t);
        sendResponse({ ok: true });
        break;
      }
      case 'THP_restoreAll': { await restoreAll(); sendResponse({ ok: true }); break; }
      case 'THP_toggleEnabled': {
        const s = await getSettings();
        const next = await saveSettings({ enabled: !s.enabled });
        await refreshBadge();
        sendResponse({ enabled: next.enabled });
        break;
      }
      case 'THP_toggleWhitelistCurrent': {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (t?.url) await toggleWhitelistSite(t.url);
        sendResponse({ ok: true });
        break;
      }
      case 'THP_saveSettings': {
        const next = await saveSettings(msg.settings || {});
        await refreshBadge();
        sendResponse({ settings: next });
        break;
      }
      case 'THP_organizeSite': {
        const res = await organizeBySite(msg.windowId);
        sendResponse({ ok: true, ...res });
        break;
      }
      case 'THP_ungroupAll': {
        const res = await ungroupAll(msg.windowId);
        sendResponse({ ok: true, ...res });
        break;
      }
      case 'THP_getPendingScroll': {
        const y = _sender.tab?.id != null ? await popScroll(_sender.tab.id) : 0;
        sendResponse({ scrollY: y });
        break;
      }
      case 'THP_whitelistUrl': {
        // freeze screen asks to protect the frozen site; validate scheme first
        if (isSafeNavUrl(msg.url)) await whitelistSite(msg.url);
        sendResponse({ ok: isSafeNavUrl(msg.url) });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async
});

// react to settings changes made elsewhere
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) refreshBadge();
});
