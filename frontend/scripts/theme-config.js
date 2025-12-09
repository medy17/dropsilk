/**
 * THEME CONFIGURATION
 * Single source of truth for the update-themes.js script.
 * 
 * To add a new theme:
 * 1. Create a CSS file in frontend/src/styles/themes/ (e.g. "my-theme.css")
 * 2. Add an entry here matching the filename (without extension).
 * 3. Run "npm run update-themes"
 */

module.exports = {
    // Filename (key): { name: 'Display Name', darkColor: 'Meta Tag Color for Dark Mode' }
    midnight: { name: 'Midnight', darkColor: '#16161e' },
    sunset: { name: 'Sunset', darkColor: '#191724' },
    forest: { name: 'Forest', darkColor: '#14241e' },
    ruby: { name: 'Ruby', darkColor: '#241414' },
    ocean: { name: 'Ocean', darkColor: '#102026' },
    nebula: { name: 'Nebula', darkColor: '#1a1626' },
    terminal: { name: 'Terminal', darkColor: '#000000' },
    cyber: { name: 'Cyber', darkColor: '#050505' },
    coffee: { name: 'Coffee', darkColor: '#1a1613' },
    royal: { name: 'Royal', darkColor: '#13111f' },
};
