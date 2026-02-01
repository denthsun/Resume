const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');
const puppeteer = require('puppeteer');
const TOML = require('@iarna/toml');

// Configuration
const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// MIME types for different file extensions
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

/**
 * Get MIME type for a file
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Generate PDF using headless Chromium to mimic browser print
 */
async function handlePdfRequest(req, res, parsed) {
    const lang = (parsed.searchParams.get('lang') || 'ru').toLowerCase();
    const allowedLangs = new Set(['ru', 'en']);
    if (!allowedLangs.has(lang)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unsupported language. Use "ru" or "en".' }));
        return;
    }

    const view = parsed.searchParams.get('view') === 'ats-friendly' ? 'ats-friendly' : 'user-friendly';
    const hostHeader = req.headers.host || `${HOST}:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const targetUrl = `${proto}://${hostHeader}/?lang=${lang}&view=${view}`;

    console.log(`[API] Generating PDF for ${targetUrl}`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--font-render-hinting=medium',
            ],
        });

        const page = await browser.newPage();
        await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 45000 });
        await page.emulateMediaType('print');
        await page.waitForSelector('.container', { timeout: 15000 }).catch(() => { });

        // Ensure lazy images (favicons/previews) are requested before printing.
        // In headless PDF generation there is no user scroll, so native lazy-loading might never trigger.
        await page.evaluate(() => {
            try {
                const imgs = Array.from(document.images || []);
                imgs.forEach(img => {
                    const loadingAttr = (img.getAttribute('loading') || '').toLowerCase();
                    if (img.loading === 'lazy' || loadingAttr === 'lazy') {
                        img.loading = 'eager';
                        img.setAttribute('loading', 'eager');
                        // Nudge the browser to (re)consider the request.
                        const src = img.currentSrc || img.src;
                        if (src) img.src = src;
                    }
                });
            } catch (e) {
                // Ignore
            }
        });

        // Trigger potential viewport-bound loading by scrolling once.
        await page.evaluate(async () => {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const total = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0
            );
            const step = Math.max(window.innerHeight || 800, 400);
            for (let y = 0; y <= total; y += step) {
                window.scrollTo(0, y);
                await sleep(40);
            }
            window.scrollTo(0, 0);
        });

        // Wait for fonts and images to settle (do not fail the PDF if some remote icons error out).
        await page.evaluate(async () => {
            try {
                if (document.fonts && document.fonts.ready) {
                    await document.fonts.ready;
                }
            } catch (e) {
                // Ignore
            }
        });
        await page.waitForFunction(() => {
            try {
                return Array.from(document.images || []).every(img => img.complete);
            } catch (e) {
                return true;
            }
        }, { timeout: 15000 }).catch(() => { });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
        });

        // Generate filename from resume data: firstName lastName – jobTitle.<ats/hr>.pdf
        const viewSuffix = view === 'ats-friendly' ? 'ats' : 'hr';
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
            console.warn(`[API] Failed to generate custom filename, using default: ${error && error.message ? error.message : error}`);
        }

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
        });
        res.end(pdfBuffer);
    } catch (error) {
        console.error(`[API] Failed to generate PDF: ${error && error.message ? error.message : error}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate PDF' }));
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.warn(`[API] Failed to close browser instance: ${closeError && closeError.message ? closeError.message : closeError}`);
            }
        }
    }
}

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    // API: Resolve Open Graph image and redirect to it
    try {
        const parsed = new URL(req.url, `http://${HOST}:${PORT}`);
        if (parsed.pathname === '/api/og-image') {
            console.log(`\n[API] ========== ЗАПРОС /api/og-image ==========`);
            const targetParam = parsed.searchParams.get('url') || '';
            console.log(`[API] Получен параметр url: ${targetParam}`);
            const targetUrl = normalizeTargetUrl(targetParam);
            console.log(`[API] Нормализованный URL: ${targetUrl}`);

            if (!targetUrl) {
                console.error(`[API] ❌ Невалидный или отсутствующий URL параметр`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid or missing url parameter' }));
                return;
            }

            resolveOpenGraphImage(targetUrl)
                .then((imageUrl) => {
                    console.log(`[API] ✅ Успешно получен URL изображения: ${imageUrl}`);
                    console.log(`[API] Редирект на: ${imageUrl}`);
                    // Redirect to actual image URL so <img> can load it напрямую
                    res.writeHead(302, {
                        Location: imageUrl,
                        'Cache-Control': 'public, max-age=3600',
                    });
                    res.end();
                    console.log(`[API] ========== КОНЕЦ ЗАПРОСА ==========\n`);
                })
                .catch((error) => {
                    console.error(`[API] ❌ Ошибка при получении OG изображения: ${error && error.message ? error.message : error}`);
                    console.error(`[API] Stack: ${error && error.stack ? error.stack : 'N/A'}`);
                    // Final fallback — универсальный сервис opengraph (скриншот/OG)
                    const fallback = `https://v1.opengraph.11ty.dev/${encodeURIComponent(targetUrl)}/`;
                    console.log(`[API] Используем fallback: ${fallback}`);
                    res.writeHead(302, {
                        Location: fallback,
                        'Cache-Control': 'public, max-age=300',
                    });
                    res.end();
                    console.log(`[API] ========== КОНЕЦ ЗАПРОСА (fallback) ==========\n`);
                });
            return;
        }
        if (parsed.pathname === '/api/resume') {
            if (req.method !== 'GET') {
                res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'GET' });
                res.end(JSON.stringify({ error: 'Method Not Allowed' }));
                return;
            }
            const lang = (parsed.searchParams.get('lang') || 'ru').toLowerCase();
            const allowedLangs = new Set(['ru', 'en']);
            if (!allowedLangs.has(lang)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unsupported language. Use "ru" or "en".' }));
                return;
            }
            const tomlPath = path.join(__dirname, 'resume.toml');
            fs.readFile(tomlPath, 'utf8', (err, text) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'resume.toml not found' }));
                        return;
                    }
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to read resume.toml' }));
                    return;
                }
                try {
                    const parsedToml = TOML.parse(text);
                    const localized = localizeResumeData(parsedToml, lang);
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
                    res.end(JSON.stringify(localized));
                } catch (parseError) {
                    console.error('TOML parse error:', parseError && parseError.message ? parseError.message : parseError);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid TOML format in resume.toml' }));
                }
            });
            return;
        }
        if (parsed.pathname === '/api/pdf') {
            handlePdfRequest(req, res, parsed);
            return;
        }
    } catch (e) {
        // Ignore parsing errors and proceed to static handling
    }

    // Parse URL and handle root (serve only from our directory)
    const requestPathname = req.url.split('?')[0] || '/';
    const relativePath = requestPathname === '/'
        ? 'index.html'
        : decodeURIComponent(requestPathname).replace(/^\/+/, '');
    const filePath = path.join(__dirname, relativePath);

    // Security check: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    // Read and serve file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>404 - Not Found</title>
                        <style>
                            body {
                                font-family: sans-serif;
                                text-align: center;
                                padding: 50px;
                            }
                            h1 { color: #E53935; }
                        </style>
                    </head>
                    <body>
                        <h1>404 - File Not Found</h1>
                        <p>The requested file was not found: ${req.url}</p>
                        <a href="/">Go to Home</a>
                    </body>
                    </html>
                `);
            } else {
                // Server error
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`500 Internal Server Error: ${err.code}`);
            }
        } else {
            // Success - serve file with appropriate MIME type
            const mimeType = getMimeType(filePath);
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content);
        }
    });
});

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
 * Normalize and validate incoming URL
 */
function normalizeTargetUrl(input) {
    if (!input || typeof input !== 'string') return null;
    let url = input.trim();
    // If protocol is missing, consider it https
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    try {
        const u = new URL(url);
        // Only allow http/https
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.toString();
    } catch {
        return null;
    }
}

/**
 * HTTP(S) GET с поддержкой редиректов
 */
function httpGetBuffer(url, redirectsLeft = 5, headers = {}) {
    return new Promise((resolve, reject) => {
        console.log(`[httpGetBuffer] Запрос к: ${url} (осталось редиректов: ${redirectsLeft})`);
        const client = url.startsWith('https:') ? https : http;
        const defaultHeaders = {
            // More browser-like User-Agent — helps sites that block non-standard UAs
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
        };
        const req = client.get(url, { headers: { ...defaultHeaders, ...headers } }, (res) => {
            const status = res.statusCode || 0;
            const loc = res.headers.location;
            const contentType = res.headers['content-type'] || 'unknown';
            const contentEncoding = res.headers['content-encoding'] || 'none';

            console.log(`[httpGetBuffer] Ответ: статус ${status}, Content-Type: ${contentType}, Content-Encoding: ${contentEncoding}`);

            // Follow redirects
            if ([301, 302, 303, 307, 308].includes(status) && loc && redirectsLeft > 0) {
                const next = new URL(loc, url).toString();
                console.log(`[httpGetBuffer] Редирект на: ${next}`);
                res.resume(); // discard data
                httpGetBuffer(next, redirectsLeft - 1, headers).then(resolve).catch(reject);
                return;
            }
            if (status >= 400) {
                console.error(`[httpGetBuffer] Ошибка HTTP ${status}`);
                reject(new Error(`Request failed with status ${status}`));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                console.log(`[httpGetBuffer] Получено данных: ${buffer.length} байт (сжато: ${contentEncoding})`);

                const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
                if (encoding.includes('br')) {
                    console.log(`[httpGetBuffer] Декомпрессия Brotli...`);
                    zlib.brotliDecompress(buffer, (err, out) => {
                        if (err) {
                            console.log(`[httpGetBuffer] Ошибка декомпрессии Brotli, используем сырой буфер: ${err.message}`);
                            return resolve(buffer);
                        }
                        console.log(`[httpGetBuffer] Декомпрессия Brotli успешна: ${out.length} байт`);
                        resolve(out);
                    });
                } else if (encoding.includes('gzip')) {
                    console.log(`[httpGetBuffer] Декомпрессия Gzip...`);
                    zlib.gunzip(buffer, (err, out) => {
                        if (err) {
                            console.log(`[httpGetBuffer] Ошибка декомпрессии Gzip, используем сырой буфер: ${err.message}`);
                            return resolve(buffer);
                        }
                        console.log(`[httpGetBuffer] Декомпрессия Gzip успешна: ${out.length} байт`);
                        resolve(out);
                    });
                } else if (encoding.includes('deflate')) {
                    console.log(`[httpGetBuffer] Декомпрессия Deflate...`);
                    zlib.inflate(buffer, (err, out) => {
                        if (err) {
                            console.log(`[httpGetBuffer] Ошибка декомпрессии Deflate, используем сырой буфер: ${err.message}`);
                            return resolve(buffer);
                        }
                        console.log(`[httpGetBuffer] Декомпрессия Deflate успешна: ${out.length} байт`);
                        resolve(out);
                    });
                } else {
                    console.log(`[httpGetBuffer] Сжатие не используется, возвращаем сырой буфер`);
                    resolve(buffer);
                }
            });
        });
        req.on('error', (err) => {
            console.error(`[httpGetBuffer] Ошибка запроса: ${err.message}`);
            reject(err);
        });
        req.setTimeout(10000, () => {
            console.error(`[httpGetBuffer] Таймаут запроса`);
            req.destroy(new Error('Request timeout'));
        });
    });
}

/**
 * Декодировать HTML-сущности в строке (минимально необходимый набор)
 */
function decodeHtmlEntities(text) {
    if (!text || typeof text !== 'string') return text;
    const named = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
    };
    let decoded = text.replace(/&(amp|lt|gt|quot);|&#(?:39|x27);/g, (m) => named[m] || m);
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => {
        const code = parseInt(num, 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
    return decoded;
}

/**
 * Извлечь content из meta-тега по имени/свойству (без зависимостей)
 */
function findMetaContent(html, attr, value) {
    console.log(`[findMetaContent] Ищем мета-тег: ${attr}="${value}"`);
    // Escape special regex characters in value
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<meta[^>]+${attr}\\s*=\\s*["']${escapedValue}["'][^>]*>`, 'i');
    const tagMatch = html.match(pattern);
    if (!tagMatch) {
        console.log(`[findMetaContent] Мета-тег не найден для ${attr}="${value}"`);
        return null;
    }
    console.log(`[findMetaContent] Найден тег: ${tagMatch[0].substring(0, 100)}...`);
    const contentMatch = tagMatch[0].match(/content\s*=\s*["']([^"']+)["']/i);
    if (!contentMatch) {
        console.log(`[findMetaContent] Атрибут content не найден в теге`);
        return null;
    }
    const rawContent = contentMatch[1];
    console.log(`[findMetaContent] Сырое значение content: ${rawContent}`);
    // Decode HTML entities in the content attribute value
    const decoded = decodeHtmlEntities(rawContent);
    console.log(`[findMetaContent] Декодированное значение: ${decoded}`);
    return decoded;
}

