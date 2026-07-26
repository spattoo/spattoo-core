import { useState, useEffect, useMemo } from 'react';
import { statusLabel, DEFAULT_STATUS_INDEX } from './statuses.js';

// ── Orders → Calendar: the delivery month at a glance ─────────────────────────
// A month grid of how many cakes are due each day, from GET /api/orders/calendar.
// That endpoint returns COUNTS ONLY — one small entry per day — never the order rows,
// so this view costs the same whether the baker takes 5 orders a month or 5,000.
// Picking a day hands the date back up; the panel then shows the real order list
// filtered to it, reusing the same filter path the Dashboard already uses.
//
// Visual language follows the rest of the Orders UI: MONOCHROME, tone derived from
// lifecycle position (see statuses.js) — no per-status hues, no pictographic icons.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad     = n => String(n).padStart(2, '0');
const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth  = (y, m) => new Date(y, m, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m - 1, 1).getDay();

// "Today" belongs to the BAKER's timezone, not the browser's — a baker travelling (or a
// staff member abroad) must still see their own working day highlighted. Falls back to
// browser-local if the host hasn't supplied one or it isn't a zone this runtime knows.
function todayInZone(timezone) {
  try {
    return new Date().toLocaleDateString('en-CA', timezone ? { timeZone: timezone } : undefined);
  } catch {
    return new Date().toLocaleDateString('en-CA');
  }
}

const Chevron = ({ dir }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
       style={{ transform: dir === 'left' ? 'rotate(180deg)' : 'none' }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// One day's status mix, e.g. "1 confirmed · 1 ready". Reads by_status straight from the
// API so a status added to the DB shows up here with no code change.
function statusSummary(byStatus, statusIndex) {
  return Object.entries(byStatus ?? {})
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${statusLabel(statusIndex, key).toLowerCase()}`)
    .join(' · ');
}

export default function OrdersCalendar({
  apiClient,
  statusIndex = DEFAULT_STATUS_INDEX,
  isMobile = false,
  primaryColor = '#1a1a1a',
  timezone = null,
  onPickDate,
  onCreateForDate = null,
}) {
  const today = useMemo(() => todayInZone(timezone), [timezone]);
  const [year,  setYear]  = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));
  const [days,    setDays]    = useState({});   // 'YYYY-MM-DD' → { count, by_status }
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    const from = isoDate(year, month, 1);
    const to   = isoDate(year, month, daysInMonth(year, month));
    setLoading(true);
    setError(null);
    apiClient.fetchOrdersCalendar(from, to)
      .then(list => {
        if (cancelled) return;
        setDays(Object.fromEntries((Array.isArray(list) ? list : []).map(d => [d.date, d])));
      })
      .catch(err => { if (!cancelled) setError(err?.message ?? 'Failed to load the calendar'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, month, apiClient]);

  function shiftMonth(delta) {
    const m = month + delta;
    if (m < 1)       { setYear(y => y - 1); setMonth(12); }
    else if (m > 12) { setYear(y => y + 1); setMonth(1); }
    else             { setMonth(m); }
  }

  const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7));

  // Leading blanks so the 1st lands on its weekday, then the days themselves.
  const cells = [
    ...Array(firstWeekday(year, month)).fill(null),
    ...Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const cellMinHeight = isMobile ? 62 : 104;

  const navBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, borderRadius: 10,
    background: '#fff', border: '1.5px solid #E8E4DC', color: '#5e5e5e',
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Month header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        padding: isMobile ? '12px 14px' : '14px 20px',
        background: '#fff', borderBottom: '1.5px solid #E8E4DC',
      }}>
        <button onClick={() => shiftMonth(-1)} style={navBtn} title="Previous month" aria-label="Previous month">
          <Chevron dir="left" />
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            fontSize: isMobile ? 15 : 17, fontWeight: 800, color: '#1a1a1a',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
          {!isCurrentMonth && (
            <button
              onClick={() => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7))); }}
              style={{
                background: '#ECEBE6', border: 'none', color: '#5e5e5e', borderRadius: 8,
                padding: '5px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit', flexShrink: 0,
              }}>
              Today
            </button>
          )}
          {loading && <span style={{ fontSize: 12, color: '#bbb', flexShrink: 0 }}>Loading…</span>}
        </div>
        <button onClick={() => shiftMonth(1)} style={navBtn} title="Next month" aria-label="Next month">
          <Chevron dir="right" />
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px 20px', background: '#FEF2F2', borderBottom: '1px solid #FECACA',
          color: '#991B1B', fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>{error}</div>
      )}

      {/* Weekday labels */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flexShrink: 0,
        background: '#F2F0EB', borderBottom: '1.5px solid #E8E4DC',
      }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{
            textAlign: 'center', padding: '7px 0', fontSize: 10, fontWeight: 800,
            letterSpacing: 0.6, color: '#8a8a8a', textTransform: 'uppercase',
          }}>{isMobile ? d[0] : d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', alignContent: 'start' }}>
        {cells.map((day, i) => {
          if (!day) {
            return <div key={`blank-${i}`} style={{
              minHeight: cellMinHeight, background: '#FAF9F6',
              borderRight: '1px solid #EFEDE8', borderBottom: '1px solid #EFEDE8',
            }} />;
          }
          const date    = isoDate(year, month, day);
          const entry   = days[date];
          const count   = entry?.count ?? 0;
          const isToday = date === today;
          const canCreate = !!onCreateForDate;

          return (
            <div
              key={date}
              onClick={count > 0 ? () => onPickDate(date) : (canCreate ? () => onCreateForDate(date) : undefined)}
              title={count > 0
                ? `${count} ${count === 1 ? 'order' : 'orders'} due — open the list`
                : (canCreate ? 'New order for this day' : undefined)}
              style={{
                minHeight: cellMinHeight, padding: isMobile ? '5px 4px' : '7px 8px',
                display: 'flex', flexDirection: 'column', gap: 4,
                borderRight: '1px solid #EFEDE8', borderBottom: '1px solid #EFEDE8',
                background: isToday ? '#F4F2EC' : '#fff',
                cursor: (count > 0 || canCreate) ? 'pointer' : 'default',
              }}
            >
              {/* Day number — today gets the brand disc */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  fontSize: 12, fontWeight: isToday ? 800 : 600,
                  background: isToday ? primaryColor : 'transparent',
                  color: isToday ? '#fff' : '#5e5e5e',
                }}>{day}</span>
              </div>

              {count > 0 && (
                isMobile ? (
                  // Phone: a count pill only. Name/status text truncates to nothing at
                  // this width, so the number IS the information.
                  <span style={{
                    alignSelf: 'flex-start',
                    background: primaryColor, color: '#fff',
                    borderRadius: 8, padding: '2px 7px',
                    fontSize: 11, fontWeight: 800, lineHeight: 1.5,
                  }}>{count}</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{
                      alignSelf: 'flex-start',
                      background: primaryColor, color: '#fff',
                      borderRadius: 8, padding: '2px 9px',
                      fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                    }}>
                      {count} {count === 1 ? 'order' : 'orders'}
                    </span>
                    <span style={{
                      fontSize: 10, color: '#8a8a8a', lineHeight: 1.35,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {statusSummary(entry.by_status, statusIndex)}
                    </span>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
