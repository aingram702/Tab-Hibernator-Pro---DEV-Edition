// Unit tests for the pure logic in src/lib/settings.js.
// Run with: npm test   (uses Node's built-in test runner, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isHibernatableUrl, isSafeNavUrl, isLocalDevUrl, matchesPattern,
  isWhitelisted, originalUrlFromSuspended, baseDomain, colorFor,
  normalizeSettings, GROUP_COLORS, ACCENTS, DEFAULTS,
} from '../src/lib/settings.js';

test('isHibernatableUrl accepts only http(s)', () => {
  assert.ok(isHibernatableUrl('http://a.com'));
  assert.ok(isHibernatableUrl('https://a.com/x?y=1'));
  assert.ok(!isHibernatableUrl('chrome://extensions'));
  assert.ok(!isHibernatableUrl('file:///x'));
  assert.ok(!isHibernatableUrl('about:blank'));
  assert.ok(!isHibernatableUrl(''));
  assert.ok(!isHibernatableUrl(undefined));
});

test('isSafeNavUrl is the navigation security gate', () => {
  assert.ok(isSafeNavUrl('http://a.com/x'));
  assert.ok(isSafeNavUrl('https://a.com/x'));
  // dangerous / non-web schemes must be refused
  assert.ok(!isSafeNavUrl('javascript:alert(1)'));
  assert.ok(!isSafeNavUrl('JaVaScRiPt:alert(1)'));
  assert.ok(!isSafeNavUrl('  javascript:alert(1)'));
  assert.ok(!isSafeNavUrl('data:text/html,<script>x</script>'));
  assert.ok(!isSafeNavUrl('blob:https://a.com/uuid'));
  assert.ok(!isSafeNavUrl('vbscript:msgbox'));
  assert.ok(!isSafeNavUrl('file:///etc/passwd'));
  assert.ok(!isSafeNavUrl('chrome-extension://id/x.html'));
  assert.ok(!isSafeNavUrl(''));
  assert.ok(!isSafeNavUrl(null));
});

test('isLocalDevUrl detects loopback, private LAN, and dev TLDs', () => {
  for (const u of [
    'http://localhost:3000/app', 'http://127.0.0.1:8080', 'http://0.0.0.0:5173',
    'http://myapp.test/', 'http://printer.local', 'http://192.168.1.50:9000',
    'http://10.0.0.5', 'http://172.16.4.4', 'http://172.31.0.1',
  ]) assert.ok(isLocalDevUrl(u), u);
  for (const u of [
    'https://github.com', 'http://172.32.0.1', 'https://example.com',
  ]) assert.ok(!isLocalDevUrl(u), u);
});

test('matchesPattern supports substrings and globs', () => {
  assert.ok(matchesPattern('https://github.com/foo/bar', 'github.com'));
  assert.ok(matchesPattern('https://sub.example.com/x', 'example.com'));
  assert.ok(matchesPattern('https://ci.internal.corp/job', '*.internal.corp'));
  assert.ok(matchesPattern('https://jenkins.acme.io/', 'jenkins.*'));
  assert.ok(!matchesPattern('https://google.com', 'github.com'));
  assert.ok(!matchesPattern('https://x.com', ''));
});

test('matchesPattern is bounded against pathological patterns', () => {
  assert.ok(!matchesPattern('https://a.com', 'a'.repeat(250))); // too long
  assert.ok(!matchesPattern('https://a.com', '*'.repeat(25)));  // too many wildcards
  assert.ok(!matchesPattern(12345, 'a.com'));                   // non-string url
});

test('isWhitelisted composes local + dev-domains + custom lists', () => {
  const s = {
    autoWhitelistLocalhost: true, devDomainsEnabled: true,
    devDomains: ['github.com'], whitelist: ['*.staging.acme.io'],
  };
  assert.ok(isWhitelisted('http://localhost:3000', s));
  assert.ok(isWhitelisted('https://github.com/x', s));
  assert.ok(isWhitelisted('https://api.staging.acme.io/health', s));
  assert.ok(isWhitelisted('chrome://x', s)); // non-web always protected
  assert.ok(!isWhitelisted('https://news.ycombinator.com', s));

  const off = { autoWhitelistLocalhost: false, devDomainsEnabled: false, devDomains: ['github.com'], whitelist: [] };
  assert.ok(!isWhitelisted('http://localhost:3000', off));
  assert.ok(!isWhitelisted('https://github.com/x', off));
});

test('originalUrlFromSuspended extracts the uri param', () => {
  const s = 'chrome-extension://id/src/suspended/suspended.html?uri=' +
    encodeURIComponent('https://example.com/p?a=1') + '&title=Hi';
  assert.equal(originalUrlFromSuspended(s), 'https://example.com/p?a=1');
  assert.equal(originalUrlFromSuspended('not a url'), null);
});

test('baseDomain collapses subdomains but preserves IPs and ccTLDs', () => {
  assert.equal(baseDomain('api.stripe.com'), 'stripe.com');
  assert.equal(baseDomain('dashboard.stripe.com'), 'stripe.com');
  assert.equal(baseDomain('github.com'), 'github.com');
  assert.equal(baseDomain('www.foo.co.uk'), 'foo.co.uk');
  assert.equal(baseDomain('localhost'), 'localhost');
  // IP literals stay whole (regression: used to become "0.1")
  assert.equal(baseDomain('127.0.0.1'), '127.0.0.1');
  assert.equal(baseDomain('192.168.0.42'), '192.168.0.42');
  assert.equal(baseDomain('::1'), '::1');
});

test('colorFor is deterministic and returns a valid group color', () => {
  assert.equal(colorFor('github.com'), colorFor('github.com'));
  for (const d of ['stripe.com', 'localhost', 'example.org', 'a.b.c.d']) {
    assert.ok(GROUP_COLORS.includes(colorFor(d)), d);
  }
});

test('normalizeSettings coerces and clamps bad input', () => {
  const out = normalizeSettings({
    idleMinutes: '9999',      // string + over max → clamped to 1440
    tabMemoryMB: -5,          // under min → clamped to 10
    enabled: 0,               // → false
    showBadge: 'yes',         // truthy → true
    accent: 'chartreuse',     // invalid → default
    whitelist: ['  a.com ', 'a.com', 42, ''], // trim + dedupe + drop non-strings/empties
    devDomains: 'not-an-array',               // → []
    bogusKey: 'should be dropped',
  });
  assert.equal(out.idleMinutes, 1440);
  assert.equal(out.tabMemoryMB, 10);
  assert.equal(out.enabled, false);
  assert.equal(out.showBadge, true);
  assert.equal(out.accent, DEFAULTS.accent);
  assert.deepEqual(out.whitelist, ['a.com']);
  assert.deepEqual(out.devDomains, []);
  assert.ok(!('bogusKey' in out));
  // every DEFAULTS key is present
  for (const k of Object.keys(DEFAULTS)) assert.ok(k in out, k);
});

test('normalizeSettings on junk falls back to defaults', () => {
  assert.deepEqual(normalizeSettings(null), normalizeSettings({}));
  const out = normalizeSettings('garbage');
  assert.equal(out.idleMinutes, DEFAULTS.idleMinutes);
  assert.ok(ACCENTS[out.accent]);
});

test('DEFAULTS are sane', () => {
  assert.equal(typeof DEFAULTS.idleMinutes, 'number');
  assert.ok(DEFAULTS.idleMinutes > 0);
  assert.ok(Array.isArray(DEFAULTS.devDomains));
  assert.ok(DEFAULTS.devDomains.includes('localhost'));
  assert.equal(DEFAULTS.enabled, true);
});
