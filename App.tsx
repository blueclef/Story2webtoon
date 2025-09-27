/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { generateStoryboard, identifyCharacters, generateCharacterSheet, generateStyleGuide } from './services/geminiService';
import StoryboardPanel from './components/PolaroidCard'; // Re-purposed for StoryboardPanel
import Footer from './components/Footer';
import type { Panel, PanelUpdate } from './services/geminiService';

// FIX: Define a type for Character to avoid type inference issues with Object.values()
type Character = {
    name: string;
    image: string | null;
    isLoading: boolean;
    error?: string;
};

type StyleGuide = {
    image: string | null;
    isLoading: boolean;
    error?: string;
};


const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:bg-yellow-600";
const secondaryButtonClasses = "font-permanent-marker text-lg text-center text-black bg-yellow-400 py-2 px-6 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:bg-yellow-600";


const EXAMPLE_STORY = `Panel 1
A young man, ZANE, with spiky silver hair and a black trench coat, stands on a rainy rooftop overlooking a futuristic city. He looks determined.
ZANE (thought bubble): I have to find her. Before they do.

Panel 2
Close up on Zane's hand. He's holding a small, glowing data chip.

Panel 3
A woman, LILA, with long cyan hair and glowing cybernetic tattoos on her arm, is seen on a giant holographic billboard in the city below. She's smiling.
LILA (on ad): Nova-Cola! The taste of the future!

Panel 4
Zane puts the chip in his pocket and leaps off the building, his trench coat flaring out like wings.
ZANE: I'm coming, Lila.`;

const LOCAL_STORAGE_KEY = 'webtoon-ai-storyboarder-save';


