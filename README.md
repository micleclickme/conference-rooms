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
