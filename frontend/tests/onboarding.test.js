import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as onboarding from '../src/js/ui/onboarding.js';

const { mockStore, mockUiElements } = vi.hoisted(() => {
    return {
        mockStore: {
            getState: vi.fn(),
            actions: {
                updateOnboardingState: vi.fn()
            }
        },
        mockUiElements: {
            welcomeOnboarding: null,
            dismissWelcomeBtn: null,
            inviteOnboarding: null,
            dashboardFlightCodeBtn: null,
            inviteBtn: null,
            dismissInviteBtn: null
        }
    };
});

vi.mock('../src/js/state.js', () => ({
    store: mockStore
}));

vi.mock('../src/js/ui/dom.js', () => ({
    uiElements: mockUiElements
}));


describe('Onboarding UI', () => {
    let container;

    beforeEach(() => {
        // Reset mocks
        vi.resetAllMocks();

        // Setup DOM
        container = document.createElement('div');
        document.body.appendChild(container);

        // create elements
        mockUiElements.welcomeOnboarding = document.createElement('div');
        mockUiElements.welcomeOnboarding.id = 'welcomeOnboarding';
        mockUiElements.welcomeOnboarding.innerHTML = '<div class="onboarding-tooltip"></div>';
        mockUiElements.dismissWelcomeBtn = document.createElement('button');

        mockUiElements.inviteOnboarding = document.createElement('div');
        mockUiElements.inviteOnboarding.id = 'inviteOnboarding';
        mockUiElements.inviteOnboarding.innerHTML = '<div class="onboarding-tooltip"></div>';
        mockUiElements.inviteBtn = document.createElement('button');
        mockUiElements.inviteBtn.id = 'inviteBtn';
        mockUiElements.dashboardFlightCodeBtn = document.createElement('button');
        mockUiElements.dismissInviteBtn = document.createElement('button');

        container.appendChild(mockUiElements.welcomeOnboarding);
        container.appendChild(mockUiElements.inviteOnboarding);
        container.appendChild(mockUiElements.inviteBtn);

        // Create target for welcome onboarding
        const ticketPanel = document.createElement('div');
        ticketPanel.className = 'flight-ticket-panel-wrapper';
        container.appendChild(ticketPanel);

        // Create parent for invite onboarding
        const dashboardHeader = document.createElement('div');
        dashboardHeader.id = 'dashboard-header';
        container.appendChild(dashboardHeader);

        // Mock window dimensions
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
        Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });

        // Mock getBoundingClientRect
        Element.prototype.getBoundingClientRect = vi.fn(() => ({
            top: 100,
            bottom: 200,
            left: 100,
            right: 200,
            width: 100,
            height: 100
        }));

        // Mock requestAnimationFrame to execute immediately
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());

        // Mock setTimeout
        vi.useFakeTimers();

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('showWelcomeOnboarding', () => {
        it('should show welcome onboarding when criteria met', () => {
            mockStore.getState.mockReturnValue({
                onboardingState: { welcome: false },
                invitationPending: false
            });

            onboarding.showWelcomeOnboarding();
            vi.runAllTimers(); // For scroll/timeout delays

            expect(mockUiElements.welcomeOnboarding.style.display).toBe('block');
            expect(mockUiElements.welcomeOnboarding.classList.contains('show')).toBe(true);

            // Should position tooltip (desktop logic)
            const tooltip = mockUiElements.welcomeOnboarding.querySelector('.onboarding-tooltip');
            expect(tooltip.style.position).toBe('absolute');
        });

        it('should NOT show if already seen', () => {
            mockStore.getState.mockReturnValue({
                onboardingState: { welcome: true }, // Seen
                invitationPending: false
            });

            onboarding.showWelcomeOnboarding();
            vi.runAllTimers();

            expect(mockUiElements.welcomeOnboarding.style.display).not.toBe('block');
        });

        it('should handle dismissal', () => {
            mockStore.getState.mockReturnValue({
                onboardingState: { welcome: false },
                invitationPending: false
            });

            onboarding.showWelcomeOnboarding();
            vi.runAllTimers();

            // Click dismiss
            mockUiElements.dismissWelcomeBtn.onclick();

            expect(mockUiElements.welcomeOnboarding.classList.contains('show')).toBe(false);
            expect(mockStore.actions.updateOnboardingState).toHaveBeenCalledWith('welcome');

            vi.runAllTimers(); // animation delay
            expect(mockUiElements.welcomeOnboarding.style.display).toBe('none');
        });

        it('should position correctly on mobile', () => {
            window.innerWidth = 375; // Mobile width
            mockStore.getState.mockReturnValue({
                onboardingState: { welcome: false },
                invitationPending: false
            });

            onboarding.showWelcomeOnboarding();
            vi.runAllTimers();

            const tooltip = mockUiElements.welcomeOnboarding.querySelector('.onboarding-tooltip');
            expect(tooltip.style.position).toBe('fixed'); // Mobile logic uses fixed
        });
    });

    describe('showInviteOnboarding', () => {
        it('should show invite onboarding when criteria met', () => {
            mockStore.getState.mockReturnValue({
                onboardingState: { invite: false }
            });

            console.log('Before showInviteOnboarding');
            console.log('header:', document.getElementById('dashboard-header'));
            console.log('inviteBtn:', mockUiElements.inviteBtn);

            onboarding.showInviteOnboarding();
            vi.runAllTimers();

            console.log('After timer', mockUiElements.inviteOnboarding.style.display);

            expect(mockUiElements.inviteOnboarding.style.display).toBe('block');
            expect(mockUiElements.inviteOnboarding.classList.contains('show')).toBe(true);
        });

        it('should NOT show if already seen', () => {
            mockStore.getState.mockReturnValue({
                onboardingState: { invite: true }
            });

            onboarding.showInviteOnboarding();
            vi.runAllTimers();

            expect(mockUiElements.inviteOnboarding.style.display).not.toBe('block');
        });

        it('should handle dismissal', () => {
            mockStore.getState.mockReturnValue({
                onboardingState: { invite: false }
            });

            onboarding.showInviteOnboarding();
            vi.runAllTimers();

            // Click dismiss
            mockUiElements.dismissInviteBtn.onclick();

            expect(mockUiElements.inviteOnboarding.classList.contains('show')).toBe(false);
            expect(mockStore.actions.updateOnboardingState).toHaveBeenCalledWith('invite');

            vi.runAllTimers();
            expect(mockUiElements.inviteOnboarding.style.display).toBe('none');
        });
    });
});
