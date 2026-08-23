import * as fs from 'fs';
import * as path from 'path';

export async function scrapeRecipe(url: string) {
    const dumpPath = path.join(import.meta.dirname, '../../dump.html')
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const html = await response.text();
        fs.writeFileSync(dumpPath, html)
        return dumpPath;
    } catch (err) {
        if (err instanceof Error) {
            throw new Error(err.message);
        } else {
            console.error("An unknown error occured:", err)
        }
    }
}