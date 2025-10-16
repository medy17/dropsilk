// src/js/ui/tutorial.js

import { uiElements } from './dom.js';
import { sendMessage } from '../network/websocket.js';
import { showToast } from '../utils/toast.js';

// Internal state
let currentStepIndex = -1;
let steps = [];

// Positioning helpers
function isMobileDevice() {
    return window.innerWidth <= 768;
}
function getViewportInfo() {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        vw: window.visualViewport?.width || window.innerWidth,
        vh: window.visualViewport?.height || window.innerHeight,
        safeTop: window.visualViewport?.offsetTop || 0,
        safeLeft: window.visualViewport?.offsetLeft || 0,
    };
}
function positionTooltip(tooltip, targetRect) {
    const viewport = getViewportInfo();
    tooltip.style.position = isMobileDevice() ? 'fixed' : 'absolute';
    tooltip.style.maxWidth = `${Math.min(320, viewport.vw - 32)}px`;
    tooltip.style.width = 'auto';

    const tooltipRect = tooltip.getBoundingClientRect();
    let top;
    let left;

    if (isMobileDevice()) {
        left = viewport.safeLeft + (viewport.vw - tooltipRect.width) / 2;
        const targetCenterY = targetRect.top - viewport.safeTop + targetRect.height / 2;
        if (targetCenterY < viewport.vh / 2) {
            top = viewport.safeTop + (targetRect.bottom - viewport.safeTop) + 20;
        } else {
            top = viewport.safeTop + (targetRect.top - viewport.safeTop) - tooltipRect.height - 20;
        }
        left = Math.max(
            viewport.safeLeft + 16,
            Math.min(left, viewport.safeLeft + viewport.vw - tooltipRect.width - 16),
        );
        top = Math.max(
            viewport.safeTop + 16,
            Math.min(top, viewport.safeTop + viewport.vh - tooltipRect.height - 16),
        );
    } else {
        const spaceBelow = viewport.height - targetRect.bottom;
        top = spaceBelow > tooltipRect.height + 20
            ? targetRect.bottom + 15
            : targetRect.top - tooltipRect.height - 15;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        left = Math.max(10, Math.min(left, viewport.width - tooltipRect.width - 10));
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function scrollIntoViewIfNeeded(element) {
    if (!element.checkVisibility()) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return new Promise((r) => setTimeout(r, 300));
    }
    return Promise.resolve();
}

// Safe target resolver: if not found, anchor to dashboard header so we never abort
function resolveTarget(step) {
    try {
        const el = typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
        if (el) return el;
    } catch {}
    return document.getElementById('dashboard-header') || document.body;
}

// Core show logic
async function showStep(index) {
    if (index >= steps.length) {
        return endTutorial();
    }
    currentStepIndex = index;

    const step = steps[index];
    const { tutorialOverlay, tutorialTooltip } = uiElements;

    const target = resolveTarget(step);
    await scrollIntoViewIfNeeded(target);

    // Render actions: primary Next/Start/etc + Skip
    const primaryLabel = step.primaryLabel || 'Next';
    const secondaryLabel = step.secondaryLabel || 'Skip Tutorial';

    tutorialTooltip.innerHTML = `
    <h3>${step.title}</h3>
    <p>${step.text}</p>
    <div id="tutorialTooltipActions" style="display:flex; gap:.5rem; margin-top:1rem; flex-wrap:wrap;">
      <button class="btn btn-primary" id="tutorialPrimaryBtn">${primaryLabel}</button>
      <button class="btn btn-secondary" id="tutorialSkipBtn">${secondaryLabel}</button>
    </div>
  `;

    tutorialOverlay.style.display = 'block';

    requestAnimationFrame(() => {
        positionTooltip(tutorialTooltip, target.getBoundingClientRect());
        target.classList.add('onboarding-highlight-parent');
        tutorialOverlay.classList.add('show');

        // Wire buttons
        const primary = document.getElementById('tutorialPrimaryBtn');
        const skip = document.getElementById('tutorialSkipBtn');

        if (primary) {
            primary.onclick = () => {
                try {
                    step.onPrimary?.();
                } catch {}
                advanceTutorial();
            };
        }
        if (skip) {
            skip.onclick = () => endTutorial();
        }
    });
}

function hideTooltip() {
    const { tutorialOverlay } = uiElements;
    tutorialOverlay.classList.remove('show');
    document
        .querySelectorAll('.onboarding-highlight-parent')
        .forEach((el) => el.classList.remove('onboarding-highlight-parent'));
    setTimeout(() => {
        tutorialOverlay.style.display = 'none';
    }, 200);
}

// Steps
function defineSteps() {
    steps = [
        {
            // 0: Start
            target: '#dashboard-header',
            title: 'Welcome to the Demo!',
            text:
                "We'll use a demo bot to show you how receiving works. Press Start to receive the first file.",
            primaryLabel: 'Start',
            onPrimary: () => {
                // Create the demo flight is already done by startTutorial; we only trigger the first file here
                sendMessage({ type: 'demo-next-step', step: 'first-file' });
            },
        },
        {
            // 1: File received
            target: () => document.querySelector('#receiver-queue .queue-item') || document.getElementById('receiver-queue'),
            title: 'File Received!',
            text:
                "You can preview with the eye icon, or download it. When you're ready, press Next.",
            primaryLabel: 'Next',
        },
        {
            // 2: Send more files
            target: '#receiver-queue',
            title: 'Multiple Files',
            text:
                "Let’s add a few more files so you can see batch options. Press “Send More Files”.",
            primaryLabel: 'Send More Files',
            onPrimary: () => {
                sendMessage({ type: 'demo-next-step', step: 'remaining-files' });
            },
        },
        {
            // 3: Show zip button (or queue if it’s not drawn yet—user can still press Next)
            target: () =>
                document.getElementById('downloadAllBtn') || document.getElementById('receiver-queue'),
            title: 'Batch Download',
            text:
                'When multiple files are present, “Download All as Zip” appears. You can click it now, then press Next.',
            primaryLabel: 'Next',
        },
        {
            // 4: Inside modal (or still the header if not open—user can still proceed)
            target: () =>
                document.getElementById('zip-file-list') || document.getElementById('dashboard-header'),
            title: 'Select Files',
            text:
                'Choose which files to include. When you’re ready, press Next and then use “Download Selected as Zip” yourself.',
            primaryLabel: 'Next',
        },
        {
            // 5: Point at the download button
            target: () =>
                document.getElementById('downloadSelectedBtn') ||
                document.getElementById('dashboard-header'),
            title: 'All set!',
            text:
                'Press “Download Selected as Zip” to save them. You can keep the demo bot connected and experiment as long as you like.',
            primaryLabel: 'Finish',
            onPrimary: () => {},
        },
    ];
}

// Public API
export function advanceTutorial() {
    const next = currentStepIndex + 1;
    showStep(next);
}

export function startTutorial() {
    localStorage.setItem('dropsilk-tutorial-state', 'started');
    // Let backend create the demo flight
    sendMessage({ type: 'create-flight-for-demo' });
    // Show the first step (Start)
    showStep(0);
}

export function initTutorial() {
    defineSteps();
}

// Optional global helper (not used by WebSocket anymore)
if (typeof window !== 'undefined' && !window.dsAdvanceTutorial) {
    window.dsAdvanceTutorial = () => {
        try {
            advanceTutorial();
        } catch (e) {
            console.warn('dsAdvanceTutorial error:', e);
        }
    };
}