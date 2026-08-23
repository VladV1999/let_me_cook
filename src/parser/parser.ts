import * as cheerio from "cheerio";
import type { Element } from 'domhandler';
import * as fs from "fs";
export async function assignCheerio(docPath: string) {
    const html = fs.readFileSync(docPath, 'utf-8')
    const $ = cheerio.load(html);
    return $;
}

export async function retrieveGraphTag(doc: cheerio.CheerioAPI) {
    const plainData = doc('script[type="application/ld+json"]');
    const rawStrings = plainData.map((i: number, el: Element) => {
        return doc(el).html();
    }).get();
    const arr: any[] = rawStrings.map(str => JSON.parse(str!));
    const graphContainer = arr.find((obj: any) => Array.isArray(obj["@graph"]));
    if (graphContainer === undefined) {
        throw new Error("There is no script tag with a graph list inside")
    };
    const recipe = graphContainer["@graph"].find((node: any) =>
    Array.isArray(node["@type"]) ? node["@type"].includes("Recipe") : node["@type"] === "Recipe")
    return recipe;
}