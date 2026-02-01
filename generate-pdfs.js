const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');
const TOML = require('@iarna/toml');

// Import server functions
const server = require('./server.js');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

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
 * Wait for server to be ready
 */
async function waitForServer(url, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await fetch(url);
            console.log(`✅ Server is ready at ${url}`);
            return true;
        } catch (error) {
            console.log(`⏳ Waiting for server... (attempt ${i + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error(`Server did not start within ${maxAttempts} seconds`);
}

/**
 * Generate PDF for a specific language and view mode
 */
async function generatePDF(browser, lang, view, outputDir) {
    const url = `http://${HOST}:${PORT}/?lang=${lang}&view=${view}`;
    const viewSuffix = view === 'ats-friendly' ? 'ats' : 'hr';

    // Generate filename from resume data: firstName lastName – jobTitle.<ats/hr>.pdf
    let filename = `resume.${viewSuffix}.pdf`;
    try {
        const tomlPath = path.join(__dirname, 'resume.toml');
        const tomlText = fs.readFileSync(tomlPath, 'utf8');
        const parsedToml = TOML.parse(tomlText);
        const localized = localizeResumeData(parsedToml, lang);

        const firstName = localized.firstName || '';
        const lastName = localized.lastName || '';
        const jobTitle = localized.jobTitle || '';

        const nameParts = [firstName, lastName].filter(Boolean);
        const name = nameParts.join(' ');

        if (name && jobTitle) {
            filename = `${name} – ${jobTitle}.${viewSuffix}.pdf`;
        } else if (name) {
            filename = `${name}.${viewSuffix}.pdf`;
        }
    } catch (error) {
        console.warn(`⚠️  Failed to generate custom filename, using default: ${error && error.message ? error.message : error}`);
    }

    const outputFile = path.join(outputDir, filename);

    console.log(`📄 Generating PDF: ${lang}-${viewSuffix}`);
    console.log(`   URL: ${url}`);
    console.log(`   Output: ${outputFile}`);

    const page = await browser.newPage();

    try {
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });

        // Emulate print media
        await page.emulateMediaType('print');

        // Wait for content to load
        const selector = view === 'ats-friendly' ? '#atsLayout' : '.container';
        await page.waitForSelector(selector, { timeout: 15000 }).catch(() => {
            console.warn(`⚠️  Selector ${selector} not found, continuing anyway`);
        });

        // Ensure lazy images are loaded
        await page.evaluate(() => {
            try {
                const imgs = Array.from(document.images || []);
                imgs.forEach(img => {
                    const loadingAttr = (img.getAttribute('loading') || '').toLowerCase();
                    if (img.loading === 'lazy' || loadingAttr === 'lazy') {
                        img.loading = 'eager';
                        img.setAttribute('loading', 'eager');
                        const src = img.currentSrc || img.src;
                        if (src) img.src = src;
                    }
                });
            } catch (e) {
                // Ignore
            }
        });

        // Scroll through the page to trigger lazy loading
        await page.evaluate(async () => {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const total = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0
            );
            const step = Math.max(window.innerHeight || 800, 400);
            for (let y = 0; y <= total; y += step) {
                window.scrollTo(0, y);
                await sleep(50);
            }
            window.scrollTo(0, 0);
        });

        // Wait for images to load
        await page.evaluate(() => {
            return Promise.all(
                Array.from(document.images || [])
                    .filter(img => !img.complete)
                    .map(img => new Promise((resolve) => {
                        img.addEventListener('load', resolve, { once: true });
                        img.addEventListener('error', resolve, { once: true });
                    }))
            );
        });

        // Additional wait for any remaining async operations
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0.5cm',
                right: '0.5cm',
                bottom: '0.5cm',
                left: '0.5cm'
            },
            preferCSSPageSize: true,
        });

        // Save PDF to file
        fs.writeFileSync(outputFile, pdfBuffer);
        console.log(`✅ Generated: ${outputFile}`);

    } catch (error) {
        console.error(`❌ Error generating ${lang}-${viewSuffix} PDF:`, error.message);
        throw error;
    } finally {
        await page.close();
    }
}

/**
 * Main function to generate all PDFs
 */
async function generateAllPDFs() {
    const outputDir = path.join(__dirname, 'data');

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let serverInstance = null;
    let browser = null;

    try {
        // Start server
        console.log('🚀 Starting server...');
        serverInstance = await server.startServer(PORT);

        // Wait for server to be ready
        await waitForServer(`http://${HOST}:${PORT}`);

        // Launch browser
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--font-render-hinting=medium',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
        });

        // Generate PDFs for all combinations
        const languages = ['ru', 'en'];
        const views = ['user-friendly', 'ats-friendly'];

        console.log('\n📋 Generating PDFs for all combinations...\n');

        for (const lang of languages) {
            for (const view of views) {
                await generatePDF(browser, lang, view, outputDir);
            }
        }

        console.log('\n✅ All PDFs generated successfully!');
        console.log(`📁 Output directory: ${outputDir}`);

    } catch (error) {
        console.error('❌ PDF generation failed:', error);
        process.exit(1);
    } finally {
        // Cleanup
        if (browser) {
            await browser.close();
            console.log('🌐 Browser closed');
        }

        if (serverInstance) {
            serverInstance.close();
            console.log('🛑 Server stopped');
        }
    }
}

// Run if called directly
if (require.main === module) {
    generateAllPDFs();
}

module.exports = { generateAllPDFs };

