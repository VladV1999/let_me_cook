import * as z from "zod";

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

const recipeInstructions = z.union([
    z.string(),
    z.array(z.union([howToStepSchema, howToSectionSchema]))
])

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

export type recipeSchemaType = z.infer<typeof recipeSchema>;