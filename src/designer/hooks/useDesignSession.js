import { useCallback, useEffect, useRef, useState } from 'react';

// ── useDesignSession ────────────────────────────────────────────────────────────
// Live co-design over Supabase Realtime. One "pen" (edit baton) at a time; the pen
// holder's `design` is broadcast to everyone on the channel `session:<id>`, and every
// other participant applies it locally via loadDesign(). Presence tracks who's in the
// room. The durable session lifecycle (create/pen/persist/end) lives in spattoo-api and
// is reached through the host-provided apiClient; the live design stream is Realtime.
//
// Echo prevention: only the pen holder (isEditor) broadcasts; a receiver applies remote
// design but never re-broadcasts, so a loop is structurally impossible. applyingRemoteRef
// is belt-and-suspenders for the brief pen-handoff window.
//
// Inputs:
//   supabase        — the Supabase client (already a CakeDesigner prop); provides Realtime
//   apiClient       — host client exposing createDesignSession/getDesignSession/
//                     putDesignSessionDesign/penDesignSession/endDesignSession
//   design          — the live design atom (from useCakeDesign)
//   loadDesign      — apply a design object (from useCakeDesign) — the remote-apply sink
//   initialSessionId— join an existing session (from a share link); null = not joining
//   role            — 'owner'|'staff'|'customer' (for presence display / labelling)
//   displayName     — human label for presence
//   enabled         — master switch; when false the hook is inert (no app change)
//
// The whole feature degrades to inert if apiClient lacks the methods or supabase has no
// realtime — it never throws into the designer.

const BROADCAST_THROTTLE_MS = 80;    // ~12 design frames/sec while dragging; final always sent
const PERSIST_DEBOUNCE_MS = 3000;    // flush design to the API for durability, at most this often

const hasSessionApi = (c) =>
  !!c && typeof c.createDesignSession === 'function' && typeof c.getDesignSession === 'function';

