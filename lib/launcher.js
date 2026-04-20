import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { validateUrl } from './rooms.js';

// Main is only available inside a GNOME Shell session; outside (e.g. tests)
// the resource:// URI does not exist, so we fall back to null gracefully.
let Main = null;
try {
    Main = await import('resource:///org/gnome/shell/ui/main.js');
} catch (_) { /* running outside Shell – Main stays null */ }

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

export function open(room, command, { gettext } = {}) {
    const _ = gettext || (s => s);
    const check = validateUrl(room.url);
    if (!check.ok) {
        if (Main) Main.notify('Conference Rooms',
            _(`Invalid URL for "${room.name}": ${check.reason}`));
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
        proc.wait_async(null, null);
        return true;
    } catch (e) {
        if (Main) Main.notify('Conference Rooms',
            _(`Failed to open "${room.name}": ${e.message}`));
        console.error(`[conference-rooms] spawn failed for ${argv.join(' ')}: ${e}`);
        return false;
    }
}
