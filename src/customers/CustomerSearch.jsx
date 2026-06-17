import { useState, useEffect, useMemo } from 'react';

// Reusable "find an existing customer of this baker" search — same behaviour as the
// order-placement search (OrderModal): load the baker's customer list once, filter by
// phone digits or name substring, render tappable results. Baker scoping comes from
// apiClient.fetchCustomers (authed → that baker's customers only). onSelect(customer) fires
// when one is picked.
export default function CustomerSearch({ apiClient, primaryColor = '#1a1a1a', isMobile = false, onSelect, autoFocus = false }) {
  const [customers, setCustomers] = useState(null);   // null = not loaded yet
  const [loading,   setLoading]   = useState(false);
  const [fetchErr,  setFetchErr]  = useState(null);
  const [query,     setQuery]     = useState('');

  useEffect(() => {
    if (!apiClient?.fetchCustomers) { setCustomers([]); return; }
    setLoading(true);
    apiClient.fetchCustomers()
      .then(data => setCustomers(data ?? []))
      .catch(e => { setCustomers([]); setFetchErr(e.message ?? 'Failed to load customers'); })
      .finally(() => setLoading(false));
  }, []);

  // Phone-digit OR name substring match — mirrors OrderModal's searchResults.
  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || !customers?.length) return [];
    const digits = q.replace(/\D/g, '');
    const lower  = q.toLowerCase();
    return customers.filter(c => {
      if (digits.length >= 3) {
        const d = (c.phone ?? '').replace(/\D/g, '');
        if (d && d.includes(digits)) return true;
      }
      const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().trim();
      return fullName && fullName.includes(lower);
    });
  }, [query, customers]);

  const noMatch = !loading && !fetchErr && query.trim().length >= 2 && results.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        style={inp}
        type="text"
        placeholder="Search by phone or name…"
        value={query}
        autoFocus={autoFocus}
        onChange={e => setQuery(e.target.value)}
      />
      {loading && <span style={{ fontSize: 11, color: '#aaa' }}>Loading customer list…</span>}
      {!loading && fetchErr && <span style={{ fontSize: 11, color: '#e53935' }}>Could not load customers: {fetchErr}</span>}
      {noMatch && <span style={{ fontSize: 12, color: '#999' }}>No matching customers.</span>}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect?.(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 12px' : '8px 10px', background: '#fafafa', border: '1px solid #eee', borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <div style={{ width: isMobile ? 32 : 26, height: isMobile ? 32 : 26, borderRadius: '50%', background: primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: isMobile ? 13 : 10, flexShrink: 0 }}>
                {(c.first_name?.[0] ?? '').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: isMobile ? 13 : 12, color: '#1a1a1a' }}>{c.first_name} {c.last_name ?? ''}</div>
                {c.phone && <div style={{ fontSize: isMobile ? 12 : 10, color: '#888' }}>{c.phone}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inp = { padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E0DDD8', fontSize: 13, fontFamily: 'inherit', color: '#222', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff' };
