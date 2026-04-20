// SPDX-License-Identifier: GPL-2.0-or-later

// Mark a string literal for xgettext extraction without translating it at call time.
// Use when the string must travel through a non-gettext boundary (e.g. returned from
// a pure function) and be translated later via `_()` at display site.
export function N_(s) { return s; }

// Format a template with two %s placeholders. Non-global replace so the first %s
// in `a` is not consumed by the second substitution.
export function format2(template, a, b) {
    return template.replace('%s', a).replace('%s', b);
}
