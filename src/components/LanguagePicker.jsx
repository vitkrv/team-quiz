import { LANGUAGES } from '../i18n';
import { useLanguage } from '../useLanguage';

const Star = ({ x, y, r }) => {
    const points = Array.from({ length: 10 }, (_, index) => {
        const angle = -90 + index * 36;
        const radius = index % 2 === 0 ? r : r * 0.38;
        const px = x + radius * Math.cos(angle * Math.PI / 180);
        const py = y + radius * Math.sin(angle * Math.PI / 180);
        return `${px},${py}`;
    }).join(' ');

    return <polygon points={points} fill="#fff" />;
};

const UnitedStatesFlag = () => (
    <svg viewBox="0 0 7410 3900" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
        <rect width="7410" height="3900" fill="#b22234" />
        {Array.from({ length: 6 }, (_, index) => (
            <rect key={index} y={(index * 2 + 1) * 300} width="7410" height="300" fill="#fff" />
        ))}
        <rect width="2964" height="2100" fill="#3c3b6e" />
        {Array.from({ length: 9 }, (_, row) => (
            Array.from({ length: row % 2 === 0 ? 6 : 5 }, (_, col) => (
                <Star
                    key={`${row}-${col}`}
                    x={(row % 2 === 0 ? 247 : 494) + col * 494}
                    y={210 + row * 210}
                    r={90}
                />
            ))
        ))}
    </svg>
);

const UkraineFlag = () => (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
        <rect width="1200" height="400" fill="#0057b7" />
        <rect y="400" width="1200" height="400" fill="#ffd700" />
    </svg>
);

const LanguageFlag = ({ code }) => {
    if (code === 'en') return <UnitedStatesFlag />;
    if (code === 'uk') return <UkraineFlag />;
    return null;
};

export default function LanguagePicker({ className = '' }) {
    const { language, setLanguage, t } = useLanguage();

    return (
        <div className={`flex flex-col items-center gap-3 ${className}`}>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('interfaceLanguage')}</div>
            <div className="flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 shadow-lg">
                {LANGUAGES.map((item) => (
                    <button
                        key={item.code}
                        type="button"
                        onClick={() => setLanguage(item.code)}
                        className={`h-9 w-14 overflow-hidden rounded-md border border-slate-700 bg-slate-900 transition-all hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 ${language === item.code ? 'ring-2 ring-blue-400' : ''}`}
                        title={item.label}
                        aria-label={item.label}
                        aria-pressed={language === item.code}
                    >
                        <LanguageFlag code={item.code} />
                    </button>
                ))}
            </div>
        </div>
    );
}
