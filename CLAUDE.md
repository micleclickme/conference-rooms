# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GNOME Shell extension (UUID `conference-rooms@micleclickme.github.io`) targeting Shell 46–48. Runtime is **GJS, not Node.js** — there is no `package.json`, no `npm`. All JS runs under `gjs` as ES modules.

## Commands

All workflows go through the `Makefile`:

- `make test` — unit tests via `gjs -m tests/run.js`. Only imports pure modules from `lib/` (no Shell/GTK).
- `make all` — compile GSettings schema + `.mo` translations (required before `install`/`pack`).
- `make schemas` / `make mo` / `make pot` — individual steps.
- `make install` — copies files to `~/.local/share/gnome-shell/extensions/$(UUID)`. Must be run on a host with GNOME Shell; enable with `gnome-extensions enable conference-rooms@micleclickme.github.io` then restart the Shell (X11: Alt+F2 → `r`; Wayland: log out/in).
- `make pack` — produces the EGO-upload zip. The zip's file list is hard-coded in the Makefile — new top-level files/dirs are NOT included automatically, update the `pack` rule.
- `make docker-{build,test,pack,shell}` — same, inside `debian:trixie-slim` via `docker-compose.yml`. UID/GID pass-through keeps mounted files owned by the host user. The container cannot install or smoke-test the extension (no running Shell).

Run a single test: there is no `-k`/filter flag — `tests/run.js` imports test files directly. Edit `tests/run.js` to comment out entries, or invoke a single file with `gjs -m tests/<file>.test.js` (ensure it imports `harness.js` and calls `summary()` if run standalone).

Smoke-test checklist before release: `docs/smoke-test.md`. Release = push a `v*` tag; `.github/workflows/build.yml` builds, tests, and attaches the zip to a GitHub Release.

## Architecture

### Two-process split — do not cross the boundary

This is the most load-bearing constraint in the codebase.

- **`extension.js`** runs **inside `gnome-shell`**. It may import `gi://St`, `gi://Clutter`, `gi://Shell`, `gi://Meta`, and `resource:///org/gnome/shell/...` modules. Files reachable from it: `lib/indicator.js`, `lib/roomRow.js`, `lib/hotkeys.js`, `lib/clipboard.js`, `lib/launcher.js`.
- **`prefs.js`** runs in a **separate GTK4/Adwaita process** spawned by `gnome-extensions prefs`. It may import `gi://Adw`, `gi://Gtk`, `gi://Gdk`, `gi://Gio`, `gi://GObject`, and `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`. It **must not** import anything from `resource:///org/gnome/shell/...` or `gi://St`/`gi://Clutter`/`gi://Shell`/`gi://Meta` — those only exist inside the Shell.
- **Shared pure modules** (`lib/rooms.js`, `lib/i18n.js`, `lib/launcher.js`) must stay free of Shell- and GTK-specific imports so both sides (and the test harness) can use them. `rooms.js` currently depends only on `gi://GLib`, which exists everywhere.

If you add code that touches St/Clutter/PopupMenu, it belongs on the extension side. If it touches Adw/Gtk, it belongs in prefs. Putting either into a shared `lib/` module that the other side imports will crash the other process at load time.

### Persistent state lives in GSettings

Schema: `schemas/org.gnome.shell.extensions.conference-rooms.gschema.xml`. Three keys:

- `rooms` (`as`) — array of JSON strings `{id, name, url, hotkey}`. The strv-of-JSON shape is deliberate: GSettings has no native list-of-dict type, and each room needs a stable `id` that survives reordering. Serialize/parse **only** via `lib/rooms.js` (`serializeRoom`, `parseRoom`, `parseAll`). `parseAll` never throws — corrupt entries land in `errors` so the UI can surface them without the whole list failing.
- `open-command` (`s`) — shell command template, `%U` is the URL. If `%U` is absent the URL is appended as the last arg. See `lib/launcher.js` (`splitCommand`, `substituteUrl`).
- `popup-hotkey` (`as`) — GTK accelerator strv (empty = disabled).

After editing the schema: `make schemas` (or restart Shell after `make install`).

### Hotkeys: two mechanisms, one dispatcher

`lib/hotkeys.js` registers two kinds of shortcuts:

1. **Popup toggle** — `Main.wm.addKeybinding(POPUP_BINDING, settings, …)`. This path requires a schema-backed key, which is why `popup-hotkey` is a schema key.
2. **Per-room shortcuts** — `global.display.grab_accelerator(...)` + `Main.wm.allowKeybinding(...)`. Used because per-room hotkeys are stored inside the `rooms` strv, not as individual schema keys. Dispatch happens in the single `accelerator-activated` handler, looking up the action id in `_roomActions`.

Both paths notify the user (and log) on grab failure; conflict notifications are deduped per `(accel, name)` in `_conflictsNotified`. `rebind()` is called on any `rooms` or `popup-hotkey` change.

### i18n

`po/*.po` → `locale/<lang>/LC_MESSAGES/conference-rooms.mo`. `make pot` extracts with `xgettext` from all `*.js` except `tests/` and `locale/`. Two conventions to preserve:

- Pure modules that need to return user-facing messages mark strings with `N_()` (from `lib/i18n.js`) so `xgettext` picks them up; the caller at the display site translates with `_()`. Don't call `_()` inside `lib/rooms.js` / `lib/launcher.js` — there is no gettext binding available there.
- Use `format2(template, a, b)` from `lib/i18n.js` for two-`%s` templates. Native `String.replace` with a global flag would substitute into the first placeholder the value containing a second `%s`; this helper does two non-global replacements.

### Test harness

Hand-rolled: `tests/harness.js` exposes `describe/it/assertEqual/assertTrue/assertFalse/assertThrows` + `summary()`. No Node, no Mocha. Tests import the real `lib/` modules — so tested modules must stay pure (currently `rooms.js`, `launcher.js`). If you want to test a Shell-dependent module, extract the pure logic into a new `lib/` file first.

## Gotchas

- **Dockerised dev cannot smoke-test.** Container has `gjs`/`glib-compile-schemas`/`gettext` but no running Shell. Flow is: iterate in container (`make docker-test`, `make docker-pack`), then `make install` on the host.
- **Pack file list is explicit.** If you add e.g. a new top-level asset dir, update both the `install` and `pack` targets in the Makefile and re-test the zip.
- **Service icons** are matched by URL heuristics in `detectService` (`lib/rooms.js`). Adding a new service = new host match here + new `<service>-symbolic.svg` under `icons/` + map entries in `lib/roomRow.js` `SERVICE_ICONS` and in `prefs.js` `_buildRoomsGroup`. Keep the three in sync.
- **License header.** Every new `.js` file starts with `// SPDX-License-Identifier: GPL-2.0-or-later` (project is GPL-2.0-or-later, `COPYING`).
