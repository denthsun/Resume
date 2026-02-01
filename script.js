// ==================== Utility Functions ====================

/**
 * Parse markdown links to styled tags with icons
 * Supports: [title](url) -> <a class="link-tag" href="url">...</a>
 */
function parseMarkdownLinks(text) {
    if (!text) return '';

    // Parse markdown links: [title](url)
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, title, url) => {
        // Escape HTML in title and url to prevent XSS
        const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeUrl = url.replace(/"/g, '&quot;');

        // Get favicon URL and fallback icon
        const faviconUrl = getFaviconUrl(safeUrl);
        let fallbackIcon = getIconForLink(safeUrl);
        // Use mdi:link-variant as fallback for markdown links if no specific icon found
        if (fallbackIcon === 'mdi:link') {
            fallbackIcon = 'mdi:link-variant';
        }

        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-tag">
            <img src="${faviconUrl}" alt="${safeTitle} favicon" class="link-tag__favicon" loading="eager" decoding="async" referrerpolicy="no-referrer" width="10" height="10" style="width:10px;height:10px;max-width:10px;max-height:10px;padding:0;margin:0;object-fit:contain;display:block;box-sizing:border-box;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
            <span class="iconify link-tag__icon link-tag__icon--fallback" data-icon="${fallbackIcon}" aria-hidden="true" style="display: none;"></span>
            <span class="link-tag__text">${safeTitle}</span>
        </a>`;
    });
}

/**
 * Parse text formatting (bold, italic, underline)
 * Supports: **bold**, *italic*, __underline__
 */
function parseFormatting(text) {
    if (!text) return '';

    // First parse markdown links (before other formatting)
    let formatted = parseMarkdownLinks(text);

    // Convert markdown-like syntax to HTML
    formatted = formatted
        // Bold: **text** -> <strong>text</strong>
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Italic: *text* -> <em>text</em>
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // Underline: __text__ -> <u>text</u>
        .replace(/__([^_]+)__/g, '<u>$1</u>')
        // Line breaks
        .replace(/\n/g, '<br>');

    return formatted;
}

/**
 * Convert bullet point markers (-, •, *, etc.) to HTML list tags (<ul><li>)
 * Supports various bullet markers: -, •, *, ◦, ▪, ▫
 * Also supports numbered lists (1., 2., etc.) which are converted to <ol><li>
 */
function parseLists(text) {
    if (!text) return '';

    const lines = text.split('\n');
    const result = [];
    let currentList = [];
    let inList = false;
    let isNumberedList = false;

    function flushList() {
        if (currentList.length > 0) {
            const listItems = currentList.map(item => {
                let cleaned;
                if (isNumberedList) {
                    // Remove numbered marker (e.g., "1. ", "2. ") and trim
                    cleaned = item.replace(/^[\s]*\d+\.\s*/, '').trim();
                } else {
                    // Remove bullet marker and trim
                    cleaned = item.replace(/^[\s]*[-•*◦▪▫]\s*/, '').trim();
                }
                return `<li>${parseFormatting(cleaned)}</li>`;
            }).join('');
            const listTag = isNumberedList ? 'ol' : 'ul';
            result.push(`<${listTag}>${listItems}</${listTag}>`);
            currentList = [];
        }
        inList = false;
        isNumberedList = false;
    }

    lines.forEach(line => {
        const trimmed = line.trim();
        // Check if line starts with a bullet marker
        const isBulletListItem = /^[-•*◦▪▫]\s+/.test(trimmed);
        // Check if line starts with a number and dot (numbered list)
        const isNumberedListItem = /^\d+\.\s+/.test(trimmed);

        if (isBulletListItem || isNumberedListItem) {
            // If we're switching between bullet and numbered lists, flush current list
            if (inList && ((isNumberedListItem && !isNumberedList) || (isBulletListItem && isNumberedList))) {
                flushList();
            }

            if (!inList) {
                inList = true;
                isNumberedList = isNumberedListItem;
            }
            currentList.push(trimmed);
        } else {
            flushList(); // Flush current list before adding non-list content
            if (trimmed) {
                result.push(`<p>${parseFormatting(trimmed)}</p>`);
            } else {
                result.push('<br>');
            }
        }
    });

    flushList(); // Flush any remaining list

    return result.join('');
}

/**
 * Create an HTML element with text content
 */
function createElement(tag, content, className = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.innerHTML = parseFormatting(content);
    return element;
}

/**
 * Load and optimize avatar image
 * Compresses the image to optimal size for display
 */
async function loadOptimizedAvatar(imgElement, avatarUrl, firstName, lastName) {
    const targetSize = 280; // 2x for retina displays (displayed at 140x140)
    const quality = 0.85; // JPEG quality (0-1)

    try {
        // Create a temporary image element to load the original
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous'; // Enable CORS for same-origin images

        // Wait for image to load
        const imageLoadPromise = new Promise((resolve, reject) => {
            tempImg.onload = () => resolve(tempImg);
            tempImg.onerror = () => reject(new Error('Failed to load image'));
        });

        tempImg.src = avatarUrl;
        const loadedImg = await imageLoadPromise;

        // Get original size (approximate)
        const originalSize = estimateImageSize(loadedImg.naturalWidth, loadedImg.naturalHeight);

        // Create a canvas for compression
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate dimensions maintaining aspect ratio
        let width = loadedImg.naturalWidth;
        let height = loadedImg.naturalHeight;
        const aspectRatio = width / height;

        if (width > height) {
            width = targetSize;
            height = targetSize / aspectRatio;
        } else {
            height = targetSize;
            width = targetSize * aspectRatio;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress the image
        ctx.drawImage(loadedImg, 0, 0, width, height);

        // Try WebP first (better compression)
        let compressedBlob;
        let usedFormat = 'webp';

        if (canvas.toBlob) {
            // Try WebP first
            try {
                compressedBlob = await new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob && blob.size > 0) {
                            resolve(blob);
                        } else {
                            reject(new Error('WebP conversion failed'));
                        }
                    }, 'image/webp', quality);
                });

                // If WebP is too large or failed, try JPEG
                if (!compressedBlob || compressedBlob.size > originalSize * 0.8) {
                    usedFormat = 'jpeg';
                    compressedBlob = await new Promise((resolve) => {
                        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
                    });
                }
            } catch (webpError) {
                // Fallback to JPEG
                usedFormat = 'jpeg';
                compressedBlob = await new Promise((resolve) => {
                    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
                });
            }
        } else {
            // Fallback for older browsers - use data URL
            usedFormat = 'jpeg';
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const res = await fetch(dataUrl);
            compressedBlob = await res.blob();
        }

        // Create object URL and set as image source
        const optimizedUrl = URL.createObjectURL(compressedBlob);
        imgElement.src = optimizedUrl;
        imgElement.alt = `${firstName || ''} ${lastName || ''}`.trim();

        // Log compression results
        const compressedSize = compressedBlob.size;
        const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        console.log(`Avatar optimized: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB (${savings}% reduction, format: ${usedFormat})`);

        // Clean up object URL after image loads
        imgElement.onload = () => {
            URL.revokeObjectURL(optimizedUrl);
        };

    } catch (error) {
        console.warn('Failed to optimize avatar, loading original:', error);
        // Fallback to original image
        imgElement.src = avatarUrl;
        imgElement.alt = `${firstName || ''} ${lastName || ''}`.trim();
    }

    // Handle loading errors
    imgElement.onerror = function () {
        console.warn('Failed to load avatar from:', avatarUrl);
        const initials = `${(firstName || '?').charAt(0)}${(lastName || '?').charAt(0)}`.toUpperCase();
        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%232196F3" width="200" height="200"/%3E%3Ctext fill="white" font-size="80" font-family="sans-serif" text-anchor="middle" x="100" y="130"%3E' + initials + '%3C/text%3E%3C/svg%3E';
    };
}

/**
 * Estimate image file size based on dimensions
 * This is an approximation for JPEG images
 */
function estimateImageSize(width, height) {
    // Rough estimate: JPEG images are typically 0.5-1 bytes per pixel
    // We'll use 0.75 as average for estimation
    const pixelCount = width * height;
    const estimatedSize = pixelCount * 0.75;
    return estimatedSize;
}

// ==================== Theme Toggle Config ====================

const THEME_STORAGE_KEY = 'cv-generator-theme';
const THEME_ATTRIBUTE = 'data-theme';

/**
 * Get current theme from HTML element
 */
function getCurrentTheme() {
    return document.documentElement.getAttribute(THEME_ATTRIBUTE) || 'light';
}

/**
 * Set theme on HTML element
 */
function setTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
        updateThemeIcon(theme);
    }
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
    const current = getCurrentTheme();
    const newTheme = current === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    persistTheme(newTheme);
}

/**
 * Persist theme preference to localStorage
 */
function persistTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
        console.warn('Unable to persist theme preference:', error);
    }
}

/**
 * Read theme from localStorage
 */
function readStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') {
            return stored;
        }
    } catch (error) {
        console.warn('Unable to access localStorage for theme preferences:', error);
    }
    return null;
}

/**
 * Get initial theme based on storage or system preference
 */
function getInitialTheme() {
    const stored = readStoredTheme();
    if (stored) return stored;

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'light';
}

/**
 * Update theme toggle icon based on current theme
 */
function updateThemeIcon(theme) {
    const themeButton = document.getElementById('themeToggleBtn');
    if (!themeButton) return;

    const icon = themeButton.querySelector('.theme-toggle-btn__icon');
    if (!icon) return;

    if (theme === 'dark') {
        icon.setAttribute('data-icon', 'mdi:weather-sunny');
    } else {
        icon.setAttribute('data-icon', 'mdi:weather-night');
    }
}

/**
 * Initialize theme toggle button
 */
function initThemeToggle() {
    const themeButton = document.getElementById('themeToggleBtn');
    if (!themeButton) {
        console.warn('Theme toggle button not found.');
        return;
    }

    // Set initial theme
    const initialTheme = getInitialTheme();
    setTheme(initialTheme);
    persistTheme(initialTheme);

    // Add click event listener
    themeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTheme();
    });

    // Listen for system theme changes
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Only update if user hasn't manually set a preference
            const stored = readStoredTheme();
            if (!stored) {
                const newTheme = e.matches ? 'dark' : 'light';
                setTheme(newTheme);
            }
        });
    }
}

// ==================== Language Switcher Config ====================

const LANGUAGE_STORAGE_KEY = 'cv-generator-language';
const LANGUAGE_CONFIG = {
    ru: {
        label: '🇷🇺 RUS',
        path: '/api/resume?lang=ru',
        staticPath: 'data/resume-ru.json',
        htmlLang: 'ru',
    },
    en: {
        label: '🇬🇧 ENG',
        path: '/api/resume?lang=en',
        staticPath: 'data/resume-en.json',
        htmlLang: 'en',
    },
};
const DEFAULT_LANGUAGE = 'ru';
let currentLanguage = DEFAULT_LANGUAGE;

/**
 * Safely read language value from localStorage
 */
function readStoredLanguage() {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && LANGUAGE_CONFIG[stored]) {
            return stored;
        }
    } catch (error) {
        console.warn('Unable to access localStorage for language preferences:', error);
    }
    return null;
}

/**
 * Persist selected language to localStorage
 */
function persistLanguage(language) {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
        console.warn('Unable to persist language preference:', error);
    }
}

/**
 * Determine initial language based on URL parameter, storage or browser settings
 */
function getInitialLanguage() {
    // Check URL parameter first (highest priority)
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && (urlLang === 'ru' || urlLang === 'en')) {
        return urlLang;
    }

    const stored = readStoredLanguage();
    if (stored) return stored;

    const navigatorLanguage = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (navigatorLanguage.startsWith('ru')) return 'ru';
    if (navigatorLanguage.startsWith('en')) return 'en';

    return DEFAULT_LANGUAGE;
}

/**
 * Update document HTML lang attribute
 */
function setDocumentLanguage(config) {
    if (!config) return;
    document.documentElement.lang = config.htmlLang || 'en';
}

/**
 * Control language switcher open state
 */
function setLanguageSwitcherOpen(isOpen) {
    const switcher = document.getElementById('languageSwitcher');
    const trigger = document.getElementById('languageSwitcherTrigger');

    if (switcher) {
        const state = String(isOpen);
        switcher.dataset.open = state;
        switcher.setAttribute('data-open', state);
    }

    if (trigger) {
        trigger.setAttribute('aria-expanded', String(isOpen));
    }
}

/**
 * Safely move focus back to trigger element
 */
function focusLanguageTrigger(trigger) {
    if (!trigger || typeof trigger.focus !== 'function') return;
    try {
        trigger.focus({ preventScroll: true });
    } catch (error) {
        trigger.focus();
    }
}

/**
 * Open resume PDF link (opens pre-generated PDF from data folder in new tab)
 */
function downloadResumeAsPDF() {
    const pdfButton = document.getElementById('pdfDownloadBtn');
    const buttonText = pdfButton ? pdfButton.querySelector('.pdf-download-btn__text') : null;
    const originalText = buttonText ? buttonText.textContent : '';
    const loadingText = currentLanguage === 'ru' ? 'Открытие PDF...' : 'Opening PDF...';

    if (pdfButton) {
        pdfButton.disabled = true;
        pdfButton.setAttribute('aria-busy', 'true');
    }

    if (buttonText) {
        buttonText.textContent = loadingText;
    }

    try {
        const lang = currentLanguage || DEFAULT_LANGUAGE;
        const view = currentViewMode || DEFAULT_VIEW_MODE;
        const viewSuffix = view === 'ats-friendly' ? 'ats' : 'hr';

        // Generate filename from resume data: firstName lastName – jobTitle.<ats/hr>.pdf
        let filename = `resume.${viewSuffix}.pdf`;
        if (currentResumeData) {
            const firstName = currentResumeData.firstName || '';
            const lastName = currentResumeData.lastName || '';
            const jobTitle = currentResumeData.jobTitle || '';

            const nameParts = [firstName, lastName].filter(Boolean);
            const name = nameParts.join(' ');

            if (name && jobTitle) {
                filename = `${name} – ${jobTitle}.${viewSuffix}.pdf`;
            } else if (name) {
                filename = `${name}.${viewSuffix}.pdf`;
            }
        }

        // Path to pre-generated PDF in data folder
        const pdfPath = `data/${filename}`;

        // Open PDF in new tab
        window.open(pdfPath, '_blank');

        // Restore button state after a short delay
        setTimeout(() => {
            if (pdfButton) {
                pdfButton.disabled = false;
                pdfButton.removeAttribute('aria-busy');
            }
            if (buttonText) {
                buttonText.textContent = originalText || (currentLanguage === 'ru' ? 'Скачать PDF' : 'Download PDF');
            }
        }, 500);
    } catch (error) {
        console.error('Failed to open PDF:', error);
        const errorText = currentLanguage === 'ru'
            ? 'PDF не найден. Используйте Ctrl+P для печати.'
            : 'PDF not found. Use Ctrl+P to print.';
        if (buttonText) {
            buttonText.textContent = errorText;
            setTimeout(() => {
                if (buttonText) {
                    buttonText.textContent = originalText || (currentLanguage === 'ru' ? 'Скачать PDF' : 'Download PDF');
                }
            }, 3000);
        }
        if (pdfButton) {
            pdfButton.disabled = false;
            pdfButton.removeAttribute('aria-busy');
        }
    }
}

/**
 * Initialize PDF download button
 */
function initPDFDownloadButton() {
    const pdfButton = document.getElementById('pdfDownloadBtn');
    if (!pdfButton) {
        console.warn('PDF download button not found.');
        return;
    }

    pdfButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        downloadResumeAsPDF();
    });
}

// ==================== View Mode Switcher Config ====================

const VIEW_MODE_STORAGE_KEY = 'cv-generator-view-mode';
const DEFAULT_VIEW_MODE = 'user-friendly';
let currentViewMode = DEFAULT_VIEW_MODE;
let currentResumeData = null; // Store current resume data for PDF filename generation

/**
 * Read view mode from localStorage
 */
function readStoredViewMode() {
    try {
        const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
        if (stored === 'user-friendly' || stored === 'ats-friendly') {
            return stored;
        }
    } catch (error) {
        console.warn('Unable to access localStorage for view mode preferences:', error);
    }
    return null;
}

/**
 * Persist selected view mode to localStorage
 */
function persistViewMode(mode) {
    try {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch (error) {
        console.warn('Unable to persist view mode preference:', error);
    }
}

/**
 * Get initial view mode based on storage
 */
function getInitialViewMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlView = urlParams.get('view') || urlParams.get('mode');
    if (urlView === 'user-friendly' || urlView === 'ats-friendly') {
        return urlView;
    }

    const stored = readStoredViewMode();
    return stored || DEFAULT_VIEW_MODE;
}

/**
 * Update view mode switcher UI state
 */
function updateViewModeSwitcherUI(mode) {
    const options = document.querySelectorAll('.view-mode-switcher__option');

    options.forEach(option => {
        const isActive = option.dataset.mode === mode;
        option.classList.toggle('view-mode-switcher__option--active', isActive);
        option.setAttribute('aria-pressed', String(isActive));
    });
}

/**
 * Apply layout changes based on selected view mode
 */
function applyViewMode(mode) {
    const body = document.body;
    if (!body) return;
    body.dataset.viewMode = mode;

    const atsStylesheet = document.getElementById('atsStylesheet');
    if (atsStylesheet) {
        atsStylesheet.disabled = mode !== 'ats-friendly';
    }

    const hrLayout = document.querySelector('.container');
    const atsLayout = document.getElementById('atsLayout');

    if (hrLayout) {
        hrLayout.hidden = mode === 'ats-friendly';
    }

    if (atsLayout) {
        atsLayout.hidden = mode !== 'ats-friendly';
    }
}

/**
 * Handle view mode change
 */
function handleViewModeChange(mode) {
    if (mode === currentViewMode) return;

    currentViewMode = mode;
    persistViewMode(mode);
    updateViewModeSwitcherUI(mode);
    applyViewMode(mode);
    console.log(`View mode changed to: ${mode}`);
}

/**
 * Initialize view mode switcher
 */
function initViewModeSwitcher() {
    const switcher = document.getElementById('viewModeSwitcher');
    if (!switcher) {
        console.warn('View mode switcher not found.');
        return;
    }

    const options = Array.from(switcher.querySelectorAll('.view-mode-switcher__option'));
    if (options.length === 0) {
        console.warn('View mode switcher options not found.');
        return;
    }

    // Set initial view mode
    const initialMode = getInitialViewMode();
    currentViewMode = initialMode;
    updateViewModeSwitcherUI(initialMode);
    applyViewMode(initialMode);

    // Add click event listeners
    options.forEach(option => {
        option.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const mode = option.dataset.mode;
            if (mode) {
                handleViewModeChange(mode);
            }
        });

        option.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const mode = option.dataset.mode;
                if (mode) {
                    handleViewModeChange(mode);
                }
            }
        });
    });
}

/**
 * Initialize language switcher interactions
 */
function initLanguageSwitcher() {
    const switcher = document.getElementById('languageSwitcher');
    const trigger = document.getElementById('languageSwitcherTrigger');
    const options = Array.from(document.querySelectorAll('.language-switcher__option'));

    if (!switcher || !trigger || options.length === 0) {
        console.warn('Language switcher markup is missing or incomplete.');
        return;
    }

    const toggleOpenState = () => {
        const isOpen = switcher.dataset.open === 'true';
        setLanguageSwitcherOpen(!isOpen);
    };

    trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        toggleOpenState();
    });

    trigger.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleOpenState();
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setLanguageSwitcherOpen(true);
            const activeOption = document.querySelector('.language-switcher__option[aria-selected="true"]');
            if (activeOption) {
                activeOption.focus();
            } else if (options[0]) {
                options[0].focus();
            }
        }
        if (event.key === 'Escape') {
            setLanguageSwitcherOpen(false);
        }
    });

    options.forEach(option => {
        option.setAttribute('tabindex', '0');
        option.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            const { lang } = option.dataset;
            if (!lang || lang === currentLanguage) {
                setLanguageSwitcherOpen(false);
                focusLanguageTrigger(trigger);
                return;
            }
            await loadResumeData(lang);
            setLanguageSwitcherOpen(false);
            focusLanguageTrigger(trigger);
        });

        option.addEventListener('keydown', async event => {
            const { lang } = option.dataset;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!lang || lang === currentLanguage) {
                    setLanguageSwitcherOpen(false);
                    focusLanguageTrigger(trigger);
                    return;
                }
                await loadResumeData(lang);
                setLanguageSwitcherOpen(false);
                focusLanguageTrigger(trigger);
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                setLanguageSwitcherOpen(false);
                focusLanguageTrigger(trigger);
            }
        });
    });

    document.addEventListener('click', event => {
        if (!switcher.contains(event.target)) {
            setLanguageSwitcherOpen(false);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            setLanguageSwitcherOpen(false);
        }
    });
}

// ==================== Render Functions ====================

/**
 * Get icon name based on URL or type
 */
function getIconForLink(url, type) {
    if (url.includes('linkedin.com')) return 'mdi:linkedin';
    if (url.includes('github.com')) return 'mdi:github';
    if (url.includes('t.me') || type === 'telegram') return 'mdi:telegram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'mdi:twitter';
    if (url.includes('facebook.com')) return 'mdi:facebook';
    if (url.includes('instagram.com')) return 'mdi:instagram';
    if (type === 'website') return 'mdi:web';
    return 'mdi:link';
}

/**
 * Extract readable domain from URL
 */
function getDomainFromUrl(url) {
    try {
        const { hostname } = new URL(url);
        return hostname.replace(/^www\./, '');
    } catch (error) {
        console.warn('Unable to parse domain from URL:', url, error);
        return url;
    }
}

/**
 * Build preview image URL (falls back to favicon)
 */
function getPreviewImageUrl(url) {
    // Universal path: the server will redirect to the actual Open Graph image
    // or a safe fallback (screenshot) — no domain-specific hacks required.
    const encodedUrl = encodeURIComponent(url);
    const previewUrl = `/api/og-image?url=${encodedUrl}`;
    console.log(`[getPreviewImageUrl] Исходный URL: ${url}`);
    console.log(`[getPreviewImageUrl] Закодированный URL: ${encodedUrl}`);
    console.log(`[getPreviewImageUrl] Итоговый preview URL: ${previewUrl}`);
    return previewUrl;
}

/**
 * Handle preview image loading errors
 */
function handlePreviewImageError(img) {
    console.error(`[handlePreviewImageError] Ошибка загрузки изображения`);
    console.error(`[handlePreviewImageError] src: ${img.src}`);
    console.error(`[handlePreviewImageError] alt: ${img.alt}`);
    console.error(`[handlePreviewImageError] naturalWidth: ${img.naturalWidth}, naturalHeight: ${img.naturalHeight}`);

    const previewContainer = img.closest('.experience-link__preview');
    if (previewContainer) {
        console.log(`[handlePreviewImageError] Добавляем класс fallback`);
        previewContainer.classList.add('experience-link__preview--fallback');
        const fallbackIcon = previewContainer.querySelector('.experience-link__fallback');
        if (fallbackIcon) {
            fallbackIcon.style.display = 'inline-flex';
            console.log(`[handlePreviewImageError] Показываем fallback иконку`);
        }
    }
    img.remove();
    console.log(`[handlePreviewImageError] Изображение удалено из DOM`);
}

/**
 * Build favicon URL that preserves original icon colors
 */
function getFaviconUrl(url) {
    // Special handling for GitHub to use mdi:github icon instead of favicon
    if (url.includes('github.com')) {
        // Return invalid URL to trigger onerror and show fallback icon
        return 'data:,';
    }

    // Special handling for Twitter/X to use old Twitter logo
    if (url.includes('twitter.com') || url.includes('x.com')) {
        // Use old Twitter favicon
        return 'https://abs.twimg.com/favicons/twitter.2.ico';
    }

    let target = url;

    try {
        const parsed = new URL(url);
        target = `${parsed.protocol}//${parsed.hostname}`;
    } catch (error) {
        // If URL parsing fails (e.g., missing protocol), attempt to normalize
        const sanitized = url.replace(/^[^a-zA-Z0-9]+/, '');
        target = `https://${sanitized}`;
        console.warn('Invalid URL provided for favicon. Attempting to normalize:', url, error);
    }

    const encoded = encodeURIComponent(target);
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encoded}`;
}

/**
 * Safely get language configuration
 */
function getLanguageConfig(language) {
    return LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG[DEFAULT_LANGUAGE];
}

/**
 * Update language switcher UI state
 */
function updateLanguageSwitcherUI(language) {
    const config = getLanguageConfig(language);
    const switcher = document.getElementById('languageSwitcher');
    const currentLabel = document.getElementById('languageSwitcherCurrent');
    const trigger = document.getElementById('languageSwitcherTrigger');
    const options = document.querySelectorAll('.language-switcher__option');

    if (currentLabel) {
        currentLabel.textContent = config.label;
    }

    if (trigger) {
        trigger.setAttribute('aria-label', `Switch language, current ${config.label}`);
        trigger.setAttribute('aria-expanded', 'false');
    }

    options.forEach(option => {
        const isSelected = option.dataset.lang === language;
        option.setAttribute('aria-selected', String(isSelected));
        option.classList.toggle('language-switcher__option--active', isSelected);
    });

    setLanguageSwitcherOpen(false);
}

/**
 * Update section titles based on current language
 */
function updateSectionTitles(language) {
    // Update "About Me" section title
    const aboutTitleElement = document.querySelector('#aboutSection .section-title');
    if (aboutTitleElement) {
        const titleRu = aboutTitleElement.getAttribute('data-title-ru');
        const titleEn = aboutTitleElement.getAttribute('data-title-en');
        const iconElement = aboutTitleElement.querySelector('.icon');

        if (iconElement) {
            const title = language === 'ru' ? titleRu : titleEn;
            aboutTitleElement.innerHTML = iconElement.outerHTML + ' ' + title;
        }
    }

    // Update "What I'm Looking For" section title
    const expectationTitleElement = document.querySelector('#expectationSection .section-title');
    if (expectationTitleElement) {
        const titleRu = expectationTitleElement.getAttribute('data-title-ru');
        const titleEn = expectationTitleElement.getAttribute('data-title-en');
        const iconElement = expectationTitleElement.querySelector('.icon');
        const hasAccentClass = expectationTitleElement.classList.contains('accent-red');

        if (iconElement) {
            const title = language === 'ru' ? titleRu : titleEn;
            expectationTitleElement.innerHTML = iconElement.outerHTML + ' ' + title;
            if (hasAccentClass) {
                expectationTitleElement.classList.add('accent-red');
            }
        }
    }

    // Update "Interests" section title
    const interestsTitleElement = document.querySelector('#interestsSection .section-title');
    if (interestsTitleElement) {
        const titleRu = interestsTitleElement.getAttribute('data-title-ru');
        const titleEn = interestsTitleElement.getAttribute('data-title-en');
        const iconElement = interestsTitleElement.querySelector('.icon');

        if (iconElement) {
            const title = language === 'ru' ? titleRu : titleEn;
            interestsTitleElement.innerHTML = iconElement.outerHTML + ' ' + title;
        }
    }

    // Update "Education & Languages" section title
    const educationLanguagesTitleElement = document.querySelector('#educationLanguagesSection .section-title');
    if (educationLanguagesTitleElement) {
        const titleRu = educationLanguagesTitleElement.getAttribute('data-title-ru');
        const titleEn = educationLanguagesTitleElement.getAttribute('data-title-en');
        const iconElement = educationLanguagesTitleElement.querySelector('.icon');
        const hasAccentClass = educationLanguagesTitleElement.classList.contains('accent-green');

        if (iconElement) {
            const title = language === 'ru' ? titleRu : titleEn;
            educationLanguagesTitleElement.innerHTML = iconElement.outerHTML + ' ' + title;
            if (hasAccentClass) {
                educationLanguagesTitleElement.classList.add('accent-green');
            }
        }
    }
}

/**
 * Update PDF button text based on current language
 */
function updatePdfButtonText(language) {
    const pdfButton = document.getElementById('pdfDownloadBtn');
    if (!pdfButton) return;

    const buttonText = pdfButton.querySelector('.pdf-download-btn__text');
    if (buttonText) {
        buttonText.textContent = language === 'ru' ? 'Скачать PDF' : 'Download PDF';
    }

    const ariaLabel = language === 'ru' ? 'Скачать резюме в PDF' : 'Download resume as PDF';
    pdfButton.setAttribute('aria-label', ariaLabel);
}

/**
 * Render header section
 */
function renderHeader(data) {
    // Update page title using profile name
    if (data.firstName && data.lastName) {
        const fullName = `${data.firstName} ${data.lastName}`;
        if (data.jobTitle) {
            document.title = `${fullName} - ${data.jobTitle}`;
        } else {
            document.title = `${fullName} - Resume`;
        }
    }

    // Full name
    const fullName = document.getElementById('fullName');
    if (fullName && data.firstName && data.lastName) {
        fullName.textContent = `${data.firstName.toUpperCase()} ${data.lastName.toUpperCase()}`;
    }

    // Job title
    const jobTitle = document.getElementById('jobTitle');
    if (jobTitle) {
        jobTitle.innerHTML = parseFormatting(data.jobTitle || '');
    }

    // Email
    const emailElement = document.getElementById('email');
    if (emailElement && data.email) {
        emailElement.innerHTML = `
        <span class="icon">
            <span class="iconify" data-icon="mdi:email"></span>
        </span>
        <a href="mailto:${data.email}" class="text">${data.email}</a>
    `;
    }

    // Location
    const locationElement = document.getElementById('location');
    if (locationElement && data.location) {
        locationElement.innerHTML = `
        <span class="icon">
            <span class="iconify" data-icon="mdi:map-marker"></span>
        </span>
        <span class="text">${data.location}</span>
    `;
    }

    // References (links)
    const referencesElement = document.getElementById('references');
    if (referencesElement) {
        referencesElement.innerHTML = '';
        const references = Array.isArray(data.references) ? data.references : [];

        references.forEach(ref => {
            const link = document.createElement('a');
            link.href = ref.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            const iconContainer = document.createElement('span');
            iconContainer.className = 'icon';

            // For GitHub, always use iconify icon instead of favicon
            const isGitHub = ref.url.includes('github.com');

            if (isGitHub) {
                // For GitHub, show iconify icon directly
                const fallbackIcon = document.createElement('span');
                fallbackIcon.className = 'iconify';
                fallbackIcon.dataset.icon = getIconForLink(ref.url, ref.type);
                fallbackIcon.setAttribute('aria-hidden', 'true');
                iconContainer.appendChild(fallbackIcon);
            } else {
                // For other links, try favicon first, fallback to iconify
                const favicon = document.createElement('img');
                favicon.className = 'favicon';
                favicon.src = getFaviconUrl(ref.url);
                favicon.alt = `${ref.text} favicon`;
                favicon.loading = 'lazy';
                favicon.decoding = 'async';

                const fallbackIcon = document.createElement('span');
                fallbackIcon.className = 'iconify fallback-icon';
                fallbackIcon.dataset.icon = getIconForLink(ref.url, ref.type);
                fallbackIcon.setAttribute('aria-hidden', 'true');
                fallbackIcon.style.display = 'none';

                favicon.addEventListener('error', () => {
                    favicon.style.display = 'none';
                    fallbackIcon.style.display = 'inline-flex';
                });

                iconContainer.appendChild(favicon);
                iconContainer.appendChild(fallbackIcon);
            }

            const textElement = document.createElement('span');
            textElement.className = 'text';
            textElement.textContent = ref.text;

            link.appendChild(iconContainer);
            link.appendChild(textElement);

            referencesElement.appendChild(link);
        });
    }

    // Avatar
    const avatar = document.getElementById('avatar');
    if (avatar && data.avatar) {
        loadOptimizedAvatar(avatar, data.avatar, data.firstName, data.lastName);
    }
}

/**
 * Render about section
 */
function renderAbout(data) {
    const aboutElement = document.getElementById('about');
    const content = parseLists(data.about || '');
    aboutElement.innerHTML = content || '<p></p>';
}

/**
 * Render expectation section
 */
function renderExpectation(data) {
    if (!data.expectation || (typeof data.expectation === 'string' && data.expectation.trim() === '')) {
        document.getElementById('expectationSection').style.display = 'none';
        return;
    }

    document.getElementById('expectationSection').style.display = '';
    const expectationElement = document.getElementById('expectation');
    const content = parseLists(data.expectation || '');
    expectationElement.innerHTML = content || '<p></p>';
}

/**
 * Render languages section
 */
function renderLanguages(data) {
    const languagesElement = document.getElementById('languages');

    // Extract level from parentheses if exists, otherwise use full level
    const formatLanguageTag = (lang) => {
        const levelMatch = lang.level.match(/\(([^)]+)\)/);
        const levelText = levelMatch ? levelMatch[1] : lang.level;
        return `${lang.name} – ${levelText}`;
    };

    languagesElement.innerHTML = `
        <div class="skill-keywords">
            ${data.languages.map(lang =>
        `<span class="skill-keyword">${formatLanguageTag(lang)}</span>`
    ).join('\n            ')}
        </div>
    `;
}

/**
 * Render skills introduction text
 */
function renderSkillsIntro(data) {
    const skillsIntroElement = document.getElementById('skillsIntro');
    if (!skillsIntroElement) return;

    const intro = data.skillsIntro;
    if (!intro) return;
    skillsIntroElement.innerHTML = parseFormatting(intro);
}

/**
 * Render skills section
 */
function renderSkills(data) {
    const skillsElement = document.getElementById('skills');
    skillsElement.innerHTML = data.skills.map(skill => `
        <div class="skill-category">
            <div class="skill-category-title">${skill.category}</div>
            <div class="skill-keywords">
                ${skill.keywords.map(keyword =>
        `<span class="skill-keyword">${keyword}</span>`
    ).join('')}
            </div>
        </div>
    `).join('');
}

/**
 * Render extra skills section
 */
function renderExtraSkills(data) {
    if (!data.extraSkills || (typeof data.extraSkills === 'string' && data.extraSkills.trim() === '')) {
        document.getElementById('extraSkillsSection').style.display = 'none';
        return;
    }

    document.getElementById('extraSkillsSection').style.display = '';
    const extraSkillsElement = document.getElementById('extraSkills');
    const content = parseLists(data.extraSkills || '');
    extraSkillsElement.innerHTML = content || '<p></p>';
}

/**
 * Render interests section
 */
function renderInterests(data) {
    if (!data.interests || (typeof data.interests === 'string' && data.interests.trim() === '')) {
        document.getElementById('interestsSection').style.display = 'none';
        return;
    }

    document.getElementById('interestsSection').style.display = '';
    const interestsElement = document.getElementById('interests');
    const content = parseLists(data.interests || '');
    interestsElement.innerHTML = content || '<p></p>';
}

/**
 * Adjust experience links position based on available width
 * Positions links in bottom-left of experience-content if they fit, otherwise keeps them at the bottom
 */
function adjustExperienceLinksPosition() {
    const experienceItems = document.querySelectorAll('.experience-item');

    experienceItems.forEach(item => {
        const links = item.querySelector('.experience-links');
        const responsibilities = item.querySelector('.experience-responsibilities');
        const experienceContent = item.querySelector('.experience-content');

        if (!links || !responsibilities || !experienceContent) return;

        // Store current parent
        const currentParent = links.parentElement;
        const isInContent = currentParent === experienceContent;
        const isInResponsibilities = currentParent === responsibilities;

        // Always measure from bottom position to get natural width
        // Temporarily move to bottom if currently in responsibilities or content
        let wasMoved = false;
        if (isInResponsibilities || isInContent) {
            item.appendChild(links);
            wasMoved = true;
            // Force reflow to ensure accurate measurement
            void links.offsetWidth;
        }

        // Measure natural width of links (scrollWidth gives content width)
        const linksNaturalWidth = links.scrollWidth;

        // Measure available width in responsibilities column
        const responsibilitiesWidth = responsibilities.offsetWidth;

        // Check if links fit in responsibilities column (with small margin for safety)
        const margin = 5; // Small margin to account for rounding
        if (linksNaturalWidth <= responsibilitiesWidth - margin) {
            // Move links inside experience-content with absolute positioning
            if (!isInContent || links.parentElement !== experienceContent) {
                experienceContent.appendChild(links);
            }
        } else {
            // Keep links at the bottom (after experience-content)
            if (isInContent || wasMoved) {
                item.appendChild(links);
            }
        }
    });
}

/**
 * Render experience section
 */
function renderExperience(data) {
    const experienceElement = document.getElementById('experience');
    experienceElement.innerHTML = data.experience.map(exp => {
        let linksHTML = '';
        if (exp.links && exp.links.length > 0) {
            linksHTML = `
                <div class="experience-links">
                    ${exp.links.map(link =>
                `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="experience-link ${!link.description ? 'experience-link--no-description' : ''}">
                            <div class="experience-link__preview">
                                <img
                                    src="${getFaviconUrl(link.url)}"
                                    alt="Favicon of ${getDomainFromUrl(link.url)}"
                                    class="experience-link__favicon"
                                    loading="eager"
                                    decoding="async"
                                    referrerpolicy="no-referrer"
                                    onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"
                                >
                                <span class="experience-link__fallback iconify" data-icon="${getIconForLink(link.url)}" aria-hidden="true" style="display: none;"></span>
                            </div>
                            <div class="experience-link__content">
                                <div class="experience-link__title">${link.title}</div>
                                ${link.description ? `<div class="experience-link__description">${parseFormatting(link.description)}</div>` : ''}
                            </div>
                        </a>`
            ).join('')}
                </div>
            `;
        }

        return `
            <div class="experience-item">
                <div class="experience-header">
                    <div class="experience-title-row">
                        <div class="experience-title-row__left">
                            <div class="experience-company">${exp.company}</div>
                            <div class="experience-position">${exp.position}</div>
                        </div>
                        <div class="experience-meta">
                            <span class="icon">
                                <span class="iconify" data-icon="mdi:calendar"></span>
                            </span>
                            <span>${exp.period}</span>
                        </div>
                    </div>
                    ${exp.about ? `<div class="experience-about">${parseLists(exp.about)}</div>` : ''}
                </div>
                <div class="experience-content">
                    <div class="experience-responsibilities">
                        ${parseLists(exp.responsibilities)}
                    </div>
                    ${exp.achievements ? `
                        <div class="experience-achievements">
                            <div class="experience-achievements__header">
                                <span class="icon">
                                    <span class="iconify" data-icon="mdi:trophy"></span>
                                </span>
                                <span class="experience-achievements__title">${currentLanguage === 'ru' ? 'Ключевые достижения' : 'Key Achievements'}</span>
                            </div>
                            <div class="experience-achievements__content">
                                ${parseLists(exp.achievements)}
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${linksHTML}
            </div>
        `;
    }).join('');

    // Adjust links position after rendering and images load
    // Use setTimeout to ensure DOM is fully rendered
    setTimeout(() => {
        adjustExperienceLinksPosition();

        // Also adjust after all images in links are loaded
        const linkImages = experienceElement.querySelectorAll('.experience-link__favicon');
        let imagesLoaded = 0;
        const totalImages = linkImages.length;

        if (totalImages === 0) {
            adjustExperienceLinksPosition();
        } else {
            linkImages.forEach(img => {
                if (img.complete) {
                    imagesLoaded++;
                    if (imagesLoaded === totalImages) {
                        adjustExperienceLinksPosition();
                    }
                } else {
                    img.addEventListener('load', () => {
                        imagesLoaded++;
                        if (imagesLoaded === totalImages) {
                            adjustExperienceLinksPosition();
                        }
                    });
                    img.addEventListener('error', () => {
                        imagesLoaded++;
                        if (imagesLoaded === totalImages) {
                            adjustExperienceLinksPosition();
                        }
                    });
                }
            });
        }
    }, 0);
}

