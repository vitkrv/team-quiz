import { useState } from 'react';
import ImageLightbox from './ImageLightbox';
import { getImageUrl } from '../services/imageStorage';

const variantClasses = {
    thumbnail: 'h-28 w-44',
    host: 'max-h-48 w-full max-w-sm',
    player: 'max-h-[42vh] w-full max-w-4xl'
};

const frameClasses = {
    thumbnail: 'overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70',
    host: 'overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70',
    player: 'overflow-visible rounded-none border-0 bg-transparent'
};

export default function QuestionImage({ image, alt, variant = 'player', className = '' }) {
    const [isOpen, setIsOpen] = useState(false);
    if (!image) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`${frameClasses[variant]} ${variantClasses[variant]} ${className}`}
            >
                <img
                    src={getImageUrl(image, variant === 'thumbnail' ? 'thumbnail' : variant === 'host' ? 'host' : 'game')}
                    alt={alt}
                    className="h-full w-full object-contain"
                />
            </button>
            {isOpen && <ImageLightbox image={image} alt={alt} onClose={() => setIsOpen(false)} />}
        </>
    );
}
