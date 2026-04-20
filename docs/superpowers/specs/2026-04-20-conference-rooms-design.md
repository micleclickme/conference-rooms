# Conference Rooms — GNOME Shell extension design

**Date:** 2026-04-20
**Target:** GNOME Shell 46+ (GJS ESM)
**UUID:** `conference-rooms@mdanuschenkov`

## Goal

A GNOME Shell extension that keeps a list of persistent conference room links (Google Meet, Jitsi Meet including self-hosted servers) in a panel popup. One click opens a room in the configured browser/command; a secondary button copies the URL. Per-room and global hotkeys are supported.

Reference: [GMeet extension](https://extensions.gnome.org/extension/6622/gmeet/) — single-room prototype; this design generalises it to multiple rooms and services.

## Requirements (agreed)

- Persistent list of conference room links.
- Click a room to open it.
- Next to each room, a copy-link button.
- Support Google Meet, Jitsi Meet (incl. custom self-hosted servers). Service is auto-detected by URL host — purely for the row icon.
- Panel indicator with popup menu is the primary UI.
- Global hotkey to toggle popup, plus optional per-room hotkeys to open a room directly.
- Rooms added via a URL + display name; prefs does not force structured input.
- Copy feedback is silent (no notification); the copy button briefly switches to a checkmark.
- Opening uses a user-configurable command template (default `xdg-open %U`).
- Manual ordering of rooms in prefs (up/down buttons).
- Static panel icon (`call-start-symbolic`). No badge.
- i18n: English source strings, Russian translation via gettext (`po/ru.po`).

## Architecture

### File layout

```
conference-rooms@mdanuschenkov/
├── metadata.json              # UUID, name, shell-version: ["46","47","48"]
├── extension.js               # enable/disable; owns Indicator + HotkeyManager
├── prefs.js                   # ExtensionPreferences subclass; Adw.PreferencesWindow
├── stylesheet.css
├── lib/
│   ├── indicator.js           # PanelMenu.Button + popup rebuild
│   ├── roomRow.js             # PopupBaseMenuItem with inline open/copy
│   ├── rooms.js               # JSON ↔ Room, URL validation, canonicalization, service detect
│   ├── hotkeys.js             # Main.wm.addKeybinding lifecycle, relocatable settings
│   ├── launcher.js            # command template parsing, Gio.Subprocess spawn
│   └── clipboard.js           # St.Clipboard helper
├── schemas/
│   ├── org.gnome.shell.extensions.conference-rooms.gschema.xml
│   └── gschemas.compiled
├── po/
│   ├── conference-rooms.pot
│   └── ru.po
├── locale/                    # compiled .mo produced by Makefile
├── icons/                     # symbolic SVGs: google-meet, jitsi, generic (with fallback)
└── Makefile                   # build, install, pot, mo, zip targets
```

### Lifecycle

- `enable()` creates `Indicator` (panel button + popup) and `HotkeyManager`; both read the same `Gio.Settings`.
- `settings.connect('changed::rooms', …)` triggers `Indicator.rebuild()` and `HotkeyManager.rebind()`. `changed::popup-hotkey` triggers only `HotkeyManager.rebind()`.
- `disable()` destroys the indicator, removes every keybinding, disconnects every settings signal, cancels pending `GLib.timeout_add` sources, nulls references. Nothing persists across disable — EGO review requirement.

### Module boundaries

Pure modules (`rooms.js`, `launcher.js`) are side-effect-free and unit-testable under a bare `gjs` runner. Shell-coupled modules (`indicator.js`, `roomRow.js`, `hotkeys.js`, `clipboard.js`) are covered by a manual smoke checklist.

## Data model

### In-memory Room

```js
{
  id: string,       // UUID v4, stable across edits
  name: string,     // display name
  url: string,      // canonicalized: https:// prefix, no trailing slash, no fragment
  hotkey: string    // GTK accelerator ("<Super>m"); "" means no hotkey
}
```

### GSettings schema

`org.gnome.shell.extensions.conference-rooms`:

| key              | type | default          | description                                                      |
|------------------|------|------------------|------------------------------------------------------------------|
| `rooms`          | `as` | `[]`             | JSON-serialized Room objects; array order = popup order          |
| `open-command`   | `s`  | `xdg-open %U`    | Command template; `%U` is replaced with the URL                  |
| `popup-hotkey`   | `as` | `["<Super>m"]`   | `addKeybinding` requires strv; empty array disables the hotkey   |
| `schema-version` | `i`  | `1`              | Reserved for future migrations                                   |

Rationale for JSON-in-strv over relocatable schemas: fewer rooms in practice (tens, not thousands), JSON is readable via `dconf`, and the prefs UI writes the whole array atomically on every mutation. A schema-version key keeps the door open for migration if the model grows.

### Per-room hotkey storage

`Main.wm.addKeybinding` requires a GSettings key of type `as`. Since rooms are user-created at runtime, per-room bindings use a relocatable schema:

```xml
<schema id="org.gnome.shell.extensions.conference-rooms.room-hotkey">
  <key name="binding" type="as"><default>[]</default></key>
</schema>
```

`HotkeyManager` creates a `Gio.Settings` instance at path `/org/gnome/shell/extensions/conference-rooms/hotkeys/<room.id>/` for every room with a non-empty `hotkey`, writes `[hotkey]` into its `binding` key, and registers the keybinding using that relocatable settings object. This is the only relocatable surface in the codebase and is isolated in `hotkeys.js`.

### URL canonicalization and validation

On save in prefs:
- Trim whitespace.
- If no scheme → prepend `https://`.
- Parse with `GLib.Uri.parse(..., GLib.UriFlags.NONE)` in STRICT mode.
- Whitelist `http` / `https`.
- Drop `fragment`.
- Strip trailing `/` of the path.

Failures surface inline in the prefs dialog (red EntryRow + message, Save disabled). Corrupt JSON in existing `rooms` strv (from dconf edits) surfaces as an error-styled row with disabled edit actions — not silently dropped, to let the user repair it.

### Service detection

Used only to pick a row icon. Rules applied in order, first match wins:

1. host equals `meet.google.com` → `meet`
2. host contains substring `jitsi` (case-insensitive) → `jitsi`
3. path matches `^/[A-Za-z0-9._-]+/?$` and URL has no query string → `jitsi` (typical self-hosted pattern like `https://call.example.com/standup`)
4. otherwise → `generic`

Misdetection is harmless — the room still opens; only the row icon changes. Missing icon files fall back to `call-start-symbolic`.

## UI

### Indicator

`PanelMenu.Button` subclass. Panel icon: `call-start-symbolic` with `style_class: 'system-status-icon'`. `rebuild()` removes every menu child and rebuilds from `settings.get_strv('rooms')`. Structure:

```
[RoomRow × N]
──── separator ────
Preferences…
```

Empty state: a single `PopupMenuItem` reading `"No rooms configured. Click to open preferences."` that opens prefs on activation.

### RoomRow

`PopupBaseMenuItem` subclass. Layout:

```
┌─────────────────────────────────────────────────────┐
│ [icon] Standup              <Super>1     [copy]      │
└─────────────────────────────────────────────────────┘
  ← open-area (activates whole row) →      ← button →
```

- Contents: `St.BoxLayout` (horizontal, x_expand: true) with service icon, name label (expand), optional accelerator label, and `St.Button` holding `edit-copy-symbolic`.
- Activating the row (click / Enter) calls `Launcher.open(room)` and `menu.close()`.
- The copy button handles its own `button-press-event` and returns `Clutter.EVENT_STOP` so the parent row does not activate. Likewise for `key-press-event` on Space/Return when focus is on the button. Copy: `Clipboard.set(room.url)` then swap the icon to `emblem-ok-symbolic` for 1000 ms via `GLib.timeout_add`. The timeout id is stored on the button and cleared on re-click to avoid overlapping timers. The button does not close the menu.
- Keyboard: TAB moves focus between open-area and copy-button.

### Styles

```css
.conf-room-row { spacing: 8px; padding: 4px 8px; }
.conf-room-icon { icon-size: 16px; }
.conf-room-name { min-width: 180px; }
.conf-room-accel { color: rgba(255,255,255,0.5); font-size: 0.9em; }
.conf-room-copy-button { padding: 2px; border-radius: 4px; }
.conf-room-copy-button:hover { background-color: rgba(255,255,255,0.1); }
.conf-room-copy-button-ok StIcon { color: #4ade80; }
```

### Preferences

`prefs.js` returns a subclass of `ExtensionPreferences` with `fillPreferencesWindow(window)`. One `Adw.PreferencesPage`, two groups.

**General group.**

- `Adw.EntryRow` bound to `open-command` via `settings.bind(..., Gio.SettingsBindFlags.DEFAULT)`.
- `Adw.ActionRow` for `popup-hotkey` showing the current accelerator as a label, with a `Set…` button that opens an `Adw.Dialog` using `Gtk.ShortcutController` in capture mode. Esc clears; Enter saves.

**Rooms group.**

- Header suffix: `＋` button opens RoomDialog in create mode.
- Each room → `Adw.ActionRow`: service icon, title = name, subtitle = URL (elided), suffix = accelerator label (if any) plus four flat icon buttons `↑ ↓ ✎ ✕`. End buttons disabled at list boundaries.
- `✕` opens `Adw.AlertDialog` for confirmation.

**RoomDialog (`Adw.Dialog`).**

- Name: `Adw.EntryRow`, required, trimmed.
- URL: `Adw.EntryRow`, validated per the rules in *Data model → URL canonicalization*.
- Hotkey: `Adw.ActionRow` with capture widget + clear button. Rejects accelerators without at least one of `<Super>/<Ctrl>/<Alt>/<Shift>`. Checks for collisions with other rooms and with `popup-hotkey` inside the prefs list; shows an inline error and disables Save when a collision exists.
- Save replaces the full `rooms` strv in one `set_strv` call. The single `changed::rooms` signal drives the indicator rebuild and the hotkey rebind.

Prefs keeps a local array of parsed Room objects; every user operation (add / edit / delete / reorder) mutates the array and then writes it back whole.

### Launcher

`launcher.js` parses `open-command` with `GLib.shell_parse_argv` (handles quoted args). Substitution: replace the first element equal to `%U` with the URL; if no `%U` token exists, append the URL. Spawn via `Gio.Subprocess.newv(argv, Gio.SubprocessFlags.NONE)`, flags set so Shell does not wait. Spawn failures surface as `Main.notify('Conference Rooms', 'Failed to open: <message>')` plus a `console.error` log.

### Hotkey lifecycle

- `enable()` subscribes to `changed::rooms` and `changed::popup-hotkey`, then calls `bindAll()`.
- `bindAll()` calls `unbindAll()`, registers `popup-hotkey` (if non-empty), then iterates rooms: for each room with a hotkey, create/update its relocatable settings and register its binding. Handler closes over `room.id` and calls `Launcher.openById(id)`.
- Full rebuild on every change is intentional — the room count is small and correctness beats diff complexity.
- `unbindAll()` removes every registered binding name, writes `[]` into each relocatable binding key before deregistering (keeps dconf tidy), and drops references.
- `disable()` calls `unbindAll()` and disconnects settings signals.

### i18n

All user-visible strings pass through `_()`. `xgettext` via Makefile target `pot` produces `po/conference-rooms.pot`; `ru.po` is maintained alongside. Make target `mo` compiles to `locale/<lang>/LC_MESSAGES/conference-rooms.mo`. `extension.js` calls `this.initTranslations()` in `enable()`; `prefs.js` equivalently.

## Error handling

| Situation                                  | Behavior                                                                                         |
|--------------------------------------------|--------------------------------------------------------------------------------------------------|
| Corrupt JSON in one `rooms` element        | Skip that element, `console.warn`. Prefs shows it as an error row with disabled edit actions.    |
| Empty `open-command`                       | Fall back to `xdg-open %U`, `console.warn`.                                                      |
| `open-command` without `%U`                | Append URL as last argv element.                                                                 |
| `Gio.Subprocess.newv` throws               | `Main.notify` with error; `console.error`.                                                       |
| Invalid URL on open                        | `Main.notify` with room name; do not spawn.                                                      |
| `Main.wm.addKeybinding` returns `-1`       | One-shot `Main.notify` per conflict at bind time; `console.warn`. Room stays visible, no bind.   |
| `St.Clipboard.set_text` failure            | Ignore; do not show the checkmark.                                                               |
| Corrupt JSON row in prefs                  | Error CSS class on row, edit disabled; other rows unaffected.                                    |

Every pending `GLib.timeout_add` stores its source id and is removed on destroy. Every signal connection is tracked and disconnected in `disable()`.

## Testing

### Unit (`gjs -m tests/run.js`)

`rooms.test.js`:
- `canonicalizeUrl` — https prefix addition, trailing-slash stripping, fragment removal.
- `validateUrl` — rejects `file://`, `javascript:`, empty.
- `detectService` — `meet.google.com` → `meet`; `jitsi.example.com` → `jitsi`; random → `generic`.
- `parseAll` — a broken JSON element does not drop the rest.

`launcher.test.js`:
- `splitCommand('xdg-open %U')` → `['xdg-open', '%U']`.
- `substituteUrl(['xdg-open', '%U'], url)` → `['xdg-open', url]`.
- `substituteUrl(['firefox', '--new-window'], url)` → `['firefox', '--new-window', url]`.
- Quoted args: `chromium --app="%U"` splits and substitutes correctly.

### Manual smoke checklist (`docs/smoke-test.md`)

Run before each release:

1. Install, `gnome-extensions enable conference-rooms@mdanuschenkov`, restart Shell (X11) or log out (Wayland).
2. Panel icon appears; click → popup shows "No rooms configured".
3. Open prefs, add a Google Meet room → popup updates without restart.
4. Click a room → browser opens the correct URL.
5. Click the copy button → popup stays open, icon flips to checkmark for ~1 s, clipboard holds the URL.
6. Assign a hotkey; popup-hotkey and room hotkey work in both NORMAL and OVERVIEW action modes.
7. Assign a conflicting hotkey → receive a conflict notification.
8. Delete a room → it disappears from popup, its hotkey stops responding.
9. Change `open-command` to `firefox --new-window %U` → rooms open in Firefox.
10. `gnome-extensions disable` then `enable` → no warnings in `journalctl --user -f /usr/bin/gnome-shell`, everything still works.

### Lint

ESLint with `eslint-config-gjs` as a cheap static net. Optional.

## Out of scope (v1)

- Calendar integration (GNOME Calendar / Evolution / ICS).
- Zoom, Teams, BBB support (model accommodates them if added later — just URL-based services).
- Drag-and-drop reordering (up/down buttons suffice).
- Count badge / dynamic indicator.
- Telemetry / analytics.
- Sync across machines (GSettings already does this via GNOME account sync when enabled).
