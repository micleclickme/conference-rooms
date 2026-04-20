// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

export function canonicalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    const hashIdx = s.indexOf('#');
    if (hashIdx >= 0) s = s.slice(0, hashIdx);
    const qIdx = s.indexOf('?');
    const pathPart = qIdx >= 0 ? s.slice(0, qIdx) : s;
    const queryPart = qIdx >= 0 ? s.slice(qIdx) : '';
    const schemeEnd = pathPart.indexOf('://');
    const authorityEnd = schemeEnd >= 0 ? schemeEnd + 2 : -1;
    const trimmed = pathPart.replace(/\/+$/, (m, off) =>
        off > authorityEnd ? '' : m);
    return trimmed + queryPart;
}

export function validateUrl(url) {
    const s = String(url || '').trim();
    if (!s) return { ok: false, reason: 'URL is empty' };
    let uri;
    try {
        uri = GLib.Uri.parse(s, GLib.UriFlags.NONE);
    } catch (_) {
        return { ok: false, reason: 'Malformed URL' };
    }
    const scheme = (uri.get_scheme() || '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https')
        return { ok: false, reason: 'Only http(s) URLs are supported' };
    if (!uri.get_host())
        return { ok: false, reason: 'URL has no host' };
    return { ok: true };
}

export function detectService(url) {
    let uri;
    try {
        uri = GLib.Uri.parse(String(url || ''), GLib.UriFlags.NONE);
    } catch (_) {
        return 'generic';
    }
    const host = (uri.get_host() || '').toLowerCase();
    const path = uri.get_path() || '';
    const query = uri.get_query();
    if (host === 'meet.google.com') return 'meet';
    if (host.includes('jitsi')) return 'jitsi';
    if (!query && /^\/[A-Za-z0-9._-]+\/?$/.test(path)) return 'jitsi';
    return 'generic';
}

export function serializeRoom(room) {
    return JSON.stringify({
        id: room.id,
        name: room.name,
        url: room.url,
        hotkey: room.hotkey || '',
    });
}

export function parseRoom(json) {
    const obj = JSON.parse(json);
    if (typeof obj !== 'object' || obj === null)
        throw new Error('Room is not an object');
    if (typeof obj.id !== 'string' || !obj.id) throw new Error('Missing id');
    if (typeof obj.name !== 'string') throw new Error('Missing name');
    if (typeof obj.url !== 'string') throw new Error('Missing url');
    return {
        id: obj.id,
        name: obj.name,
        url: obj.url,
        hotkey: typeof obj.hotkey === 'string' ? obj.hotkey : '',
    };
}

export function parseAll(strv) {
    const rooms = [];
    const errors = [];
    (strv || []).forEach((raw, index) => {
        try {
            rooms.push(parseRoom(raw));
        } catch (e) {
            errors.push({ index, raw, message: e.message });
        }
    });
    return { rooms, errors };
}

export function generateId() {
    return GLib.uuid_string_random();
}
