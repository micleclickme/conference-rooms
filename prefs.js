// SPDX-License-Identifier: GPL-2.0-or-later
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
                        telemost: 'telemost-symbolic',
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
            body: _('"%s" will be removed.').replace('%s', room.name),
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
            if (!urlCheck.ok) return _(urlCheck.reason);
            if (currentHotkey) {
                const hasMod = /<(Super|Control|Ctrl|Alt|Shift)>/.test(currentHotkey);
                if (!hasMod) return _('Shortcut must include at least one modifier');
                const popup = settings.get_strv('popup-hotkey');
                if (popup && popup[0] === currentHotkey)
                    return _('Shortcut conflicts with the popup toggle shortcut');
                const collision = rooms.find(r =>
                    r.hotkey === currentHotkey && (!existing || r.id !== existing.id));
                if (collision) return _('Shortcut already used by "%s"').replace('%s', collision.name);
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
}
