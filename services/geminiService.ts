/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- Type Definitions ---
export interface Panel {
    description: string;
    character?: string;
    dialogue: string;
    isThoughtBubble?: boolean;
    status: 'pending' | 'generating' | 'done' | 'error';
    imageUrl?: string;
    error?: string;
}

export type PanelUpdate = {
    type: 'plan';
    panels: Panel[];
} | {
    type: 'progress';
    index: number;
    panelUpdate: Partial<Panel>;
};

type ProgressCallback = (update: PanelUpdate) => void;

// --- Helper Functions & Schemas ---

const panelSchema = {
    type: Type.OBJECT,
    properties: {
        panels: {
            type: Type.ARRAY,
            description: "An array of webtoon panels.",
            items: {
                type: Type.OBJECT,
                properties: {
                    visual_description: {
                        type: Type.STRING,
                        description: "A detailed visual description for an AI image generator. Describe characters (appearance, expression, pose), background, and camera angle. Maintain character consistency throughout.",
                    },
                    character: {
                        type: Type.STRING,
                        description: "The name of the character speaking or thinking. If no specific character (e.g., narration), leave empty.",
                    },
                    dialogue: {
                        type: Type.STRING,
                        description: "The dialogue text, without the character's name. If no dialogue, return an empty string.",
                    },
                    is_thought_bubble: {
                        type: Type.BOOLEAN,
                        description: "True if the dialogue is an internal thought, false if it's spoken aloud.",
                    }
                },
                required: ['visual_description', 'character', 'dialogue', 'is_thought_bubble'],
            },
        },
    },
    required: ['panels'],
};

const charactersSchema = {
    type: Type.OBJECT,
    properties: {
        characters: {
            type: Type.ARRAY,
            description: "A list of unique character names found in the script.",
            items: { type: Type.STRING },
        },
    },
    required: ['characters'],
};

// Helper to load an image from a data URL
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${src.substring(0, 50)}...`));
        img.src = src;
    });
}


/**
 * Creates a single composite reference image from multiple source images.
 * @param imageUrls Array of base64 data URLs for the images.
 * @returns A promise that resolves to a single base64 data URL (JPEG).
 */
async function createReferenceSheet(imageUrls: string[]): Promise<string> {
    if (imageUrls.length === 0) {
        throw new Error("No images provided to create a reference sheet.");
    }
    // No need to composite if there's only one image
    if (imageUrls.length === 1) {
        return imageUrls[0];
    }

    const loadedImages = await Promise.all(imageUrls.map(loadImage));

    const canvas = document.createElement('canvas');
    // Arrange images horizontally. Use a fixed height for consistency.
    const targetHeight = 512;
    let totalWidth = 0;
    const scaledImages = loadedImages.map(img => {
        const scale = targetHeight / img.height;
        const width = img.width * scale;
        totalWidth += width;
        return { img, width, height: targetHeight };
    });

    canvas.width = totalWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get 2D canvas context');
    }

    ctx.fillStyle = 'white'; // Fill background in case of transparent images
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let currentX = 0;
    for (const { img, width, height } of scaledImages) {
        ctx.drawImage(img, currentX, 0, width, height);
        currentX += width;
    }

    return canvas.toDataURL('image/jpeg', 0.9);
}


/**
 * Identifies unique character names from a story script.
 */
export async function identifyCharacters(story: string): Promise<string[]> {
    const prompt = `Analyze the following story script and identify all unique character names. Exclude any generic roles like "Narrator" or "Crowd". Return the names as a JSON array of strings.

SCRIPT:
---
${story}
---`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: charactersSchema,
            },
        });
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (!parsed.characters || !Array.isArray(parsed.characters)) {
            return [];
        }
        // Return unique characters
        return [...new Set<string>(parsed.characters)];
    } catch (error) {
        console.error("Error identifying characters:", error);
        return [];
    }
}

/**
 * Generates a character sheet with multiple expressions based on their description in the story.
 */
export async function generateCharacterSheet(characterName: string, story: string): Promise<string> {
    const prompt = `Create a character reference sheet for a webtoon character named "${characterName}", based on their description in the following story.
