// This script can be executed to add the SweetAlert2 config script to all HTML pages
// Run this script with Node.js to apply the changes to all HTML files

const fs = require('fs');
const path = require('path');

// Directory containing HTML files
const htmlDirectory = path.join(__dirname, '..', 'html');

// Function to recursively find all HTML files
function findHtmlFiles(directory) {
    const results = [];
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            // Recursive search in subdirectories
            results.push(...findHtmlFiles(filePath));
        } else if (file.endsWith('.html')) {
            results.push(filePath);
        }
    }
    
    return results;
}

// Function to add SweetAlert2 config script to an HTML file
function addSweetAlertToHtml(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Skip if already contains sweetalert-config.js
        if (content.includes('sweetalert-config.js')) {
            console.log(`SweetAlert2 config already included in ${filePath}`);
            return;
        }
        
        // Find the position to insert the script - before the last script or before </body>
        let insertPosition;
        
        // Check for last script tag
        const lastScriptIndex = content.lastIndexOf('<script src=');
        if (lastScriptIndex !== -1) {
            // Find the end of the script tag line
            const lineEndIndex = content.indexOf('\n', lastScriptIndex);
            if (lineEndIndex !== -1) {
                insertPosition = lineEndIndex + 1;
            } else {
                // If no newline after the script tag, insert after the script tag
                const scriptTagEndIndex = content.indexOf('</script>', lastScriptIndex);
                if (scriptTagEndIndex !== -1) {
                    insertPosition = scriptTagEndIndex + 9; // Length of </script>
                }
            }
        }
        
        // If no script tag found, look for </body>
        if (!insertPosition) {
            const bodyCloseIndex = content.lastIndexOf('</body>');
            if (bodyCloseIndex !== -1) {
                insertPosition = bodyCloseIndex;
            }
        }
        
        // Insert the SweetAlert2 config script
        if (insertPosition) {
            const indent = '  '; // Default indentation
            const scriptTag = `${indent}<script src="../scripts/sweetalert-config.js"></script>\n`;
            content = content.slice(0, insertPosition) + scriptTag + content.slice(insertPosition);
            
            // Save the updated content
            fs.writeFileSync(filePath, content);
            console.log(`Added SweetAlert2 config to ${filePath}`);
        } else {
            console.error(`Could not find insertion point in ${filePath}`);
        }
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
    }
}

// Find all HTML files and add SweetAlert2 config
const htmlFiles = findHtmlFiles(htmlDirectory);
console.log(`Found ${htmlFiles.length} HTML files`);

htmlFiles.forEach(file => {
    addSweetAlertToHtml(file);
});

console.log('SweetAlert2 config added to all HTML files!'); 