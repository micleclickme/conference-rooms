// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { detectService } from './rooms.js';
import * as Clipboard from './clipboard.js';

const SERVICE_ICONS = {
    meet: 'meet-symbolic',
    jitsi: 'jitsi-symbolic',
    telemost: 'telemost-symbolic',
    generic: 'call-start-symbolic',
};

const COPY_OK_MS = 1000;

export const RoomRow = GObject.registerClass({
    GTypeName: 'ConferenceRoomsRoomRow',
}, class RoomRow extends PopupMenu.PopupBaseMenuItem {
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
        const source = event && event.get_source ? event.get_source() : null;
        if (source && this._isInCopyButton(source)) {
            // Copy button fires its own `clicked`; don't also open the room.
            return;
        }
        this._onOpen(this._room);
        super.activate(event);
    }

    _isInCopyButton(actor) {
        let a = actor;
        while (a) {
            if (a === this._copyButton) return true;
            a = a.get_parent();
        }
        return false;
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
