#!/usr/bin/env -S gjs -m
import System from 'system';
import { summary } from './harness.js';

async function main() {
    await import('./rooms.test.js');
    await import('./launcher.test.js');
    System.exit(summary());
}

main();
