import { describe, it, assertEqual } from './harness.js';
import { splitCommand, substituteUrl } from '../lib/launcher.js';

describe('splitCommand', () => {
    it('splits simple command', () => {
        assertEqual(splitCommand('xdg-open %U'), ['xdg-open', '%U']);
    });
    it('handles quoted args', () => {
        assertEqual(splitCommand('chromium --app="%U"'), ['chromium', '--app=%U']);
    });
    it('returns empty array for empty string', () => {
        assertEqual(splitCommand(''), []);
    });
});

describe('substituteUrl', () => {
    it('replaces %U token', () => {
        assertEqual(substituteUrl(['xdg-open', '%U'], 'https://x/y'), ['xdg-open', 'https://x/y']);
    });
    it('substitutes inside argument', () => {
        assertEqual(substituteUrl(['chromium', '--app=%U'], 'https://x/y'), ['chromium', '--app=https://x/y']);
    });
    it('appends URL if no %U token anywhere', () => {
        assertEqual(substituteUrl(['firefox', '--new-window'], 'https://x/y'),
            ['firefox', '--new-window', 'https://x/y']);
    });
    it('leaves empty argv empty (no %U and no argv means nothing to spawn)', () => {
        assertEqual(substituteUrl([], 'https://x/y'), ['https://x/y']);
    });
});