/**
 * Render projects section
 */
function renderProjects(data) {
    console.log(`[renderProjects] Начинаем рендеринг ${data.projects.length} проектов`);
    const projectsElement = document.getElementById('projects');

    const linksHTML = data.projects.map((project, index) => {
        console.log(`[renderProjects] Проект ${index + 1}: "${project.title}"`);
        console.log(`[renderProjects] Ссылка проекта: ${project.link}`);

        return `
            <a href="${project.link}" target="_blank" rel="noopener noreferrer" class="experience-link ${!project.description ? 'experience-link--no-description' : ''}">
                <div class="experience-link__preview">
                    <img
                        src="${getFaviconUrl(project.link)}"
                        alt="Favicon of ${getDomainFromUrl(project.link)}"
                        class="experience-link__favicon"
                        loading="eager"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"
                    >
                    <span class="experience-link__fallback iconify" data-icon="${getIconForLink(project.link)}" aria-hidden="true" style="display: none;"></span>
                </div>
                <div class="experience-link__content">
                    <div class="experience-link__title">${project.title}</div>
                    ${project.description ? `<div class="experience-link__description">${parseFormatting(project.description)}</div>` : ''}
                </div>
            </a>
        `;
    }).join('');

    projectsElement.innerHTML = `
        <div class="experience-links">
            ${linksHTML}
        </div>
    `;
    console.log(`[renderProjects] Рендеринг завершен`);
}

