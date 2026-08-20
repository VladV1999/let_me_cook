import * as fs from 'fs';

export async function scrapeRecipe(url: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const html = await response.text();
        fs.writeFileSync("../../dump.html", html)
    } catch (err) {
        if (err instanceof Error) {
            console.error(err.message);
        } else {
            console.error("An unknown error occured:", err)
        }
    }
}

await scrapeRecipe("https://www.recipetineats.com/chicken-broccoli-stir-fry/")