import React from 'react';
import { PASSWORD_RULES } from './passwordPolicy.js';

// Live per-rule checklist shown under a new-password field. Each rule ticks green as it is
// satisfied. Pure presentation — the rules + validation live in ./passwordPolicy so the UI
// and the submit gate share ONE definition within this package. Renders nothing until the
// user starts typing. Inline-styled to match the designer's light modal (core isn't Tailwind).
export default function PasswordChecklist({ password }) {
  if (!password) return null;
  return (
    <ul
      aria-label="Password requirements"
      style={{ listStyle: 'none', margin: '2px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li
            key={rule.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11.5, fontFamily: "'Quicksand',sans-serif", fontWeight: 600,
              color: ok ? '#2e7d52' : '#9ca3af', transition: 'color 0.15s ease',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${ok ? '#2e7d52' : '#cbd0d6'}`,
                background: ok ? 'rgba(46,125,82,0.12)' : 'transparent',
                color: ok ? '#2e7d52' : 'transparent',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} style={{ width: 8, height: 8 }}>
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