/**
 * Render education section
 */
function renderEducation(data) {
    const educationElement = document.getElementById('education');
    educationElement.innerHTML = data.education.map(edu => `
        <div class="education-item">
            <div class="education-degree">${edu.degree}</div>
            <div class="education-university">${edu.university}</div>
            <div class="education-period">
                <span class="icon">
                    <span class="iconify" data-icon="mdi:calendar"></span>
                </span>
                <span>${edu.period}</span>
            </div>
        </div>
    `).join('');
}

/**
 * Render education & languages section (combined)
 */
function renderEducationLanguages(data) {
    const educationLanguagesElement = document.getElementById('educationLanguages');

    // Extract level from parentheses if exists, otherwise use full level
    const formatLanguageTag = (lang) => {
        const levelMatch = lang.level.match(/\(([^)]+)\)/);
        const levelText = levelMatch ? levelMatch[1] : lang.level;
        return `${lang.name} – ${levelText}`;
    };

    let content = '';

    // Render education items
    if (data.education && data.education.length > 0) {
        content += data.education.map(edu => `
            <div class="education-item">
                <div class="education-degree">${edu.degree}</div>
                <div class="education-university">${edu.university}</div>
                <div class="education-period">
                    <span class="icon">
                        <span class="iconify" data-icon="mdi:calendar"></span>
                    </span>
                    <span>${edu.period}</span>
                </div>
            </div>
        `).join('');
    }

    // Render languages
    if (data.languages && data.languages.length > 0) {
        if (content) {
            content += '<div style="margin-top: 12px;"></div>';
        }
        content += `
            <div class="skill-keywords">
                ${data.languages.map(lang =>
            `<span class="skill-keyword">${formatLanguageTag(lang)}</span>`
        ).join('\n                ')}
            </div>
        `;
    }

    educationLanguagesElement.innerHTML = content || '<p></p>';
}

