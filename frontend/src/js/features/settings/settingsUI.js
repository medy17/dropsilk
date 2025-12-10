// features/settings/settingsUI.js
// Handles settings modal UI rendering and event binding

import i18next from '../../i18n.js';
import { audioManager } from '../../utils/audioManager.js';
import { applyTheme } from '../theme/index.js';
import {
  getAllSettings,
  getPreviewConsentMap,
  setPreviewConsent,
  applyAnimationQuality,
  applySystemFont,
} from './settingsData.js';

// --- NEW IMPORT ---
// We import the generated arrays/objects here
import { AVAILABLE_THEMES, THEME_CONFIG } from '../../themeConfig.gen.js';

/**
 * Creates the HTML for the settings modal content
 * @returns {string} HTML string
 */
export function createSettingsModalHTML() {
  const settings = getAllSettings();
  const consentMap = getPreviewConsentMap();
  const pptxConsent = consentMap.pptx || 'ask';

  // --- DYNAMIC OPTION GENERATION ---
  // Instead of hardcoding HTML, we map over the keys from your generated file.
  const themeOptions = AVAILABLE_THEMES.map(key => {
    const config = THEME_CONFIG[key];
    // Check if this is the currently selected theme
    const isSelected = settings.theme === key ? 'selected' : '';
    // Create the option tag
    return `<option value="${key}" ${isSelected}>${config.name}</option>`;
  }).join('\n');

  return `
      <div class="settings-list">
        ${createToggleSetting('sounds', i18next.t('sounds'), i18next.t('soundsDescription'), settings.sounds)}
        ${createToggleSetting('analytics', i18next.t('analytics'), i18next.t('analyticsDescription'), settings.analytics)}
        
        ${createToggleSetting('mode', i18next.t('darkMode'), i18next.t('darkModeDescription'), settings.mode === 'dark')}

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('theme')}</div>
            <div class="settings-item-desc">${i18next.t('themeDescription', 'Choose your preferred color palette.')}</div>
          </div>
          <select class="settings-select" id="settings-theme-selector">
            <option value="default" ${settings.theme === 'default' ? 'selected' : ''}>${i18next.t('default', 'Default')}</option>
            <!-- INJECT DYNAMIC OPTIONS HERE -->
            ${themeOptions}
          </select>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('animationQuality')}</div>
            <div class="settings-item-desc">${i18next.t('animationQualityDescription')}</div>
          </div>
          <div class="segmented" id="settings-animation-quality">
            <button type="button" class="seg-btn ${settings.animationQuality === 'quality' ? 'active' : ''}" data-value="quality">${i18next.t('best')}</button>
            <button type="button" class="seg-btn ${settings.animationQuality === 'performance' ? 'active' : ''}" data-value="performance">${i18next.t('basic')}</button>
            <button type="button" class="seg-btn ${settings.animationQuality === 'off' ? 'active' : ''}" data-value="off">${i18next.t('off')}</button>
          </div>
        </div>
        
        <div class="settings-item">
            <div class="settings-item-info">
                <div class="settings-item-title">${i18next.t('language')}</div>
                <div class="settings-item-desc">${i18next.t('languageDescription')}</div>
            </div>
            <select class="settings-select" id="settings-language">
                ${getLanguageOptions()}
            </select>
        </div>
        
        ${createToggleSetting('system-font', i18next.t('preferSystemFont'), i18next.t('preferSystemFontDescription'), settings.systemFont)}
        ${createToggleSetting('auto-download', i18next.t('autoDownload'), i18next.t('autoDownloadDescription'), settings.autoDownload)}
        
        <div class="settings-item" id="auto-download-size-container" style="${settings.autoDownload ? '' : 'display: none;'}">
            <div class="settings-item-info">
                <div class="settings-item-title">${i18next.t('autoDownloadMaxSize')}</div>
                <div class="settings-item-desc">${i18next.t('autoDownloadMaxSizeDescription')}</div>
            </div>
            <input type="number" class="settings-number-input" id="settings-auto-download-max-size" value="${settings.autoDownloadMaxSize}" min="0.001" max="3000" step="any" />
        </div>
        
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('pptxPreview')}</div>
            <div class="settings-item-desc">${i18next.t('pptxPreviewDescription')}</div>
          </div>
          <div class="segmented" id="settings-pptx-consent">
            <button type="button" class="seg-btn ${pptxConsent === 'ask' ? 'active' : ''}" data-value="ask">${i18next.t('ask')}</button>
            <button type="button" class="seg-btn ${pptxConsent === 'allow' ? 'active' : ''}" data-value="allow">${i18next.t('allow')}</button>
            <button type="button" class="seg-btn ${pptxConsent === 'deny' ? 'active' : ''}" data-value="deny">${i18next.t('deny')}</button>
          </div>
        </div>

        <div class="settings-item-full-width" style="margin-top: 1rem; margin-bottom: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--c-panel-border);">
            <h4 style="margin: 0; color: var(--c-text-secondary); font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;">${i18next.t('advanced')}</h4>
        </div>
        
        ${createToggleSetting('opfs-buffer', i18next.t('safeMode'), i18next.t('safeModeDescription'), settings.opfsEnabled, !settings.opfsSupported)}
        
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${i18next.t('transferChunkSize')}</div>
            <div class="settings-item-desc">${i18next.t('transferChunkSizeDescription')}</div>
          </div>
          <input type="number" class="settings-number-input" id="settings-chunk-size" value="${settings.chunkSize}" min="16384" max="1048576" step="16384" />
        </div>

        <div class="settings-item-full-width">
            <button class="btn btn-danger" id="reset-preferences-btn">${i18next.t('resetAllPreferences')}</button>
        </div>
      </div>
    `;
}

