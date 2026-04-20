// SPDX-License-Identifier: GPL-2.0-or-later
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { RoomRow } from './roomRow.js';
import { parseAll } from './rooms.js';

export const Indicator = GObject.registerClass({
    GTypeName: 'ConferenceRoomsIndicator',
}, class Indicator extends PanelMenu.Button {
    _init({ settings, onOpenRoom, onOpenPrefs, gettext, getIconPath }) {
        super._init(0.0, 'Conference Rooms');
        this._settings = settings;
        this._onOpenRoom = onOpenRoom;
        this._onOpenPrefs = onOpenPrefs;
        this._ = gettext;
        this._getIconPath = getIconPath;

        const panelIcon = new St.Icon({
            icon_name: 'call-start-symbolic',
            style_class: 'system-status-icon',
        });
        if (this._getIconPath) {
            const gicon = this._getIconPath('generic');
            if (gicon) panelIcon.gicon = gicon;
        }
        this.add_child(panelIcon);

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
