const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

/**
 * Localize resume data from multilanguage TOML
 * Extracts values for the specified language from keys like "propertyName.language"
 */
function localizeResumeData(data, lang) {
    const result = {};

    // Helper function to process object recursively
    function processObject(obj, targetObj) {
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) continue;

            const value = obj[key];

            // Check if this is a multilanguage key (e.g., "firstName.ru")
            const match = key.match(/^(.+)\.([a-z]{2})$/);
            if (match) {
                const [, propName, keyLang] = match;
                // Only include if this is the requested language
                if (keyLang === lang) {
                    targetObj[propName] = typeof value === 'string' ? value.trim() : value;
                }
            } else {
                // Non-multilanguage property
                if (Array.isArray(value)) {
                    // Process array of objects (like experience, projects, education)
                    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                        targetObj[key] = value.map(item => {
                            const processedItem = {};
                            processObject(item, processedItem);
                            return processedItem;
                        });
                    } else {
                        // Simple array, trim strings
                        targetObj[key] = value.map(v => typeof v === 'string' ? v.trim() : v);
                    }
                } else if (typeof value === 'object' && value !== null) {
                    // Nested object
                    targetObj[key] = {};
                    processObject(value, targetObj[key]);
                } else {
                    // Simple value, trim if string
                    targetObj[key] = typeof value === 'string' ? value.trim() : value;
                }
            }
        }
    }

    processObject(data, result);
    return result;
}

/**
 * Build static JSON files from TOML for GitHub Pages
 */
function build() {
    const tomlPath = path.join(__dirname, 'resume.toml');
    const outputDir = path.join(__dirname, 'data');

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read and parse TOML
    const tomlContent = fs.readFileSync(tomlPath, 'utf8');
    const parsedToml = TOML.parse(tomlContent);

    // Generate JSON for each language
    const languages = ['ru', 'en'];
    languages.forEach(lang => {
        const localized = localizeResumeData(parsedToml, lang);
        const jsonPath = path.join(outputDir, `resume-${lang}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(localized, null, 2), 'utf8');
        console.log(`✅ Generated ${jsonPath}`);
    });

    console.log('\n✅ Build completed successfully!');
}

try {
    build();
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}

