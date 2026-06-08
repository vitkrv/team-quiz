export default function FloatingEmojiBackground({ items, className = '' }) {
    return (
        <div className={`pointer-events-none absolute overflow-hidden ${className}`}>
            {items.map((item) => (
                <span
                    key={item.id}
                    className="absolute select-none"
                    style={{
                        left: `${item.left}%`,
                        top: `${item.top}%`,
                        fontSize: `${item.size}rem`,
                        opacity: item.opacity,
                        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`
                    }}
                >
                    {item.emoji}
                </span>
            ))}
        </div>
    );
}
