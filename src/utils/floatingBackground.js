export const createSeededRandom = (seed = 'background') => {
    let hash = 2166136261;

    Array.from(seed).forEach((character) => {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    });

    return () => {
        hash += 0x6D2B79F5;
        let value = hash;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

export const createFloatingBackgroundItems = ({
    seed = 'background',
    count,
    emojis,
    columns = 5,
    sizeMin = 0.9,
    sizeRange = 1.9,
    opacityMin = 0.08,
    opacityRange = 0.18,
    rotationRange = 90,
    cellPadding = 0.18
}) => {
    const random = createSeededRandom(seed);
    const rows = Math.ceil(count / columns);
    const cellIndexes = Array.from({ length: count }, (_, index) => index);

    for (let index = cellIndexes.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [cellIndexes[index], cellIndexes[swapIndex]] = [cellIndexes[swapIndex], cellIndexes[index]];
    }

    return cellIndexes.map((cellIndex, index) => {
        const column = cellIndex % columns;
        const row = Math.floor(cellIndex / columns);
        const cellWidth = 100 / columns;
        const cellHeight = 100 / rows;
        const paddedCellRange = 1 - (cellPadding * 2);

        return {
            id: `${seed}:${index}`,
            emoji: emojis[Math.floor(random() * emojis.length)],
            left: (column * cellWidth) + (cellWidth * (cellPadding + (random() * paddedCellRange))),
            top: (row * cellHeight) + (cellHeight * (cellPadding + (random() * paddedCellRange))),
            rotation: (random() * rotationRange) - (rotationRange / 2),
            size: sizeMin + (random() * sizeRange),
            opacity: opacityMin + (random() * opacityRange)
        };
    });
};
