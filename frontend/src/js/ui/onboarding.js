// js/ui/onboarding.js
import { store } from '../state.js';
import { uiElements } from './dom.js';

function isMobileDevice() {
    return window.innerWidth <= 768;
}

function getViewportInfo() {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        // Use visualViewport for better mobile support
        vw: window.visualViewport?.width || window.innerWidth,
        vh: window.visualViewport?.height || window.innerHeight,
        // Safe area (accounting for mobile browser UI)
        safeTop: window.visualViewport?.offsetTop || 0,
        safeLeft: window.visualViewport?.offsetLeft || 0
    };
}

function positionTooltipMobile(tooltip, targetRect, viewport) {
    const padding = 16;

    // Reset any previous positioning
    tooltip.style.position = 'fixed';
    tooltip.style.width = 'auto';
    tooltip.style.maxWidth = `${Math.min(320, viewport.vw - (padding * 2))}px`;

    // Get tooltip dimensions after setting max-width
    const tooltipRect = tooltip.getBoundingClientRect();

    let top, left;

    // Always center horizontally on mobile
    left = (viewport.vw - tooltipRect.width) / 2;

    // For vertical positioning, use a simpler strategy
    const targetCenterY = targetRect.top + (targetRect.height / 2);
    const viewportCenter = viewport.vh / 2;

    if (targetCenterY < viewportCenter) {
        // Target is in upper half - position tooltip below target
        top = targetRect.bottom + 20;

        // But make sure it doesn't go off screen
        if (top + tooltipRect.height > viewport.vh - padding) {
            top = viewport.vh - tooltipRect.height - padding;
        }
    } else {
        // Target is in lower half - position tooltip above target
        top = targetRect.top - tooltipRect.height - 20;

        // Make sure it doesn't go above screen
        if (top < padding) {
            top = padding;
        }
    }

    // Final safety checks
    left = Math.max(padding, Math.min(left, viewport.vw - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, viewport.vh - tooltipRect.height - padding));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function positionTooltipDesktop(tooltip, targetRect, viewport) {
    tooltip.style.position = 'absolute';
    tooltip.style.maxWidth = '320px';
    tooltip.style.width = 'auto';

    const tooltipRect = tooltip.getBoundingClientRect();
    const spaceBelow = viewport.height - targetRect.bottom;
    const spaceAbove = targetRect.top;

    let top, left;

    if (spaceBelow > tooltipRect.height + 20) {
        top = targetRect.bottom + 15;
    } else if (spaceAbove > tooltipRect.height + 20) {
        top = targetRect.top - tooltipRect.height - 15;
    } else {
        top = targetRect.bottom + 15;
    }

    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    const padding = 10;
    left = Math.max(padding, Math.min(left, viewport.width - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, viewport.height - tooltipRect.height - padding));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function positionElements(spotlight, tooltip, targetRect) {
    const viewport = getViewportInfo();
    const isMobile = isMobileDevice();

    // Position spotlight
    const spotlightPadding = isMobile ? 8 : 10;
    spotlight.style.position = 'fixed';
    spotlight.style.top = `${targetRect.top - spotlightPadding}px`;
    spotlight.style.left = `${targetRect.left - spotlightPadding}px`;
    spotlight.style.width = `${targetRect.width + (spotlightPadding * 2)}px`;
    spotlight.style.height = `${targetRect.height + (spotlightPadding * 2)}px`;

    // Position tooltip based on device type
    if (isMobile) {
        positionTooltipMobile(tooltip, targetRect, viewport);
    } else {
        positionTooltipDesktop(tooltip, targetRect, viewport);
    }
}

function scrollIntoViewIfNeeded(element) {
    const rect = element.getBoundingClientRect();
    const viewport = getViewportInfo();

    // Check if element is reasonably visible
    const isVisible = rect.top >= 0 &&
        rect.bottom <= viewport.vh &&
        rect.left >= 0 &&
        rect.right <= viewport.vw;

    if (!isVisible) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
        });
        return true; // Indicates we scrolled
    }
    return false;
}

