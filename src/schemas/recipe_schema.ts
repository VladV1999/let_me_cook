import * as z from "zod";

const STATIONS = ["Stove", 
    "Oven", 
    "Microwave", 
    "Prep",] as const;

const howToStepSchema = z.object({
    "@type": z.literal("HowToStep"),
    text: z.string(),
    name: z.string().optional(),
    url: z.string().optional(),
})

const howToSectionSchema = z.object({
    "@type": z.literal("HowToSection"),
    name: z.string(),
    itemListElement: z.array(howToStepSchema),
})

export const recipeInstructions = z.array(z.union([howToStepSchema, howToSectionSchema]))

export const recipeSchema = z.object({
    name: z.string(),
    cookTime: z.string().optional(),
    cookingMethod: z.string().optional(),
    recipeIngredient: z.union([z.string(), z.array(z.string())]),
    recipeInstructions: recipeInstructions,
    recipeYield: z.union([z.string(), z.number(), z.array(z.string())]),
    performTime: z.string().optional(),
    prepTime: z.string().optional(),
    step: z.union([z.string(), z.array(z.string()), howToStepSchema]).optional(),
    totalTime: z.string().optional(),
})

export const stepSchema = z.object({
    id: z.number(),
    text: z.string(),
    dependsOn: z.array(z.number()),
    station: z.enum(STATIONS).optional(),
    duration: z.string().optional().nullable(),
})

export const normalizedRecipeSchema = z.object({
    id: z.string(),
    steps: z.array(stepSchema),
    totalDurationMinutes: z.string().optional(),
    yield: z.union([z.number(), z.array(z.string()), z.string()]),
})

export type recipeSchemaType = z.infer<typeof recipeSchema>;
export type stepsSchemaType = z.infer<typeof stepSchema>;
export type normalizedRecipeSchemaType = z.infer<typeof normalizedRecipeSchema>;