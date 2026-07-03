// Small UI helpers shared by the popup and options pages.
import { ACCENTS } from './settings.js';

export function sendBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}

export function applyTheme(settings) {
  const hex = (ACCENTS[settings.accent] || ACCENTS.green).hex;
  document.documentElement.style.setProperty('--accent', hex);
  document.body.classList.toggle('scanlines', !!settings.scanlines);
}

// Human-readable RAM figure.
export function fmtMB(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(mb >= 10240 ? 0 : 1) + ' GB';
  return Math.round(mb) + ' MB';
}
