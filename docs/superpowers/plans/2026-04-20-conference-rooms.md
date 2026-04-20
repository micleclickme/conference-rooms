# Conference Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GNOME Shell 46+ extension that shows a panel indicator with a popup listing configured conference rooms (Google Meet / Jitsi, incl. self-hosted), each opening via a user-configurable command and offering a copy-link button; includes global popup hotkey and optional per-room hotkeys; prefs via Libadwaita; English + Russian UI.

**Architecture:** Two Shell-lifecycle-owned objects — `Indicator` (popup UI) and `HotkeyManager` (bindings) — driven by a single `Gio.Settings`. Rooms serialize as JSON strings in an `as` strv; per-room bindings use a relocatable schema instance per room UUID. Pure modules (`rooms.js`, `launcher.js` helpers) are TDD'd via a small `gjs` harness; Shell-coupled modules are verified via a manual smoke checklist.

**Tech Stack:** GJS ESM, GNOME Shell 46 APIs, GTK4 + Libadwaita 1 (prefs), GSettings/dconf, GLib, gettext.

**Spec:** `docs/superpowers/specs/2026-04-20-conference-rooms-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `metadata.json` | Extension manifest (UUID, shell-version, gettext-domain, settings-schema) |
| `extension.js` | ESM entrypoint; `enable()`/`disable()`; owns Indicator + HotkeyManager |
| `prefs.js` | ESM prefs entrypoint; builds `Adw.PreferencesPage` (General + Rooms groups, RoomDialog) |
| `stylesheet.css` | `.conf-room-*` classes for popup rows |
| `lib/rooms.js` | Pure: canonicalizeUrl, validateUrl, detectService, serializeRoom, parseRoom, parseAll, generateId |
| `lib/launcher.js` | Pure helpers (splitCommand, substituteUrl) + runtime `open(room, command)` using `Gio.Subprocess` |
| `lib/clipboard.js` | Thin `St.Clipboard` wrapper |
| `lib/roomRow.js` | `PopupBaseMenuItem` subclass rendering one room with inline open/copy |
| `lib/indicator.js` | `PanelMenu.Button` subclass; rebuild on `changed::rooms` |
| `lib/hotkeys.js` | `Main.wm.addKeybinding` lifecycle using relocatable schema per room |
| `schemas/org.gnome.shell.extensions.conference-rooms.gschema.xml` | Main schema + relocatable `.room-hotkey` |
| `schemas/gschemas.compiled` | Generated; `.gitignore`d |
| `po/conference-rooms.pot` | Extracted source strings |
| `po/ru.po` | Russian translation |
| `locale/**/conference-rooms.mo` | Generated; `.gitignore`d |
| `icons/{google-meet,jitsi,generic}-symbolic.svg` | Service icons |
| `tests/harness.js` | Minimal describe/it/assert runner |
| `tests/run.js` | Imports every `*.test.js` and exits with pass/fail code |
| `tests/rooms.test.js`, `tests/launcher.test.js` | Unit tests |
| `Makefile` | Build (schemas, pot, mo), install, uninstall, pack (EGO zip), test |
| `docs/smoke-test.md` | Manual smoke checklist |
| `README.md` | User install + dev docs |
| `.gitignore` | `gschemas.compiled`, `locale/`, `*.mo`, `*.zip` |

---

## Task 1: Scaffold repository

**Files:**
- Create: `.gitignore`, `metadata.json`, `extension.js`, `prefs.js`, `lib/` (empty), `schemas/` (empty), `tests/` (empty), `po/` (empty), `icons/` (empty)

- [ ] **Step 1: Initialize git**

```bash
cd /home/mdanuschenkov/gnome-extension-manager
git init -b main
git config user.email "mdanuschenkov@localrent.com"
git config user.name "mdanuschenkov"
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
schemas/gschemas.compiled
locale/
*.mo
*.zip
node_modules/
.DS_Store
```

- [ ] **Step 3: Write `metadata.json`**

```json
{
  "uuid": "conference-rooms@mdanuschenkov",
  "name": "Conference Rooms",
  "description": "Panel popup with a list of conference room links (Google Meet, Jitsi, incl. self-hosted). Click to open, button to copy URL.",
  "shell-version": ["46", "47", "48"],
  "url": "https://github.com/mdanuschenkov/conference-rooms",
  "settings-schema": "org.gnome.shell.extensions.conference-rooms",
  "gettext-domain": "conference-rooms"
}
```

- [ ] **Step 4: Write placeholder `extension.js`**

```javascript
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ConferenceRoomsExtension extends Extension {
    enable() {}
    disable() {}
}
```

- [ ] **Step 5: Write placeholder `prefs.js`**

```javascript
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ConferenceRoomsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(_window) {}
}
```

- [ ] **Step 6: Create empty directories with `.gitkeep`**

```bash
mkdir -p lib schemas tests po icons docs/superpowers/plans
touch lib/.gitkeep schemas/.gitkeep tests/.gitkeep po/.gitkeep icons/.gitkeep
```

- [ ] **Step 7: Commit scaffold**

```bash
git add .gitignore metadata.json extension.js prefs.js lib schemas tests po icons docs
git commit -m "chore: scaffold conference-rooms extension"
```

---

## Task 2: Test harness

**Files:**
- Create: `tests/harness.js`, `tests/run.js`

- [ ] **Step 1: Write `tests/harness.js`**

```javascript
let passed = 0;
let failed = 0;
const failures = [];

export function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

export function it(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${name}`);
        console.log(`    ${e.message}`);
        failed++;
        failures.push({ name, error: e });
    }
}

export function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg || 'Expected'}: ${e}, got: ${a}`);
}

export function assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'Expected true');
}

export function assertFalse(cond, msg) {
    if (cond) throw new Error(msg || 'Expected false');
}

export function assertThrows(fn, msg) {
    try {
        fn();
    } catch (_) {
        return;
    }
    throw new Error(msg || 'Expected function to throw');
}

export function summary() {
    console.log(`\n${passed} passed, ${failed} failed`);
    return failed === 0 ? 0 : 1;
}
```

- [ ] **Step 2: Write `tests/run.js`**

```javascript
#!/usr/bin/env -S gjs -m
import System from 'system';
import { summary } from './harness.js';

async function main() {
    await import('./rooms.test.js');
    await import('./launcher.test.js');
    System.exit(summary());
}

main();
```

- [ ] **Step 3: Create empty test files so the runner does not fail on import**

```javascript
// tests/rooms.test.js
```

```javascript
// tests/launcher.test.js
```

- [ ] **Step 4: Verify the runner executes**

Run: `gjs -m tests/run.js`
Expected: `0 passed, 0 failed` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add minimal gjs test harness and runner"
```

---

## Task 3: Room model — canonicalizeUrl (TDD)

**Files:**
- Test: `tests/rooms.test.js`
- Create: `lib/rooms.js`

- [ ] **Step 1: Write failing tests for `canonicalizeUrl`**

Overwrite `tests/rooms.test.js`:

