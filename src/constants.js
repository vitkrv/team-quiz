export const HOST_AVATAR = '👑';

export const ANIMAL_AVATARS = ['🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐸', '🐵', '🐔', '🐧', '🦅', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐢', '🐍', '🐙', '🦑', '🦞', '🦀', '🐡', '🐠', '🐬', '🐳', '🦖', '🦕', '🐉'];

export const SURPRISE_SCORING_MECHANICS = {
    wheel: 'wheel',
    table: 'table'
};

export const normalizeSurpriseScoringMechanic = (mechanic) => (
    Object.values(SURPRISE_SCORING_MECHANICS).includes(mechanic)
        ? mechanic
        : SURPRISE_SCORING_MECHANICS.wheel
);
