// SPDX-License-Identifier: GPL-2.0-or-later
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
        const notify = text => Main.notify('Conference Rooms', text);

        this._settings = this.getSettings();

        const iconDir = this.dir.get_child('icons');
        const getIconPath = service => {
            const file = iconDir.get_child(`${service}-symbolic.svg`);
            if (!file.query_exists(null)) return null;
            return Gio.FileIcon.new(file);
        };

        const openRoom = room => {
            Launcher.open(room, this._settings.get_string('open-command'),
                { notify, gettext: _ });
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
            notify,
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