```javascript
import { describe, it, assertEqual } from './harness.js';
import { canonicalizeUrl } from '../lib/rooms.js';

describe('canonicalizeUrl', () => {
    it('adds https:// when scheme missing', () => {
        assertEqual(canonicalizeUrl('meet.google.com/abc'), 'https://meet.google.com/abc');
    });
    it('strips trailing slash from path', () => {
        assertEqual(canonicalizeUrl('https://meet.jit.si/standup/'), 'https://meet.jit.si/standup');
    });
    it('removes fragment', () => {
        assertEqual(canonicalizeUrl('https://meet.jit.si/foo#bar'), 'https://meet.jit.si/foo');
    });
    it('trims whitespace', () => {
        assertEqual(canonicalizeUrl('  https://meet.jit.si/foo  '), 'https://meet.jit.si/foo');
    });
    it('preserves query string', () => {
        assertEqual(canonicalizeUrl('https://meet.jit.si/foo?jwt=xyz'), 'https://meet.jit.si/foo?jwt=xyz');
    });
    it('keeps http:// if explicitly provided', () => {
        assertEqual(canonicalizeUrl('http://internal.example.com/room'), 'http://internal.example.com/room');
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `gjs -m tests/run.js`
Expected: fails with `ImportError` or similar — `canonicalizeUrl` not defined.

- [ ] **Step 3: Implement `canonicalizeUrl` in `lib/rooms.js`**

```javascript
import GLib from 'gi://GLib';

export function canonicalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    const hashIdx = s.indexOf('#');
    if (hashIdx >= 0) s = s.slice(0, hashIdx);
    const qIdx = s.indexOf('?');
    const pathPart = qIdx >= 0 ? s.slice(0, qIdx) : s;
    const queryPart = qIdx >= 0 ? s.slice(qIdx) : '';
    const trimmed = pathPart.replace(/\/+$/, (m, off) => {
        return off > 'https://'.length ? '' : m;
    });
    return trimmed + queryPart;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `gjs -m tests/run.js`
Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Add tests for `validateUrl`**

Append to `tests/rooms.test.js`:

```javascript
import { validateUrl } from '../lib/rooms.js';

describe('validateUrl', () => {
    it('accepts https URL', () => { assertEqual(validateUrl('https://meet.jit.si/x').ok, true); });
    it('accepts http URL', () => { assertEqual(validateUrl('http://x.example/y').ok, true); });
    it('rejects empty', () => { assertEqual(validateUrl('').ok, false); });
    it('rejects javascript:', () => { assertEqual(validateUrl('javascript:alert(1)').ok, false); });
    it('rejects file://', () => { assertEqual(validateUrl('file:///etc/passwd').ok, false); });
    it('rejects URL without host', () => { assertEqual(validateUrl('https://').ok, false); });
});
```

- [ ] **Step 6: Implement `validateUrl`**

Append to `lib/rooms.js`:

```javascript
export function validateUrl(url) {
    const s = String(url || '').trim();
    if (!s) return { ok: false, reason: 'URL is empty' };
    let uri;
    try {
        uri = GLib.Uri.parse(s, GLib.UriFlags.NONE);
    } catch (_) {
        return { ok: false, reason: 'Malformed URL' };
    }
    const scheme = (uri.get_scheme() || '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https')
        return { ok: false, reason: 'Only http(s) URLs are supported' };
    if (!uri.get_host())
        return { ok: false, reason: 'URL has no host' };
    return { ok: true };
}
```

- [ ] **Step 7: Run tests — expect 12 passed**

Run: `gjs -m tests/run.js`
Expected: `12 passed, 0 failed`.

- [ ] **Step 8: Add tests for `detectService`**

Append:

```javascript
import { detectService } from '../lib/rooms.js';

describe('detectService', () => {
    it('detects Google Meet', () => { assertEqual(detectService('https://meet.google.com/abc-defg-hij'), 'meet'); });
    it('detects jitsi by hostname substring', () => { assertEqual(detectService('https://meet.jit.si/standup'), 'jitsi'); });
    it('detects self-hosted jitsi hostname', () => { assertEqual(detectService('https://jitsi.example.com/room'), 'jitsi'); });
    it('detects single-segment self-hosted as jitsi', () => { assertEqual(detectService('https://call.example.com/standup'), 'jitsi'); });
    it('returns generic when path has query string', () => { assertEqual(detectService('https://example.com/standup?x=1'), 'generic'); });
    it('returns generic for deep path', () => { assertEqual(detectService('https://example.com/a/b/c'), 'generic'); });
    it('returns generic for empty path', () => { assertEqual(detectService('https://example.com/'), 'generic'); });
});
```

- [ ] **Step 9: Implement `detectService`**

Append to `lib/rooms.js`:

```javascript
export function detectService(url) {
    let uri;
    try {
        uri = GLib.Uri.parse(String(url || ''), GLib.UriFlags.NONE);
    } catch (_) {
        return 'generic';
    }
    const host = (uri.get_host() || '').toLowerCase();
    const path = uri.get_path() || '';
    const query = uri.get_query();
    if (host === 'meet.google.com') return 'meet';
    if (host.includes('jitsi')) return 'jitsi';
    if (!query && /^\/[A-Za-z0-9._-]+\/?$/.test(path)) return 'jitsi';
    return 'generic';
}
```

- [ ] **Step 10: Run tests — expect 19 passed**

Run: `gjs -m tests/run.js`
Expected: `19 passed, 0 failed`.

- [ ] **Step 11: Add tests for `parseAll` / `serializeRoom` / `parseRoom` / `generateId`**

Append:

```javascript
import { parseAll, serializeRoom, parseRoom, generateId } from '../lib/rooms.js';

describe('serializeRoom / parseRoom', () => {
    it('round-trips a room', () => {
        const r = { id: 'abc', name: 'X', url: 'https://x/y', hotkey: '<Super>1' };
        assertEqual(parseRoom(serializeRoom(r)), r);
    });
    it('defaults missing hotkey to empty string', () => {
        const json = '{"id":"a","name":"N","url":"https://u"}';
        assertEqual(parseRoom(json).hotkey, '');
    });
});

describe('parseAll', () => {
    it('skips broken JSON but keeps valid ones', () => {
        const strv = [
            '{"id":"a","name":"A","url":"https://a","hotkey":""}',
            'not-json',
            '{"id":"b","name":"B","url":"https://b","hotkey":"<Super>b"}',
        ];
        const result = parseAll(strv);
        assertEqual(result.rooms.length, 2);
        assertEqual(result.rooms[0].id, 'a');
        assertEqual(result.rooms[1].id, 'b');
        assertEqual(result.errors.length, 1);
        assertEqual(result.errors[0].index, 1);
    });
});

describe('generateId', () => {
    it('returns a 36-char UUID', () => {
        const id = generateId();
        assertEqual(id.length, 36);
        assertEqual(/^[0-9a-f-]{36}$/.test(id), true);
    });
    it('returns unique values', () => {
        assertEqual(generateId() === generateId(), false);
    });
});
```

- [ ] **Step 12: Implement `serializeRoom`, `parseRoom`, `parseAll`, `generateId`**

Append to `lib/rooms.js`:

```javascript
export function serializeRoom(room) {
    return JSON.stringify({
        id: room.id,
        name: room.name,
        url: room.url,
        hotkey: room.hotkey || '',
    });
}

export function parseRoom(json) {
    const obj = JSON.parse(json);
    if (typeof obj !== 'object' || obj === null)
        throw new Error('Room is not an object');
    if (typeof obj.id !== 'string' || !obj.id) throw new Error('Missing id');
    if (typeof obj.name !== 'string') throw new Error('Missing name');
    if (typeof obj.url !== 'string') throw new Error('Missing url');
    return {
        id: obj.id,
        name: obj.name,
        url: obj.url,
        hotkey: typeof obj.hotkey === 'string' ? obj.hotkey : '',
    };
}

export function parseAll(strv) {
    const rooms = [];
    const errors = [];
    (strv || []).forEach((raw, index) => {
        try {
            rooms.push(parseRoom(raw));
        } catch (e) {
            errors.push({ index, raw, message: e.message });
        }
    });
    return { rooms, errors };
}

export function generateId() {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
```

- [ ] **Step 13: Run tests — expect 24 passed**

Run: `gjs -m tests/run.js`
Expected: `24 passed, 0 failed`.

- [ ] **Step 14: Commit**

```bash
git add lib/rooms.js tests/rooms.test.js
git commit -m "feat(rooms): URL canonicalization, validation, service detection, JSON (de)serialization"
```

---

## Task 4: Launcher helpers (TDD)

**Files:**
- Test: `tests/launcher.test.js`
- Create: `lib/launcher.js`

- [ ] **Step 1: Write failing tests**

Overwrite `tests/launcher.test.js`:

```javascript
import { describe, it, assertEqual } from './harness.js';
import { splitCommand, substituteUrl } from '../lib/launcher.js';

describe('splitCommand', () => {
    it('splits simple command', () => {
        assertEqual(splitCommand('xdg-open %U'), ['xdg-open', '%U']);
    });
    it('handles quoted args', () => {
        assertEqual(splitCommand('chromium --app="%U"'), ['chromium', '--app=%U']);
    });
    it('returns empty array for empty string', () => {
        assertEqual(splitCommand(''), []);
    });
});

describe('substituteUrl', () => {
    it('replaces %U token', () => {
        assertEqual(substituteUrl(['xdg-open', '%U'], 'https://x/y'), ['xdg-open', 'https://x/y']);
    });
    it('substitutes inside argument', () => {
        assertEqual(substituteUrl(['chromium', '--app=%U'], 'https://x/y'), ['chromium', '--app=https://x/y']);
    });
    it('appends URL if no %U token anywhere', () => {
        assertEqual(substituteUrl(['firefox', '--new-window'], 'https://x/y'),
            ['firefox', '--new-window', 'https://x/y']);
    });
    it('leaves empty argv empty (no %U and no argv means nothing to spawn)', () => {
        assertEqual(substituteUrl([], 'https://x/y'), ['https://x/y']);
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `gjs -m tests/run.js`
Expected: failure on `launcher.js` import.

- [ ] **Step 3: Implement pure helpers in `lib/launcher.js`**

```javascript
import GLib from 'gi://GLib';

export function splitCommand(command) {
    const s = String(command || '').trim();
    if (!s) return [];
    const [ok, argv] = GLib.shell_parse_argv(s);
    if (!ok) throw new Error('Failed to parse command');
    return argv;
}

export function substituteUrl(argv, url) {
    const hasToken = argv.some(arg => arg.includes('%U'));
    if (!hasToken) return [...argv, url];
    return argv.map(arg => arg.split('%U').join(url));
}
```

- [ ] **Step 4: Run tests — expect 31 passed**

Run: `gjs -m tests/run.js`
Expected: `31 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add lib/launcher.js tests/launcher.test.js
git commit -m "feat(launcher): pure command-template splitting and URL substitution"
```

---

## Task 5: GSettings schemas

**Files:**
- Create: `schemas/org.gnome.shell.extensions.conference-rooms.gschema.xml`
- Modify: `Makefile`

- [ ] **Step 1: Write schema XML**

Create `schemas/org.gnome.shell.extensions.conference-rooms.gschema.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist gettext-domain="conference-rooms">
  <schema id="org.gnome.shell.extensions.conference-rooms"
          path="/org/gnome/shell/extensions/conference-rooms/">
    <key name="rooms" type="as">
      <default>[]</default>
      <summary>Configured conference rooms</summary>
      <description>Each element is a JSON object {id, name, url, hotkey}. Order is display order.</description>
    </key>
    <key name="open-command" type="s">
      <default>'xdg-open %U'</default>
      <summary>Command template for opening a room</summary>
      <description>%U is replaced with the URL. If %U is absent, URL is appended as the last argument.</description>
    </key>
    <key name="popup-hotkey" type="as">
      <default><![CDATA[['<Super>m']]]></default>
      <summary>Hotkey to toggle the popup menu</summary>
    </key>
    <key name="schema-version" type="i">
      <default>1</default>
      <summary>Reserved for future migrations</summary>
    </key>
  </schema>
</schemalist>
```

**Note:** Per-room hotkeys are registered at runtime via `global.display.grab_accelerator` in Task 9 — no schema key is needed. `Main.wm.addKeybinding` requires globally-unique names that must exist in a schema, which does not fit dynamic user-defined bindings. `grab_accelerator` is the purpose-built API for this case.

- [ ] **Step 2: Write `Makefile`**

Create `Makefile`:

```makefile
UUID := conference-rooms@mdanuschenkov
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SHELL := /bin/bash

