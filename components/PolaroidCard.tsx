/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

type PanelStatus = 'pending' | 'generating' | 'done' | 'error';

interface StoryboardPanelProps {
    imageUrl?: string;
    dialogue?: string;
    character?: string;
    isThoughtBubble?: boolean;
    panelNumber: number;
    status: PanelStatus;
    error?: string;
}

const LoadingSpinner = () => (
    <div className="flex items-center justify-center h-full">
        <svg className="animate-spin h-8 w-8 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const ErrorDisplay = ({ message }: { message?: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-center p-2">
         <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-red-400 text-xs font-semibold">Image Failed</p>
        {message && <p className="text-red-500 text-xs mt-1">{message}</p>}
    </div>
);

const StoryboardPanel: React.FC<StoryboardPanelProps> = ({ imageUrl, dialogue, panelNumber, status, error, character, isThoughtBubble }) => {
    const hasDialogue = dialogue && dialogue.trim().length > 0;

    return (
        <div className="bg-neutral-800 border-2 border-neutral-700/80 rounded-sm aspect-[3/4] w-full flex flex-col relative overflow-hidden shadow-md">
            <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center z-20">
                {panelNumber}
            </div>
            <div className="flex-grow flex items-center justify-center bg-neutral-900/50 relative group">
                {status === 'generating' && <LoadingSpinner />}
                {status === 'error' && <ErrorDisplay message={error} />}
                {status === 'done' && imageUrl && (
                     <a href={imageUrl} download={`panel-${panelNumber}.jpeg`} aria-label={`Download panel ${panelNumber}`} className="w-full h-full block">
                        <img src={imageUrl} alt={`Panel ${panelNumber}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </div>
                    </a>
                )}
                {(status === 'pending' || !imageUrl && status!=='error' && status!=='generating') && (
                    <div className="text-neutral-600 text-xs font-mono">Panel {panelNumber}</div>
                )}
            </div>
            {hasDialogue && status === 'done' && (
                <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center px-2 pb-2 pointer-events-none">
                    <div className={`relative bg-white/90 backdrop-blur-sm text-black font-bangers text-xs leading-snug tracking-wide py-1.5 px-3 shadow-lg text-center max-w-[95%] ${isThoughtBubble ? 'rounded-2xl' : 'rounded-lg'}`}>
                        {character && <p className="font-bold">{character.toUpperCase()}</p>}
                        <p>{dialogue}</p>
                        
                        {!isThoughtBubble ? (
                            // Standard speech bubble tail pointing UP
                            <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-0 h-0 
                                border-l-[6px] border-l-transparent
                                border-r-[6px] border-r-transparent
                                border-b-[8px] border-b-[rgba(255,255,255,0.9)]">
                            </div>
                        ) : (
                            // Thought bubble "tail" - a trail of circles going UP
                            <>
                                <div className="absolute left-1/2 -translate-x-4 -top-3 w-2.5 h-2.5 bg-white/90 rounded-full"></div>
                                <div className="absolute left-1/2 -translate-x-8 -top-4 w-2 h-2 bg-white/90 rounded-full"></div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StoryboardPanel;