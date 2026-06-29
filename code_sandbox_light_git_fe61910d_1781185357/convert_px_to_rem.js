const fs = require('fs');
const path = require('path');

const BASE_FONT_SIZE = 14;

function processContent(content) {
    // This regex looks for any number followed by px, for example: 12px, 14.5px
    // It captures the number in group 1.
    return content.replace(/([-]?\d+(\.\d+)?)px/g, (match, p1) => {
        const value = parseFloat(p1);
        
        // Don't convert 0px, 1px, 2px (usually borders, small shadows)
        // Also skip negative borders if any (-1px, -2px)
        if (Math.abs(value) <= 2) {
            return match; 
        }

        const remValue = value / BASE_FONT_SIZE;
        // Format to max 4 decimal places, removing trailing zeros
        const formattedRem = parseFloat(remValue.toFixed(4)).toString();
        
        return `${formattedRem}rem`;
    });
}

const filesToProcess = ['css/style.css', 'index.html'];

for (const filePath of filesToProcess) {
    const fullPath = path.resolve(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        continue;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    const originalContent = content;

    content = processContent(content);

    // If it's the CSS file, add the media queries for responsivenes if not already present
    if (filePath.endsWith('.css') && !content.includes('@media screen and (max-width: 1600px)')) {
        const mediaQueries = `

/* =========================================================
   RESPONSIVIDADE GLOBAL (AUTO-ZOOM)
   ========================================================= */
html {
    font-size: 14px;
}

@media screen and (max-width: 1600px) {
    html { font-size: 13px; }
}
@media screen and (max-width: 1440px) {
    html { font-size: 12px; }
}
@media screen and (max-width: 1366px) {
    html { font-size: 11px; }
}
@media screen and (max-width: 1280px) {
    html { font-size: 10px; }
}
@media screen and (max-width: 1024px) {
    html { font-size: 9px; }
}
@media screen and (max-width: 768px) {
    html { font-size: 8px; }
}
`;
        
        // Remove existing html { font-size: 14px; } to avoid duplication, though CSS cascading would override it anyway.
        // It's cleaner to just append it to the top after :root, or bottom.
        // Let's just append to the end of the file.
        content += mediaQueries;
    }

    if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Processed and updated ${filePath}`);
    } else {
        console.log(`No changes needed for ${filePath}`);
    }
}
