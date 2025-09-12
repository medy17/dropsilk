// js/ui/onboarding.js
import { store } from '../state.js';
import { uiElements } from './dom.js';

// Helper to detect mobile/tablet devices
function isMobileDevice() {
    return window.innerWidth <= 768 ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);
}

// Helper to get safe viewport dimensions (accounting for mobile browser chrome)
function getViewportDimensions() {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        // Use visualViewport if available (better for mobile)
        safeWidth: window.visualViewport?.width || window.innerWidth,
        safeHeight: window.visualViewport?.height || window.innerHeight
    };
}

function positionTooltip(tooltip, targetRect) {
    const viewport = getViewportDimensions();
    const isMobile = isMobileDevice();

    // For mobile, use a different strategy
    if (isMobile) {
        positionTooltipMobile(tooltip, targetRect, viewport);
    } else {
        positionTooltipDesktop(tooltip, targetRect, viewport);
    }
}

function positionTooltipMobile(tooltip, targetRect, viewport) {
    const padding = 16; // Safe padding from edges
    const tooltipRect = tooltip.getBoundingClientRect();

    // For mobile, prefer fixed positioning at bottom or center
    const spaceBelow = viewport.safeHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    let top, left;

    // If target is in upper half, position below
    if (targetRect.top < viewport.safeHeight / 2) {
        // Position below with some spacing
        top = Math.min(
            targetRect.bottom + 20,
            viewport.safeHeight - tooltipRect.height - padding
        );
    }
    // If target is in lower half, position above
    else {
        top = Math.max(
            targetRect.top - tooltipRect.height - 20,
            padding
        );
    }

    // For mobile, center horizontally or use safe margins
    const maxTooltipWidth = viewport.safeWidth - (padding * 2);

    // If tooltip is too wide, it should be handled by CSS max-width
    // But we can ensure it's centered and fits
    left = Math.max(
        padding,
        Math.min(
            (viewport.safeWidth - tooltipRect.width) / 2,
            viewport.safeWidth - tooltipRect.width - padding
        )
    );

    // Final safety clamps
    top = Math.max(padding, Math.min(top, viewport.safeHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, viewport.safeWidth - tooltipRect.width - padding));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Ensure tooltip doesn't exceed mobile width
    tooltip.style.maxWidth = `${maxTooltipWidth}px`;
    tooltip.style.width = 'auto';
}

function positionTooltipDesktop(tooltip, targetRect, viewport) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const spaceBelow = viewport.height - targetRect.bottom;
    const spaceAbove = targetRect.top;

    let top, left;

    // Prefer to position below if there's enough space
    if (spaceBelow > tooltipRect.height + 20) {
        top = targetRect.bottom + 15;
    }
    // Otherwise, prefer above if there's enough space
    else if (spaceAbove > tooltipRect.height + 20) {
        top = targetRect.top - tooltipRect.height - 15;
    }
    // If neither has enough space, just put it below
    else {
        top = targetRect.bottom + 15;
    }

    // Center horizontally relative to target
    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    // Clamp to viewport edges
    const padding = 10;
    if (left < padding) left = padding;
    if (left + tooltipRect.width > viewport.width - padding) {
        left = viewport.width - tooltipRect.width - padding;
    }

    if (top < padding) top = padding;
    if (top + tooltipRect.height > viewport.height - padding) {
        top = viewport.height - tooltipRect.height - padding;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.maxWidth = '320px'; // Reset to default
    tooltip.style.width = 'auto';
}

function positionSpotlight(spotlight, targetRect, padding = 10) {
    const isMobile = isMobileDevice();

    // On mobile, use smaller padding to avoid spotlight being too large
    const safePadding = isMobile ? 5 : padding;

    spotlight.style.top = `${targetRect.top - safePadding}px`;
    spotlight.style.left = `${targetRect.left - safePadding}px`;
    spotlight.style.width = `${targetRect.width + (safePadding * 2)}px`;
    spotlight.style.height = `${targetRect.height + (safePadding * 2)}px`;
}