/**
 * Попробовать извлечь URL изображения из OG/Twitter мета-тегов
 */
function extractOgImageUrl(html, baseUrl) {
    console.log(`[extractOgImageUrl] Начинаем поиск OG-изображения для базового URL: ${baseUrl}`);
    console.log(`[extractOgImageUrl] Размер HTML: ${html.length} символов`);

    // Проверяем наличие og:image в HTML (для отладки)
    const hasOgImage = /<meta[^>]+property\s*=\s*["']og:image["'][^>]*>/i.test(html);
    console.log(`[extractOgImageUrl] HTML содержит og:image тег: ${hasOgImage}`);

    const candidates = [
        ['property', 'og:image:secure_url'],
        ['property', 'og:image:url'],
        ['property', 'og:image'],
        ['name', 'og:image'],
        ['name', 'twitter:image:src'],
        ['property', 'twitter:image:src'],
        ['name', 'twitter:image'],
        ['property', 'twitter:image'],
    ];
    for (const [attr, value] of candidates) {
        const content = findMetaContent(html, attr, value);
        if (content) {
            console.log(`[extractOgImageUrl] Найдено значение для ${attr}="${value}": ${content}`);
            const resolved = resolveToAbsoluteUrl(content, baseUrl);
            if (resolved) {
                console.log(`[extractOgImageUrl] Разрешенный URL: ${resolved}`);
                return resolved;
            } else {
                console.log(`[extractOgImageUrl] Не удалось разрешить URL для ${content}`);
            }
        }
    }
    console.log(`[extractOgImageUrl] OG-изображение не найдено ни в одном из кандидатов`);
    return null;
}

/**
 * Разрешить относительные/протокол-независимые URL
 */
function resolveToAbsoluteUrl(resource, baseUrl) {
    if (!resource) return null;
    try {
        if (resource.startsWith('//')) {
            const base = new URL(baseUrl);
            return `${base.protocol}${resource}`;
        }
        // new URL сам обработает относительные пути, пробелы и прочее
        return new URL(resource, baseUrl).toString();
    } catch {
        return null;
    }
}

/**
 * Получить URL OG-изображения страницы (или вернуть fallback)
 */
async function resolveOpenGraphImage(pageUrl) {
    console.log(`\n[resolveOpenGraphImage] ========== НАЧАЛО ОБРАБОТКИ ==========`);
    console.log(`[resolveOpenGraphImage] Запрашиваем URL: ${pageUrl}`);

    try {
        console.log(`[resolveOpenGraphImage] Загружаем HTML...`);
        const htmlBuffer = await httpGetBuffer(pageUrl);
        console.log(`[resolveOpenGraphImage] HTML загружен, размер: ${htmlBuffer.length} байт`);

        const html = htmlBuffer.toString('utf8');
        console.log(`[resolveOpenGraphImage] HTML преобразован в строку, длина: ${html.length} символов`);

        // Показываем первые 500 символов HTML для отладки
        console.log(`[resolveOpenGraphImage] Первые 500 символов HTML:\n${html.substring(0, 500)}`);

        console.log(`[resolveOpenGraphImage] Ищем OG-изображение...`);
        const img = extractOgImageUrl(html, pageUrl);

        if (img) {
            console.log(`[resolveOpenGraphImage] ✅ УСПЕХ: Найдено OG-изображение: ${img}`);
            return img;
        }

        console.log(`[resolveOpenGraphImage] OG-изображение не найдено, пробуем fallback для Raycast...`);
        // Domain-specific lightweight fallback for Raycast extensions (если мета-тегов нет)
        try {
            const u = new URL(pageUrl);
            if (u.hostname.endsWith('raycast.com')) {
                const parts = u.pathname.split('/').filter(Boolean);
                if (parts.length >= 2) {
                    const handle = parts[0];
                    const name = parts[1];
                    const fallbackUrl = `https://www.raycast.com/api/extension-og?handle=${encodeURIComponent(handle)}&name=${encodeURIComponent(name)}`;
                    console.log(`[resolveOpenGraphImage] Используем Raycast fallback: ${fallbackUrl}`);
                    return fallbackUrl;
                }
            }
        } catch (e) {
            console.log(`[resolveOpenGraphImage] Ошибка при создании Raycast fallback: ${e.message}`);
        }

        // Fallback: сервис, который умеет вытаскивать og-image/сделать скриншот
        const finalFallback = `https://v1.opengraph.11ty.dev/${encodeURIComponent(pageUrl)}/`;
        console.log(`[resolveOpenGraphImage] Используем универсальный fallback: ${finalFallback}`);
        return finalFallback;
    } catch (error) {
        console.error(`[resolveOpenGraphImage] ❌ ОШИБКА: ${error.message}`);
        console.error(`[resolveOpenGraphImage] Stack: ${error.stack}`);
        throw error;
    } finally {
        console.log(`[resolveOpenGraphImage] ========== КОНЕЦ ОБРАБОТКИ ==========\n`);
    }
}

/**
 * Start server function (can be called programmatically)
 */
function startServer(port = PORT, host = HOST) {
    return new Promise((resolve, reject) => {
        const serverInstance = server.listen(port, host, () => {
            console.log('='.repeat(60));
            console.log('📄 CV Generator Server Started');
            console.log('='.repeat(60));
            console.log(`🌐 Server running at: http://${host}:${port}/`);
            console.log(`📁 Serving files from: ${__dirname}`);
            console.log('');
            console.log('📝 To view your resume, open the URL above in your browser');
            console.log('📥 To export to PDF: Press Ctrl+P (Cmd+P on Mac) and select "Save as PDF"');
            console.log('');
            console.log('Press Ctrl+C to stop the server');
            console.log('='.repeat(60));

            resolve(serverInstance);
        });

        serverInstance.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Error: Port ${port} is already in use.`);
                console.error(`   Try running with a different port: PORT=3001 node server.js`);
            } else {
                console.error('❌ Server error:', err);
            }
            reject(err);
        });
    });
}

// Only start server if this file is run directly (not imported as module)
if (require.main === module) {
    startServer(PORT, HOST).then((serverInstance) => {
        // Auto-open browser (optional - works on macOS)
        if (process.platform === 'darwin') {
            const { exec } = require('child_process');
            exec(`open http://${HOST}:${PORT}/`, (error) => {
                if (error) {
                    console.log('Could not auto-open browser. Please open manually.');
                }
            });
        }

        /**
         * Handle graceful shutdown
         */
        process.on('SIGINT', () => {
            console.log('\n\n👋 Shutting down server...');
            serverInstance.close(() => {
                console.log('✅ Server stopped successfully');
                process.exit(0);
            });
        });
    }).catch((err) => {
        process.exit(1);
    });
}

// Export for use in other scripts
module.exports = { startServer };

