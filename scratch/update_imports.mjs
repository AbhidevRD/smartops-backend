import fs from 'fs';
import path from 'path';

const baseDir = 'c:/projects/frontend-smartops-main/src/app';

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes("import { AppLayout } from '@/components/AppLayout'")) {
                console.log(`Updating ${fullPath}`);
                content = content.replace(
                    /import\s*{\s*AppLayout\s*}\s*from\s*['"]@\/components\/AppLayout['"]/g,
                    "import AppLayout from '@/components/AppLayout'"
                );
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

walk(baseDir);
console.log('Done!');
