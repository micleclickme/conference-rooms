import GLib from 'gi://GLib';

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
