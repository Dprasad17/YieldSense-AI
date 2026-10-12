/**
 * Whole-page translation for the Indian-language modes.
 *
 * Watches the DOM, collects the English text of visible text nodes and swaps in translations from
 * POST /api/i18n/translate (Groq, cached on the server for everyone and in this browser per language).
 * Only text-node values are changed, never the element structure, so React keeps working: when React
 * re-renders a node with new English text, the observer translates it again. Numbers, inputs, code and
 * anything inside [translate="no"] are left alone. Switching back to English restores the originals.
 */
import { API_URL } from '../api/client';
import { getToken } from '../api/session';

type Lang = 'hi' | 'kn' | 'te' | 'ta';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'TEXTAREA', 'INPUT', 'OPTION']);
// English text only: strings already in an Indian script (the built-in menu labels) are skipped.
const HAS_LETTERS = /[A-Za-z]{2,}/;
const MAX_LEN = 400;
const STORE = (lang: Lang) => `ys-i18n-${lang}`;

let lang: Lang | null = null;
let observer: MutationObserver | null = null;
let timer: number | undefined;
const originals = new Map<Text, string>();
const shown = new WeakMap<Text, string>();
const pending = new Set<string>();
const failed = new Set<string>();
let cache = new Map<string, string>();

function loadCache(l: Lang) {
  try {
    cache = new Map(Object.entries(JSON.parse(localStorage.getItem(STORE(l)) ?? '{}') as Record<string, string>));
  } catch {
    cache = new Map();
  }
}

function saveCache(l: Lang) {
  try {
    localStorage.setItem(STORE(l), JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // storage full or blocked: the server cache still has everything
  }
}

function eligible(node: Text): boolean {
  const el = node.parentElement;
  if (!el || SKIP_TAGS.has(el.tagName) || el.closest('[translate="no"],[contenteditable="true"]')) return false;
  return true;
}

/** Translate (or queue) one text node. */
function visit(node: Text) {
  if (!lang || !eligible(node)) return;
  const current = node.nodeValue ?? '';
  // Our own write: nothing to do.
  if (shown.get(node) === current) return;
  const english = current.trim();
  if (!english || english.length > MAX_LEN || !HAS_LETTERS.test(english)) return;
  originals.set(node, current);
  const t = cache.get(english);
  if (t) {
    const value = current.replace(english, t);
    shown.set(node, value);
    node.nodeValue = value;
  } else if (!failed.has(english)) {
    pending.add(english);
    schedule();
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return visit(root as Text);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) visit(n as Text);
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, 250);
}

async function flush() {
  if (!lang || pending.size === 0) return;
  const token = getToken();
  if (!token) return; // public pages stay in English
  const l = lang;
  const all = [...pending];
  pending.clear();
  // Up to 80 strings per request, requests in parallel so a new page fills in quickly.
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += 80) batches.push(all.slice(i, i + 80));
  await Promise.all(
    batches.map(async batch => {
      try {
        const res = await fetch(`${API_URL}/api/i18n/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ lang: l, texts: batch }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { translations: Record<string, string> };
        for (const t of batch) {
          const v = body.translations[t];
          if (v) cache.set(t, v);
          else failed.add(t);
        }
      } catch {
        batch.forEach(t => failed.add(t)); // don't hammer a failing service; a reload retries
      }
    }),
  );
  if (lang !== l) return;
  saveCache(l);
  walk(document.body);
}

function restore() {
  for (const [node, text] of originals) {
    if (node.isConnected && shown.get(node) === node.nodeValue) node.nodeValue = text;
  }
  originals.clear();
}

/** Turn whole-page translation on (hi/kn/te/ta) or off (en). */
export function setAutoTranslate(next: string) {
  observer?.disconnect();
  observer = null;
  window.clearTimeout(timer);
  pending.clear();
  failed.clear();
  restore();
  if (next === 'en' || typeof MutationObserver === 'undefined') {
    lang = null;
    return;
  }
  lang = next as Lang;
  loadCache(lang);
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') visit(r.target as Text);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  walk(document.body);
}
