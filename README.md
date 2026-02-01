# CV Generator

Static HTML resume site with PDF export capability. This project allows you to maintain your resume data in a structured TOML format and automatically generates a beautiful, printable HTML resume.

## 📋 Features

- ✅ **TOML-based data structure** - Easy to update and maintain
- ✅ **Multilanguage support** - Single file with language-specific properties (Russian and English)
- ✅ **Modern, professional design** - Two-column layout with clean typography
- ✅ **SF Pro Rounded font** - Clean and professional Apple typography
- ✅ **Iconify integration** - Beautiful icons for links and sections (from https://iconify.design)
- ✅ **PDF export ready** - Print directly from browser (Ctrl+P / Cmd+P)
- ✅ **Responsive design** - Looks great on all devices
- ✅ **Text formatting support** - Bold, italic, and underline in content
- ✅ **Automatic icon detection** - LinkedIn, GitHub, Telegram icons automatically detected from URLs
- ✅ **Local development server** - Easy to preview changes

## 🚀 Quick Start

### Prerequisites

- Node.js (version 12 or higher)

### Installation & Running

1. Navigate to the project directory:
```bash
cd <path/to/repository>
```

2. Install dependencies:
```bash
npm install
```

3. Start the local server:
```bash
npm start
```

4. The server will automatically start and open your resume in the browser at `http://localhost:3000`

### Alternative Start Commands

```bash
npm run dev           # Same as npm start
npm run serve         # Same as npm start
npm run build         # Build JSON data files and OG image
npm run generate-pdfs # Generate all PDF variants locally
npm run og-image      # Generate only the OpenGraph image
```

### OpenGraph Preview Automation

- `npm run build` now renders `og-preview.html` headlessly with Puppeteer and saves the output as `og-image.png`
- `og-image.png` is deployed together with the site, so OpenGraph/Twitter cards always have a fresh preview
- You can regenerate just the preview without rebuilding data via `npm run og-image`

## 📝 Editing Your Resume

### Step 1: Add Your Avatar

1. Place your avatar image in the project folder (e.g., `avatar.jpg`)
2. Or use an absolute path to your image (e.g., `/Users/username/Pictures/avatar.jpg`)
3. Update the `avatar` field in `resume.toml` with the path

### Step 2: Edit the TOML file

Open `resume.toml` in the project root and update it with your information. The file uses a multilanguage format where language-specific properties use the format `"propertyName.language"`:

```toml
# Common properties (same for all languages)
avatar = "avatar.jpg"
lastName = "Your last name"
email = "your.email@example.com"

# Multilanguage properties
"firstName.ru" = "Ваше имя"
"firstName.en" = "Your first name"

"jobTitle.ru" = "Ваша должность"
"jobTitle.en" = "Your job title"

"location.ru" = "Ваше местоположение"
"location.en" = "Your location"

"about.ru" = "Ваша биография"
"about.en" = "Your bio"

"expectation.ru" = "Ваши ожидания"
"expectation.en" = "Your expectations"

# References (same for all languages)
[[references]]
type = "website" # website/telegram/github
url  = "https://..."
text = "Display text"

# Languages section (same for all languages)
[[languages]]
name = "Language name"
level = "Proficiency level"

# Skills (same for all languages)
[[skills]]
category    = "Skill category"
description = "Category description"
keywords    = ["skill1", "skill2", "..."]

"extraSkills.ru" = ["Дополнительный навык 1", "Дополнительный навык 2"]
"extraSkills.en" = ["Additional skill 1", "Additional skill 2"]

# Experience with multilanguage fields
[[experience]]
position = "Job title"
company  = "Company name"
period   = "MM/YYYY - MM/YYYY"

"about.ru" = "О компании/проекте"
"about.en" = "About company/project"

"responsibilities.ru" = "Ваши обязанности"
"responsibilities.en" = "Your responsibilities"

"achievements.ru" = "Ваши достижения"
"achievements.en" = "Your achievements"

  [[experience.links]]
  title = "Link title"
  url   = "https://..."

# Projects with multilanguage description
[[projects]]
title = "Project name"
link  = "https://..."

"description.ru" = "Описание проекта"
"description.en" = "Project description"

# Education with multilanguage fields
[[education]]
period = "YYYY - YYYY"

"degree.ru" = "Название степени"
"degree.en" = "Degree name"

"university.ru" = "Название университета"
"university.en" = "University name"
```

### Multilanguage Properties

The following properties support multiple languages using the `"propertyName.language"` format:
- `firstName`, `pageTitle`, `jobTitle`, `location`
- `about`, `expectation`, `skillsIntro`
- `extraSkills` (array)
- `experience.about`, `experience.responsibilities`, `experience.achievements`
- `projects.description`
- `education.degree`, `education.university`

Properties without a language suffix (like `avatar`, `lastName`, `email`, `references`, `languages`, `skills`) are shared across all languages.

### Step 3: Text Formatting

You can use the following formatting in any text field:

- `**text**` - Makes text **bold**
- `*text*` - Makes text *italic*
- `__text__` - Makes text <u>underlined</u>

Example:
```toml
about = "I have **10 years** of experience in *web development*."
```

### Step 3: Switch Languages

The resume supports Russian and English. Switch languages using:
- `http://localhost:3000?lang=ru` - Russian version
- `http://localhost:3000?lang=en` - English version

The language preference is saved in your browser and will persist across sessions.

### Step 4: Preview Changes

1. Save your changes to `resume.toml`
2. Refresh your browser (F5 or Cmd+R)
3. Your updated resume will appear immediately

## 📥 Exporting to PDF

1. Open your resume in the browser (`http://localhost:3000`)
2. Press **Ctrl+P** (Windows/Linux) or **Cmd+P** (Mac)
3. In the print dialog:
   - **Destination**: Select "Save as PDF"
   - **Layout**: Portrait
   - **Paper size**: A4 or Letter
   - **Margins**: Default or Custom
   - **Options**: Enable "Background graphics" for best results
4. Click "Save" and choose where to save your PDF

### Tips for Best PDF Output

- ✅ Enable "Background graphics" in print settings
- ✅ Use A4 paper size for international standard
- ✅ Check "Print headers and footers" is disabled for cleaner output
- ✅ Preview before saving to ensure everything looks correct

## 📁 Project Structure

```
cv-generator/
├── index.html          # Main HTML structure
├── styles.css          # All styling and print styles
├── script.js           # Data loading and rendering logic
├── resume.toml         # Multilanguage resume data (Russian & English)
├── server.js           # Local development server
├── package.json        # Project configuration
└── README.md          # This file
```

## 🎨 Customizing the Design

### Icons

This project uses [Iconify](https://iconify.design) for icons. Icons are automatically detected for:
- LinkedIn (`mdi:linkedin`)
- GitHub (`mdi:github`)
- Telegram (`mdi:telegram`)
- Twitter/X (`mdi:twitter`)
- And many more...

You can browse and find more icons at https://iconify.design and use them in your HTML:

```html
<span class="iconify" data-icon="mdi:icon-name"></span>
```

### Colors

Edit the CSS variables in `styles.css`:

```css
:root {
    --color-black: #000000;
    --color-blue: #2196F3;     /* Links and accents */
    --color-red: #E53935;      /* Section highlights */
    --color-gray: #666666;     /* Secondary text */
}
```

## 🌐 Browser Support

- ✅ Chrome/Edge (Recommended for PDF export)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## 📄 License

MIT License - feel free to use this for your personal resume!

---

**Happy job hunting! 🎯**