The sheet must be a single image containing the character in several different poses and with various key facial expressions (e.g., neutral, happy, angry, surprised).
The character's design, clothing, and colors should be consistent across all depictions.
Use a simple, neutral background.
The art style must be a modern webtoon style with vibrant colors and clean lines.

STORY:
---
${story}
---`;
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9', // Wide format is good for a reference sheet
            },
        });
        const base64ImageBytes = response.generatedImages[0]?.image.imageBytes;
        if (!base64ImageBytes) {
            throw new Error("The AI model did not return an image for the character sheet.");
        }
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error(`Error generating sheet for ${characterName}:`, error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Character sheet generation failed. Details: ${errorMessage}`);
    }
}


/**
 * Generates a style guide image from the story to ensure consistency.
 */
export async function generateStyleGuide(story: string): Promise<string> {
    const prompt = `Create a "Style Guide" or "Concept Sheet" for a webtoon based on the following story.
The image should be a single, cohesive piece of concept art that visually defines the world, art style, and key elements.
The art style must be a modern webtoon style with vibrant colors and clean lines.
The image should incorporate the overall mood, setting, and key character visual traits described in the story.
This image will serve as a visual reference for all subsequent panels.

STORY:
---
${story}
---`;

    try {
        const imageResponse = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9', // A wide aspect ratio is good for a style sheet
            },
        });

        const base64ImageBytes = imageResponse.generatedImages[0]?.image.imageBytes;
        if (!base64ImageBytes) {
            throw new Error("The AI model did not return an image for the style guide.");
        }
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error("Error generating style guide:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Style guide generation failed. Details: ${errorMessage}`);
    }
}


/**
 * Segments a story into structured panel data using a text model.
 */
async function segmentStoryIntoPanels(story: string): Promise<{ description: string; character?: string; dialogue: string; isThoughtBubble?: boolean }[]> {
    const prompt = `You are a storyboard assistant for webtoon creators. Your task is to read a story script and break it down into a sequence of distinct visual panels.
For each panel, provide a detailed visual description, the character speaking, their dialogue (without the character name), and whether it's a thought bubble.

Here are the rules you must follow:
1.  **Logical Environments:** Interpret the environment logically. For example, if a character is described as 'sitting on a bus seat', the visual description must include 'the view out the window next to them'.
2.  **Continuity:** When a panel is a direct continuation of the previous one (like a close-up), explicitly state this in the description to maintain camera and character position continuity. For example: "A close-up of the previous shot...".
3.  **Character Consistency:** Ensure character descriptions are consistent across all panels.

Now, analyze the following script and provide the output in the required JSON format.

SCRIPT:
---
${story}
---
`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: panelSchema,
            },
        });

        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);

        if (!parsed.panels || !Array.isArray(parsed.panels)) {
            throw new Error("AI response is missing the 'panels' array.");
        }

        return parsed.panels.map((p: any) => ({
            description: p.visual_description,
            character: p.character,
            dialogue: p.dialogue,
            isThoughtBubble: p.is_thought_bubble,
        }));

    } catch (error) {
        console.error("Error segmenting story:", error);
        throw new Error("The AI failed to understand the story structure. Please try rewriting it or be more specific.");
    }
}

/**
 * Generates the initial image for the first panel without a reference.
 */
async function generateInitialImageForPanel(description: string): Promise<string> {
    const fullPrompt = `${description}, in a modern webtoon art style, vibrant colors, clean lines, digital art. Leave empty space at the bottom of the image for a dialogue speech bubble.`;

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: fullPrompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '3:4', // Common for webtoon panels
            },
        });

        const base64ImageBytes = response.generatedImages[0]?.image.imageBytes;
        if (!base64ImageBytes) {
            throw new Error("The AI model did not return an image. It might be due to a safety policy violation.");
        }
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error("Error generating initial image:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Initial image generation failed. Details: ${errorMessage}`);
    }
}


/**
 * Generates an image for a panel using a single composite reference image for consistency.
 */
