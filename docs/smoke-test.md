# Conference Rooms — smoke-test checklist

Run on a GNOME 46+ session before every release.

1. `make clean && make all && make install`
2. Restart Shell (X11: Alt+F2 → `r`; Wayland: log out/in). Run `gnome-extensions enable conference-rooms@micleclickme.github.io`.
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
