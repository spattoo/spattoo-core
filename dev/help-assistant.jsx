import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import HelpAssistant from '../src/shared/HelpAssistant.jsx';
import Appu from '../src/shared/Appu.jsx';
/* The same module the API runs, imported straight from the backend checkout beside this one, so
   the harness cannot drift from the server about what is declined. */
import { outOfScope } from '../../spattoo-backend/src/services/helpScope.js';

/* ── The assistant panel, driven by REAL article text ────────────────────────────────────────────
 *
 * Migration 141 is not applied anywhere, so `/help/search` cannot answer yet and the only way to
 * look at this screen is to feed it the same rows the server will return. The sections below are
 * read from `spattoo-docs/help` at dev-server start by the vite plugin in `vite.config.js`, chunked
 * exactly as `scripts/backfill-help-index.mjs` chunks them — so what renders here is the article's
 * own words, tables, numbered steps and all, and not a paraphrase written to flatter the renderer.
 *
 *   ?q=<question>        open with a question already answered
 *   ?state=empty         the nothing-is-written answer
 *   ?state=error         the request failed
 *   ?w=375               the phone. Also just narrow the window — isMobile follows the width.
 */
const q = new URLSearchParams(location.search);
const forced = q.get('state');
const width = Number(q.get('w')) || 0;

function useSections() {
  const [rows, setRows] = useState(null);
  useEffect(() => { fetch('/__help-sections').then(r => r.json()).then(setRows).catch(() => setRows([])); }, []);
  return rows;
}

/* A stand-in for Appu, to prove the slot works before the character exists: a dot that changes
   colour per state. ?appu=1 turns it on. The real one replaces this file's import, not the panel. */
const MOOD_COLOUR = {
  idle: '#9BB5A2', listening: '#60a5fa', thinking: '#f59e0b', thinking_long: '#ef4444',
  answered: '#22c55e', empty: '#a78bfa', declined: '#78716c', failed: '#ef4444', escalated: '#0ea5e9',
};
function StandInCharacter({ state, size = 26 }) {
  console.log('[harness] appu state →', state);
  return (
    <span title={state} style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block',
      background: MOOD_COLOUR[state] ?? '#ccc', transition: 'background 0.2s',
    }} />
  );
}

function App() {
  const rows = useSections();
  const [mobile, setMobile] = useState(width ? width < 768 : window.innerWidth < 768);
  useEffect(() => {
    if (width) return;
    const on = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', on); return () => window.removeEventListener('resize', on);
  }, []);

  /* Stands in for the server's ranker: embeddings are not available in the browser, so this scores
     by word overlap. ⚠️ THE RANKING IS NOT WHAT THIS HARNESS IS FOR — the ranking is measured by
     scripts/eval-help-search.mjs against the real embeddings. This exists to look at the SCREEN. */
  const searchHelp = async (question) => {
    await new Promise(r => setTimeout(r, 350));          // the round trip, so "Looking…" is visible
    if (forced === 'error') throw new Error('stub');
    if (forced === 'empty') return { ok: true, question, sections: [], questionId: 'stub-id' };
    /* The harness runs the REAL guard, so what it declines here is what the server declines. */
    const declined = outOfScope(question);
    if (declined) return { ok: true, question, sections: [], questionId: 'stub-id', outOfScope: declined };
    const words = question.toLowerCase().match(/[a-z]+/g)?.filter(w => w.length > 3) ?? [];
    const scored = (rows ?? []).map((r) => {
      const hay = `${r.doc_title} ${r.heading ?? ''} ${r.body}`.toLowerCase();
      return { ...r, score: words.filter(w => hay.includes(w)).length / (words.length || 1) };
    }).filter(s => s.score > 0.2).sort((a, b) => b.score - a.score);
    const seen = new Set();
    const sections = scored.filter(s => !seen.has(s.doc_slug) && seen.add(s.doc_slug)).slice(0, 4);
    return { ok: true, question, sections, questionId: 'stub-id' };
  };

  return (
    <div style={{ width: width || '100%', height: '100%', margin: '0 auto', position: 'relative',
                  background: '#fff', overflow: 'hidden',
                  boxShadow: width ? '0 0 0 1px #ddd' : 'none' }}>
      <div style={{ padding: 20, color: '#8a7a80', fontSize: 13, lineHeight: 1.6 }}>
        <strong style={{ color: '#2e272b' }}>The assistant</strong><br />
        {rows == null ? 'loading the articles…' : `${rows.length} sections loaded from spattoo-docs/help`}
        <br />The button is bottom-right, exactly where it sits in the app.
      </div>
      {/* MOBILE_BAR_H in the designer is 56; the harness has no nav strip, so the inset is passed
          anyway to check the button clears it. */}
      <HelpAssistant
        apiClient={{
          searchHelp,
          sendHelpFeedback: async (id) => { console.log('[harness] feedback for', id); return { ok: true }; },
          escalateHelp:    async (id, note) => { console.log('[harness] escalate', id, JSON.stringify(note)); await new Promise(r => setTimeout(r, 400)); return { ok: true }; },
        }}
        character={q.get('standin') ? StandInCharacter : Appu}
        isMobile={mobile} bottomInset={mobile ? 56 : 0} />
      {mobile && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56,
                      background: '#0b0b0d', color: 'rgba(255,255,255,0.5)', fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          the phone's nav strip sits here
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

/* Open with a question already asked: the panel has no imperative handle, so the harness drives the
   real controls — which is the rule anyway (CLAUDE.md rule 6: never assign input.value). */
const ask = q.get('q');
if (ask) {
  const tick = setInterval(() => {
    const fab = document.querySelector('button[aria-label^="Help"]');
    if (fab) { fab.click(); clearInterval(tick); setTimeout(() => type(ask), 60); }
  }, 60);
}
function type(text) {
  const input = document.querySelector('input[placeholder="How do I…?"]');
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}
