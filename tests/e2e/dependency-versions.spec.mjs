import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Dependency Degeneration Checks', () => {
  test('All CDN scripts should be pinned to a specific version', async () => {
    // Read the index.html file
    const indexPath = path.join(process.cwd(), 'index.html');
    const htmlContent = fs.readFileSync(indexPath, 'utf-8');
    
    // Find all <script src="..."> and <link href="..."> tags
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/g;
    
    const urls = [];
    let match;
    while ((match = scriptRegex.exec(htmlContent)) !== null) {
      urls.push(match[1]);
    }
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      urls.push(match[1]);
    }
    
    const unpinnedUrls = [];
    for (const url of urls) {
      if (url.includes('unpkg.com') || url.includes('jsdelivr.net') || url.includes('cdnjs.cloudflare.com')) {
        // Tailwind Play CDN unpinned
        if (url === 'https://cdn.tailwindcss.com' || url === 'https://cdn.tailwindcss.com/') {
            unpinnedUrls.push(url);
            continue;
        }

        // Check if there is an @ followed by digits, or a version folder like /1.2.3/
        const hasAtVersion = /@[0-9]+\.[0-9]+/.test(url);
        const hasFolderVersion = /\/[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?\//.test(url);
        const hasTailwindVersion = /tailwindcss\.com\/[0-9]+\.[0-9]+/.test(url);
        
        if (!hasAtVersion && !hasFolderVersion && !hasTailwindVersion) {
            // Some specific files like font-awesome might use different patterns
            if (!url.includes('/6.4.0/')) {
                unpinnedUrls.push(url);
            }
        }
      }
    }
    
    expect(unpinnedUrls, 'Found unpinned CDN dependencies which could lead to degeneration').toEqual([]);
  });
});
