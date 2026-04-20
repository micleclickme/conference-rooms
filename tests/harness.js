let passed = 0;
let failed = 0;
const failures = [];

export function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

export function it(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${name}`);
        console.log(`    ${e.message}`);
        failed++;
        failures.push({ name, error: e });
    }
}

export function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e)
        throw new Error(`${msg || 'Expected'}: ${e}, got: ${a}`);
}

export function assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'Expected true');
}

export function assertFalse(cond, msg) {
    if (cond) throw new Error(msg || 'Expected false');
}

export function assertThrows(fn, msg) {
    try {
        fn();
    } catch (_) {
        return;
    }
    throw new Error(msg || 'Expected function to throw');
}

export function summary() {
    console.log(`\n${passed} passed, ${failed} failed`);
    return failed === 0 ? 0 : 1;
}
