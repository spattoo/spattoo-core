import { useState, useEffect } from 'react';

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
}

const STATUS_META = {
  pending:     { label: 'Pending',   color: '#92400E', bg: '#FEF9C3' },
  approved:    { label: 'Approved',  color: '#065F46', bg: '#D1FAE5' },
  in_progress: { label: 'Baking',    color: '#1E40AF', bg: '#DBEAFE' },
  ready:       { label: 'Ready',     color: '#4C1D95', bg: '#EDE9FE' },
  delivered:   { label: 'Delivered', color: '#14532D', bg: '#F0FDF4' },
  cancelled:   { label: 'Cancelled', color: '#991B1B', bg: '#FEE2E2' },
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}


// ── SVG icons ─────────────────────────────────────────────────────────────────
const Icon = {
  Package:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Clock:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Calendar: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Users:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Alert:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Chart:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Star:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Refresh:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Trophy:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 21 12 21 16 21"/><line x1="12" y1="21" x2="12" y2="17"/><path d="M7 4H17l-1 8a5 5 0 0 1-8 0Z"/><path d="M5 4a2 2 0 0 0 0 4h2"/><path d="M19 4a2 2 0 0 1 0 4h-2"/></svg>,
  Truck:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  Store:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, gradient, icon, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: 0, borderRadius: 20, padding: '22px 24px',
        background: gradient, color: '#fff', cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', overflow: 'hidden',
        boxShadow: hovered && onClick
          ? '0 12px 32px rgba(0,0,0,0.22)'
          : '0 4px 16px rgba(0,0,0,0.12)',
        transform: hovered && onClick ? 'translateY(-2px)' : 'none',
        transition: 'all 0.2s',
      }}
    >
      {/* Background icon */}
      <div style={{
        position: 'absolute', right: 16, top: 16, opacity: 0.18,
        pointerEvents: 'none', transform: 'scale(2.2)', transformOrigin: 'top right',
        color: '#fff',
      }}>{icon}</div>

      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.8 }}>{label}</span>
      <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{value}</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        {sub && <span style={{ fontSize: 12, opacity: 0.75 }}>{sub}</span>}
        {onClick && <span style={{ fontSize: 12, opacity: 0.9, fontWeight: 700 }}>View →</span>}
      </div>
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
        {data.map((d, i) => {
          const pct = Math.max((d.count / max) * 100, d.count > 0 ? 5 : 1);
          const isToday = d.date === today;
          return (
            <div key={d.date} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div
                title={`${d.count} order${d.count !== 1 ? 's' : ''}`}
                style={{
                  width: '100%', height: `${pct}%`,
                  borderRadius: '5px 5px 0 0', minHeight: 2,
                  background: isToday
                    ? 'linear-gradient(to top, #7c3aed, #a78bfa)'
                    : 'linear-gradient(to top, #4f46e540, #818cf840)',
                  transition: 'height 0.5s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: isToday ? '0 -2px 8px rgba(124,58,237,0.4)' : 'none',
                }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div style={{ display: 'flex', gap: 3 }}>
        {data.map((d, i) => {
          const isToday = d.date === today;
          const showLabel = i === 0 || i === data.length - 1 || isToday;
          return (
            <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
              {showLabel && (
                <span style={{
                  fontSize: 9, fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#7c3aed' : '#bbb',
                  whiteSpace: 'nowrap',
                }}>
                  {isToday ? 'Today' : new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Horizontal bar ────────────────────────────────────────────────────────────
function HBar({ label, count, max, gradient = 'linear-gradient(90deg,#4f46e5,#818cf8)', rank }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {rank !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 800, color: rank === 0 ? '#f59e0b' : '#ccc', minWidth: 14, textAlign: 'center' }}>
          {rank + 1}
        </span>
      )}
      <span style={{ fontSize: 12, fontWeight: 600, color: '#333', minWidth: 80, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, background: '#f0edf8', borderRadius: 6, height: 9, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: gradient, borderRadius: 6, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 800, minWidth: 28, textAlign: 'center',
        background: '#f0edf8', color: '#7c3aed', borderRadius: 8, padding: '2px 6px',
      }}>{count}</span>
    </div>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────
const PERIODS = [
  { value: '7d',  label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '3 months' },
  { value: 'all', label: 'All time' },
];

function PeriodSelector({ value, onChange, loading }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {loading && <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #e0d8f8', borderTopColor: '#4f46e5', animation: 'spin 0.7s linear infinite' }} />}
      {PERIODS.map(p => (
        <button key={p.value} onClick={() => onChange(p.value)} style={{
          padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', border: 'none',
          background: value === p.value ? '#4f46e5' : '#f0edf8',
          color: value === p.value ? '#fff' : '#888',
          transition: 'all 0.15s',
        }}>{p.label}</button>
      ))}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Card({ title, icon, accent = '#4f46e5', children, flex, headerRight }) {
  return (
    <div style={{
      flex: flex ?? 1, background: '#fff', borderRadius: 20,
      boxShadow: '0 2px 20px rgba(0,0,0,0.07)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #f5f3ff',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'linear-gradient(to right, #fafafe, #fff)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
        }}>{icon}</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', flex: 1 }}>{title}</span>
        {headerRight}
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── Delivery row ──────────────────────────────────────────────────────────────
function DeliveryRow({ order }) {
  const name = order.customers ? `${order.customers.first_name ?? ''} ${order.customers.last_name ?? ''}`.trim() : 'Unknown';
  const m = STATUS_META[order.status] ?? STATUS_META.pending;
  const today = new Date().toISOString().slice(0, 10);
  const isToday = order.delivery_date === today;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #fafafe' }}>
      <div style={{
        minWidth: 42, textAlign: 'center', fontSize: 11, fontWeight: 800,
        color: isToday ? '#fff' : '#4f46e5',
        background: isToday ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : '#f0edf8',
        borderRadius: 8, padding: '4px 6px',
      }}>
        {fmtDate(order.delivery_date)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#aaa', marginTop: 1 }}>
          {order.delivery_mode === 'home_delivery' ? <Icon.Truck /> : <Icon.Store />}
          {order.delivery_mode === 'home_delivery' ? 'Delivery' : 'Pickup'}
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, background: m.bg, color: m.color, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
        {m.label}
      </span>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function DashboardPanel({ open, onClose, apiClient, onNavigateOrders, onNavigateCustomers, primaryColor = '#1a1a1a', accentColor = '#333333' }) {
  const isMobile = useIsMobile();
  const [data,            setData]            = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [breakdownPeriod, setBreakdownPeriod] = useState('30d');
  const [breakdownData,   setBreakdownData]   = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    apiClient.fetchDashboard()
      .then(d => { setData(d); setBreakdownData({ statusBreakdown: d.statusBreakdown, deliverySplit: d.deliverySplit }); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !data) return;
    setBreakdownLoading(true);
    apiClient.fetchDashboardBreakdown(breakdownPeriod)
      .then(setBreakdownData)
      .catch(() => {})
      .finally(() => setBreakdownLoading(false));
  }, [breakdownPeriod, open]);

  if (!open) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700;800&display=swap');
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .dash-fadein { animation: fadeUp 0.35s ease both; }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: isMobile ? 0 : 76,
        zIndex: 300, display: 'flex', flexDirection: 'column',
        fontFamily: "'Quicksand', sans-serif",
        background: '#f3f0fb',
        boxShadow: '-4px 0 40px rgba(0,0,0,0.15)',
        animation: 'slideInRight 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* Header */}
        <div style={{
          padding: isMobile ? '16px 20px' : '20px 28px',
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          <button onClick={onClose} style={{
            width: 32, height: 32, flexShrink: 0, zIndex: 1,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.85)',
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>

          <div style={{ flex: 1, zIndex: 1 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Abstract bar + line chart illustration */}
          <svg
            width="100%" height="100%"
            viewBox="0 0 520 80"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {/* Subtle horizontal grid lines */}
            <line x1="0" y1="20" x2="520" y2="20" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
            <line x1="0" y1="40" x2="520" y2="40" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
            <line x1="0" y1="60" x2="520" y2="60" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />

            {/* Bars — upward trend with natural variation */}
            {[
              [18, 22], [68, 35], [118, 18], [168, 42], [218, 30],
              [268, 50], [318, 38], [368, 56], [418, 46], [468, 64],
            ].map(([x, h], i) => (
              <rect key={i} x={x} y={80 - h} width="22" height={h} rx="3"
                fill="white" fillOpacity={i === 9 ? 0.22 : 0.12} />
            ))}

            {/* Trend line over bars */}
            <polyline
              points="29,58 79,45 129,62 179,38 229,50 279,30 329,42 379,24 429,34 479,16"
              stroke="white" strokeWidth="2" strokeOpacity="0.55"
              strokeLinecap="round" strokeLinejoin="round"
            />

            {/* Area fill under line */}
            <path
              d="M29,58 79,45 129,62 179,38 229,50 279,30 329,42 379,24 429,34 479,16 L479,80 L29,80 Z"
              fill="white" fillOpacity="0.05"
            />

            {/* Highlight dots — first, peak, last */}
            <circle cx="29"  cy="58" r="3.5" fill="white" fillOpacity="0.4" />
            <circle cx="279" cy="30" r="3.5" fill="white" fillOpacity="0.4" />
            <circle cx="479" cy="16" r="5"   fill="white" fillOpacity="0.85" />
            <circle cx="479" cy="16" r="9"   fill="white" fillOpacity="0.12" />
          </svg>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 14, paddingTop: 60 }}>
              Loading your dashboard…
            </div>
          )}

          {error && (
            <div style={{ padding: '16px 20px', borderRadius: 16, background: '#FEE2E2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {data && (
            <div className="dash-fadein" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ── Stat cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12 }}>
                <StatCard
                  label="Orders this week" value={data.stats.ordersThisWeek} sub="last 7 days"
                  icon={<Icon.Package />}
                  gradient="linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
                  onClick={() => onNavigateOrders({ params: { from: new Date(Date.now() - 7 * 86400000).toISOString() }, label: 'Orders placed in the last 7 days' })}
                />
                <StatCard
                  label="Pending" value={data.stats.pendingCount} sub="need attention"
                  icon={<Icon.Clock />}
                  gradient={data.stats.pendingCount > 0
                    ? 'linear-gradient(135deg, #dc2626 0%, #9f1239 100%)'
                    : 'linear-gradient(135deg, #64748b 0%, #475569 100%)'}
                  onClick={() => onNavigateOrders({ params: { status: 'pending' }, label: 'Pending orders' })}
                />
                <StatCard
                  label="Due today" value={data.stats.dueToday}
                  sub={data.stats.dueTomorrow > 0 ? `+${data.stats.dueTomorrow} tomorrow` : 'deliveries'}
                  icon={<Icon.Calendar />}
                  gradient={data.stats.dueToday > 0
                    ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                    : 'linear-gradient(135deg, #64748b 0%, #475569 100%)'}
                  onClick={() => onNavigateOrders({ params: { delivery_date: today }, label: 'Orders due today' })}
                />
                <StatCard
                  label="New customers" value={data.newCustomers.length} sub="last 7 days"
                  icon={<Icon.Users />}
                  gradient="linear-gradient(135deg, #059669 0%, #047857 100%)"
                  onClick={() => onNavigateCustomers({
                    params: { from: new Date(Date.now() - 7 * 86400000).toISOString() },
                    label: 'New customers — last 7 days',
                  })}
                />
              </div>

              {/* ── Needs attention ── */}
              {data.needsAttention.length > 0 && (
                <div style={{
                  borderRadius: 20, overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(220,38,38,0.2)',
                }}>
                  <div
                    onClick={() => onNavigateOrders({ params: { delivery_date: today }, label: 'Orders due today or tomorrow — action needed' })}
                    style={{
                      padding: '14px 20px', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #dc2626 0%, #9f1239 100%)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <span style={{ color: '#fff' }}><Icon.Alert /></span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#fff' }}>
                      {data.needsAttention.length} order{data.needsAttention.length > 1 ? 's' : ''} need attention today
                    </span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>View all →</span>
                  </div>
                  <div style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}>
                    {data.needsAttention.map((o, i) => {
                      const name = o.customers ? `${o.customers.first_name ?? ''} ${o.customers.last_name ?? ''}`.trim() : 'Unknown';
                      const m = STATUS_META[o.status] ?? STATUS_META.pending;
                      const isToday = o.delivery_date === today;
                      return (
                        <div
                          key={o.id}
                          onClick={() => onNavigateOrders({ params: { delivery_date: o.delivery_date }, label: `Orders due ${isToday ? 'today' : 'tomorrow'}` })}
                          style={{
                            padding: '12px 20px', cursor: 'pointer',
                            borderTop: i === 0 ? 'none' : '1px solid #fef2f2',
                            display: 'flex', alignItems: 'center', gap: 12,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: isToday ? '#dc2626' : '#f97316',
                            boxShadow: `0 0 0 3px ${isToday ? '#fee2e2' : '#ffedd5'}`,
                          }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: isToday ? '#dc2626' : '#ea580c', minWidth: 56 }}>
                            {isToday ? 'Today' : 'Tomorrow'}
                          </span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, background: m.bg, color: m.color, borderRadius: 20, padding: '3px 10px' }}>{m.label}</span>
                          <span style={{ color: '#aaa' }}>{o.delivery_mode === 'home_delivery' ? <Icon.Truck /> : <Icon.Store />}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Row: Upcoming + Bar chart ── */}
              <div style={{ display: 'flex', gap: 16, flexDirection: isMobile ? 'column' : 'row' }}>
                <Card title={`Upcoming (${data.upcomingDeliveries.length})`} icon={<Icon.Calendar />} accent="#4f46e5" flex={1}>
                  {data.upcomingDeliveries.length === 0
                    ? <span style={{ fontSize: 13, color: '#bbb', padding: '8px 0' }}>Nothing due in the next 7 days</span>
                    : data.upcomingDeliveries.slice(0, 5).map(o => <DeliveryRow key={o.id} order={o} />)
                  }
                </Card>
                <Card title="Orders — last 14 days" icon={<Icon.Chart />} accent="#7c3aed" flex={1}>
                  <BarChart data={data.ordersPerDay} />
                </Card>
              </div>

              {/* ── Row: Flavours + Status ── */}
              <div style={{ display: 'flex', gap: 16, flexDirection: isMobile ? 'column' : 'row' }}>
                <Card title="Top flavours — last 3 months" icon={<Icon.Star />} accent="#7c3aed">
                  {data.topFlavours.length === 0
                    ? <span style={{ fontSize: 13, color: '#bbb' }}>No flavour data yet</span>
                    : data.topFlavours.map((f, i) => (
                        <HBar key={f.name} label={f.name} count={f.count}
                          max={data.topFlavours[0]?.count ?? 1}
                          gradient="linear-gradient(90deg,#7c3aed,#a78bfa)"
                          rank={i} />
                      ))
                  }
                </Card>
                <Card title="Status breakdown" icon={<Icon.Refresh />} accent="#0284c7"
                  headerRight={<PeriodSelector value={breakdownPeriod} onChange={setBreakdownPeriod} loading={breakdownLoading} />}>
                  {!breakdownData?.statusBreakdown?.length
                    ? <span style={{ fontSize: 13, color: '#bbb' }}>No orders yet</span>
                    : breakdownData.statusBreakdown.map(s => {
                        const m = STATUS_META[s.status] ?? { label: s.status, color: '#555', bg: '#f3f4f6' };
                        const pct = (s.count / (breakdownData.statusBreakdown[0]?.count ?? 1)) * 100;
                        return (
                          <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, background: m.bg, color: m.color, borderRadius: 20, padding: '3px 10px', minWidth: 68, textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {m.label}
                            </span>
                            <div style={{ flex: 1, background: '#f5f3ff', borderRadius: 6, height: 9, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: m.color, borderRadius: 6, transition: 'width 0.6s ease' }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: m.color, minWidth: 20, textAlign: 'right' }}>{s.count}</span>
                          </div>
                        );
                      })
                  }
                </Card>
              </div>

              {/* ── Row: Delivery split ── */}
              <div style={{ display: 'flex', gap: 16, flexDirection: isMobile ? 'column' : 'row' }}>
                <Card title="Delivery split" icon={<Icon.Truck />} accent="#059669"
                  headerRight={<PeriodSelector value={breakdownPeriod} onChange={setBreakdownPeriod} loading={breakdownLoading} />}>
                  {(() => {
                    const split = breakdownData?.deliverySplit ?? data.deliverySplit;
                    const total = split.pickup + split.homeDelivery;
                    if (total === 0) return <span style={{ fontSize: 13, color: '#bbb' }}>No orders yet</span>;
                    const pickupPct   = Math.round((split.pickup       / total) * 100);
                    const deliveryPct = 100 - pickupPct;
                    return (
                      <>
                        {/* Visual split bar */}
                        <div style={{ height: 24, borderRadius: 12, overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${pickupPct}%`, background: 'linear-gradient(90deg,#059669,#34d399)', transition: 'width 0.6s ease' }} />
                          <div style={{ flex: 1, background: 'linear-gradient(90deg,#4f46e5,#818cf8)' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#059669' }} />
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#333' }}><Icon.Store /> Pickup</span>
                            <span style={{ fontSize: 12, color: '#059669', fontWeight: 800 }}>{pickupPct}%</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 800 }}>{deliveryPct}%</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#333' }}><Icon.Truck /> Delivery</span>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#4f46e5' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                          <HBar label="Pickup" count={split.pickup} max={total} gradient="linear-gradient(90deg,#059669,#34d399)" />
                          <HBar label="Delivery" count={split.homeDelivery} max={total} gradient="linear-gradient(90deg,#4f46e5,#818cf8)" />
                        </div>
                      </>
                    );
                  })()}
                </Card>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