// ==================== Main Init Function ====================

/**
 * Load resume data from JSON and render
 */
async function loadResumeData(language = currentLanguage) {
    const config = getLanguageConfig(language);

    try {
        // Try API first (for local development), fallback to static JSON (for GitHub Pages)
        let response = await fetch(config.path, { cache: 'no-cache' }).catch(() => null);

        if (!response || !response.ok) {
            // Fallback to static JSON file
            console.log(`API unavailable, trying static file: ${config.staticPath}`);
            response = await fetch(config.staticPath, { cache: 'no-cache' }).catch((fetchError) => {
                console.error(`Failed to fetch static file ${config.staticPath}:`, fetchError);
                throw new Error(`Failed to load resume data from ${config.staticPath}. Make sure the file exists and the build process completed successfully.`);
            });

            if (!response || !response.ok) {
                throw new Error(`HTTP error! status: ${response.status}. Failed to load ${config.staticPath}`);
            }
        }

        const data = await response.json();
        const normalized = normalizeResumeData(data);

        currentLanguage = language;
        currentResumeData = normalized; // Store resume data for PDF filename generation
        persistLanguage(language);
        setDocumentLanguage(config);
        updateLanguageSwitcherUI(language);
        updatePdfButtonText(language);
        updateSectionTitles(language);

        // Render all sections
        renderHeader(normalized);
        renderAbout(normalized);
        renderExpectation(normalized);
        renderSkillsIntro(normalized);
        renderSkills(normalized);
        renderExtraSkills(normalized);
        renderInterests(normalized);
        renderExperience(normalized);
        renderProjects(normalized);
        renderEducationLanguages(normalized);

        if (window.AtsLayout && typeof window.AtsLayout.render === 'function') {
            window.AtsLayout.render(normalized, { language: currentLanguage });
        } else {
            console.warn('AtsLayout renderer is not available');
        }

        console.log('Resume data loaded successfully!');
    } catch (error) {
        console.error(`Error loading resume data for language "${language}":`, error);
        console.error(`Tried API: ${config.path}`);
        console.error(`Tried static file: ${config.staticPath}`);

        // Show error message to user
        document.body.innerHTML = `
            <div style="padding: 40px; text-align: center; font-family: sans-serif;">
                <h1 style="color: #E53935;">Error Loading Resume</h1>
                <p>Could not load resume data. Tried:</p>
                <ul style="text-align: left; display: inline-block; color: #666;">
                    <li>API: ${config.path}</li>
                    <li>Static file: ${config.staticPath}</li>
                </ul>
                <p style="color: #666; font-size: 14px; margin-top: 20px;">Error: ${error.message}</p>
                <p style="color: #999; font-size: 12px; margin-top: 10px;">Please check the browser console for more details.</p>
            </div>
        `;
    }
}

