// SPDX-License-Identifier: GPL-2.0-or-later
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { parseAll } from './rooms.js';

const POPUP_BINDING = 'popup-hotkey';
const ALL_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;

function format2(template, a, b) {
    return template.replace('%s', a).replace('%s', b);
}

export class HotkeyManager {
    constructor({ settings, notify, onTogglePopup, onOpenRoomById, gettext }) {
        this._settings = settings;
        this._notify = notify || (() => {});
        this._onTogglePopup = onTogglePopup;
        this._onOpenRoomById = onOpenRoomById;
        this._ = gettext;

        this._popupRegistered = false;
        this._roomActions = new Map();        // action-id (number) → { name, roomId }
        this._conflictsNotified = new Set();

        this._acceleratorActivatedId = global.display.connect(
            'accelerator-activated',
            (_display, action) => this._onAccelerator(action)
        );

        this._roomsChangedId = this._settings.connect('changed::rooms',
            () => this.rebind());
        this._popupHotkeyChangedId = this._settings.connect(`changed::${POPUP_BINDING}`,
            () => this.rebind());

        this.rebind();
    }

    rebind() {
        this._unbindAll();

        const popup = this._settings.get_strv(POPUP_BINDING);
        if (popup.length > 0 && popup[0]) {
            const added = Main.wm.addKeybinding(
                POPUP_BINDING,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                ALL_MODES,
                () => this._onTogglePopup()
            );
            if (added === Meta.KeyBindingAction.NONE) {
                this._notifyConflict(popup[0], this._('Toggle popup'));
            } else {
                this._popupRegistered = true;
            }
        }

        const { rooms } = parseAll(this._settings.get_strv('rooms'));
        for (const room of rooms) {
            if (!room.hotkey) continue;
            const action = global.display.grab_accelerator(room.hotkey, Meta.KeyBindingFlags.NONE);
            if (action === Meta.KeyBindingAction.NONE) {
                this._notifyConflict(room.hotkey, room.name);
                continue;
            }
            const name = Meta.external_binding_name_for_action(action);
            Main.wm.allowKeybinding(name, ALL_MODES);
            this._roomActions.set(action, { name, roomId: room.id });
        }
    }

    _onAccelerator(action) {
        const info = this._roomActions.get(action);
        if (info) this._onOpenRoomById(info.roomId);
    }

    _unbindAll() {
        if (this._popupRegistered) {
            Main.wm.removeKeybinding(POPUP_BINDING);
            this._popupRegistered = false;
        }
        for (const [action, info] of this._roomActions) {
            try {
                Main.wm.allowKeybinding(info.name, Shell.ActionMode.NONE);
                global.display.ungrab_accelerator(action);
            } catch (e) {
                console.warn(`[conference-rooms] ungrab failed for ${info.name}: ${e}`);
            }
        }
        this._roomActions.clear();
    }

    _notifyConflict(accel, name) {
        const key = `${accel}|${name}`;
        if (this._conflictsNotified.has(key)) return;
        this._conflictsNotified.add(key);
        this._notify(format2(this._('Hotkey %s already in use — "%s"'), accel, name));
        console.warn(`[conference-rooms] hotkey conflict: ${accel} for "${name}"`);
    }

    destroy() {
        this._unbindAll();
        this._conflictsNotified.clear();
        if (this._acceleratorActivatedId) {
            global.display.disconnect(this._acceleratorActivatedId);
            this._acceleratorActivatedId = 0;
        }
        if (this._roomsChangedId) {
            this._settings.disconnect(this._roomsChangedId);
            this._roomsChangedId = 0;
        }
        if (this._popupHotkeyChangedId) {
            this._settings.disconnect(this._popupHotkeyChangedId);
            this._popupHotkeyChangedId = 0;
        }
    }
}
