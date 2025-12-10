// src/js/ui/effects.js
const KEY_CANDIDATES = [
    'dropsilk:animation-quality',
    'dropsilk.animQuality',
    'dropsilk.animationQuality',
    'animationQuality',
];

const MAP = {
    high: 'high',
    quality: 'high',
    clarity: 'high',
    smoothness: 'high',
    reduced: 'reduced',
    performance: 'reduced',
    low: 'reduced',
    off: 'off',
    none: 'off',
    disable: 'off',
    disabled: 'off',
};

function norm(val) {
    if (!val) return null;
    const k = String(val).toLowerCase().trim();
    return MAP[k] || null;
}

function safeGet(keys) {
    try {
        for (const k of keys) {
            const v = localStorage.getItem(k);
            if (v) return v;
        }
    } catch { /* empty */ }
    return null;
}

function safeSet(k, v) {
    try {
        localStorage.setItem(k, v);
    } catch { /* empty */ }
}

function readQuality() {
    const v = safeGet(KEY_CANDIDATES);
    if (v) return norm(v);
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'reduced'
        : 'high';
}

function writeQuality(q) {
    // normalise and write to the canonical key
    const v = norm(q) || 'high';
    safeSet('dropsilk:animation-quality', v);
    return v;
}

function applyBodyClasses(q) {
    const b = document.body;
    b.classList.remove('reduced-effects', 'no-effects');
    if (q === 'reduced') b.classList.add('reduced-effects');
    if (q === 'off') b.classList.add('no-effects');
}

function hardStopAurora(q) {
    const aurora = document.querySelector('.aurora-background');
    const blobs = document.querySelectorAll('.aurora-blob');
    if (aurora) {
        if (q === 'off') {
            aurora.hidden = true;
            aurora.style.animationPlayState = 'paused';
        } else {
            aurora.hidden = false;
            aurora.style.animationPlayState = q === 'reduced' ? 'paused' : 'running';
        }
    }
    blobs.forEach((el) => {
        if (q !== 'high') el.setAttribute('hidden', '');
        else el.removeAttribute('hidden');
        el.style.animationPlayState = q === 'high' ? 'running' : 'paused';
    });
}

function updateBoardingSpinnerState() {
    const overlay = document.getElementById('boarding-overlay');
    if (!overlay) return;
    const running = overlay.classList.contains('show');
    overlay
        .querySelectorAll('.spinner, .spinner .path')
        .forEach((el) => {
            el.style.animationPlayState = running ? 'running' : 'paused';
        });
}

function bindSpinnerObserver() {
    const overlay = document.getElementById('boarding-overlay');
    if (!overlay) return;
    new MutationObserver(updateBoardingSpinnerState).observe(overlay, {
        attributes: true,
        attributeFilter: ['class'],
    });
    updateBoardingSpinnerState();
}

function reflectUI(q) {
    const root = document.getElementById('settingsModal');
    if (!root) return;
    root.querySelectorAll('[data-effects]').forEach((btn) => {
        const v = norm(btn.getAttribute('data-effects'));
        const active = v === q;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    root
        .querySelectorAll('[name="animationQuality"]')
        .forEach((inp) => (inp.checked = norm(inp.value) === q));
}

export function applyAnimationQuality(raw) {
    const q = writeQuality(raw);
    applyBodyClasses(q);
    hardStopAurora(q);
    reflectUI(q);
}

export function initEffects() {
    const q = readQuality();
    applyAnimationQuality(q);

    const root = document.getElementById('settingsModal');
    if (root) {
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-effects]');
            if (!btn) return;
            applyAnimationQuality(btn.getAttribute('data-effects'));
        });
        root.addEventListener('change', (e) => {
            const t = e.target;
            if (
                t instanceof HTMLInputElement &&
                t.name === 'animationQuality' &&
                t.checked
            ) {
                applyAnimationQuality(t.value);
            }
        });
    }

    bindSpinnerObserver();
}