export function showWelcomeOnboarding() {
    const { onboardingState, invitationPending } = store.getState();
    const { welcomeOnboarding } = uiElements;

    if (onboardingState.welcome || invitationPending || !welcomeOnboarding) return;

    const target = document.querySelector('.flight-ticket-panel-wrapper');
    if (!target) return;

    const showOnboarding = () => {
        const rect = target.getBoundingClientRect();
        const spotlight = welcomeOnboarding.querySelector('.onboarding-spotlight');
        const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');

        positionElements(spotlight, tooltip, rect);

        welcomeOnboarding.style.display = 'block';
        // Force reflow before adding show class
        welcomeOnboarding.offsetHeight;
        welcomeOnboarding.classList.add('show');

        document.body.style.overflow = 'hidden';
    };

    // Scroll target into view if needed, then show onboarding
    const didScroll = scrollIntoViewIfNeeded(target);
    if (didScroll) {
        // Wait for scroll to complete
        setTimeout(showOnboarding, 600);
    } else {
        // Show immediately
        requestAnimationFrame(showOnboarding);
    }

    // Handle resize/orientation changes
    let resizeTimeout;
    const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (welcomeOnboarding.classList.contains('show')) {
                const rect = target.getBoundingClientRect();
                const spotlight = welcomeOnboarding.querySelector('.onboarding-spotlight');
                const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');
                positionElements(spotlight, tooltip, rect);
            }
        }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
    }

    uiElements.dismissWelcomeBtn.onclick = () => {
        welcomeOnboarding.classList.remove('show');
        setTimeout(() => {
            welcomeOnboarding.style.display = 'none';
        }, 300);
        store.actions.updateOnboardingState('welcome');
        document.body.style.overflow = '';

        // Cleanup
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', handleResize);
        }
        clearTimeout(resizeTimeout);
    };
}

export function showInviteOnboarding() {
    const { onboardingState } = store.getState();
    const { inviteOnboarding, dashboardFlightCodeBtn, inviteBtn } = uiElements;

    if (onboardingState.invite || !inviteOnboarding || !dashboardFlightCodeBtn || !inviteBtn) return;

    const showOnboarding = () => {
        const rect1 = dashboardFlightCodeBtn.getBoundingClientRect();
        const rect2 = inviteBtn.getBoundingClientRect();

        const spotlight1 = inviteOnboarding.querySelector('.invite-spotlight-1');
        const spotlight2 = inviteOnboarding.querySelector('.invite-spotlight-2');
        const tooltip = inviteOnboarding.querySelector('.onboarding-tooltip');

        // Position spotlights
        const spotlightPadding = isMobileDevice() ? 6 : 8;

        spotlight1.style.position = 'fixed';
        spotlight1.style.top = `${rect1.top - spotlightPadding}px`;
        spotlight1.style.left = `${rect1.left - spotlightPadding}px`;
        spotlight1.style.width = `${rect1.width + (spotlightPadding * 2)}px`;
        spotlight1.style.height = `${rect1.height + (spotlightPadding * 2)}px`;
        spotlight1.style.borderRadius = '12px';

        spotlight2.style.position = 'fixed';
        spotlight2.style.top = `${rect2.top - spotlightPadding}px`;
        spotlight2.style.left = `${rect2.left - spotlightPadding}px`;
        spotlight2.style.width = `${rect2.width + (spotlightPadding * 2)}px`;
        spotlight2.style.height = `${rect2.height + (spotlightPadding * 2)}px`;
        spotlight2.style.borderRadius = '14px';

        // Position tooltip relative to invite button (more prominent)
        const viewport = getViewportInfo();
        if (isMobileDevice()) {
            positionTooltipMobile(tooltip, rect2, viewport);
        } else {
            positionTooltipDesktop(tooltip, rect2, viewport);
        }

        inviteOnboarding.style.display = 'block';
        inviteOnboarding.offsetHeight; // Force reflow
        inviteOnboarding.classList.add('show');

        document.body.style.overflow = 'hidden';
    };

    // Check if both elements are visible, scroll dashboard into view if needed
    const dashboard = document.getElementById('dashboard');
    const didScroll = dashboard ? scrollIntoViewIfNeeded(dashboard) : false;

    if (didScroll) {
        setTimeout(showOnboarding, 600);
    } else {
        requestAnimationFrame(showOnboarding);
    }

    // Handle resize/orientation changes
    let resizeTimeout;
    const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (inviteOnboarding.classList.contains('show')) {
                showOnboarding();
            }
        }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
    }

    uiElements.dismissInviteBtn.onclick = () => {
        inviteOnboarding.classList.remove('show');
        setTimeout(() => {
            inviteOnboarding.style.display = 'none';
        }, 300);
        store.actions.updateOnboardingState('invite');
        document.body.style.overflow = '';

        // Cleanup
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', handleResize);
        }
        clearTimeout(resizeTimeout);
    };
}