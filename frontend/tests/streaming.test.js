import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as streaming from '../src/js/ui/streaming.js';

describe('Streaming UI', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        // Setup DOM elements needed for streaming
        container.innerHTML = `
            <div id="local-stream-panel" class="hidden">
                <video id="local-video" muted></video>
                <div class="stream-settings-menu" style="display: none;">
                    <button data-quality="performance">Performance</button>
                    <button data-quality="quality">Quality</button>
                    <button data-quality="clarity">Clarity</button>
                </div>
                <button class="stream-settings-btn"></button>
            </div>
            <div id="screen-share-panel" class="hidden">
                <video id="remote-video" autoplay></video>
                <button id="fullscreen-stream-btn"></button>
            </div>
            <button id="shareScreenBtn" class="hidden">
                <span>Start Sharing</span>
            </button>
        `;

        // Mock MediaStream
        global.MediaStream = class MockMediaStream {
            getVideoTracks() {
                return [{
                    onended: null,
                    stop: vi.fn(),
                    applyConstraints: vi.fn()
                }];
            }
        };

        // Mock scrollIntoView
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    describe('showLocalStreamView', () => {
        it('should show local stream panel and set video source', () => {
            const stream = new MediaStream();
            const callback = vi.fn();

            streaming.showLocalStreamView(stream, callback);

            const panel = document.getElementById('local-stream-panel');
            const video = document.getElementById('local-video');

            expect(panel.classList.contains('hidden')).toBe(false);
            expect(video.srcObject).toBe(stream);
            expect(panel.scrollIntoView).toHaveBeenCalled();
        });

        it('should handle settings menu interaction', () => {
            const stream = new MediaStream();
            const callback = vi.fn();

            streaming.showLocalStreamView(stream, callback);

            const settingsBtn = container.querySelector('.stream-settings-btn');
            const settingsMenu = container.querySelector('.stream-settings-menu');

            // Open menu
            settingsBtn.click();
            expect(settingsMenu.style.display).toBe('block');

            // Select quality
            const qualityBtn = settingsMenu.querySelector('[data-quality="quality"]');
            qualityBtn.click();

            expect(callback).toHaveBeenCalledWith('quality');
            expect(qualityBtn.classList.contains('active')).toBe(true);
            expect(settingsMenu.style.display).toBe('none');
        });

        it('should switch between quality settings correctly', () => {
            const stream = new MediaStream();
            const callback = vi.fn();

            streaming.showLocalStreamView(stream, callback);

            const settingsBtn = container.querySelector('.stream-settings-btn');
            const settingsMenu = container.querySelector('.stream-settings-menu');
            const performanceBtn = settingsMenu.querySelector('[data-quality="performance"]');
            const qualityBtn = settingsMenu.querySelector('[data-quality="quality"]');

            // Open menu
            settingsBtn.click();

            // Select performance first
            performanceBtn.click();
            expect(callback).toHaveBeenCalledWith('performance');
            expect(performanceBtn.classList.contains('active')).toBe(true);
            expect(qualityBtn.classList.contains('active')).toBe(false);

            // Open menu again
            settingsBtn.click();

            // Switch to quality
            qualityBtn.click();
            expect(callback).toHaveBeenCalledWith('quality');
            expect(qualityBtn.classList.contains('active')).toBe(true);
            expect(performanceBtn.classList.contains('active')).toBe(false);
        });
    });

    describe('hideLocalStreamView', () => {
        it('should hide panel and clear video source', () => {
            const stream = new MediaStream();
            const panel = document.getElementById('local-stream-panel');
            const video = document.getElementById('local-video');

            video.srcObject = stream;
            panel.classList.remove('hidden');

            streaming.hideLocalStreamView();

            expect(panel.classList.contains('hidden')).toBe(true);
            expect(video.srcObject).toBeNull();
        });
    });

    describe('showRemoteStreamView', () => {
        it('should show remote stream panel and set video source', () => {
            const stream = new MediaStream();
            streaming.showRemoteStreamView(stream);

            const panel = document.getElementById('screen-share-panel');
            const video = document.getElementById('remote-video');

            expect(panel.classList.contains('hidden')).toBe(false);
            expect(video.srcObject).toBe(stream);
            expect(panel.scrollIntoView).toHaveBeenCalled();
        });

        // Note: Fullscreen API is hard to mock completely in JSDOM, 
        // but we can check if the button click handler is attached
        it('should attach fullscreen handler', () => {
            const stream = new MediaStream();
            streaming.showRemoteStreamView(stream);

            const fullscreenBtn = document.getElementById('fullscreen-stream-btn');
            expect(fullscreenBtn.onclick).toBeInstanceOf(Function);
        });
    });

    describe('hideRemoteStreamView', () => {
        it('should hide panel and clear video source', () => {
            const stream = new MediaStream();
            const panel = document.getElementById('screen-share-panel');
            const video = document.getElementById('remote-video');

            video.srcObject = stream;
            panel.classList.remove('hidden');

            streaming.hideRemoteStreamView();

            expect(panel.classList.contains('hidden')).toBe(true);
            expect(video.srcObject).toBeNull();
        });
    });

    describe('updateShareButton', () => {
        it('should update button state when sharing', () => {
            streaming.updateShareButton(true);

            const btn = document.getElementById('shareScreenBtn');
            const textSpan = btn.querySelector('span');

            expect(btn.classList.contains('is-sharing')).toBe(true);
            expect(textSpan.textContent).toBe('stopSharing'); // Mock returns key
        });

        it('should update button state when not sharing', () => {
            streaming.updateShareButton(false);

            const btn = document.getElementById('shareScreenBtn');
            const textSpan = btn.querySelector('span');

            expect(btn.classList.contains('is-sharing')).toBe(false);
            expect(textSpan.textContent).toBe('shareScreen'); // Mock returns key
        });
    });
});
