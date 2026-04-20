// SPDX-License-Identifier: GPL-2.0-or-later
import St from 'gi://St';

export function copy(text) {
    const clipboard = St.Clipboard.get_default();
    clipboard.set_text(St.ClipboardType.CLIPBOARD, String(text));
}
