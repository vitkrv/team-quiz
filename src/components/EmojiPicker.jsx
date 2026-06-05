import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Smile, X } from 'lucide-react';

const EMOJI_OPTIONS = [
    { emoji: '\u{1F9E0}', name: 'Brain', keywords: ['mind', 'smart', 'knowledge', 'quiz'] },
    { emoji: '\u{1F600}', name: 'Grinning face', keywords: ['smile', 'happy', 'fun'] },
    { emoji: '\u{1F60D}', name: 'Heart eyes', keywords: ['love', 'favorite', 'like'] },
    { emoji: '\u{1F60E}', name: 'Cool face', keywords: ['cool', 'sunglasses', 'confident'] },
    { emoji: '\u{1F480}', name: 'Skull', keywords: ['dead', 'spooky', 'bones'] },
    { emoji: '\u{1F639}', name: 'Laughing cat', keywords: ['cat', 'laugh', 'funny'] },
    { emoji: '\u{1F63D}', name: 'Kissing cat', keywords: ['cat', 'kiss', 'cute'] },
    { emoji: '\u{1F63E}', name: 'Pouting cat', keywords: ['cat', 'angry', 'mad'] },
    { emoji: '\u{1F648}', name: 'See no evil', keywords: ['monkey', 'hide', 'shy'] },
    { emoji: '\u{1F649}', name: 'Hear no evil', keywords: ['monkey', 'listen', 'ignore'] },
    { emoji: '\u{1F64A}', name: 'Speak no evil', keywords: ['monkey', 'quiet', 'secret'] },
    { emoji: '\u{1F440}', name: 'Eyes', keywords: ['look', 'watch', 'see'] },
    { emoji: '\u{1F4A1}', name: 'Light bulb', keywords: ['idea', 'thinking', 'answer'] },
    { emoji: '\u{1F3C6}', name: 'Trophy', keywords: ['winner', 'prize', 'competition'] },
    { emoji: '\u{1F3AF}', name: 'Bullseye', keywords: ['target', 'challenge', 'score'] },
    { emoji: '\u{1F4DA}', name: 'Books', keywords: ['study', 'school', 'history'] },
    { emoji: '\u{1F52C}', name: 'Microscope', keywords: ['science', 'biology', 'lab'] },
    { emoji: '\u{1F30D}', name: 'Globe', keywords: ['world', 'geography', 'travel'] },
    { emoji: '\u{1F3AC}', name: 'Clapper board', keywords: ['movie', 'cinema', 'film'] },
    { emoji: '\u{1F3B5}', name: 'Music note', keywords: ['song', 'audio', 'sound'] },
    { emoji: '\u{1F3A8}', name: 'Palette', keywords: ['art', 'design', 'painting'] },
    { emoji: '\u{1F3AE}', name: 'Game controller', keywords: ['games', 'gaming', 'play'] },
    { emoji: '\u{26BD}', name: 'Soccer ball', keywords: ['football', 'sport', 'sports'] },
    { emoji: '\u{1F3C0}', name: 'Basketball', keywords: ['sport', 'sports', 'nba'] },
    { emoji: '\u{1F3C8}', name: 'Football', keywords: ['sport', 'sports', 'nfl'] },
    { emoji: '\u{1F680}', name: 'Rocket', keywords: ['space', 'fast', 'future'] },
    { emoji: '\u{2B50}', name: 'Star', keywords: ['favorite', 'best', 'classic'] },
    { emoji: '\u{1F525}', name: 'Fire', keywords: ['hot', 'hard', 'challenge'] },
    { emoji: '\u{2728}', name: 'Sparkles', keywords: ['magic', 'shine', 'special'] },
    { emoji: '\u{26A1}', name: 'Lightning', keywords: ['speed', 'energy', 'rush'] },
    { emoji: '\u{1F48E}', name: 'Gem', keywords: ['rare', 'premium', 'value'] },
    { emoji: '\u{1F3F0}', name: 'Castle', keywords: ['history', 'medieval', 'kingdom'] },
    { emoji: '\u{2694}\u{FE0F}', name: 'Crossed swords', keywords: ['battle', 'war', 'strategy'] },
    { emoji: '\u{1F9ED}', name: 'Compass', keywords: ['travel', 'geography', 'direction'] },
    { emoji: '\u{1F5FA}\u{FE0F}', name: 'Map', keywords: ['travel', 'geography', 'world'] },
    { emoji: '\u{1F4B0}', name: 'Money bag', keywords: ['money', 'business', 'finance'] },
    { emoji: '\u{1F4C8}', name: 'Chart', keywords: ['business', 'numbers', 'statistics'] },
    { emoji: '\u{2699}\u{FE0F}', name: 'Gear', keywords: ['technology', 'engineering', 'mechanics'] },
    { emoji: '\u{1F4BB}', name: 'Laptop', keywords: ['technology', 'coding', 'computer'] },
    { emoji: '\u{1F9EA}', name: 'Test tube', keywords: ['science', 'chemistry', 'experiment'] },
    { emoji: '\u{1F9EC}', name: 'DNA', keywords: ['science', 'biology', 'genetics'] },
    { emoji: '\u{1F370}', name: 'Cake', keywords: ['food', 'dessert', 'party'] },
    { emoji: '\u{1F355}', name: 'Pizza', keywords: ['food', 'party', 'snack'] },
    { emoji: '\u{1F37F}', name: 'Popcorn', keywords: ['movie', 'cinema', 'snack'] },
    { emoji: '\u{1F389}', name: 'Party popper', keywords: ['party', 'fun', 'celebration'] },
    { emoji: '\u{1F921}', name: 'Clown', keywords: ['funny', 'comedy', 'jokes'] },
    { emoji: '\u{1F575}\u{FE0F}', name: 'Detective', keywords: ['mystery', 'crime', 'clue'] }
];

