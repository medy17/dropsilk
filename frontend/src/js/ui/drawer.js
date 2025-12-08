// ui/drawer.js
// Handles the side drawer navigation

/**
 * Initializes the side drawer
 */
export function initializeDrawer() {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    const toggleBtn = document.getElementById('drawer-toggle');
    const closeBtn = document.getElementById('drawer-close');
    const drawerNav = document.getElementById('drawer-nav');

    if (!drawer || !overlay || !toggleBtn || !closeBtn || !drawerNav) return;

    // Prevents the drawer from animating on page load.
    setTimeout(() => {
        drawer.classList.add('drawer-ready');
    }, 0);

    const openDrawer = () => document.body.classList.add('drawer-open');
    const closeDrawer = () => document.body.classList.remove('drawer-open');

    toggleBtn.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    drawerNav.addEventListener('click', (e) => {
        if (e.target.matches('.drawer-nav-link')) {
            drawer.classList.add('drawer-tapped');
            setTimeout(() => {
                drawer.classList.remove('drawer-tapped');
            }, 200);

            const originalId = e.target.id.replace('drawer-', '');
            const originalButton = document.getElementById(originalId);
            if (originalButton) {
                originalButton.click();
            }
            closeDrawer();
        }
    });

    // Special handling for the header Donate button
    const donateBtnHeader = document.getElementById('donateBtnHeader');
    const kofiBtn = document.getElementById('ko-fiBtn');
    if (donateBtnHeader && kofiBtn) {
        donateBtnHeader.addEventListener('click', () => {
            kofiBtn.click();
        });
    }
}
