import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ }
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { canonicalizeUrl, validateUrl, detectService,
         serializeRoom, parseRoom, parseAll, generateId }
    from './lib/rooms.js';

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
        this._buildRoomsGroup(page, settings, window);
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

    _editRoom(_window, _settings, _existing) {
        // Stub — implemented in Task 13 (RoomDialog)
    }
}
