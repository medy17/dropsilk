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
        // Safe offsets (account for mobile browser UI/toolbars)
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

    // Ensure we measure actual size (if a CSS transition/transform is active)
    const prevVisibility = tooltip.style.visibility;
    const prevTransform = tooltip.style.transform;
    tooltip.style.visibility = 'hidden';
    tooltip.style.transform = 'none';

    // Get tooltip dimensions after setting max-width
    const tooltipRect = tooltip.getBoundingClientRect();

    let top, left;

    // Always center horizontally on mobile (include safeLeft)
    left = viewport.safeLeft + (viewport.vw - tooltipRect.width) / 2;

    // For vertical positioning, use a simpler strategy
    // Map target rect to the visual viewport coordinate space using safeTop.
    // getBoundingClientRect() is typically visual-viewport relative, but
    // safeTop guards against iOS dynamic UI inconsistencies.
    const targetTopVis = targetRect.top - viewport.safeTop;
    const targetBottomVis = targetRect.bottom - viewport.safeTop;
    const targetCenterY = targetTopVis + (targetRect.height / 2);
    const viewportCenter = viewport.vh / 2;

    if (targetCenterY < viewportCenter) {
        // Target is in upper half - position tooltip below target
        top = viewport.safeTop + targetBottomVis + 20;

        // But make sure it doesn't go off screen
        if (top + tooltipRect.height > viewport.safeTop + viewport.vh - padding) {
            top = viewport.safeTop + viewport.vh - tooltipRect.height - padding;
        }
    } else {
        // Target is in lower half - position tooltip above target
        top = viewport.safeTop + targetTopVis - tooltipRect.height - 20;

        // Make sure it doesn't go above screen
        if (top < viewport.safeTop + padding) {
            top = viewport.safeTop + padding;
        }
    }

    // Final safety checks
    left = Math.max(
        viewport.safeLeft + padding,
        Math.min(left, viewport.safeLeft + viewport.vw - tooltipRect.width - padding)
    );
    top = Math.max(
        viewport.safeTop + padding,
        Math.min(top, viewport.safeTop + viewport.vh - tooltipRect.height - padding)
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    // Restore styles
    tooltip.style.visibility = prevVisibility;
    tooltip.style.transform = prevTransform;
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
        const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');
        // Make overlay visible first so measurements are correct
        welcomeOnboarding.style.display = 'block';
        // Next frame: measure and position
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const viewport = getViewportInfo();

            if (isMobileDevice()) {
                positionTooltipMobile(tooltip, rect, viewport);
            } else {
                positionTooltipDesktop(tooltip, rect, viewport);
            }

            // Highlight the target's parent container
            target.classList.add('onboarding-highlight-parent');

            // Force reflow then animate in
            // eslint-disable-next-line no-unused-expressions
            welcomeOnboarding.offsetHeight;
            welcomeOnboarding.classList.add('show');
            document.body.style.overflow = 'hidden';
        });
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
        window.visualViewport.addEventListener('scroll', handleResize);
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
            window.visualViewport.removeEventListener('scroll', handleResize);
        }
        clearTimeout(resizeTimeout);

        // --- MODIFICATION: Signal that the welcome onboarding is complete ---
        document.dispatchEvent(new CustomEvent('onboardingWelcomeDismissed'));
    };
}

export function showInviteOnboarding() {
    const { onboardingState } = store.getState();
    const { inviteOnboarding, dashboardFlightCodeBtn, inviteBtn } = uiElements;
    const parentElement = document.getElementById('dashboard-header');

    if (onboardingState.invite || !inviteOnboarding || !dashboardFlightCodeBtn || !inviteBtn || !parentElement) return;

    const showOnboarding = () => {
        const tooltip = inviteOnboarding.querySelector('.onboarding-tooltip');
        // Make overlay visible first so measurements are correct
        inviteOnboarding.style.display = 'block';
        requestAnimationFrame(() => {
            const rect2 = inviteBtn.getBoundingClientRect();
            const viewport = getViewportInfo();

            // Highlight the parent container
            parentElement.classList.add('onboarding-highlight-parent');

            if (isMobileDevice()) {
                positionTooltipMobile(tooltip, rect2, viewport);
            } else {
                positionTooltipDesktop(tooltip, rect2, viewport);
            }

            // Force reflow then animate in
            // eslint-disable-next-line no-unused-expressions
            inviteOnboarding.offsetHeight;
            inviteOnboarding.classList.add('show');
            document.body.style.overflow = 'hidden';
        });
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
        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleResize);
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
            window.visualViewport.removeEventListener('scroll', handleResize);
        }
        clearTimeout(resizeTimeout);
    };
}