// tests/state.test.js
import { describe, it, expect, beforeEach } from 'vitest';
// Corrected path: includes 'src'
import { store } from '../src/js/state.js';

describe('Global State Management', () => {

    beforeEach(() => {
        store.actions.resetState();
    });

    it('should initialize user with a random name', () => {
        store.actions.initializeUser();
        const state = store.getState();
        expect(state.myName).toBeTruthy();
        expect(state.myName.length).toBeGreaterThan(0);
    });



    it('should set current flight code', () => {
        const code = 'ABC123';
        store.actions.setCurrentFlightCode(code);
        expect(store.getState().currentFlightCode).toBe(code);
    });

    it('should add files to send queue', () => {
        const file1 = new File(['content'], 'test1.txt', { type: 'text/plain' });
        const file2 = new File(['content'], 'test2.png', { type: 'image/png' });

        store.actions.addFilesToQueue([file1, file2]);

        const state = store.getState();
        expect(state.fileToSendQueue).toHaveLength(2);
        expect(state.fileToSendQueue[0].name).toBe('test1.txt');
    });

    it('should handle file ID mapping', () => {
        const file = new File([''], 'test.txt');
        const id = 'unique-id-123';

        store.actions.addFileIdMapping(file, id);
        const retrievedId = store.actions.getFileId(file);

        expect(retrievedId).toBe(id);
    });

    it('should calculate metrics correctly', () => {
        store.actions.updateMetricsOnSend(1000);
        store.actions.updateMetricsOnReceive(500);

        const state = store.getState();
        expect(state.totalBytesSent).toBe(1000);
        expect(state.totalBytesReceived).toBe(500);
        expect(state.sentInInterval).toBe(1000);
    });

    it('should reset metrics interval', () => {
        store.actions.updateMetricsOnSend(1000);
        const time = Date.now();
        store.actions.resetIntervalMetrics(time);

        const state = store.getState();
        expect(state.lastMetricsUpdateTime).toBe(time);
        expect(state.sentInInterval).toBe(0);
        expect(state.totalBytesSent).toBe(1000);
    });

    it('should remove file from queue', () => {
        const file = new File([''], 'remove-me.txt');
        const id = 'remove-id';
        store.actions.addFilesToQueue([file]);
        store.actions.addFileIdMapping(file, id);

        expect(store.getState().fileToSendQueue).toContain(file);

        store.actions.removeFileFromQueue(id);

        expect(store.getState().fileToSendQueue).not.toContain(file);
        expect(store.actions.getFileId(file)).toBeUndefined();
    });

    it('should reorder send queue', () => {
        const file1 = new File([''], '1.txt');
        const file2 = new File([''], '2.txt');
        const file3 = new File([''], '3.txt');
        const id1 = 'id1', id2 = 'id2', id3 = 'id3';

        store.actions.addFilesToQueue([file1, file2, file3]);
        store.actions.addFileIdMapping(file1, id1);
        store.actions.addFileIdMapping(file2, id2);
        store.actions.addFileIdMapping(file3, id3);

        // Reorder to 3, 1, 2
        const newOrder = [id3, id1, id2];
        store.actions.reorderQueueByDom(newOrder);

        const queue = store.getState().fileToSendQueue;
        expect(queue[0]).toBe(file3);
        expect(queue[1]).toBe(file1);
        expect(queue[2]).toBe(file2);
    });

    it('should persist onboarding state', () => {
        localStorage.setItem('dropsilk-onboarding', JSON.stringify({ welcome: true }));
        store.actions.initializeUser();
        expect(store.getState().onboardingState.welcome).toBe(true);
        expect(store.getState().onboardingState.invite).toBe(false); // default
    });
});