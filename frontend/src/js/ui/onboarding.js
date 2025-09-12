// js/ui/onboarding.js
import { store } from '../state.js';
import { uiElements } from './dom.js';

function positionTooltip(tooltip, targetRect) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    let top, left;

    // Prefer to position below if there's enough space.
    if (spaceBelow > tooltipRect.height + 20) {
        top = targetRect.bottom + 15;
    }
    // Otherwise, prefer above if there's enough space.
    else if (spaceAbove > tooltipRect.height + 20) {
        top = targetRect.top - tooltipRect.height - 15;
    }
    // If neither has enough space, just put it below and let it be clamped.
    else {
        top = targetRect.bottom + 15;
    }

    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    // Clamp horizontally to the viewport edges
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }

    // Clamp vertically to the viewport edges
    if (top < 10) top = 10;
    if (top + tooltipRect.height > window.innerHeight - 10) {
        top = window.innerHeight - tooltipRect.height - 10;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

export function showWelcomeOnboarding() {
    const { onboardingState, invitationPending } = store.getState();
    const { welcomeOnboarding } = uiElements;

    if (onboardingState.welcome || invitationPending || !welcomeOnboarding) return;

    const target = document.querySelector('.flight-ticket-panel-wrapper');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const spotlight = welcomeOnboarding.querySelector('.onboarding-spotlight');
    const tooltip = welcomeOnboarding.querySelector('.onboarding-tooltip');

    spotlight.style.top = `${rect.top - 10}px`;
    spotlight.style.left = `${rect.left - 10}px`;
    spotlight.style.width = `${rect.width + 20}px`;
    spotlight.style.height = `${rect.height + 20}px`;

    positionTooltip(tooltip, rect);

    welcomeOnboarding.style.display = 'block';
    setTimeout(() => welcomeOnboarding.classList.add('show'), 10);

    // FIX: Lock body scroll
    document.body.style.overflow = 'hidden';

    uiElements.dismissWelcomeBtn.onclick = () => {
        welcomeOnboarding.classList.remove('show');
        setTimeout(() => welcomeOnboarding.style.display = 'none', 300);
        store.actions.updateOnboardingState('welcome');
        // FIX: Unlock body scroll
        document.body.style.overflow = '';
    };
}

export function showInviteOnboarding() {
    const { onboardingState } = store.getState();
    const { inviteOnboarding, dashboardFlightCodeBtn, inviteBtn } = uiElements;

    if (onboardingState.invite || !inviteOnboarding || !dashboardFlightCodeBtn || !inviteBtn) return;

    const rect1 = dashboardFlightCodeBtn.getBoundingClientRect();
    const rect2 = inviteBtn.getBoundingClientRect();

    const spotlight1 = inviteOnboarding.querySelector('.invite-spotlight-1');
    spotlight1.style.top = `${rect1.top - 5}px`;
    spotlight1.style.left = `${rect1.left - 5}px`;
    spotlight1.style.width = `${rect1.width + 10}px`;
    spotlight1.style.height = `${rect1.height + 10}px`;
    spotlight1.style.borderRadius = '12px';

    const spotlight2 = inviteOnboarding.querySelector('.invite-spotlight-2');
    spotlight2.style.top = `${rect2.top - 5}px`;
    spotlight2.style.left = `${rect2.left - 5}px`;
    spotlight2.style.width = `${rect2.width + 10}px`;
    spotlight2.style.height = `${rect2.height + 10}px`;
    spotlight2.style.borderRadius = '14px';

    const tooltip = inviteOnboarding.querySelector('.onboarding-tooltip');
    positionTooltip(tooltip, rect2);

    inviteOnboarding.style.display = 'block';
    setTimeout(() => inviteOnboarding.classList.add('show'), 10);

    // FIX: Lock body scroll
    document.body.style.overflow = 'hidden';

    uiElements.dismissInviteBtn.onclick = () => {
        inviteOnboarding.classList.remove('show');
        setTimeout(() => inviteOnboarding.style.display = 'none', 300);
        store.actions.updateOnboardingState('invite');
        // FIX: Unlock body scroll
        document.body.style.overflow = '';
    };
}