// ==================== Initialize on Page Load ====================

// Wait for DOM to be fully loaded
function initializeResume() {
    const initialLanguage = getInitialLanguage();
    currentLanguage = initialLanguage;

    const initialConfig = getLanguageConfig(initialLanguage);
    setDocumentLanguage(initialConfig);
    updateLanguageSwitcherUI(initialLanguage);
    updatePdfButtonText(initialLanguage);
    updateSectionTitles(initialLanguage);
    initThemeToggle();
    initLanguageSwitcher();
    initPDFDownloadButton();
    initViewModeSwitcher();
    loadResumeData(initialLanguage);

    // Adjust experience links position on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            adjustExperienceLinksPosition();
        }, 100);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeResume);
} else {
    initializeResume();
}

/**
 * Normalize resume data to expected structure and defaults
 */
function normalizeResumeData(data) {
    const safeString = (v) => (typeof v === 'string' ? v.trim() : '');
    const safeArray = (v) => (Array.isArray(v) ? v : []);
    // For optional fields: return undefined if field is missing, empty string if empty
    const optionalString = (v) => {
        if (v === undefined || v === null) return undefined;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            return trimmed === '' ? undefined : trimmed;
        }
        return undefined;
    };

    const trimStringFields = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const trimmed = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                if (typeof value === 'string') {
                    trimmed[key] = value.trim();
                } else if (Array.isArray(value)) {
                    trimmed[key] = value.map(item => typeof item === 'string' ? item.trim() : trimStringFields(item));
                } else if (typeof value === 'object' && value !== null) {
                    trimmed[key] = trimStringFields(value);
                } else {
                    trimmed[key] = value;
                }
            }
        }
        return trimmed;
    };

    const normalized = {
        // Header/basic
        avatar: data && data.avatar,
        firstName: data && data.firstName ? String(data.firstName).trim() : data && data.firstName,
        lastName: data && data.lastName ? String(data.lastName).trim() : data && data.lastName,
        pageTitle: data && data.pageTitle ? String(data.pageTitle).trim() : data && data.pageTitle,
        jobTitle: safeString(data && data.jobTitle),
        email: data && data.email ? String(data.email).trim() : data && data.email,
        location: safeString(data && data.location),
        references: safeArray(data && data.references).map(ref => trimStringFields(ref)),
        // Content
        about: safeString(data && data.about),
        expectation: optionalString(data && data.expectation),
        languages: safeArray(data && data.languages).map(lang => trimStringFields(lang)),
        skillsIntro: optionalString(data && data.skillsIntro),
        skills: safeArray(data && data.skills).map(skill => trimStringFields(skill)),
        extraSkills: optionalString(data && data.extraSkills),
        interests: optionalString(data && data.interests),
        experience: safeArray(data && data.experience).map(exp => trimStringFields(exp)),
        projects: safeArray(data && data.projects).map(proj => trimStringFields(proj)),
        education: safeArray(data && data.education).map(edu => trimStringFields(edu)),
    };

    return normalized;
}

