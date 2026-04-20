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

### Host

Install `gjs`, `libglib2.0-bin`, `libglib2.0-dev-bin` (or equivalent), `gettext`, `make`, `zip`. Then:

```bash
make test        # unit tests (pure modules only)
make schemas     # compile GSettings schemas
make pot         # refresh translation template
make mo          # compile .po files
make pack        # build EGO-upload zip
```

### Docker (isolated build env)

No host install needed — `docker` + `docker compose` are enough. Node.js is **not** required (tests run under `gjs`).

```bash
make docker-build  # one-time image build
make docker-test   # run unit tests in container
make docker-pack   # build the release zip in container
make docker-shell  # drop into a dev shell
```

The container UID/GID match your host user, so files written to the mounted workspace stay yours. `.devcontainer/devcontainer.json` is provided for VS Code / Cursor "Reopen in Container".

**Limitation:** the container cannot install or smoke-test the extension — that needs a live GNOME Shell session on the host. Use `make install` on the host after the container produces `schemas/gschemas.compiled` and `locale/`.

Manual smoke checklist: `docs/smoke-test.md`.

## Release

Tag with a `v*` prefix and push:

```bash
git tag v1.0.0
git push --tags
```

The `Build` workflow (`.github/workflows/build.yml`) runs tests, builds the EGO-ready zip, creates a GitHub Release named after the tag, and attaches the zip as a release asset. Every push to `main` and every PR also runs tests and uploads the zip as a build artifact (kept 30 days) for manual review.

## License

GPL-2.0-or-later. See `COPYING`.
