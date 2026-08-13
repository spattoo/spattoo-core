import { Section, Field, Toggle } from './controls.jsx';

// ── "Which dietary options do you deal in?" ───────────────────────────────────
// Its own module rather than another block pasted inside FlavoursPanel: it answers a
// different question (what this bakery deals in AT ALL) from the flavour list it sits
// beside (which flavours, and what each can't be made as), and screens grow by
// accretion until nobody can find anything.
//
// Rendered inside Settings → Flavours because a baker thinks of both as one question —
// "what can we make?" — and a second top-level destination for six toggles would be
// worse than a second section on one screen.
//
// ── THE TWO KINDS DO DIFFERENT THINGS, AND THE UI MUST SAY SO ─────────────────
// Turning a DIET option off hides it from customers. Turning an ALLERGEN off does NOT
// hide it — the customer can still say they need nut-free, it is still recorded, and
// they simply see that this bakery can't guarantee it. If the copy here doesn't make
// that plain, a baker will switch nut-free off believing they will never be asked
// again, and be blindsided the first time an order arrives carrying it.
export default function DietaryOptionsSection({ options, excluded, onToggle, isMobile }) {
  if (!options?.length) return null;

  const groups = [
    {
      kind: 'diet',
      title: 'Diet options you offer',
      hint: "Turn off anything you don't do. Customers won't see it when they order.",
    },
    {
      kind: 'allergen',
      title: 'Allergies you can cater to',
      hint: "Turn off anything you can't guarantee. Customers can still tell you about an allergy — it stays on the order and reaches your kitchen — they'll just see that you can't guarantee it, so nobody finds out on the day.",
    },
  ];

  return (
    <Section title="Dietary options">
      {groups.map(g => {
        const rows = options.filter(o => o.kind === g.kind);
        if (!rows.length) return null;
        return (
          <Field key={g.kind} label={g.title} hint={g.hint}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              {rows.map((o, i) => {
                const on = !excluded.has(o.key);
                return (
                  <div key={o.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: isMobile ? '12px 0' : '10px 0',
                    borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: on ? '#2C4433' : '#9CA3AF' }}>
                        {o.label}
                      </div>
                      {/* Said out loud on the row itself, not only in the group hint —
                          this is the line that stops a baker mis-reading the switch. */}
                      {!on && (
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                          {o.kind === 'allergen'
                            ? "Shown to customers as “can't guarantee” — still recorded if they ask"
                            : 'Hidden from customers'}
                        </div>
                      )}
                    </div>
                    <Toggle checked={on} onChange={() => onToggle(o.key)} />
                  </div>
                );
              })}
            </div>
          </Field>
        );
      })}
    </Section>
  );
}
