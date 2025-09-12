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

function scrollIntoViewIfNeeded(element, options = {}) {
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
            block: options.block || 'center',
            inline: options.inline || 'center'
        });
        return true; // Indicates we scrolled
    }
    return false;
}

// Add a more aggressive scroll function for dashboard
function scrollDashboardIntoView() {
    const dashboardHeader = document.getElementById('dashboard-header');
    const dashboard = document.getElementById('dashboard');

    if (dashboardHeader) {
        // Scroll to show the dashboard header clearly at the top
        dashboardHeader.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
        });
        return true;
    } else if (dashboard) {
        // Fallback to dashboard with more aggressive positioning
        dashboard.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
        });
        return true;
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
        const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');
        const viewport = getViewportInfo();

        // Position tooltip
        if (isMobileDevice()) {
            positionTooltipMobile(tooltip, rect, viewport);
        } else {
            positionTooltipDesktop(tooltip, rect, viewport);
        }

        // Highlight the target's parent container
        target.classList.add('onboarding-highlight-parent');

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
                const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');
                const viewport = getViewportInfo();
                if (isMobileDevice()) {
                    positionTooltipMobile(tooltip, rect, viewport);
                } else {
                    positionTooltipDesktop(tooltip, rect, viewport);
                }
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

        // Revert the z-index change
        target.classList.remove('onboarding-highlight-parent');

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
    const parentElement = document.getElementById('dashboard-header');

    if (onboardingState.invite || !inviteOnboarding || !dashboardFlightCodeBtn || !inviteBtn || !parentElement) return;

    const showOnboarding = () => {
        const rect2 = inviteBtn.getBoundingClientRect();
        const tooltip = inviteOnboarding.querySelector('.onboarding-tooltip');

        // Highlight the parent container
        parentElement.classList.add('onboarding-highlight-parent');

        // Position tooltip relative to invite button
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

    const didScroll = scrollDashboardIntoView();

    if (didScroll) {
        setTimeout(showOnboarding, 900);
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

        // Revert the z-index change
        parentElement.classList.remove('onboarding-highlight-parent');

        // Cleanup
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', handleResize);
        }
        clearTimeout(resizeTimeout);
    };
}