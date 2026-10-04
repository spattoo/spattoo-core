import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── A baker choosing what their own rail is made of ─────────────────────────────────────────────
 *
 * Sandeep: "i actually want to build this as a setting a baker can choose... let this be from blaze
 * tier and above only."
 *
 * ⚠️ THE RISK IS NOT THE FEATURE, IT IS THE ROWS. A skin is master data so an admin can add a look
 * without a deploy — and the rail's labels are 9px sitting ON that look, so whoever picks the
 * colours is deciding whether navigation can be read. A mid oak tried on 2026-10-04 looked exactly
 * like wood and measured 2.61 : 1 against a 4.5 floor, with every gate green.
 *
 * spattoo-api owns the arithmetic (lib/railSkin.js, check:rail-skins, and the same formula re-run on
 * the write path for rows the gate never saw). What is pinned HERE is the client half: that it does
 * not re-decide entitlement, that the default survives a silent host, and that the rail draws from
 * the row rather than from anything typed in.
 */
const designer = readFileSync(new URL('../designer/CakeDesigner.jsx', import.meta.url), 'utf8');
const section  = readFileSync(new URL('./RailSkinSection.jsx', import.meta.url), 'utf8');
const panel    = readFileSync(new URL('./SettingsPanel.jsx', import.meta.url), 'utf8');

describe('the client does not re-decide who may have a skin', () => {
  /* `served` arrives already resolved against the entitlement. Resolving it again here would be a
     second copy of a billing rule, and the quieter one — the copy that keeps working after the
     first is changed. */
  it('draws what the server served, and never consults a plan', () => {
    expect(designer).toMatch(/const row = \(r\?\.skins \?\? \[\]\)\.find\(sk => sk\.key === r\?\.served\)/);
    expect(designer).not.toMatch(/railSkin[\s\S]{0,200}entitlements/i);
  });

  it('keeps the default when the host cannot answer', () => {
    expect(designer).toMatch(/const \[railSkin, setRailSkin\] = useState\(DEFAULT_RAIL_SKIN\)/);
    expect(designer).toMatch(/if \(!apiClient\?\.fetchRailSkins\) return;/);
    // A row the list does not contain is a server and a client disagreeing — draw the default
    // rather than half a look.
    expect(designer).toMatch(/setRailSkin\(row \? \{ \.\.\.DEFAULT_RAIL_SKIN, \.\.\.row \} : DEFAULT_RAIL_SKIN\)/);
  });
});

describe('the rail is drawn from the row', () => {
  it('takes its gradient, its joint and its ink from the skin', () => {
    expect(designer).toMatch(/function SpatulaFrame\(\{ lifted = false, skin = DEFAULT_RAIL_SKIN \}\)/);
    expect(designer).toMatch(/skin\.stops\.map/);
    expect(designer).toMatch(/skin\.joint_at == null/);
    expect(designer).toMatch(/color: active \? railSkin\.ink_active : railSkin\.ink/);
  });

  /* ⚠️ A KEY, NOT A NAME (rule 2). The renderer switches on `texture`; it must never ask which skin
     it is drawing, or a fourth look means editing conditions scattered through the paint. */
  it('switches on the texture key, never on the skin name', () => {
    expect(designer).toMatch(/skin\.texture !== 'grain'/);
    expect(designer).not.toMatch(/skin\.key === '(walnut|slate|chrome)'/);
  });

  // Seeded in code AND in the migration on purpose: a default that lives only in a database is a
  // rail with no colour until a network call returns.
  it('has a default that does not need the network', () => {
    expect(designer).toMatch(/const DEFAULT_RAIL_SKIN = \{/);
    expect(designer).toMatch(/stops: CHROME_STOPS\.map/);
  });
});

describe('finding it at all', () => {
  /* ⚠️ IT SHIPPED UNFINDABLE. The chooser went inside the page Settings ▸ "Orders & Delivery"
     opens, so reaching it meant opening an entry about lead times and scrolling. Sandeep: "where
     can the baker change the spatula menu? i dont see it in settins." — and it is the SAME mistake
     he caught a day earlier, when the consent trail sat under that same entry. A door is only a
     door if its label names what is behind it. */
  it('has its own entry in the Settings menu', () => {
    expect(designer).toMatch(/id: 'appearance', label: 'Menu bar'/);
    expect(designer).toMatch(/setSettingsScope\('appearance'\)/);
  });

  it('and its own scope, so that entry opens it alone', () => {
    expect(panel).toMatch(/const showAppearance = scope === 'all' \|\| scope === 'appearance';/);
    expect(panel).toMatch(/\{showAppearance && \(/);
  });

  /* A skin saves the moment it is tapped, so the page has nothing to Save — the same immediate
     contract PrivacyDataSection's actions have. A button that changes nothing on screen while
     implying the choice is unsaved is the dead-control rule with the failure hidden. */
  it('does not offer a Save button for a choice that is already saved', () => {
    expect(panel).toMatch(/\{!showAppearance \|\| showSettings \|\| showStore \? \(/);
  });
});

describe('the chooser', () => {
  /* Locked skins are SHOWN — the same call premium storefront themes make. A feature nobody below
     Blaze can see is one nobody below Blaze will ever want. */
  it('shows what Blaze would give you, rather than hiding it', () => {
    expect(section).toMatch(/const locked = sk\.is_premium && !entitled;/);
    expect(section).toMatch(/BLAZE/);
  });

  /* ⚠️ THE DIM MUST NOT REACH THE SWATCH. At 55% over a white card the walnut turned tan and the
     slate turned putty — the one thing the locked row exists to show was the one thing it hid.
     Caught by rendering it, not by reading it. */
  it('keeps a locked swatch vivid', () => {
    expect(section).not.toMatch(/opacity: locked \? 0\.55 : 1/);
    expect(section).toMatch(/color: locked \? '#9AA79F'/);
  });

  // A downgrade must not read as the app losing their choice.
  it('keeps the tick on a skin they can no longer use', () => {
    expect(section).toMatch(/const on\s+= chosen === sk\.key \|\| \(!chosen && sk\.is_default\)/);
  });
});
