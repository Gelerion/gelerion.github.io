// Theme Toggle Functionality
(function() {
    'use strict';
    
    // Theme storage key
    const THEME_STORAGE_KEY = 'theme-preference';
    
    // Default theme
    const DEFAULT_THEME = 'light';
    
    // Theme icons - using more accessible and modern icons
    const THEME_ICONS = {
        light: '☀️',
        dark: '🌙'
    };
    
    // Only two modes
    const DARK_THEME = 'dark';
    
    // Initialize theme on page load
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Use saved theme, or system preference, or default
        let theme = savedTheme || (systemPrefersDark ? DARK_THEME : 'light');
        
        setTheme(theme);
        updateToggleButton(theme);
    }
    
    // Set theme on document
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    
    // Update toggle button appearance
    function updateToggleButton(theme) {
        const toggleButton = document.getElementById('theme-toggle');
        if (toggleButton) {
            toggleButton.textContent = THEME_ICONS[theme] || THEME_ICONS.dark;
            const isLight = theme === 'light';
            toggleButton.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light'} mode`);
        }
    }
    
    // Toggle between light and dark themes
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            // Switch to dark mode
            setTheme(DARK_THEME);
            updateToggleButton(DARK_THEME);
        } else {
            // Switch to light mode
            setTheme('light');
            updateToggleButton('light');
        }
    }
    
    // Listen for system theme changes
    function watchSystemTheme() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', function(e) {
            // Only update if user hasn't set a manual preference
            if (!localStorage.getItem(THEME_STORAGE_KEY)) {
                const newTheme = e.matches ? 'dark' : 'light';
                setTheme(newTheme);
                updateToggleButton(newTheme);
            }
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initTheme();
            watchSystemTheme();
        });
    } else {
        initTheme();
        watchSystemTheme();
    }
    
    // Make toggleTheme available globally
    window.toggleTheme = toggleTheme;
    
    // Add click event listener to toggle button
    document.addEventListener('DOMContentLoaded', function() {
        const toggleButton = document.getElementById('theme-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleTheme);
        }
    });
})();