const getOptionSearchText = (option) => (
    [option.emoji, option.name, ...option.keywords].join(' ').toLowerCase()
);

export default function EmojiPicker({
    value,
    onChange,
    onClear,
    disabled = false,
    label,
    searchPlaceholder,
    clearLabel,
    noResultsLabel,
    className = ''
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const pickerRef = useRef(null);
    const searchInputRef = useRef(null);
    const selectedOption = EMOJI_OPTIONS.find((option) => option.emoji === value);

    const filteredOptions = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        if (!normalizedSearch) return EMOJI_OPTIONS;

        return EMOJI_OPTIONS.filter((option) => getOptionSearchText(option).includes(normalizedSearch));
    }, [search]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!pickerRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            window.requestAnimationFrame(() => searchInputRef.current?.focus());
        } else {
            setSearch('');
        }
    }, [isOpen]);

    const handleSelect = (emoji) => {
        onChange(emoji);
        setIsOpen(false);
    };

    const handleClear = () => {
        onClear?.();
        setIsOpen(false);
    };

    return (
        <div ref={pickerRef} className={`relative ${className}`}>
            {label && <div className="mb-2 block text-sm font-medium text-slate-400">{label}</div>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    disabled={disabled}
                    className="inline-flex min-h-12 min-w-20 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-left font-bold text-white outline-none transition-colors hover:border-blue-500 hover:bg-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                >
                    <span className="text-2xl leading-none">{value || <Smile size={22} />}</span>
                    <span className="sr-only">{selectedOption?.name || label}</span>
                </button>
                {value && (
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={disabled}
                        className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 px-3 text-slate-300 transition-colors hover:border-red-400 hover:bg-red-600/20 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={clearLabel}
                        title={clearLabel}
                    >
                        <X size={18} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/40">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            ref={searchInputRef}
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </label>
                    <div className="mt-3 grid max-h-64 grid-cols-6 gap-2 overflow-y-auto pr-1">
                        {filteredOptions.map((option) => {
                            const isSelected = option.emoji === value;

                            return (
                                <button
                                    key={`${option.name}-${option.emoji}`}
                                    type="button"
                                    onClick={() => handleSelect(option.emoji)}
                                    className={`flex aspect-square items-center justify-center rounded-lg border text-2xl transition-colors ${isSelected ? 'border-blue-400 bg-blue-600/30' : 'border-slate-800 bg-slate-900 hover:border-slate-500 hover:bg-slate-800'}`}
                                    aria-label={option.name}
                                    title={option.name}
                                >
                                    {option.emoji}
                                </button>
                            );
                        })}
                    </div>
                    {filteredOptions.length === 0 && (
                        <div className="mt-3 rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-500">
                            {noResultsLabel}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
