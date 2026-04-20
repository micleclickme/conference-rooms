import { describe, it, assertEqual } from './harness.js';
import { canonicalizeUrl, validateUrl, detectService, parseAll, serializeRoom, parseRoom, generateId } from '../lib/rooms.js';

describe('canonicalizeUrl', () => {
    it('adds https:// when scheme missing', () => {
        assertEqual(canonicalizeUrl('meet.google.com/abc'), 'https://meet.google.com/abc');
    });
    it('strips trailing slash from path', () => {
        assertEqual(canonicalizeUrl('https://meet.jit.si/standup/'), 'https://meet.jit.si/standup');
    });
    it('removes fragment', () => {
        assertEqual(canonicalizeUrl('https://meet.jit.si/foo#bar'), 'https://meet.jit.si/foo');
    });
    it('trims whitespace', () => {
        assertEqual(canonicalizeUrl('  https://meet.jit.si/foo  '), 'https://meet.jit.si/foo');
    });
    it('preserves query string', () => {
        assertEqual(canonicalizeUrl('https://meet.jit.si/foo?jwt=xyz'), 'https://meet.jit.si/foo?jwt=xyz');
    });
    it('keeps http:// if explicitly provided', () => {
        assertEqual(canonicalizeUrl('http://internal.example.com/room'), 'http://internal.example.com/room');
    });
});

describe('validateUrl', () => {
    it('accepts https URL', () => { assertEqual(validateUrl('https://meet.jit.si/x').ok, true); });
    it('accepts http URL', () => { assertEqual(validateUrl('http://x.example/y').ok, true); });
    it('rejects empty', () => { assertEqual(validateUrl('').ok, false); });
    it('rejects javascript:', () => { assertEqual(validateUrl('javascript:alert(1)').ok, false); });
    it('rejects file://', () => { assertEqual(validateUrl('file:///etc/passwd').ok, false); });
    it('rejects URL without host', () => { assertEqual(validateUrl('https://').ok, false); });
});

describe('detectService', () => {
    it('detects Google Meet', () => { assertEqual(detectService('https://meet.google.com/abc-defg-hij'), 'meet'); });
    it('detects jitsi by hostname substring', () => { assertEqual(detectService('https://meet.jit.si/standup'), 'jitsi'); });
    it('detects self-hosted jitsi hostname', () => { assertEqual(detectService('https://jitsi.example.com/room'), 'jitsi'); });
    it('detects single-segment self-hosted as jitsi', () => { assertEqual(detectService('https://call.example.com/standup'), 'jitsi'); });
    it('returns generic when path has query string', () => { assertEqual(detectService('https://example.com/standup?x=1'), 'generic'); });
    it('returns generic for deep path', () => { assertEqual(detectService('https://example.com/a/b/c'), 'generic'); });
    it('returns generic for empty path', () => { assertEqual(detectService('https://example.com/'), 'generic'); });
});

describe('serializeRoom / parseRoom', () => {
    it('round-trips a room', () => {
        const r = { id: 'abc', name: 'X', url: 'https://x/y', hotkey: '<Super>1' };
        assertEqual(parseRoom(serializeRoom(r)), r);
    });
    it('defaults missing hotkey to empty string', () => {
        const json = '{"id":"a","name":"N","url":"https://u"}';
        assertEqual(parseRoom(json).hotkey, '');
    });
});

describe('parseAll', () => {
    it('skips broken JSON but keeps valid ones', () => {
        const strv = [
            '{"id":"a","name":"A","url":"https://a","hotkey":""}',
            'not-json',
            '{"id":"b","name":"B","url":"https://b","hotkey":"<Super>b"}',
        ];
        const result = parseAll(strv);
        assertEqual(result.rooms.length, 2);
        assertEqual(result.rooms[0].id, 'a');
        assertEqual(result.rooms[1].id, 'b');
        assertEqual(result.errors.length, 1);
        assertEqual(result.errors[0].index, 1);
    });
});

describe('generateId', () => {
    it('returns a 36-char UUID', () => {
        const id = generateId();
        assertEqual(id.length, 36);
        assertEqual(/^[0-9a-f-]{36}$/.test(id), true);
    });
    it('returns unique values', () => {
        assertEqual(generateId() === generateId(), false);
    });
});
