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