SCHEMA_FILES := $(wildcard schemas/*.gschema.xml)
PO_FILES := $(wildcard po/*.po)
MO_FILES := $(patsubst po/%.po,locale/%/LC_MESSAGES/conference-rooms.mo,$(PO_FILES))

.PHONY: all schemas pot mo test install uninstall pack clean

all: schemas mo

schemas: schemas/gschemas.compiled

schemas/gschemas.compiled: $(SCHEMA_FILES)
	glib-compile-schemas schemas/

test:
	gjs -m tests/run.js

pot:
	xgettext --from-code=UTF-8 --output=po/conference-rooms.pot \
		--keyword=_ --keyword=N_ \
		--package-name="Conference Rooms" \
		$$(find . -name '*.js' -not -path './tests/*' -not -path './locale/*')

mo: $(MO_FILES)

locale/%/LC_MESSAGES/conference-rooms.mo: po/%.po
	mkdir -p $(dir $@)
	msgfmt $< -o $@

install: all
	mkdir -p "$(INSTALL_DIR)"
	cp -r metadata.json extension.js prefs.js stylesheet.css lib schemas icons locale "$(INSTALL_DIR)/"

uninstall:
	rm -rf "$(INSTALL_DIR)"

pack: all
	rm -f $(UUID).shell-extension.zip
	cd . && zip -r $(UUID).shell-extension.zip \
		metadata.json extension.js prefs.js stylesheet.css \
		lib schemas icons locale

clean:
	rm -f schemas/gschemas.compiled
	rm -rf locale
	rm -f *.zip
```

- [ ] **Step 3: Compile schemas and verify**

Run: `make schemas`
Expected: `schemas/gschemas.compiled` is created, no errors.

Run: `ls schemas/gschemas.compiled`
Expected: file exists.

- [ ] **Step 4: Commit**

```bash
git add schemas/org.gnome.shell.extensions.conference-rooms.gschema.xml Makefile
git commit -m "feat(schemas): main and per-room-hotkey GSettings schemas; Makefile"
```

---

## Task 6: Clipboard helper

**Files:**
- Create: `lib/clipboard.js`

- [ ] **Step 1: Write `lib/clipboard.js`**

```javascript
import St from 'gi://St';

export function copy(text) {
    const clipboard = St.Clipboard.get_default();
    clipboard.set_text(St.ClipboardType.CLIPBOARD, String(text));
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/clipboard.js
git commit -m "feat(clipboard): St.Clipboard helper"
```

---

## Task 7: RoomRow popup item

**Files:**
- Create: `lib/roomRow.js`

- [ ] **Step 1: Write `lib/roomRow.js`**

```javascript
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { detectService } from './rooms.js';
import * as Clipboard from './clipboard.js';

const SERVICE_ICONS = {
    meet: 'google-meet-symbolic',
    jitsi: 'jitsi-symbolic',
    generic: 'call-start-symbolic',
};

const COPY_OK_MS = 1000;

export const RoomRow = GObject.registerClass(
class RoomRow extends PopupMenu.PopupBaseMenuItem {
    _init(room, { onOpen, getIconPath }) {
        super._init({ reactive: true, can_focus: true });
        this._room = room;
        this._onOpen = onOpen;
        this._copyTimeoutId = 0;

        const row = new St.BoxLayout({
            style_class: 'conf-room-row',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const service = detectService(room.url);
        this._icon = new St.Icon({
            style_class: 'conf-room-icon',
            icon_name: SERVICE_ICONS[service] || SERVICE_ICONS.generic,
            fallback_icon_name: 'call-start-symbolic',
        });
        if (getIconPath) {
            const gicon = getIconPath(service);
            if (gicon) this._icon.gicon = gicon;
        }
        row.add_child(this._icon);

        this._nameLabel = new St.Label({
            text: room.name,
            style_class: 'conf-room-name',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(this._nameLabel);

        if (room.hotkey) {
            this._accelLabel = new St.Label({
                text: room.hotkey,
                style_class: 'conf-room-accel',
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.add_child(this._accelLabel);
        }

        this._copyIcon = new St.Icon({
            icon_name: 'edit-copy-symbolic',
            icon_size: 16,
        });
        this._copyButton = new St.Button({
            style_class: 'conf-room-copy-button',
            child: this._copyIcon,
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        this._copyButton.connect('clicked', () => this._onCopy());
        this._copyButton.connect('button-press-event', () => Clutter.EVENT_STOP);
        this._copyButton.connect('key-press-event', (_a, event) => {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Return || sym === Clutter.KEY_space) {
                this._onCopy();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        row.add_child(this._copyButton);

        this.add_child(row);

        this.connect('destroy', () => this._onDestroy());
    }

    activate(event) {
        this._onOpen(this._room);
        super.activate(event);
    }

    _onCopy() {
        Clipboard.copy(this._room.url);
        if (this._copyTimeoutId) {
            GLib.source_remove(this._copyTimeoutId);
            this._copyTimeoutId = 0;
        }
        this._copyIcon.icon_name = 'emblem-ok-symbolic';
        this._copyButton.add_style_class_name('conf-room-copy-button-ok');
        this._copyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COPY_OK_MS, () => {
            this._copyIcon.icon_name = 'edit-copy-symbolic';
            this._copyButton.remove_style_class_name('conf-room-copy-button-ok');
            this._copyTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _onDestroy() {
        if (this._copyTimeoutId) {
            GLib.source_remove(this._copyTimeoutId);
            this._copyTimeoutId = 0;
        }
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/roomRow.js
git commit -m "feat(ui): RoomRow popup item with inline open/copy"
```

---

## Task 8: Indicator

**Files:**
- Create: `lib/indicator.js`

- [ ] **Step 1: Write `lib/indicator.js`**

```javascript
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { RoomRow } from './roomRow.js';
import { parseAll } from './rooms.js';

export const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init({ settings, onOpenRoom, onOpenPrefs, gettext, getIconPath }) {
        super._init(0.0, 'Conference Rooms');
        this._settings = settings;
        this._onOpenRoom = onOpenRoom;
        this._onOpenPrefs = onOpenPrefs;
        this._ = gettext;
        this._getIconPath = getIconPath;

        this.add_child(new St.Icon({
            icon_name: 'call-start-symbolic',
            style_class: 'system-status-icon',
        }));

        this._roomsChangedId = this._settings.connect('changed::rooms',
            () => this.rebuild());

        this.rebuild();
    }

    rebuild() {
        this.menu.removeAll();

        const strv = this._settings.get_strv('rooms');
        const { rooms, errors } = parseAll(strv);
        for (const err of errors) {
            console.warn(`[conference-rooms] skipping broken room entry #${err.index}: ${err.message}`);
        }

        if (rooms.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(
                this._('No rooms configured. Click to open preferences.'));
            empty.connect('activate', () => this._onOpenPrefs());
            this.menu.addMenuItem(empty);
        } else {
            for (const room of rooms) {
                const item = new RoomRow(room, {
                    onOpen: r => this._onOpenRoom(r),
                    getIconPath: this._getIconPath,
                });
                this.menu.addMenuItem(item);
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const prefs = new PopupMenu.PopupMenuItem(this._('Preferences'));
            prefs.connect('activate', () => this._onOpenPrefs());
            this.menu.addMenuItem(prefs);
        }
    }

    destroy() {
        if (this._roomsChangedId) {
            this._settings.disconnect(this._roomsChangedId);
            this._roomsChangedId = 0;
        }
        super.destroy();
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/indicator.js
git commit -m "feat(ui): panel Indicator with popup rebuild on settings change"
```

---

## Task 9: HotkeyManager

**Files:**
- Create: `lib/hotkeys.js`

- [ ] **Step 1: Write `lib/hotkeys.js`**

Uses two different APIs:
- `popup-hotkey` is in a static schema → `Main.wm.addKeybinding`.
- Per-room hotkeys are user-defined and dynamic → `global.display.grab_accelerator` + `Main.wm.allowKeybinding` + `accelerator-activated` signal, keyed by `Meta` action ids.

```javascript
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { parseAll } from './rooms.js';

const POPUP_BINDING = 'popup-hotkey';
const ALL_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;

export class HotkeyManager {
    constructor({ settings, onTogglePopup, onOpenRoomById, gettext }) {
        this._settings = settings;
        this._onTogglePopup = onTogglePopup;
        this._onOpenRoomById = onOpenRoomById;
        this._ = gettext;

        this._popupRegistered = false;
        this._roomActions = new Map();        // action-id (number) → { name, roomId }
        this._conflictsNotified = new Set();

        this._acceleratorActivatedId = global.display.connect(
            'accelerator-activated',
            (_display, action) => this._onAccelerator(action)
        );

        this._roomsChangedId = this._settings.connect('changed::rooms',
            () => this.rebind());
        this._popupHotkeyChangedId = this._settings.connect(`changed::${POPUP_BINDING}`,
            () => this.rebind());

        this.rebind();
    }

    rebind() {
        this._unbindAll();

        const popup = this._settings.get_strv(POPUP_BINDING);
        if (popup.length > 0 && popup[0]) {
            const added = Main.wm.addKeybinding(
                POPUP_BINDING,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                ALL_MODES,
                () => this._onTogglePopup()
            );
            if (added === Meta.KeyBindingAction.NONE) {
                this._notifyConflict(popup[0], this._('Toggle popup'));
            } else {
                this._popupRegistered = true;
            }
        }

        const { rooms } = parseAll(this._settings.get_strv('rooms'));
        for (const room of rooms) {
            if (!room.hotkey) continue;
            const action = global.display.grab_accelerator(room.hotkey, Meta.KeyBindingFlags.NONE);
            if (action === Meta.KeyBindingAction.NONE) {
                this._notifyConflict(room.hotkey, room.name);
                continue;
            }
            const name = Meta.external_binding_name_for_action(action);
            Main.wm.allowKeybinding(name, ALL_MODES);
            this._roomActions.set(action, { name, roomId: room.id });
        }
    }

    _onAccelerator(action) {
        const info = this._roomActions.get(action);
        if (info) this._onOpenRoomById(info.roomId);
    }

    _unbindAll() {
        if (this._popupRegistered) {
            Main.wm.removeKeybinding(POPUP_BINDING);
            this._popupRegistered = false;
        }
        for (const [action, info] of this._roomActions) {
            try {
                Main.wm.allowKeybinding(info.name, Shell.ActionMode.NONE);
                global.display.ungrab_accelerator(action);
            } catch (e) {
                console.warn(`[conference-rooms] ungrab failed for ${info.name}: ${e}`);
            }
        }
        this._roomActions.clear();
        this._conflictsNotified.clear();
    }

    _notifyConflict(accel, name) {
        const key = `${accel}|${name}`;
        if (this._conflictsNotified.has(key)) return;
        this._conflictsNotified.add(key);
        Main.notify('Conference Rooms',
            this._(`Hotkey ${accel} already in use — "${name}"`));
        console.warn(`[conference-rooms] hotkey conflict: ${accel} for "${name}"`);
    }

    destroy() {
        this._unbindAll();
        if (this._acceleratorActivatedId) {
            global.display.disconnect(this._acceleratorActivatedId);
            this._acceleratorActivatedId = 0;
        }
        if (this._roomsChangedId) {
            this._settings.disconnect(this._roomsChangedId);
            this._roomsChangedId = 0;
        }
        if (this._popupHotkeyChangedId) {
            this._settings.disconnect(this._popupHotkeyChangedId);
            this._popupHotkeyChangedId = 0;
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hotkeys.js
git commit -m "feat(hotkeys): relocatable-schema-based per-room keybinding manager"
```

---

## Task 10: Extension entrypoint + launcher spawn

**Files:**
- Modify: `extension.js`
- Modify: `lib/launcher.js`

- [ ] **Step 1: Add runtime `open` to `lib/launcher.js`**

Append to `lib/launcher.js`:

```javascript
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { validateUrl } from './rooms.js';

const DEFAULT_COMMAND = 'xdg-open %U';

export function open(room, command, { gettext } = {}) {
    const _ = gettext || (s => s);
    const check = validateUrl(room.url);
    if (!check.ok) {
        Main.notify('Conference Rooms',
            _(`Invalid URL for "${room.name}": ${check.reason}`));
        return false;
    }
    let template = String(command || '').trim();
    if (!template) template = DEFAULT_COMMAND;

    let argv;
    try {
        argv = splitCommand(template);
    } catch (e) {
        console.warn(`[conference-rooms] bad open-command "${template}": ${e.message}`);
        argv = splitCommand(DEFAULT_COMMAND);
    }
    argv = substituteUrl(argv, room.url);

    try {
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        proc.wait_async(null, null);
        return true;
    } catch (e) {
        Main.notify('Conference Rooms',
            _(`Failed to open "${room.name}": ${e.message}`));
        console.error(`[conference-rooms] spawn failed for ${argv.join(' ')}: ${e}`);
        return false;
    }
}
```

- [ ] **Step 2: Write `extension.js`**

Overwrite `extension.js`:

```javascript
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Indicator } from './lib/indicator.js';
import { HotkeyManager } from './lib/hotkeys.js';
import * as Launcher from './lib/launcher.js';
import { parseAll } from './lib/rooms.js';

export default class ConferenceRoomsExtension extends Extension {
    enable() {
        this.initTranslations();
        const _ = this.gettext.bind(this);

        this._settings = this.getSettings();

        const iconDir = this.dir.get_child('icons');
        const getIconPath = service => {
            const file = iconDir.get_child(`${service}-symbolic.svg`);
            if (!file.query_exists(null)) return null;
            return Gio.FileIcon.new(file);
        };

        const openRoom = room => {
            Launcher.open(room, this._settings.get_string('open-command'), { gettext: _ });
        };

        const openRoomById = id => {
            const { rooms } = parseAll(this._settings.get_strv('rooms'));
            const room = rooms.find(r => r.id === id);
            if (room) openRoom(room);
        };

        this._indicator = new Indicator({
            settings: this._settings,
            onOpenRoom: openRoom,
            onOpenPrefs: () => this.openPreferences(),
            gettext: _,
            getIconPath,
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._hotkeys = new HotkeyManager({
            settings: this._settings,
            onTogglePopup: () => this._indicator.menu.toggle(),
            onOpenRoomById: openRoomById,
            gettext: _,
        });
    }

    disable() {
        if (this._hotkeys) {
            this._hotkeys.destroy();
            this._hotkeys = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}
```

- [ ] **Step 3: Build and install**

```bash
make clean && make all && make install
```

Expected: no errors; files land in `~/.local/share/gnome-shell/extensions/conference-rooms@mdanuschenkov/`.

- [ ] **Step 4: Smoke-test v0**

On X11: Alt+F2 → `r` → Enter.
On Wayland: log out, log back in.

Then:
```bash
gnome-extensions enable conference-rooms@mdanuschenkov
```

Expected: panel icon appears. Click → "No rooms configured" item visible. Clicking opens prefs window (empty — prefs.js not wired yet, so it may show an empty window; that's OK for now).

Check logs:
```bash
journalctl --user -b /usr/bin/gnome-shell --since "1 minute ago" | grep -i conference
```
Expected: no warnings/errors.

- [ ] **Step 5: Commit**

```bash
git add extension.js lib/launcher.js
git commit -m "feat: wire Indicator + HotkeyManager in extension entrypoint; subprocess launcher"
```

---

## Task 11: Prefs General group

**Files:**
- Modify: `prefs.js`

- [ ] **Step 1: Write `prefs.js` with General group only**

Overwrite `prefs.js`:

```javascript
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ }
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function formatAccel(strv) {
    if (!strv || strv.length === 0 || !strv[0]) return _('Disabled');
    return strv[0];
}

function captureAccelerator(parentWindow) {
    return new Promise(resolve => {
        const dialog = new Adw.Window({
            transient_for: parentWindow,
            modal: true,
            default_width: 320,
            default_height: 140,
            title: _('Press a shortcut'),
        });
        const label = new Gtk.Label({
            label: _('Press keys… Esc to clear, Backspace to cancel'),
            margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24,
        });
        dialog.set_content(label);

        const controller = new Gtk.EventControllerKey();
        dialog.add_controller(controller);
        controller.connect('key-pressed', (_c, keyval, _code, state) => {
            const mods = state & Gtk.accelerator_get_default_mod_mask();
            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                resolve({ cleared: true });
                return true;
            }
            if (keyval === Gdk.KEY_BackSpace) {
                dialog.close();
                resolve({ cancelled: true });
                return true;
            }
            if (mods === 0) return true;
            if (keyval === Gdk.KEY_Shift_L || keyval === Gdk.KEY_Shift_R ||
                keyval === Gdk.KEY_Control_L || keyval === Gdk.KEY_Control_R ||
                keyval === Gdk.KEY_Alt_L || keyval === Gdk.KEY_Alt_R ||
                keyval === Gdk.KEY_Super_L || keyval === Gdk.KEY_Super_R)
                return true;
            const accel = Gtk.accelerator_name_with_keycode(null, keyval, _code, mods);
            dialog.close();
            resolve({ accel });
            return true;
        });

        dialog.present();
    });
}

export default class ConferenceRoomsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        this._buildGeneralGroup(page, settings, window);
    }

    _buildGeneralGroup(page, settings, window) {
        const group = new Adw.PreferencesGroup({ title: _('General') });
        page.add(group);

        const commandRow = new Adw.EntryRow({ title: _('Open command (%U = URL)') });
        settings.bind('open-command', commandRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(commandRow);

        const popupRow = new Adw.ActionRow({ title: _('Toggle popup shortcut') });
        const popupLabel = new Gtk.Label({ css_classes: ['dim-label'] });
        const refreshPopupLabel = () => {
            popupLabel.label = formatAccel(settings.get_strv('popup-hotkey'));
        };
        refreshPopupLabel();
        const popupChanged = settings.connect('changed::popup-hotkey', refreshPopupLabel);
        window.connect('close-request', () => settings.disconnect(popupChanged));

        const setButton = new Gtk.Button({
            label: _('Set…'),
            valign: Gtk.Align.CENTER,
        });
        setButton.connect('clicked', async () => {
            const result = await captureAccelerator(window);
            if (result.cancelled) return;
            if (result.cleared) settings.set_strv('popup-hotkey', []);
            else settings.set_strv('popup-hotkey', [result.accel]);
        });
        popupRow.add_suffix(popupLabel);
        popupRow.add_suffix(setButton);
        group.add(popupRow);
    }
}
```

- [ ] **Step 2: Reinstall and smoke-check prefs**

```bash
make install
```

Open prefs:
```bash
gnome-extensions prefs conference-rooms@mdanuschenkov
```

Expected:
- Window opens with one "General" group.
- `open-command` field shows `xdg-open %U`. Editing it persists (re-open confirms).
- `Toggle popup shortcut` row shows `<Super>m` label.
- Click `Set…`, press `<Super>k` → label updates to `<Super>k`.
- Press `Esc` in capture dialog → shortcut cleared (label shows "Disabled").

- [ ] **Step 3: Commit**

```bash
git add prefs.js
git commit -m "feat(prefs): General group with open-command and popup-hotkey capture"
```

---

## Task 12: Prefs Rooms list

**Files:**
- Modify: `prefs.js`

- [ ] **Step 1: Add Rooms group and row management**

Append a new method to `ConferenceRoomsPreferences` and call it from `fillPreferencesWindow`.

Modify `fillPreferencesWindow`:

```javascript
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        this._buildGeneralGroup(page, settings, window);
        this._buildRoomsGroup(page, settings, window);
    }
```

Add at the top of the file, after imports:

```javascript
import { canonicalizeUrl, validateUrl, detectService,
         serializeRoom, parseRoom, parseAll, generateId }
    from './lib/rooms.js';
```

Add this method to the class:

```javascript
    _buildRoomsGroup(page, settings, window) {
        const group = new Adw.PreferencesGroup({ title: _('Rooms') });
        page.add(group);

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['flat'],
            tooltip_text: _('Add room'),
            valign: Gtk.Align.CENTER,
        });
        group.set_header_suffix(addButton);

        const rowWidgets = [];

        const render = () => {
            for (const w of rowWidgets) group.remove(w);
            rowWidgets.length = 0;

            const { rooms, errors } = parseAll(settings.get_strv('rooms'));
            for (const err of errors) {
                const errRow = new Adw.ActionRow({
                    title: _('(corrupt entry — edit via dconf)'),
                    subtitle: err.message,
                    css_classes: ['error'],
                });
                group.add(errRow);
                rowWidgets.push(errRow);
            }

            rooms.forEach((room, index) => {
                const row = new Adw.ActionRow({
                    title: room.name || _('(unnamed)'),
                    subtitle: room.url,
                });

                const service = detectService(room.url);
                row.add_prefix(new Gtk.Image({
                    icon_name: ({
                        meet: 'google-meet-symbolic',
                        jitsi: 'jitsi-symbolic',
                        generic: 'call-start-symbolic',
                    })[service],
                }));

                if (room.hotkey) {
                    row.add_suffix(new Gtk.Label({
                        label: room.hotkey,
                        css_classes: ['dim-label'],
                        valign: Gtk.Align.CENTER,
                    }));
                }

                const up = new Gtk.Button({
                    icon_name: 'go-up-symbolic',
                    css_classes: ['flat'],
                    valign: Gtk.Align.CENTER,
                    sensitive: index > 0,
                    tooltip_text: _('Move up'),
                });
                up.connect('clicked', () => this._move(settings, index, -1));
                row.add_suffix(up);

                const down = new Gtk.Button({
                    icon_name: 'go-down-symbolic',
                    css_classes: ['flat'],
                    valign: Gtk.Align.CENTER,
                    sensitive: index < rooms.length - 1,
                    tooltip_text: _('Move down'),
                });
                down.connect('clicked', () => this._move(settings, index, +1));
                row.add_suffix(down);

                const edit = new Gtk.Button({
                    icon_name: 'document-edit-symbolic',
                    css_classes: ['flat'],
                    valign: Gtk.Align.CENTER,
                    tooltip_text: _('Edit'),
                });
                edit.connect('clicked', () => this._editRoom(window, settings, room));
                row.add_suffix(edit);

                const del = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    css_classes: ['flat'],
                    valign: Gtk.Align.CENTER,
                    tooltip_text: _('Delete'),
                });
                del.connect('clicked', () => this._deleteRoom(window, settings, room));
                row.add_suffix(del);

                group.add(row);
                rowWidgets.push(row);
            });

            if (rooms.length === 0 && errors.length === 0) {
                const empty = new Adw.ActionRow({
                    title: _('No rooms yet'),
                    subtitle: _('Click + to add your first room'),
                });
                group.add(empty);
                rowWidgets.push(empty);
            }
        };

        addButton.connect('clicked', () => this._editRoom(window, settings, null));
        const changedId = settings.connect('changed::rooms', render);
        window.connect('close-request', () => settings.disconnect(changedId));

        render();
    }

    _move(settings, index, delta) {
        const arr = settings.get_strv('rooms').slice();
        const to = index + delta;
        if (to < 0 || to >= arr.length) return;
        const [item] = arr.splice(index, 1);
        arr.splice(to, 0, item);
        settings.set_strv('rooms', arr);
    }

    _deleteRoom(window, settings, room) {
        const dialog = new Adw.AlertDialog({
            heading: _('Delete room?'),
            body: _(`"${room.name}" will be removed.`),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.choose(window, null, (d, res) => {
            const response = d.choose_finish(res);
            if (response !== 'delete') return;
            const { rooms } = parseAll(settings.get_strv('rooms'));
            const filtered = rooms.filter(r => r.id !== room.id);
            settings.set_strv('rooms', filtered.map(serializeRoom));
        });
    }
```

- [ ] **Step 2: Reinstall and verify list works (Edit not yet implemented — skip +/edit for now)**

```bash
make install
```

Open prefs. Expected: "Rooms" group with "No rooms yet" row; "+" button visible in header.

Add a test entry via dconf to verify display:

```bash
dconf write /org/gnome/shell/extensions/conference-rooms/rooms \
  "['{\"id\":\"test-1\",\"name\":\"Standup\",\"url\":\"https://meet.jit.si/standup\",\"hotkey\":\"\"}']"
```

Expected: row appears with name, URL, up/down/edit/delete buttons. Deleting removes it (confirmation dialog first).

- [ ] **Step 3: Commit**

```bash
git add prefs.js
git commit -m "feat(prefs): Rooms group with list, reorder, delete"
```

---

## Task 13: RoomDialog (add/edit)

**Files:**
- Modify: `prefs.js`

- [ ] **Step 1: Implement `_editRoom`**

Add to `ConferenceRoomsPreferences` class:

```javascript
    _editRoom(window, settings, existing) {
        const isNew = existing === null;
        const { rooms } = parseAll(settings.get_strv('rooms'));

        const dialog = new Adw.Dialog({
            title: isNew ? _('Add room') : _('Edit room'),
            content_width: 480,
        });

        const content = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        content.add_top_bar(header);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);
        content.set_content(page);
        dialog.set_child(content);

        const nameRow = new Adw.EntryRow({ title: _('Name') });
        nameRow.text = existing ? existing.name : '';
        group.add(nameRow);

        const urlRow = new Adw.EntryRow({ title: _('URL') });
        urlRow.text = existing ? existing.url : '';
        group.add(urlRow);

        const hotkeyRow = new Adw.ActionRow({ title: _('Shortcut') });
        const hotkeyLabel = new Gtk.Label({ css_classes: ['dim-label'] });
        let currentHotkey = existing ? existing.hotkey : '';
        const refreshHotkey = () => { hotkeyLabel.label = currentHotkey || _('None'); };
        refreshHotkey();

        const captureBtn = new Gtk.Button({ label: _('Set…'), valign: Gtk.Align.CENTER });
        captureBtn.connect('clicked', async () => {
            const result = await captureAccelerator(window);
            if (result.cancelled) return;
            if (result.cleared) currentHotkey = '';
            else currentHotkey = result.accel;
            refreshHotkey();
        });
        hotkeyRow.add_suffix(hotkeyLabel);
        hotkeyRow.add_suffix(captureBtn);
        group.add(hotkeyRow);

        const errorLabel = new Gtk.Label({
            css_classes: ['error'],
            wrap: true,
            xalign: 0,
            visible: false,
            margin_start: 12, margin_end: 12, margin_bottom: 8,
        });
        content.set_content_bottom_bar = errorLabel;
        group.add(errorLabel);

        const cancel = new Gtk.Button({ label: _('Cancel') });
        cancel.connect('clicked', () => dialog.close());
        header.pack_start(cancel);

        const save = new Gtk.Button({
            label: _('Save'),
            css_classes: ['suggested-action'],
        });
        header.pack_end(save);

        const validate = () => {
            const name = nameRow.text.trim();
            const rawUrl = urlRow.text.trim();
            if (!name) return _('Name is required');
            const canonical = canonicalizeUrl(rawUrl);
            const urlCheck = validateUrl(canonical);
            if (!urlCheck.ok) return urlCheck.reason;
            if (currentHotkey) {
                const hasMod = /<(Super|Control|Ctrl|Alt|Shift)>/.test(currentHotkey);
                if (!hasMod) return _('Shortcut must include at least one modifier');
                const popup = settings.get_strv('popup-hotkey');
                if (popup && popup[0] === currentHotkey)
                    return _('Shortcut conflicts with the popup toggle shortcut');
                const collision = rooms.find(r =>
                    r.hotkey === currentHotkey && (!existing || r.id !== existing.id));
                if (collision) return _(`Shortcut already used by "${collision.name}"`);
            }
            return null;
        };

        const updateError = () => {
            const msg = validate();
            if (msg) { errorLabel.label = msg; errorLabel.visible = true; save.sensitive = false; }
            else { errorLabel.visible = false; save.sensitive = true; }
        };
        nameRow.connect('changed', updateError);
        urlRow.connect('changed', updateError);
        updateError();

        save.connect('clicked', () => {
            if (validate()) return;
            const canonical = canonicalizeUrl(urlRow.text.trim());
            const room = {
                id: existing ? existing.id : generateId(),
                name: nameRow.text.trim(),
                url: canonical,
                hotkey: currentHotkey,
            };
            const all = rooms.slice();
            if (existing) {
                const idx = all.findIndex(r => r.id === existing.id);
                if (idx >= 0) all[idx] = room;
            } else {
                all.push(room);
            }
            settings.set_strv('rooms', all.map(serializeRoom));
            dialog.close();
        });

        dialog.present(window);
    }
```

- [ ] **Step 2: Reinstall and smoke-check full prefs flow**

```bash
make install
```

Open prefs, click `+`. Dialog appears. Fill Name="Test", URL="meet.google.com/abc-defg-hij" (no scheme). Save. Expected: URL in list reads `https://meet.google.com/abc-defg-hij` (scheme added by canonicalize).

Click `✎` on the row. Dialog pre-populated. Change name. Save. List updates.

Set a hotkey. Try without modifiers — save disabled with error message. Try `<Super>t` — saves. Label appears in list.

Move row up/down. Order persists after closing/reopening prefs.

- [ ] **Step 3: Commit**

```bash
git add prefs.js
git commit -m "feat(prefs): RoomDialog with validation for add/edit"
```

---

## Task 14: Stylesheet

**Files:**
- Create: `stylesheet.css`

- [ ] **Step 1: Write `stylesheet.css`**

```css
.conf-room-row {
    spacing: 8px;
    padding: 4px 8px;
}

.conf-room-icon {
    icon-size: 16px;
}

.conf-room-name {
    min-width: 180px;
}

.conf-room-accel {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.9em;
    padding-right: 8px;
}

.conf-room-copy-button {
    padding: 2px;
    border-radius: 4px;
}

.conf-room-copy-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.conf-room-copy-button-ok StIcon {
    color: #4ade80;
}
```

- [ ] **Step 2: Reinstall, restart Shell, verify**

```bash
make install
```
Restart Shell (X11) or log out/in (Wayland). Open popup — rows should have padding, checkmark should appear green when you click the copy button.

- [ ] **Step 3: Commit**

```bash
git add stylesheet.css
git commit -m "style: popup row layout and copy-button feedback"
```

---

## Task 15: Service icons

**Files:**
- Create: `icons/google-meet-symbolic.svg`
- Create: `icons/jitsi-symbolic.svg`
- Create: `icons/generic-symbolic.svg`

- [ ] **Step 1: Create minimal SVGs (replace with branded SVGs later if desired)**

`icons/generic-symbolic.svg`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h5A1.5 1.5 0 0 1 11 4.5v1.2l2.4-1.5c.3-.2.6 0 .6.4v7c0 .4-.3.6-.6.4L11 10.3v1.2A1.5 1.5 0 0 1 9.5 13h-5A1.5 1.5 0 0 1 3 11.5v-7z" fill="#eee"/>
</svg>
```

`icons/google-meet-symbolic.svg`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect x="2" y="4" width="8" height="8" rx="1" fill="#eee"/>
  <path d="M10 6.5l3.5-2v7L10 9.5z" fill="#eee"/>
</svg>
```

`icons/jitsi-symbolic.svg`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="5.5" fill="none" stroke="#eee" stroke-width="1.5"/>
  <circle cx="8" cy="8" r="1.5" fill="#eee"/>
</svg>
```

- [ ] **Step 2: Reinstall, verify icons render**

```bash
make install
```

Popup should now show distinct icons per service.

- [ ] **Step 3: Commit**

```bash
git add icons/
git commit -m "feat(icons): fallback symbolic icons for meet, jitsi, generic"
```

---

## Task 16: i18n setup

**Files:**
- Create: `po/conference-rooms.pot` (generated)
- Create: `po/ru.po`

- [ ] **Step 1: Extract messages**

```bash
make pot
```

Expected: `po/conference-rooms.pot` created with all `_()` strings from `extension.js`, `prefs.js`, and `lib/*.js`.

- [ ] **Step 2: Seed Russian translation**

Create `po/ru.po` by copying the POT and filling Russian strings:

```bash
cp po/conference-rooms.pot po/ru.po
```

Edit `po/ru.po` header:
```
"Language: ru\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Plural-Forms: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<12 || n%100>14) ? 1 : 2);\n"
```

Fill `msgstr` for each key — representative examples:
```
msgid "No rooms configured. Click to open preferences."
msgstr "Комнаты не настроены. Откройте настройки."

msgid "Preferences"
msgstr "Настройки"

msgid "General"
msgstr "Общие"

msgid "Rooms"
msgstr "Комнаты"

msgid "Open command (%U = URL)"
msgstr "Команда открытия (%U = URL)"

msgid "Toggle popup shortcut"
msgstr "Хоткей открытия меню"

msgid "Add room"
msgstr "Добавить комнату"

msgid "Edit room"
msgstr "Редактировать комнату"

msgid "Delete room?"
msgstr "Удалить комнату?"

msgid "Name"
msgstr "Имя"

msgid "URL"
msgstr "Ссылка"

msgid "Shortcut"
msgstr "Хоткей"

msgid "Name is required"
msgstr "Имя обязательно"

msgid "Shortcut must include at least one modifier"
msgstr "Хоткей должен содержать хотя бы один модификатор"
```

(Fill all remaining keys similarly — every `msgid` needs a `msgstr`.)

- [ ] **Step 3: Build mo files**

```bash
make mo
```

Expected: `locale/ru/LC_MESSAGES/conference-rooms.mo` created.

- [ ] **Step 4: Install and verify**

```bash
make install
```

If system locale is `ru_RU.UTF-8`: prefs open in Russian. Otherwise force for a quick test:
```bash
LANG=ru_RU.UTF-8 gnome-extensions prefs conference-rooms@mdanuschenkov
```

Expected: strings in the "General" / "Rooms" groups are Russian.

- [ ] **Step 5: Commit**

```bash
git add po/conference-rooms.pot po/ru.po
git commit -m "i18n: add POT template and Russian translation"
```

---

## Task 17: Install target, smoke checklist, README

**Files:**
- Create: `docs/smoke-test.md`
- Create: `README.md`

- [ ] **Step 1: Write `docs/smoke-test.md`**

```markdown
# Conference Rooms — smoke-test checklist

Run on a GNOME 46+ session before every release.

1. `make clean && make all && make install`
2. Restart Shell (X11: Alt+F2 → `r`; Wayland: log out/in). Run `gnome-extensions enable conference-rooms@mdanuschenkov`.
3. Panel shows the phone icon. Click → popup shows "No rooms configured".
4. Open prefs, add a Google Meet room. Popup updates without restart.
5. Click the room in the popup. Browser opens to the correct URL.
6. Click the copy button in the popup. Popup stays open. Icon flips to green checkmark for ~1s. Clipboard holds the exact URL.
7. Assign a hotkey (`<Super>1`). In NORMAL mode and in the Overview, the hotkey opens that room.
8. Assign the popup-toggle hotkey (`<Super>m`). Press it — popup toggles open/closed.
9. Add a second room with the same hotkey as the first via dconf edit (bypassing prefs validation). On next enable cycle: one notification about the conflict; the offending room remains visible but its hotkey is inert.
10. Delete a room. It disappears from popup; its hotkey stops working.
11. Change `open-command` to `firefox --new-window %U`. Rooms open in Firefox.
12. `gnome-extensions disable … && gnome-extensions enable …`. No warnings in `journalctl --user -b /usr/bin/gnome-shell --since "1 minute ago"`. Everything works again.
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Conference Rooms

GNOME Shell extension: a panel popup with a list of conference room links (Google Meet, Jitsi, self-hosted). Click to open, button to copy URL. Optional per-room global hotkeys.

## Requirements

- GNOME Shell 46, 47, or 48
- `gjs`, `glib-compile-schemas`, `xgettext`, `msgfmt`, `make`

## Install

```bash
git clone <repo>
cd conference-rooms
make install
gnome-extensions enable conference-rooms@mdanuschenkov
# Restart Shell: Alt+F2 → r (X11) or log out/in (Wayland)
```

## Configure

`gnome-extensions prefs conference-rooms@mdanuschenkov`

- **Open command**: e.g. `firefox --new-window %U`, `chromium --app=%U`, `xdg-open %U`. `%U` is replaced with the URL; if the token is absent, the URL is appended.
- **Toggle popup shortcut**: default `<Super>M`.
- **Rooms**: `+` to add. Name + URL. Optional per-room hotkey.

## Develop

```bash
make test        # unit tests (pure modules only)
make schemas     # compile GSettings schemas
make pot         # refresh translation template
make mo          # compile .po files
make pack        # build EGO-upload zip
```

Manual smoke checklist: `docs/smoke-test.md`.

## License

GPL-3.0-or-later
```

- [ ] **Step 3: Final smoke test run**

Walk the entire `docs/smoke-test.md` checklist end-to-end. Fix anything that fails.

- [ ] **Step 4: Commit**

```bash
git add docs/smoke-test.md README.md
git commit -m "docs: smoke checklist and README"
```

---

## Self-review notes

- **Spec coverage:** All spec sections map to tasks — scaffolding (T1), tests (T2/3/4), schemas (T5), UI modules (T6/7/8/9/10), prefs (T11/12/13), styles/icons (T14/15), i18n (T16), packaging/docs (T17).
- **Error handling:** all rows of the spec's error table are implemented (T3 parseAll skip, T10 empty-command fallback, T10 spawn-fail notify, T10 invalid-URL notify, T9 hotkey-conflict notify, T7 clipboard fail ignored silently, T12 corrupt-row error class).
- **Deviation from spec — per-room hotkey implementation.** The spec's "Per-room hotkey storage" section describes a relocatable schema with `Main.wm.addKeybinding`. In review, this approach has a correctness issue: `addKeybinding` registers under a globally unique name, and the relocatable schema's key is always called `binding` — so only the last-registered room would actually respond. T9 switches to `global.display.grab_accelerator` + `Main.wm.allowKeybinding` + `accelerator-activated` signal, which is the purpose-built API for dynamic user-defined bindings and does not need per-room schema keys. User-visible behavior is identical; no schema changes required at runtime. The `room-hotkey` relocatable schema was therefore dropped from T5.
