// js/app.js
// This is the main entry point for the application.
import "../styles/index.css"; // load for vite
import i18next from "./i18n.js";
import { store } from "./state.js";
import { renderUserName, showBoardingOverlay, initializeOnboardingPulses } from "./ui/view.js";
import { initializeEventListeners } from "./ui/events.js";
import { initializeModals } from "./ui/modals.js";
import { connect as connectWebSocket } from "./network/websocket.js";
import { showWelcomeOnboarding } from "./ui/onboarding.js";

function initializeGlobalUI() {
    console.log("Initializing Global UI (Theme, Modals)...");
    initializeModals();
}

function translateStaticElements() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const optionsAttr = element.getAttribute('data-i18n-options');
        let options = {};
        if (optionsAttr) {
            try {
                options = JSON.parse(optionsAttr);
            } catch (e) {
                console.error(`Could not parse i18n options for key "${key}":`, optionsAttr, e);
            }
        }
        element.innerHTML = i18next.t(key, options);
    });
}

// Function now accepts a parameter to know if the user was invited
function initializeAppCore(isInvitedUser = false) {
    console.log("Initializing App Core Logic...");

    // Attach all event listeners specific to the app.
    initializeEventListeners();

    // Initialize the user's state (including onboarding state).
    store.actions.initializeUser();

    // Now that the user's state is loaded, we can safely check consent/onboarding.
    initializePrivacyConsent();

    // Ensure we only lazy-load reCAPTCHA when it is actually needed.
    initializeRecaptchaLazyLoad();

    // Render the initial user name on the ticket.
    renderUserName();

    // Show visual cues like pulsing buttons for new users.
    initializeOnboardingPulses();

    // Connect to the signaling server.
    connectWebSocket();

    // Only show the welcome guide if it's a new, non-invited user.
    if (!isInvitedUser) {
        // Use a small delay to allow the main layout to settle.
        setTimeout(showWelcomeOnboarding, 500);
    }
}

/**
 * Utility: create and append a script element from a "deferred" script tag.
 * The deferred tag should have type="text/plain" and its URL in data-src.
 * Returns a Promise that resolves when the script loads.
 */
function activateDeferredScript(byId, { async = true, defer = false } = {}) {
    const placeholder = document.getElementById(byId);
    if (!placeholder) {
        return Promise.resolve();
    }
    if (placeholder.getAttribute("data-activated") === "true") {
        return Promise.resolve(); // already activated
    }

    const src = placeholder.getAttribute("data-src") || placeholder.src || "";
    if (!src) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        if (async) s.async = true;
        if (defer) s.defer = true;
        s.onload = () => {
            placeholder.setAttribute("data-activated", "true");
            resolve();
        };
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
    });
}

/**
 * Activates the Google Analytics scripts after consent is given.
 * Also ensures the init snippet runs once gtag.js is loaded.
 */
let analyticsLoaded = false;
function activateAnalytics() {
    if (analyticsLoaded) return;

    const loaderPlaceholder = document.getElementById("gtag-script-loader");
    const initPlaceholder = document.getElementById("gtag-script-init");

    if (!loaderPlaceholder || !initPlaceholder) {
        console.warn("Analytics placeholders not found; skipping analytics.");
        return;
    }

    activateDeferredScript("gtag-script-loader")
        .then(() => {
            const initScript = document.createElement("script");
            initScript.textContent = initPlaceholder.textContent || "";
            document.head.appendChild(initScript);
            initPlaceholder.setAttribute("data-activated", "true");
            analyticsLoaded = true;
            console.log("Analytics activated after consent.");
        })
        .catch((err) => {
            console.error("Failed to load analytics:", err);
        });
}

/**
 * Activates Vercel Speed Insights after consent.
 */
let speedInsightsLoaded = false;
function activateSpeedInsights() {
    if (speedInsightsLoaded) return;
    const id = "vercel-speed-insights";
    activateDeferredScript(id)
        .then(() => {
            speedInsightsLoaded = true;
            console.log("Speed Insights activated after consent.");
        })
        .catch((err) => {
            console.error("Failed to load Speed Insights:", err);
        });
}

// Expose activators so Settings UI can enable them after consent
// (Disabling/removal requires a reload; we’ll prompt the user.)
window.dsActivateAnalytics = function () {
    try { activateAnalytics(); activateSpeedInsights(); } catch (e) { console.warn(e); }
};

/**
 * reCAPTCHA lazy-load and first-click render.
 */
let recaptchaRequested = false;
let recaptchaWidgetId = null;
let recaptchaScriptLoading = null;

function getRecaptchaSiteKey() {
    const scriptPh = document.getElementById("recaptcha-script");
    const container = document.getElementById("recaptcha-container");
    const keyFromScript = scriptPh?.getAttribute("data-sitekey") || "";
    const keyFromContainer = container?.getAttribute("data-sitekey") || "";
    const sitekey = keyFromScript || keyFromContainer || "";
    if (!sitekey) {
        console.warn(
            "reCAPTCHA site key not found. Set data-sitekey on #recaptcha-script or #recaptcha-container."
        );
    }
    return sitekey;
}

function revealEmailUI() {
    const pretext = document.getElementById("captcha-pretext");
    const initial = document.getElementById("email-view-initial-state");
    const captcha = document.getElementById("email-view-captcha-state");
    const revealed = document.getElementById("email-view-revealed-state");
    if (pretext) pretext.style.display = "none";
    if (initial) initial.style.display = "none";
    if (captcha) captcha.style.display = "none";
    if (revealed) revealed.style.display = "block";
}

