// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { validateUrl } from './rooms.js';

export function splitCommand(command) {
    const s = String(command || '').trim();
    if (!s) return [];
    const [ok, argv] = GLib.shell_parse_argv(s);
    if (!ok) throw new Error('Failed to parse command');
    return argv;
}

export function substituteUrl(argv, url) {
    const hasToken = argv.some(arg => arg.includes('%U'));
    if (!hasToken) return [...argv, url];
    return argv.map(arg => arg.split('%U').join(url));
}

const DEFAULT_COMMAND = 'xdg-open %U';

function format2(template, a, b) {
    return template.replace('%s', a).replace('%s', b);
}

export function open(room, command, { notify, gettext } = {}) {
    const _ = gettext || (s => s);
    const say = notify || (() => {});
    const check = validateUrl(room.url);
    if (!check.ok) {
        say(format2(_('Invalid URL for "%s": %s'), room.name, _(check.reason)));
        return false;
    }
    let template = String(command || '').trim();
    if (!template) template = DEFAULT_COMMAND;

    let argv;
    try {
        argv = splitCommand(template);
    } catch (e) {
        console.warn(`[conference-rooms] bad open-command "${template}": ${e.message}`);
        argv = splitCommand(DEFAULT_COMMAND);
    }
    argv = substituteUrl(argv, room.url);

    try {
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        proc.wait_async(null, (p, res) => {
            try { p.wait_finish(res); } catch (_) {}
        });
        return true;
    } catch (e) {
        say(format2(_('Failed to open "%s": %s'), room.name, e.message));
        console.error(`[conference-rooms] spawn failed for ${argv.join(' ')}: ${e}`);
        return false;
    }
}