/**
 * Creates a toggle setting item HTML
 */
function createToggleSetting(id, title, description, checked, disabled = false) {
  return `
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${title}</div>
            <div class="settings-item-desc">${description}</div>
          </div>
          <label class="switch">
            <input type="checkbox" class="switch-input" id="settings-${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}/>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>
    `;
}

/**
 * Gets language options HTML
 */
function getLanguageOptions() {
  const langs = [
    { code: 'en', name: 'english' },
    { code: 'es', name: 'spanish' },
    { code: 'fr', name: 'french' },
    { code: 'it', name: 'italian' },
    { code: 'ja', name: 'japanese' },
    { code: 'ms', name: 'malay' },
    { code: 'pt', name: 'portuguese' },
    { code: 'sw', name: 'swahili' },
    { code: 'zh', name: 'chinese' },
  ];

  return langs.map(lang =>
    `<option value="${lang.code}" ${i18next.language.startsWith(lang.code) ? 'selected' : ''}>${i18next.t(lang.name)}</option>`
  ).join('\n');
}

/**
 * Binds event listeners to settings modal elements
 * @param {HTMLElement} container - The settings container element
 * @param {Function} onSave - Callback when settings change
 */
export function bindSettingsEvents(container, onSave) {
  // Sounds toggle
  container.querySelector('#settings-sounds')?.addEventListener('change', (e) => {
    if (e.target.checked) audioManager.enable();
    else audioManager.disable();
    onSave?.();
  });

  // Analytics toggle
  container.querySelector('#settings-analytics')?.addEventListener('change', (e) => {
    localStorage.setItem('dropsilk-privacy-consent', e.target.checked ? 'true' : 'false');
    onSave?.();
  });

  // Mode selector
  // Dark Mode toggle
  container.querySelector('#settings-mode')?.addEventListener('change', (e) => {
    const mode = e.target.checked ? 'dark' : 'light';
    applyTheme(null, mode); // Update mode only
    onSave?.();
  });

  // Theme selector
  container.querySelector('#settings-theme-selector')?.addEventListener('change', (e) => {
    applyTheme(e.target.value, null); // Update theme only
    onSave?.();
  });

  // Animation quality segmented control
  container.querySelector('#settings-animation-quality')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    container.querySelectorAll('#settings-animation-quality .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyAnimationQuality(btn.dataset.value);
    onSave?.();
  });

  // Language select
  container.querySelector('#settings-language')?.addEventListener('change', (e) => {
    i18next.changeLanguage(e.target.value);
    localStorage.setItem('dropsilk-language', e.target.value);
    onSave?.();
  });

  // System font toggle
  container.querySelector('#settings-system-font')?.addEventListener('change', (e) => {
    localStorage.setItem('dropsilk-system-font', e.target.checked ? 'true' : 'false');
    applySystemFont(e.target.checked);
    onSave?.();
  });

  // Auto-download toggle
  container.querySelector('#settings-auto-download')?.addEventListener('change', (e) => {
    localStorage.setItem('dropsilk-auto-download', e.target.checked ? 'true' : 'false');
    const sizeContainer = container.querySelector('#auto-download-size-container');
    if (sizeContainer) sizeContainer.style.display = e.target.checked ? '' : 'none';
    onSave?.();
  });

  // Auto-download max size
  container.querySelector('#settings-auto-download-max-size')?.addEventListener('change', (e) => {
    localStorage.setItem('dropsilk-auto-download-max-size', e.target.value);
    onSave?.();
  });

  // PPTX consent segmented control
  container.querySelector('#settings-pptx-consent')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    container.querySelectorAll('#settings-pptx-consent .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setPreviewConsent('pptx', btn.dataset.value);
    onSave?.();
  });

  // OPFS toggle
  container.querySelector('#settings-opfs-buffer')?.addEventListener('change', (e) => {
    localStorage.setItem('dropsilk-use-opfs-buffer', e.target.checked ? 'true' : 'false');
    onSave?.();
  });

  // Chunk size input
  container.querySelector('#settings-chunk-size')?.addEventListener('change', (e) => {
    localStorage.setItem('dropsilk-chunk-size', e.target.value);
    onSave?.();
  });

  // Reset preferences button
  container.querySelector('#reset-preferences-btn')?.addEventListener('click', () => {
    if (confirm(i18next.t('resetPreferencesConfirm', 'Are you sure you want to reset all preferences?'))) {
      const keys = [
        'dropsilk-mode', 'dropsilk-color-theme', 'dropsilk-animation-quality', 'dropsilk-system-font',
        'dropsilk-auto-download', 'dropsilk-auto-download-max-size', 'dropsilk-chunk-size',
        'dropsilk-use-opfs-buffer', 'dropsilk-preview-consent', 'dropsilk-language',
      ]; keys.forEach(key => localStorage.removeItem(key));
      audioManager.enable();
      // We reload anyway, but for clarity:
      applyTheme('default', 'light');
      location.reload();
    }
  });
}