function renderRecaptchaIfNeeded() {
    const container = document.getElementById("recaptcha-container");
    if (!container) return;

    // Ensure container is visible (important for some UI libs)
    const captchaState = document.getElementById("email-view-captcha-state");
    if (captchaState && captchaState.style.display === "none") {
        captchaState.style.display = "block";
    }

    const sitekey = getRecaptchaSiteKey();
    if (!sitekey) return;

    if (container.dataset.widgetId) {
        // Already rendered
        return;
    }

    if (!window.grecaptcha || typeof window.grecaptcha.render !== "function") {
        // Script not ready yet
        return;
    }

    const widgetId = window.grecaptcha.render(container, {
        sitekey,
        callback: (token) => {
            // Token received; reveal email UI
            revealEmailUI();
            // You can verify token server-side if you wish.
        },
        "error-callback": () => {
            console.warn("reCAPTCHA error occurred.");
        },
        "expired-callback": () => {
            console.warn("reCAPTCHA expired, resetting.");
            if (typeof window.grecaptcha?.reset === "function") {
                window.grecaptcha.reset(widgetId);
            }
        },
    });

    container.dataset.widgetId = String(widgetId);
    recaptchaWidgetId = widgetId;
    console.log("reCAPTCHA rendered.");
}

function loadRecaptchaScriptAndRender() {
    // Define onload callback before injecting the script, so the query param finds it.
    window.onRecaptchaLoadCallback = function () {
        try {
            if (typeof window.grecaptcha?.ready === "function") {
                window.grecaptcha.ready(() => {
                    renderRecaptchaIfNeeded();
                });
            } else {
                renderRecaptchaIfNeeded();
            }
        } catch (e) {
            console.error("Error in onRecaptchaLoadCallback:", e);
        }
    };

    if (!recaptchaScriptLoading) {
        recaptchaScriptLoading = activateDeferredScript("recaptcha-script").catch(
            (err) => {
                console.error("Failed to load reCAPTCHA:", err);
                recaptchaScriptLoading = null;
            }
        );
    } else {
        // If already loading or loaded, try rendering again (in case it's ready now)
        recaptchaScriptLoading.finally(() => {
            if (window.grecaptcha) {
                renderRecaptchaIfNeeded();
            }
        });
    }
}

function initializeRecaptchaLazyLoad() {
    const viewEmailBtn = document.getElementById("viewEmailBtn");
    if (!viewEmailBtn) return;

    viewEmailBtn.addEventListener("click", () => {
        if (!recaptchaRequested) {
            recaptchaRequested = true;
            // Show CAPTCHA state
            const initial = document.getElementById("email-view-initial-state");
            const captcha = document.getElementById("email-view-captcha-state");
            if (initial) initial.style.display = "none";
            if (captcha) captcha.style.display = "block";

            if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
                renderRecaptchaIfNeeded();
            } else {
                loadRecaptchaScriptAndRender();
            }
        } else {
            // Subsequent clicks: ensure it's visible and rendered
            renderRecaptchaIfNeeded();
        }
    });
}

/**
 * Manages the privacy consent banner and analytics script loading.
 */
function initializePrivacyConsent() {
    const consentToast = document.getElementById("privacy-consent-toast");
    const acceptBtn = document.getElementById("accept-privacy-btn");
    const privacyLinkInToast = document.getElementById("privacy-link-in-toast");
    const privacyModalTrigger = document.getElementById("privacyBtn");

    if (!consentToast || !acceptBtn || !privacyLinkInToast || !privacyModalTrigger)
        return;

    const hasConsented =
        localStorage.getItem("dropsilk-privacy-consent") === "true";

    if (hasConsented) {
        // Load analytics-related scripts immediately for returning users.
        activateAnalytics();
        activateSpeedInsights();
        return; // Don't show the toast if already consented
    }

    // Logic to show the toast
    const showPrivacyToast = () => {
        setTimeout(() => {
            consentToast.style.display = "block";
            // Force reflow
            // eslint-disable-next-line no-unused-expressions
            consentToast.offsetHeight;
            consentToast.classList.add("show");
        }, 500);
    };

    const hasSeenWelcome = store.getState().onboardingState.welcome;
    if (hasSeenWelcome) {
        showPrivacyToast();
    } else {
        document.addEventListener("onboardingWelcomeDismissed", showPrivacyToast, {
            once: true,
        });
    }

    // Event listener for the accept button
    acceptBtn.addEventListener("click", () => {
        localStorage.setItem("dropsilk-privacy-consent", "true");
        activateAnalytics();
        activateSpeedInsights();
        consentToast.classList.remove("show");
        setTimeout(() => {
            consentToast.style.display = "none";
        }, 500);
    });

    // Event listener for the "Privacy Policy" link inside the toast
    privacyLinkInToast.addEventListener("click", () => {
        privacyModalTrigger.click();
    });
}

// --- Main Execution ---
document.addEventListener("DOMContentLoaded", () => {
    console.log("DropSilk Initializing...");

    const applyTranslations = () => translateStaticElements();
    if (i18next.isInitialized) applyTranslations();
    else i18next.on('initialized', applyTranslations);
    i18next.on('languageChanged', applyTranslations);

    initializeGlobalUI();

    const isAppPage = document.querySelector(".main-content");

    const urlParams = new URLSearchParams(window.location.search);
    const flightCodeFromUrl = urlParams.get("code");

    if (isAppPage) {
        const isInvited = flightCodeFromUrl && flightCodeFromUrl.length === 6;
        // If there's a valid code in the URL, show the boarding screen immediately.
        if (isInvited) {
            showBoardingOverlay(flightCodeFromUrl);
        }
        // Pass the invited status to the core initializer
        initializeAppCore(isInvited);
    } else {
        console.log(
            "On a non-app page (e.g., 404). Core logic will not be initialized."
        );
    }
});