export function useDesignSession({
  supabase, apiClient, design, loadDesign,
  initialSessionId = null, role = null, displayName = null, enabled = true,
} = {}) {
  const live = enabled && hasSessionApi(apiClient) && !!supabase?.channel;

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [session, setSession] = useState(null);        // last-known server session row
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]); // [{ userId, role, name }]
  const [holderUserId, setHolderUserId] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  const [error, setError] = useState(null);

  const channelRef = useRef(null);
  const applyingRemoteRef = useRef(false);   // set while applying a remote design → don't echo
  const joinedHydratedRef = useRef(false);   // apply the joined session's snapshot exactly once
  const throttleRef = useRef({ timer: null, last: 0, pending: null });
  const persistRef = useRef({ timer: null });
  const remoteRef = useRef({ raf: 0, pending: null });   // receiver: coalesce incoming updates to one apply/frame

  const isEditor = !!myUserId && holderUserId === myUserId;

  // Resolve my auth user id once (Presence key + pen identity).
  useEffect(() => {
    if (!live) return;
    let alive = true;
    supabase.auth?.getUser?.()
      .then(({ data }) => { if (alive) setMyUserId(data?.user?.id ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [live, supabase]);

  // ── Subscribe to the session channel ─────────────────────────────────────────
  useEffect(() => {
    if (!live || !sessionId || !myUserId) return;

    let cancelled = false;
    joinedHydratedRef.current = false;

    // Hydrate current server state (pen holder + last-persisted design) on join.
    apiClient.getDesignSession(sessionId)
      .then((s) => {
        if (cancelled || !s) return;
        setSession(s);
        setHolderUserId(s.editor_user_id ?? null);
        // Apply the room's current design once, unless I'm the pen holder (I'm the source).
        if (!joinedHydratedRef.current && s.design_snapshot && s.editor_user_id !== myUserId) {
          joinedHydratedRef.current = true;
          applyingRemoteRef.current = true;
          try { loadDesign(s.design_snapshot); } catch (e) { console.error('[codesign] hydrate failed', e); }
        }
      })
      .catch((e) => setError(e?.message ?? 'Failed to load session'));

    const channel = supabase.channel(`session:${sessionId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'design:update' }, ({ payload }) => {
      if (!payload?.design) return;
      // Coalesce bursts: keep only the LATEST design and apply it once per animation frame.
      // A full loadDesign → re-render → 3D rebuild is heavy; without this, a slow receiver
      // queues every message and drifts seconds behind. Dropping superseded frames keeps it
      // current (the final state always arrives, since the newest wins).
      const r = remoteRef.current;
      r.pending = payload.design;
      if (r.raf) return;
      r.raf = requestAnimationFrame(() => {
        r.raf = 0;
        const d = r.pending; r.pending = null;
        if (!d) return;
        applyingRemoteRef.current = true;
        try { loadDesign(d); } catch (e) { console.error('[codesign] apply remote failed', e); }
      });
    });

    channel.on('broadcast', { event: 'control' }, ({ payload }) => {
      setHolderUserId(payload?.editor_user_id ?? null);
    });

    const syncPresence = () => {
      const state = channel.presenceState();
      const list = Object.values(state).flat().map((p) => ({ userId: p.userId, role: p.role, name: p.name }));
      setParticipants(list);
    };
    channel.on('presence', { event: 'sync' }, syncPresence);
    channel.on('presence', { event: 'join' }, syncPresence);
    channel.on('presence', { event: 'leave' }, syncPresence);

    channel.subscribe(async (status) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        try { await channel.track({ userId: myUserId, role, name: displayName }); } catch { /* presence best-effort */ }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnected(false);
      }
    });

    return () => {
      cancelled = true;
      setConnected(false);
      if (throttleRef.current.timer) { clearTimeout(throttleRef.current.timer); throttleRef.current.timer = null; }
      if (persistRef.current.timer) { clearTimeout(persistRef.current.timer); persistRef.current.timer = null; }
      if (remoteRef.current.raf) { cancelAnimationFrame(remoteRef.current.raf); remoteRef.current.raf = 0; }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [live, sessionId, myUserId, supabase, apiClient, role, displayName, loadDesign]);

  // ── Broadcast my design while I hold the pen ─────────────────────────────────
  useEffect(() => {
    if (!live || !connected || !isEditor) return;
    // A design change caused by applying a REMOTE update must not be echoed back.
    if (applyingRemoteRef.current) { applyingRemoteRef.current = false; return; }

    const t = throttleRef.current;
    t.pending = design;
    const send = () => {
      t.last = Date.now();
      t.timer = null;
      const d = t.pending; t.pending = null;
      channelRef.current?.send({ type: 'broadcast', event: 'design:update', payload: { design: d } });
      schedulePersist(d);
    };
    const elapsed = Date.now() - t.last;
    if (elapsed >= BROADCAST_THROTTLE_MS) {
      send();
    } else if (!t.timer) {
      t.timer = setTimeout(send, BROADCAST_THROTTLE_MS - elapsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, live, connected, isEditor]);

  // Persist the design to the API for durability (debounced) — hydrates late joiners / survives reload.
  const schedulePersist = useCallback((d) => {
    if (!apiClient?.putDesignSessionDesign || !sessionId) return;
    if (persistRef.current.timer) clearTimeout(persistRef.current.timer);
    persistRef.current.timer = setTimeout(() => {
      apiClient.putDesignSessionDesign(sessionId, d).catch(() => {});
    }, PERSIST_DEBOUNCE_MS);
  }, [apiClient, sessionId]);

  // ── Lifecycle + pen actions ──────────────────────────────────────────────────
  const start = useCallback(async ({ customerId = null, orderId = null } = {}) => {
    if (!hasSessionApi(apiClient)) return null;
    const s = await apiClient.createDesignSession({ design, customer_id: customerId, order_id: orderId });
    setSession(s);
    setHolderUserId(s.editor_user_id ?? null);
    setSessionId(s.id);
    return s;
  }, [apiClient, design]);

  const applyPen = useCallback(async (action, to) => {
    if (!sessionId || !apiClient?.penDesignSession) return;
    const s = await apiClient.penDesignSession(sessionId, { action, to });
    setSession(s);
    setHolderUserId(s.editor_user_id ?? null);
    channelRef.current?.send({ type: 'broadcast', event: 'control', payload: { editor_user_id: s.editor_user_id ?? null } });
  }, [sessionId, apiClient]);

  const takePen = useCallback(() => applyPen('take'), [applyPen]);
  const releasePen = useCallback(() => applyPen('release'), [applyPen]);
  const grantPen = useCallback((toUserId) => applyPen('grant', toUserId), [applyPen]);

  const end = useCallback(async () => {
    if (!sessionId || !apiClient?.endDesignSession) return;
    // Flush the final design before closing so the persisted snapshot is current.
    try { if (apiClient.putDesignSessionDesign) await apiClient.putDesignSessionDesign(sessionId, design); } catch { /* best-effort */ }
    const s = await apiClient.endDesignSession(sessionId);
    setSession(s);
    setSessionId(null);
    setConnected(false);
  }, [sessionId, apiClient, design]);

  return {
    live,
    sessionId,
    session,
    connected,
    participants,
    holderUserId,
    myUserId,
    isEditor,
    error,
    start,
    end,
    takePen,
    releasePen,
    grantPen,
  };
}
