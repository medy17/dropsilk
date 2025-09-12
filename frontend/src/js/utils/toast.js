// js/utils/toast.js
// Manages the creation and display of toast notifications.

import { uiElements } from '../ui/dom.js';
import { store } from '../state.js';
import { sendMessage } from '../network/websocket.js';

export function showToast({ type = 'info', title, body, duration = 10000, actions = [], onRemove = null }) {
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.id = toastId;

    let actionsHTML = '';
    if (actions.length > 0) {
        actionsHTML = '<div class="toast-actions">';
        actions.forEach((action, index) => {
            actionsHTML += `<button class="btn ${action.class || ''} action-btn-${index}">${action.text}</button>`;
        });
        actionsHTML += '</div>';
    }

    toast.innerHTML = `
        <div class="toast-header">
            <strong>${title}</strong>
            <button class="toast-close">×</button>
        </div>
        <div class="toast-body">${body}</div>
        ${actionsHTML}
    `;

    uiElements.toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);

    const removeToast = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
        if (onRemove) onRemove(); // Execute the callback on removal
    };

    let autoDismiss;
    if (duration > 0) {
        autoDismiss = setTimeout(removeToast, duration);
    }

    toast.addEventListener('click', (e) => {
        if (e.target.matches('.toast-close')) {
            clearTimeout(autoDismiss);
            removeToast();
        }
        actions.forEach((action, index) => {
            if (e.target.matches(`.action-btn-${index}`)) {
                action.callback();
                clearTimeout(autoDismiss);
                removeToast();
            }
        });
    });
}

export function showInvitationToast(fromName, flightCode) {
    store.actions.setInvitationPending(true); // Set the flag when the invitation appears

    showToast({
        type: 'info',
        title: 'Flight Invitation',
        body: `<b>${fromName}</b> has invited you to a flight.`,
        duration: 15000,
        actions: [
            {
                text: 'Decline',
                class: 'btn-secondary',
                callback: () => console.log('Invitation declined.')
            },
            {
                text: 'Join',
                class: 'btn-primary',
                callback: () => {
                    store.actions.setIsFlightCreator(false);
                    sendMessage({ type: "join-flight", flightCode });
                }
            }
        ],
        // Reset the flag when the toast is removed for any reason
        onRemove: () => store.actions.setInvitationPending(false)
    });
}