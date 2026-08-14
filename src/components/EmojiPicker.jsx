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
    { emoji: '\u{1F347}', name: 'Grapes', keywords: ['food', 'fruit', 'grape'] },
    { emoji: '\u{1F348}', name: 'Melon', keywords: ['food', 'fruit', 'cantaloupe'] },
    { emoji: '\u{1F349}', name: 'Watermelon', keywords: ['food', 'fruit'] },
    { emoji: '\u{1F34A}', name: 'Tangerine', keywords: ['food', 'fruit', 'orange', 'citrus'] },
    { emoji: '\u{1F34B}', name: 'Lemon', keywords: ['food', 'fruit', 'citrus', 'sour'] },
    { emoji: '\u{1F34B}\u{200D}\u{1F7E9}', name: 'Lime', keywords: ['food', 'fruit', 'citrus'] },
    { emoji: '\u{1F34C}', name: 'Banana', keywords: ['food', 'fruit'] },
    { emoji: '\u{1F34D}', name: 'Pineapple', keywords: ['food', 'fruit', 'tropical'] },
    { emoji: '\u{1F96D}', name: 'Mango', keywords: ['food', 'fruit', 'tropical'] },
    { emoji: '\u{1F34E}', name: 'Red apple', keywords: ['food', 'fruit', 'apple'] },
    { emoji: '\u{1F34F}', name: 'Green apple', keywords: ['food', 'fruit', 'apple'] },
    { emoji: '\u{1F350}', name: 'Pear', keywords: ['food', 'fruit'] },
    { emoji: '\u{1F351}', name: 'Peach', keywords: ['food', 'fruit'] },
    { emoji: '\u{1F352}', name: 'Cherries', keywords: ['food', 'fruit', 'berry'] },
    { emoji: '\u{1F353}', name: 'Strawberry', keywords: ['food', 'fruit', 'berry'] },
    { emoji: '\u{1FAD0}', name: 'Blueberries', keywords: ['food', 'fruit', 'berry'] },
    { emoji: '\u{1F95D}', name: 'Kiwi fruit', keywords: ['food', 'fruit', 'kiwi'] },
    { emoji: '\u{1F345}', name: 'Tomato', keywords: ['food', 'fruit', 'vegetable'] },
    { emoji: '\u{1FAD2}', name: 'Olive', keywords: ['food', 'fruit'] },
    { emoji: '\u{1F965}', name: 'Coconut', keywords: ['food', 'fruit', 'tropical'] },
    { emoji: '\u{1F951}', name: 'Avocado', keywords: ['food', 'fruit', 'vegetable'] },
    { emoji: '\u{1F346}', name: 'Eggplant', keywords: ['food', 'vegetable', 'aubergine'] },
    { emoji: '\u{1F954}', name: 'Potato', keywords: ['food', 'vegetable'] },
    { emoji: '\u{1F955}', name: 'Carrot', keywords: ['food', 'vegetable'] },
    { emoji: '\u{1F33D}', name: 'Ear of corn', keywords: ['food', 'vegetable', 'maize'] },
    { emoji: '\u{1F336}', name: 'Hot pepper', keywords: ['food', 'vegetable', 'chili', 'spicy'] },
    { emoji: '\u{1FAD1}', name: 'Bell pepper', keywords: ['food', 'vegetable', 'capsicum'] },
    { emoji: '\u{1F952}', name: 'Cucumber', keywords: ['food', 'vegetable', 'pickle'] },
    { emoji: '\u{1F96C}', name: 'Leafy green', keywords: ['food', 'vegetable', 'lettuce', 'kale', 'salad'] },
    { emoji: '\u{1F966}', name: 'Broccoli', keywords: ['food', 'vegetable'] },
    { emoji: '\u{1F9C4}', name: 'Garlic', keywords: ['food', 'vegetable', 'flavoring'] },
    { emoji: '\u{1F9C5}', name: 'Onion', keywords: ['food', 'vegetable', 'flavoring'] },
    { emoji: '\u{1F95C}', name: 'Peanuts', keywords: ['food', 'vegetable', 'nut', 'peanut'] },
    { emoji: '\u{1FAD8}', name: 'Beans', keywords: ['food', 'vegetable', 'legume'] },
    { emoji: '\u{1F330}', name: 'Chestnut', keywords: ['food', 'vegetable', 'nut'] },
    { emoji: '\u{1FADA}', name: 'Ginger root', keywords: ['food', 'vegetable', 'root', 'spice'] },
    { emoji: '\u{1FADB}', name: 'Pea pod', keywords: ['food', 'vegetable', 'pea', 'legume'] },
    { emoji: '\u{1F344}\u{200D}\u{1F7EB}', name: 'Brown mushroom', keywords: ['food', 'vegetable', 'mushroom', 'fungus'] },
    { emoji: '\u{1FADC}', name: 'Root vegetable', keywords: ['food', 'vegetable', 'root', 'beet', 'radish', 'turnip'] },
    { emoji: '\u{1F370}', name: 'Cake', keywords: ['food', 'dessert', 'party'] },
    { emoji: '\u{1F355}', name: 'Pizza', keywords: ['food', 'party', 'snack'] },
    { emoji: '\u{1F37F}', name: 'Popcorn', keywords: ['movie', 'cinema', 'snack'] },
    { emoji: '\u{1F389}', name: 'Party popper', keywords: ['party', 'fun', 'celebration'] },
    { emoji: '\u{1F921}', name: 'Clown', keywords: ['funny', 'comedy', 'jokes'] },
    { emoji: '\u{1F575}\u{FE0F}', name: 'Detective', keywords: ['mystery', 'crime', 'clue'] },
    { emoji: '\u{1F300}', name: 'Cyclone', keywords: ['abstract', 'spiral', 'swirl'] },
    { emoji: '\u{1F4AB}', name: 'Dizzy', keywords: ['abstract', 'star', 'spin'] },
    { emoji: '\u{1F4A5}', name: 'Collision', keywords: ['abstract', 'boom', 'impact'] },
    { emoji: '\u{1F4A2}', name: 'Anger symbol', keywords: ['abstract', 'comic', 'mark'] },
    { emoji: '\u{1F4A6}', name: 'Sweat droplets', keywords: ['abstract', 'drops', 'water'] },
    { emoji: '\u{1F4A8}', name: 'Dashing away', keywords: ['abstract', 'speed', 'wind'] },
    { emoji: '\u{1F573}\u{FE0F}', name: 'Hole', keywords: ['abstract', 'circle', 'void'] },
    { emoji: '\u{1F578}\u{FE0F}', name: 'Spider web', keywords: ['abstract', 'web', 'pattern'] },
    { emoji: '\u{1F5EF}\u{FE0F}', name: 'Right anger bubble', keywords: ['abstract', 'speech', 'comic'] },
    { emoji: '\u{1F533}', name: 'White square button', keywords: ['abstract', 'shape', 'square'] },
    { emoji: '\u{1F532}', name: 'Black square button', keywords: ['abstract', 'shape', 'square'] },
    { emoji: '\u{25AA}\u{FE0F}', name: 'Small black square', keywords: ['abstract', 'shape', 'square'] },
    { emoji: '\u{25AB}\u{FE0F}', name: 'Small white square', keywords: ['abstract', 'shape', 'square'] },
    { emoji: '\u{1F534}', name: 'Red circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F7E0}', name: 'Orange circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F7E1}', name: 'Yellow circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F7E2}', name: 'Green circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F535}', name: 'Blue circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F7E3}', name: 'Purple circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F7E4}', name: 'Brown circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{26AB}', name: 'Black circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{26AA}', name: 'White circle', keywords: ['abstract', 'shape', 'circle'] },
    { emoji: '\u{1F536}', name: 'Large orange diamond', keywords: ['abstract', 'shape', 'diamond'] },
    { emoji: '\u{1F537}', name: 'Large blue diamond', keywords: ['abstract', 'shape', 'diamond'] },
    { emoji: '\u{1F538}', name: 'Small orange diamond', keywords: ['abstract', 'shape', 'diamond'] },
    { emoji: '\u{1F539}', name: 'Small blue diamond', keywords: ['abstract', 'shape', 'diamond'] },
    { emoji: '\u{1F53A}', name: 'Red triangle pointed up', keywords: ['abstract', 'shape', 'triangle'] },
    { emoji: '\u{1F53B}', name: 'Red triangle pointed down', keywords: ['abstract', 'shape', 'triangle'] }
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