function App() {
    const [story, setStory] = useState<string>(EXAMPLE_STORY);
    const [panels, setPanels] = useState<Panel[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [characters, setCharacters] = useState<Record<string, Character>>({});
    const [isIdentifying, setIsIdentifying] = useState<boolean>(false);
    const [styleGuide, setStyleGuide] = useState<StyleGuide>({ image: null, isLoading: false });

    // Auto-load from localStorage on initial render
    useEffect(() => {
        try {
            const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);
                // Ensure saved data is not null/undefined before setting state
                if (savedState.story) setStory(savedState.story);
                if (savedState.characters) setCharacters(savedState.characters);
                if (savedState.styleGuide) setStyleGuide(savedState.styleGuide);
            }
        } catch (err) {
            console.error("Failed to load state from localStorage:", err);
            // If loading fails, it's safer to clear the corrupted data
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    }, []); // Empty dependency array ensures this runs only once on mount

    // Auto-save to localStorage whenever story or assets change
    useEffect(() => {
        try {
            // Avoid saving the initial example state if no changes have been made
            if (story === EXAMPLE_STORY && Object.keys(characters).length === 0 && !styleGuide.image) {
                return;
            }
            const stateToSave = {
                story,
                characters,
                styleGuide,
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (err) {
            console.error("Failed to save state to localStorage:", err);
        }
    }, [story, characters, styleGuide]); // This effect runs whenever these dependencies change


    const handleIdentifyCharacters = async () => {
        setIsIdentifying(true);
        setError(null);
        try {
            const charNames = await identifyCharacters(story);
            const newCharacters: Record<string, Character> = {};
            charNames.forEach(name => {
                newCharacters[name] = { name, image: null, isLoading: false };
            });
            setCharacters(newCharacters);
        } catch (err) {
            console.error("Failed to identify characters:", err);
            setError(err instanceof Error ? err.message : "Could not identify characters from the script.");
        } finally {
            setIsIdentifying(false);
        }
    };

    const handleGenerateCharacterSheet = async (charName: string) => {
        setCharacters(prev => ({ ...prev, [charName]: { ...prev[charName], isLoading: true, error: undefined } }));
        try {
            const imageUrl = await generateCharacterSheet(charName, story);
            setCharacters(prev => ({ ...prev, [charName]: { ...prev[charName], image: imageUrl, isLoading: false } }));
        } catch (err) {
            console.error(`Failed to generate character ${charName}:`, err);
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setCharacters(prev => ({ ...prev, [charName]: { ...prev[charName], isLoading: false, error: errorMessage } }));
        }
    };

    const handleUploadCharacterImage = (e: React.ChangeEvent<HTMLInputElement>, charName: string) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                const result = loadEvent.target?.result as string;
                setCharacters(prev => ({ ...prev, [charName]: { ...prev[charName], image: result, error: undefined } }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateStyleGuide = async () => {
        setStyleGuide({ image: null, isLoading: true, error: undefined });
        try {
            const imageUrl = await generateStyleGuide(story);
            setStyleGuide({ image: imageUrl, isLoading: false });
        } catch (err) {
            console.error("Failed to generate style guide:", err);
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setStyleGuide({ image: null, isLoading: false, error: errorMessage });
        }
    };


    const handleGenerateClick = async () => {
        if (!story.trim()) {
            setError("Please write a story first.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setPanels([]);

        const characterMap: Record<string, string> = {};
        Object.values(characters).forEach((char: Character) => {
            if (char.image) {
                characterMap[char.name] = char.image;
            }
        });

        try {
            await generateStoryboard(story, (update: PanelUpdate) => {
                if (update.type === 'plan') {
                    setPanels(update.panels);
                } else if (update.type === 'progress') {
                    setPanels(prevPanels =>
                        prevPanels.map((panel, index) =>
                            index === update.index ? { ...panel, ...update.panelUpdate } : panel
                        )
                    );
                }
            }, characterMap, styleGuide.image ?? undefined);
        } catch (err) {
            console.error("Storyboard generation failed:", err);
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setError(`Failed to generate storyboard. ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setStory(EXAMPLE_STORY);
        setPanels([]);
        setError(null);
        setIsLoading(false);
        setCharacters({});
        setIsIdentifying(false);
        setStyleGuide({ image: null, isLoading: false, error: undefined });
        // Also clear the saved state from localStorage
        try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (err) {
            console.error("Failed to clear state from localStorage:", err);
        }
    };

    return (
        <main className="bg-neutral-900 text-neutral-200 min-h-screen w-full flex flex-col items-center p-4 pb-24 relative">
            <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05]"></div>

            <div className="z-10 flex flex-col items-center w-full max-w-7xl mx-auto h-full flex-1">
                <div className="text-center my-8">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">Webtoon-AI Storyboarder</h1>
                    <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">Turn your story into a visual storyboard.</p>
                </div>

                <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                    {/* Input Column */}
                    <div className="flex flex-col space-y-8">
                        {/* Step 1: Story */}
                        <div>
                            <h2 className="text-2xl font-permanent-marker text-yellow-400 mb-4">1. Write Your Story</h2>
                            <textarea
                                value={story}
                                onChange={(e) => setStory(e.target.value)}
                                placeholder="Describe your scenes, characters, and dialogue here..."
                                className="w-full h-full min-h-[300px] lg:min-h-0 bg-black/30 border-2 border-neutral-700 rounded-md p-4 text-neutral-200 text-lg leading-relaxed focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-colors duration-200"
                                aria-label="Story input"
                            />
                        </div>

                        {/* Step 2: Define Visuals */}
                        <div>
                            <h2 className="text-2xl font-permanent-marker text-yellow-400 mb-4">2. Define Visuals (Optional)</h2>
                             <p className="text-neutral-400 text-sm mb-4">For best consistency, lock in your character designs and overall art style before generating the storyboard.</p>
                            <div className="bg-black/20 border border-neutral-700 rounded-lg p-6 space-y-6">
                                {/* Character Section */}
                                <div>
                                    <h3 className="text-xl font-permanent-marker text-neutral-200 mb-3">Character Sheets</h3>
                                    <p className="text-neutral-400 text-xs mb-4">Generate a reference sheet with multiple expressions for each character to ensure emotional and visual consistency.</p>

                                    <div className="flex justify-start">
                                        <button onClick={handleIdentifyCharacters} disabled={isIdentifying || !story.trim()} className={secondaryButtonClasses}>
                                            {isIdentifying ? 'Scanning...' : 'Scan for Characters'}
                                        </button>
                                    </div>
                                    {Object.keys(characters).length > 0 && (
                                        <div className="w-full mt-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {Object.values(characters).map((char: Character) => (
                                                    <div key={char.name} className="bg-neutral-800 rounded-md p-3 flex flex-col items-center gap-2 text-center">
                                                        <div className="w-full aspect-video rounded-sm bg-neutral-900 border-2 border-neutral-600 flex items-center justify-center overflow-hidden relative group">
                                                            {char.isLoading ? (
                                                                <svg className="animate-spin h-8 w-8 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                            ) : char.image ? (
                                                                <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                                                            ) : char.error ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                            )}
                                                            {!char.isLoading && char.image && (
                                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                                                    <a
                                                                        href={char.image}
                                                                        download={`${char.name}-character-sheet.jpeg`}
                                                                        className="text-white bg-blue-600/80 rounded-full h-10 w-10 flex items-center justify-center hover:bg-blue-500 transition-colors"
                                                                        aria-label={`Download ${char.name} character sheet`}
                                                                        title={`Download ${char.name} character sheet`}
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                                        </svg>
                                                                    </a>
                                                                    <button
                                                                        onClick={() => setCharacters(prev => ({ ...prev, [char.name]: { ...prev[char.name], image: null } }))}
                                                                        className="text-white bg-red-600/80 rounded-full h-10 w-10 flex items-center justify-center hover:bg-red-500 transition-colors"
                                                                        aria-label="Remove image"
                                                                        title="Remove image"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p className="font-bold text-lg font-permanent-marker text-neutral-200">{char.name}</p>
                                                        {char.error && <p className="text-xs text-red-400 max-w-full truncate" title={char.error}>Generation Failed</p>}
                                                        <div className="flex gap-2 text-xs">
                                                            <button onClick={() => handleGenerateCharacterSheet(char.name)} disabled={char.isLoading} className="bg-yellow-500 text-black px-2 py-1 rounded-sm text-xs font-bold hover:bg-yellow-400 disabled:bg-neutral-600">Gen. Sheet</button>
                                                            <label className="bg-neutral-600 text-white px-2 py-1 rounded-sm text-xs font-bold hover:bg-neutral-500 cursor-pointer">
                                                                Upload
                                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadCharacterImage(e, char.name)} />
                                                            </label>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <hr className="border-neutral-700" />
                                {/* Style Guide Section */}
                                <div>
                                    <h3 className="text-xl font-permanent-marker text-neutral-200 mb-3">Art Style & World</h3>
                                    <div className="flex justify-start">
                                        <button onClick={handleGenerateStyleGuide} disabled={styleGuide.isLoading || !story.trim()} className={secondaryButtonClasses}>
                                            {styleGuide.isLoading ? 'Generating...' : 'Generate Style Guide'}
                                        </button>
                                    </div>
                                    {(styleGuide.isLoading || styleGuide.image || styleGuide.error) && (
                                        <div className="w-full mt-6">
                                            <div className="bg-neutral-800 rounded-md p-3 flex flex-col items-center gap-2 text-center">
                                                <div className="w-full aspect-video rounded-sm bg-neutral-900 border-2 border-neutral-600 flex items-center justify-center overflow-hidden relative group">
                                                    {styleGuide.isLoading ? (
                                                        <svg className="animate-spin h-8 w-8 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    ) : styleGuide.image ? (
                                                        <img src={styleGuide.image} alt="Style Guide" className="w-full h-full object-cover" />
                                                    ) : styleGuide.error ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    ) : null}
                                                    {!styleGuide.isLoading && styleGuide.image && (
                                                         <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                                            <a
                                                                href={styleGuide.image}
                                                                download="style-guide.jpeg"
                                                                className="text-white bg-blue-600/80 rounded-full h-10 w-10 flex items-center justify-center hover:bg-blue-500 transition-colors"
                                                                aria-label="Download style guide"
                                                                title="Download style guide"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                                </svg>
                                                            </a>
                                                            <button
                                                                onClick={() => setStyleGuide({ image: null, isLoading: false, error: undefined })}
                                                                className="text-white bg-red-600/80 rounded-full h-10 w-10 flex items-center justify-center hover:bg-red-500 transition-colors"
                                                                aria-label="Remove image"
                                                                title="Remove image"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="font-bold text-lg font-permanent-marker text-neutral-200">Style Guide</p>
                                                {styleGuide.error && <p className="text-xs text-red-400 max-w-full truncate" title={styleGuide.error}>Generation Failed</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>


                        {/* Step 3: Generate */}
                        <div>
                             <h2 className="text-2xl font-permanent-marker text-yellow-400 mb-4">3. Create Storyboard</h2>
                            <div className="flex items-center justify-start gap-4">
                                <button onClick={handleGenerateClick} disabled={isLoading} className={primaryButtonClasses}>
                                    {isLoading ? 'Generating...' : 'Generate Storyboard'}
                                </button>
                                {panels.length > 0 && (
                                    <button onClick={handleReset} className="font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black">
                                        Start Over
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Output Column */}
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-permanent-marker text-yellow-400 mb-4">Your Storyboard</h2>
                        <div className="w-full h-full bg-black/30 border-2 border-neutral-700 rounded-md p-4 overflow-y-auto min-h-[60vh] lg:min-h-0">
                            {error && (
                                <div className="h-full flex flex-col items-center justify-center text-center text-red-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="font-bold text-lg">An Error Occurred</p>
                                    <p className="text-sm max-w-sm">{error}</p>
                                </div>
                            )}
                            {!error && panels.length === 0 && !isLoading && (
                                <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                    <p className="font-permanent-marker text-xl">Your storyboard will appear here</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {panels.map((panel, index) => (
                                    <StoryboardPanel
                                        key={index}
                                        panelNumber={index + 1}
                                        status={panel.status}
                                        imageUrl={panel.imageUrl}
                                        dialogue={panel.dialogue}
                                        character={panel.character}
                                        isThoughtBubble={panel.isThoughtBubble}
                                        error={panel.error}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </main>
    );
}

export default App;