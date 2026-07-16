# Chapter 6: The Design System

Aisle Finder has a deliberately small visual language, enforced by a handful
of hard rules. This chapter explains the token system and the rules — read
it before writing any UI code. The visual reference lives at
`docs/design-rules.html`; keep that file in sync with any theme change.

## 6.1 Design tokens: the `--af-*` CSS variables

Every color in the app flows through **CSS custom properties** defined once
in the shell (`src/AisleFinder.jsx`). Components never contain hex values —
they say *what role* a color plays, not what it is:

```jsx
// in any component
background: 'var(--af-surface)',
color: 'var(--af-text-muted)',
```

The core palette is nine colors per scheme:

```css
:root {
  --af-bg: #ffffff;          /* page background */
  --af-surface: #f5f7f5;     /* cards, panels */
  --af-border: #e2e8e3;
  --af-text: #24312a;
  --af-text-muted: #68746c;
  --af-green: #27ae60;       /* the brand color — primary actions */
  --af-green-dark: #157a40;  /* hover states, emphasis */
  --af-amber: #ffc439;       /* the one accent — highlights, stars */
  --af-error-text: #b3541e;
}
```

Everything else is **derived** — either an alias
(`--af-focus: var(--af-green)`) or an alpha tint
(`--af-highlight-bg: rgba(39, 174, 96, 0.07)`). This is the discipline that
keeps the palette coherent: new UI needs zero new colors, and a rebrand
would touch nine lines.

## 6.2 Dark mode for free

Because components only reference variables, dark mode is a single media
query that redefines them:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --af-bg: #121412;
    --af-surface: #1e231f;
    --af-text: #e7ece8;
    --af-green: #3fd07f;        /* brighter — dark backgrounds eat saturation */
    --af-green-dark: #8fe6b4;   /* note: *lighter* in dark mode — it means "emphasis" */
    --af-error-text: #ffab70;
    /* ... */
  }
}
```

`prefers-color-scheme` follows the OS setting — no toggle, no JavaScript, no
storage. Two details worth noticing: dark-mode greens are *brighter* (dark
surfaces mute color, so you compensate), and `--af-green-dark` is actually
lighter than `--af-green` in dark mode — the token names a *role*
(emphasis), not a literal darkness. This is why components must never
"correct" a color locally: any hardcoded hex is guaranteed wrong in one of
the two schemes.

## 6.3 The rules

These are project law (see `CLAUDE.md` and `docs/design-rules.html`):

1. **Green-only palette + amber accent.** No blues, no new hues. If a
   design feels like it needs another color, it needs a different design.
2. **No gradients in UI.** The logo (`src/components/Logo.jsx`,
   `public/logo.svg` — the green shelf-"A" monogram) is the single
   exception.
3. **Never hardcode a hex in a component.** Use a `--af-*` variable; if no
   existing token fits, derive one in the shell's theme block (alias or
   alpha tint of the core nine) — in both schemes.
4. **Font Awesome icons, never emojis.** Icons come from a Font Awesome Kit
   script loaded in `public/index.html`. Use older icon names — `fa-cog`,
   not `fa-gear` — because the kit may not include newer aliases (a missing
   alias renders as blank space, not an error).
5. **Font is Arial, set once** on the shell in `AisleFinder.jsx`. Components
   use `fontFamily: 'inherit'` or nothing at all.

## 6.4 Component idioms

The styling itself is inline `style` objects (no CSS framework), with a few
established patterns:

**Hover effects** are inline handlers, since inline styles can't express
`:hover`:

```jsx
<button
  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--af-green-dark)'; }}
  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--af-green)'; }}
>
```

Use `e.currentTarget` (the element the handler is attached to), **not**
`e.target` — on a button containing an icon and text, `e.target` is
whichever child the mouse touched, and the hover style lands on the wrong
element.

**Keyframe animations** are injected with a plain `<style>` tag in the
shell. Not `<style jsx>` — that's a Next.js feature, and this is CRA; the
`jsx` attribute is silently ignored and the styles break in confusing ways.

**Buttons need visible affordances** — icon-only buttons have shipped
looking invisible before; give buttons a text label and real padding.

## 6.5 Keeping it enforced

The system only works if every change goes through it. When you add UI:

- grep your diff for `#` colors before committing — the only hexes in
  `src/` should be in the shell's theme block;
- check both schemes (macOS: System Settings → Appearance, or the browser
  devtools emulation toggle);
- if you touched the theme block, update `docs/design-rules.html` to match.

## TODOs when adding new UI

- [ ] **Open the visual reference** — `open docs/design-rules.html`
- [ ] **Pick tokens, not colors** — reuse an existing `--af-*` var; derive a
      new one in both light and dark blocks only if truly needed
- [ ] **Icons**: Font Awesome classic names only (`fa-cog` not `fa-gear`);
      no emojis anywhere in the UI
- [ ] **Hover**: `onMouseEnter`/`onMouseLeave` with `e.currentTarget`
- [ ] **Verify in dark mode** before calling it done
- [ ] **Sync `docs/design-rules.html`** if the theme block changed

---

Next: [Chapter 7 — Web Deployment](07-web-deployment.md)
