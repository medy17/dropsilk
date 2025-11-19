// tests/view.test.js
import { describe, it, expect, beforeEach } from 'vitest';
// Corrected paths: include 'src'
import {
    updateDashboardStatus,
    disableDropZone,
    enableDropZone,
    renderNetworkUsersView
} from '../src/js/ui/view.js';
import { store } from '../src/js/state.js';

describe('View / UI Logic', () => {

    beforeEach(() => {
        document.getElementById('dashboard-flight-status').textContent = '';
        document.querySelector('.drop-zone').classList.remove('disabled');
        document.getElementById('connection-panel-list').innerHTML = '';
    });

    it('should update dashboard status and apply color class', () => {
        updateDashboardStatus('Connected', 'connected');
        const statusEl = document.getElementById('dashboard-flight-status');

        expect(statusEl.textContent).toBe('Connected');
        expect(statusEl.style.color).toBe('rgb(21, 128, 61)');
    });

    it('should disable the drop zone', () => {
        disableDropZone();
        const dropZone = document.querySelector('.drop-zone');
        const text = dropZone.querySelector('p');

        expect(dropZone.classList.contains('disabled')).toBe(true);
        expect(text.textContent).toBe('waitingForPeer');
    });

    it('should enable the drop zone', () => {
        document.querySelector('.drop-zone').classList.add('disabled');

        enableDropZone();
        const dropZone = document.querySelector('.drop-zone');
        const text = dropZone.querySelector('p');

        expect(dropZone.classList.contains('disabled')).toBe(false);
        expect(text.textContent).toBe('dragAndDrop');
    });

    it('should render network users', () => {
        const users = [
            { name: 'Alice', id: 'user-1' },
            { name: 'Bob', id: 'user-2' }
        ];
        store.actions.setLastNetworkUsers(users);
        store.actions.setCurrentFlightCode('CODE12');

        renderNetworkUsersView();

        const list = document.getElementById('connection-panel-list');
        const items = list.getElementsByClassName('network-user-item');

        expect(items.length).toBe(2);
        expect(items[0].innerHTML).toContain('Alice');
        expect(items[1].innerHTML).toContain('Bob');

        const btn = items[0].querySelector('.invite-user-btn');
        expect(btn.disabled).toBe(false);
    });
});