export function showWelcomeOnboarding() {
    const { onboardingState, invitationPending } = store.getState();
    const { welcomeOnboarding } = uiElements;

    if (onboardingState.welcome || invitationPending || !welcomeOnboarding) return;

    const target = document.querySelector('.flight-ticket-panel-wrapper');
    if (!target) return;

    // Wait for next frame to ensure accurate measurements
    requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const spotlight = welcomeOnboarding.querySelector('.onboarding-spotlight');
        const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');

        positionSpotlight(spotlight, rect);
        positionTooltip(tooltip, rect);

        welcomeOnboarding.style.display = 'block';
        setTimeout(() => welcomeOnboarding.classList.add('show'), 10);

        // Lock body scroll
        document.body.style.overflow = 'hidden';
    });

    // Handle orientation/resize changes
    const handleResize = () => {
        if (welcomeOnboarding.classList.contains('show')) {
            const rect = target.getBoundingClientRect();
            const spotlight = welcomeOnboarding.querySelector('.onboarding-spotlight');
            const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');

            positionSpotlight(spotlight, rect);
            positionTooltip(tooltip, rect);
        }
    };

    // Listen for viewport changes (including virtual keyboard on mobile)
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
    }

    uiElements.dismissWelcomeBtn.onclick = () => {
        welcomeOnboarding.classList.remove('show');
        setTimeout(() => welcomeOnboarding.style.display = 'none', 300);
        store.actions.updateOnboardingState('welcome');
        document.body.style.overflow = '';

        // Clean up event listeners
        window.removeEventListener('resize', handleResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', handleResize);
        }
    };
}

export function showInviteOnboarding() {
    const { onboardingState } = store.getState();
    const { inviteOnboarding, dashboardFlightCodeBtn, inviteBtn } = uiElements;

    if (onboardingState.invite || !inviteOnboarding || !dashboardFlightCodeBtn || !inviteBtn) return;

    requestAnimationFrame(() => {
        const rect1 = dashboardFlightCodeBtn.getBoundingClientRect();
        const rect2 = inviteBtn.getBoundingClientRect();
        const isMobile = isMobileDevice();

        const spotlight1 = inviteOnboarding.querySelector('.invite-spotlight-1');
        positionSpotlight(spotlight1, rect1, 5);
        spotlight1.style.borderRadius = '12px';

        const spotlight2 = inviteOnboarding.querySelector('.invite-spotlight-2');
        positionSpotlight(spotlight2, rect2, 5);
        spotlight2.style.borderRadius = '14px';

        const tooltip = inviteOnboarding.querySelector('.onboarding-tooltip');

        // For mobile, position relative to the more prominent element (invite button)
        // For desktop, same behavior
        positionTooltip(tooltip, rect2);

        inviteOnboarding.style.display = 'block';
        setTimeout(() => inviteOnboarding.classList.add('show'), 10);

        document.body.style.overflow = 'hidden';
    });

    // Handle orientation/resize changes
    const handleResize = () => {
        if (inviteOnboarding.classList.contains('show')) {
            const rect1 = dashboardFlightCodeBtn.getBoundingClientRect();
            const rect2 = inviteBtn.getBoundingClientRect();

            const spotlight1 = inviteOnboarding.querySelector('.invite-spotlight-1');
            positionSpotlight(spotlight1, rect1, 5);

            const spotlight2 = inviteOnboarding.querySelector('.invite-spotlight-2');
            positionSpotlight(spotlight2, rect2, 5);

            const tooltip = inviteOnboarding.querySelector('.onboarding-tooltip');
            positionTooltip(tooltip, rect2);
        }
    };

    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
    }

    uiElements.dismissInviteBtn.onclick = () => {
        inviteOnboarding.classList.remove('show');
        setTimeout(() => inviteOnboarding.style.display = 'none', 300);
        store.actions.updateOnboardingState('invite');
        document.body.style.overflow = '';

        // Clean up event listeners
        window.removeEventListener('resize', handleResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', handleResize);
        }
    };
}