async function generateConsistentImageForPanel(description: string, referenceImageUrl: string): Promise<string> {
    const fullPrompt = `You are an expert webtoon artist. Use the provided reference image as a strict style guide for character design, art style, and color palette.
Create a new panel based on this description: "${description}".
The final image must match the style of the reference. Leave some empty space at the bottom for a speech bubble.`;

    const parts: any[] = [];
    
    const [header, base64Data] = referenceImageUrl.split(',');
    if (!base64Data) {
        throw new Error("Invalid reference image data URL format.");
    }
    const mimeTypeMatch = header.match(/:(.*?);/);
    if (!mimeTypeMatch || !mimeTypeMatch[1]) {
        throw new Error("Reference image has an unknown MIME type.");
    }
    const mimeType = mimeTypeMatch[1];

    // Add the reference image first
    parts.push({
        inlineData: { data: base64Data, mimeType: mimeType },
    });
    // Add the text prompt second
    parts.push({ text: fullPrompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        const imagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
        if (!imagePart || !imagePart.inlineData) {
            throw new Error("The AI model did not return an image. This might be due to a safety policy violation or an inability to fulfill the request based on the provided references.");
        }

        const base64ImageBytes = imagePart.inlineData.data;
        const outputMimeType = imagePart.inlineData.mimeType;

        return `data:${outputMimeType};base64,${base64ImageBytes}`;

    } catch (error) {
        console.error("Error generating consistent image:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Consistent image generation failed. Details: ${errorMessage}`);
    }
}


/**
 * Main service function to generate a full storyboard from a story.
 * It plans the panels, then generates images sequentially for consistency, reporting progress via a callback.
 * @param story The user's input story.
 * @param onProgress A callback function to send live updates to the UI.
 * @param characterMap A map of character names to their base64 encoded reference images.
 * @param styleGuideImageUrl An optional base64 encoded image for overall style consistency.
 */
export async function generateStoryboard(story: string, onProgress: ProgressCallback, characterMap: Record<string, string> = {}, styleGuideImageUrl?: string): Promise<void> {

    // 1. Get the storyboard plan (descriptions and dialogues)
    const panelPlans = await segmentStoryIntoPanels(story);

    if (panelPlans.length === 0) {
        throw new Error("No panels could be generated from the story. Please provide more detail.");
    }

    // 2. Send the initial plan to the UI
    const initialPanels: Panel[] = panelPlans.map(plan => ({
        ...plan,
        status: 'pending',
    }));
    onProgress({ type: 'plan', panels: initialPanels });

    // 3. Generate images for each panel sequentially for consistency
    let lastSuccessfulImageUrl: string | null = null;

    for (const [index, plan] of panelPlans.entries()) {
        try {
            // Update UI to show this panel is generating
            onProgress({ type: 'progress', index, panelUpdate: { status: 'generating' } });

            const references: string[] = [];
            
            // The order here matters for the layout of the reference sheet.
            // Style guide -> character -> previous panel.
            if (styleGuideImageUrl) {
                references.push(styleGuideImageUrl);
            }
            
            const characterName = plan.character;
            const characterReferenceImage = (characterName && characterMap[characterName]) ? characterMap[characterName] : null;
            if (characterReferenceImage) {
                references.push(characterReferenceImage);
            }

            if (lastSuccessfulImageUrl) {
                 references.push(lastSuccessfulImageUrl);
            }

            let imageUrl: string;
            if (references.length > 0) {
                const referenceSheetUrl = await createReferenceSheet(references);
                imageUrl = await generateConsistentImageForPanel(plan.description, referenceSheetUrl);
            } else {
                // Fallback for the very first panel if no references are provided at all
                imageUrl = await generateInitialImageForPanel(plan.description);
            }

            lastSuccessfulImageUrl = imageUrl; // Update reference for the next iteration

            // Update UI with the generated image
            onProgress({ type: 'progress', index, panelUpdate: { status: 'done', imageUrl } });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error.";
            // Update UI with the error for this panel
            onProgress({ type: 'progress', index, panelUpdate: { status: 'error', error: errorMessage } });
            // We continue to the next panel, which will re-use the last *successful* image as reference.
        }
    }
}
