(function (window) {
    'use strict';

    /**
     * Parse text formatting for ATS-friendly mode (bold, italic)
     * Supports: **bold**, *italic*, __bold__ (underscore becomes bold)
     */
    function parseFormattingAts(text) {
        if (!text) return '';

        return text
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    function stripMarkdownSyntax(text = '') {
        if (!text) return '';
        return text
            .replace(/\r\n/g, '\n')
            .replace(/!\[[^\]]*]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
            .replace(/`{1,2}([^`]+)`{1,2}/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1');
    }

    function stripLineMarkers(line = '') {
        return line.replace(/^\s*(?:[-•*◦▪▫]\s+|\d+\.\s+)/, '').trim();
    }

    function escapeHTML(text = '') {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderPlainStructuredText(text) {
        if (!text) return '';

        const blocks = [];
        let currentListItems = [];
        let currentListType = null;

        function flushList() {
            if (currentListItems.length === 0) return;
            const tag = currentListType === 'ol' ? 'ol' : 'ul';
            const items = currentListItems.map(item => `<li>${item}</li>`).join('');
            blocks.push(`<${tag}>${items}</${tag}>`);
            currentListItems = [];
            currentListType = null;
        }

        function pushListItem(rawLine, type) {
            const cleaned = stripLineMarkers(rawLine);
            const formatted = parseFormattingAts(cleaned).replace(/\s+/g, ' ').trim();
            if (!formatted) return;
            if (currentListType && currentListType !== type) {
                flushList();
            }
            currentListType = type;
            currentListItems.push(formatted);
        }

        text.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                flushList();
                return;
            }

            const isBullet = /^[-•*◦▪▫]\s+/.test(trimmed);
            const isNumbered = /^\d+\.\s+/.test(trimmed);

            if (isBullet) {
                pushListItem(line, 'ul');
            } else if (isNumbered) {
                pushListItem(line, 'ol');
            } else {
                flushList();
                const formatted = parseFormattingAts(trimmed).replace(/\s+/g, ' ').trim();
                if (formatted) {
                    blocks.push(`<p>${formatted}</p>`);
                }
            }
        });

        flushList();
        return blocks.join('');
    }

    function renderAtsExperienceItem(exp = {}, language) {
        const company = escapeHTML(exp.company || '');
        const aboutText = stripMarkdownSyntax((exp.about || '').replace(/\n+/g, ' '))
            .replace(/\s+/g, ' ')
            .trim();
        const position = escapeHTML(exp.position || '');
        const period = exp.period ? escapeHTML(exp.period) : '';

        const responsibilitiesHTML = exp.responsibilities
            ? renderPlainStructuredText(exp.responsibilities)
            : '';

        let achievementsHTML = '';
        if (exp.achievements) {
            const achievementsContent = renderPlainStructuredText(exp.achievements);
            const achievementsLabel = language === 'ru' ? 'Основные достижения:' : 'Key Achievements:';
            achievementsHTML = `<div class="ats-experience__achievements">
                <div class="ats-experience__achievements-label">${achievementsLabel}</div>
                ${achievementsContent}
            </div>`;
        }

        return `
            <article class="ats-experience__item">
                <div class="ats-experience__row ats-experience__row--company">
                    <span class="ats-experience__company-wrapper">
                        <span class="iconify ats-experience__company-icon" data-icon="mdi:flag-variant" aria-hidden="true"></span>
                        <span class="ats-experience__company">${company}</span>
                        ${position ? ` <span class="ats-experience__separator">•</span> <span class="ats-experience__position">${position}</span>` : ''}
                    </span>
                    ${period ? `<span class="ats-experience__period">${period}</span>` : ''}
                </div>
                ${aboutText ? `<div class="ats-experience__row"><span class="ats-experience__company-about">${escapeHTML(aboutText)}</span></div>` : ''}
                ${responsibilitiesHTML}
                ${achievementsHTML}
            </article>
        `;
    }

    function renderAtsEducationItem(edu = {}) {
        const degree = escapeHTML(edu.degree || '');
        const university = escapeHTML(edu.university || '');
        const period = edu.period ? escapeHTML(edu.period) : '';

        if (!degree && !university && !period) return '';

        return `
            <article class="ats-education__item">
                ${degree ? `<div class="ats-education__row">
                    <span class="ats-education__degree">${degree}</span>
                    ${period ? `<span class="ats-education__period">${period}</span>` : ''}
                </div>` : ''}
                ${university ? `<div class="ats-education__row"><span class="ats-education__university">${university}</span></div>` : ''}
            </article>
        `;
    }

    function renderAtsLayout(data, options = {}) {
        if (!data) return;

        const language = options.language || 'ru';

        const fullNameElement = document.getElementById('atsFullName');
        const jobTitleElement = document.getElementById('atsJobTitle');
        const emailElement = document.getElementById('atsEmail');
        const locationElement = document.getElementById('atsLocation');
        const linkedInElement = document.getElementById('atsLinkedIn');
        const aboutElement = document.getElementById('atsAbout');
        const skillsElement = document.getElementById('atsSkills');
        const experienceElement = document.getElementById('atsExperience');
        const educationElement = document.getElementById('atsEducation');
        const languagesElement = document.getElementById('atsLanguages');

        if (fullNameElement) {
            const nameParts = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
            fullNameElement.textContent = nameParts || '';
        }

        if (jobTitleElement) {
            if (data.jobTitle) {
                jobTitleElement.textContent = data.jobTitle;
                jobTitleElement.style.display = '';
            } else {
                jobTitleElement.textContent = '';
                jobTitleElement.style.display = 'none';
            }
        }

        if (emailElement) {
            if (data.email) {
                emailElement.innerHTML = `
                    <span class="ats-header__icon">
                        <span class="iconify" data-icon="mdi:email" aria-hidden="true"></span>
                    </span>
                    <a href="mailto:${data.email}">${data.email}</a>
                `;
                emailElement.style.display = '';
            } else {
                emailElement.textContent = '';
                emailElement.style.display = 'none';
            }
        }

        if (locationElement) {
            if (data.location) {
                locationElement.innerHTML = `
                    <span class="ats-header__icon">
                        <span class="iconify" data-icon="mdi:map-marker" aria-hidden="true"></span>
                    </span>
                    <span>${data.location}</span>
                `;
                locationElement.style.display = '';
            } else {
                locationElement.textContent = '';
                locationElement.style.display = 'none';
            }
        }

        if (linkedInElement) {
            const linkedInRef = Array.isArray(data.references)
                ? data.references.find(ref => ref.url && ref.url.includes('linkedin.com'))
                : null;

            if (linkedInRef && linkedInRef.url) {
                linkedInElement.innerHTML = '';

                const iconContainer = document.createElement('span');
                iconContainer.className = 'ats-header__icon';

                // Get favicon URL using the same mechanism as HR Friendly
                const getFaviconUrl = typeof window !== 'undefined' && typeof window.getFaviconUrl === 'function'
                    ? window.getFaviconUrl
                    : function (url) {
                        try {
                            const parsed = new URL(url);
                            const target = `${parsed.protocol}//${parsed.hostname}`;
                            const encoded = encodeURIComponent(target);
                            return `https://www.google.com/s2/favicons?sz=32&domain_url=${encoded}`;
                        } catch (error) {
                            const sanitized = url.replace(/^[^a-zA-Z0-9]+/, '');
                            const target = `https://${sanitized}`;
                            const encoded = encodeURIComponent(target);
                            return `https://www.google.com/s2/favicons?sz=32&domain_url=${encoded}`;
                        }
                    };

                // Get icon name for fallback
                const getIconForLink = typeof window !== 'undefined' && typeof window.getIconForLink === 'function'
                    ? window.getIconForLink
                    : function (url, type) {
                        if (url.includes('linkedin.com')) return 'mdi:linkedin';
                        if (url.includes('github.com')) return 'mdi:github';
                        if (url.includes('t.me') || type === 'telegram') return 'mdi:telegram';
                        if (url.includes('twitter.com') || url.includes('x.com')) return 'mdi:twitter';
                        if (url.includes('facebook.com')) return 'mdi:facebook';
                        if (url.includes('instagram.com')) return 'mdi:instagram';
                        if (type === 'website') return 'mdi:web';
                        return 'mdi:link';
                    };

                // Try favicon first, fallback to iconify (same mechanism as HR Friendly)
                const favicon = document.createElement('img');
                favicon.className = 'ats-header__favicon';
                favicon.src = getFaviconUrl(linkedInRef.url);
                favicon.alt = `${linkedInRef.text || linkedInRef.url} favicon`;
                favicon.loading = 'lazy';
                favicon.decoding = 'async';
                favicon.referrerPolicy = 'no-referrer';

                const fallbackIcon = document.createElement('span');
                fallbackIcon.className = 'iconify';
                fallbackIcon.dataset.icon = getIconForLink(linkedInRef.url, linkedInRef.type);
                fallbackIcon.setAttribute('aria-hidden', 'true');
                fallbackIcon.style.display = 'none';

                favicon.addEventListener('error', () => {
                    favicon.style.display = 'none';
                    fallbackIcon.style.display = 'inline-flex';
                });

                iconContainer.appendChild(favicon);
                iconContainer.appendChild(fallbackIcon);

                const link = document.createElement('a');
                link.href = linkedInRef.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = linkedInRef.text || linkedInRef.url;

                linkedInElement.appendChild(iconContainer);
                linkedInElement.appendChild(link);
                linkedInElement.style.display = '';
            } else {
                linkedInElement.textContent = '';
                linkedInElement.style.display = 'none';
            }
        }

        if (aboutElement) {
            let aboutSource = data.about || '';
            if (data.extraSkills) {
                const extraSkillsLabel = language === 'ru' ? 'Extra Skills:' : 'Extra Skills:';
                aboutSource = aboutSource
                    ? `${aboutSource}\n\n${extraSkillsLabel}\n${data.extraSkills}`
                    : `${extraSkillsLabel}\n${data.extraSkills}`;
            }
            aboutElement.innerHTML = renderPlainStructuredText(aboutSource);
        }

        if (skillsElement) {
            const flattenedSkills = [];
            if (Array.isArray(data.skills)) {
                data.skills.forEach(skill => {
                    const keywords = Array.isArray(skill.keywords) ? skill.keywords : [];
                    keywords.forEach(keyword => {
                        const cleaned = stripLineMarkers(stripMarkdownSyntax(keyword || ''));
                        if (cleaned) {
                            flattenedSkills.push(cleaned);
                        }
                    });
                });
            }
            const uniqueSkills = [...new Set(flattenedSkills)];
            skillsElement.textContent = uniqueSkills.join(' • ');
        }

        if (experienceElement) {
            const experienceHTML = Array.isArray(data.experience)
                ? data.experience.map(exp => renderAtsExperienceItem(exp, language)).join('')
                : '';
            experienceElement.innerHTML = experienceHTML || '';
        }

        if (educationElement) {
            if (Array.isArray(data.education) && data.education.length > 0) {
                const educationHTML = data.education.map(edu => renderAtsEducationItem(edu)).join('');
                educationElement.innerHTML = educationHTML || '';
            } else {
                educationElement.innerHTML = '';
            }
        }

        if (languagesElement) {
            if (Array.isArray(data.languages) && data.languages.length > 0) {
                const languagesHTML = data.languages.map(lang => {
                    const name = escapeHTML(lang.name || '');
                    const level = escapeHTML(lang.level || '');
                    return name && level ? `${name} – ${level}` : (name || level || '');
                }).filter(Boolean).join(', ');
                languagesElement.textContent = languagesHTML || '';
            } else {
                languagesElement.textContent = '';
            }
        }
    }

    window.AtsLayout = {
        render: renderAtsLayout,
    };
})(window);

