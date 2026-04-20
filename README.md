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
gnome-extensions enable conference-rooms@micleclickme.github.io
# Restart Shell: Alt+F2 → r (X11) or log out/in (Wayland)
```

## Configure

`gnome-extensions prefs conference-rooms@micleclickme.github.io`

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

## Release

Tag with a `v*` prefix and push:

```bash
git tag v1.0.0
git push --tags
```

The `Build` workflow (`.github/workflows/build.yml`) runs tests, builds the EGO-ready zip, creates a GitHub Release named after the tag, and attaches the zip as a release asset. Every push to `main` and every PR also runs tests and uploads the zip as a build artifact (kept 30 days) for manual review.

## License

GPL-3.0-or-later
