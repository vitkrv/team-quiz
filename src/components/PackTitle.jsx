export default function PackTitle({ pack, name, className = '', iconClassName = '' }) {
    const iconEmoji = pack?.iconEmoji;
    const title = name ?? pack?.name;

    return (
        <span className={`inline-flex max-w-full min-w-0 items-center gap-2 ${className}`}>
            {iconEmoji && (
                <span className={`shrink-0 leading-none ${iconClassName}`} aria-hidden="true">
                    {iconEmoji}
                </span>
            )}
            <span className="min-w-0 truncate">{title}</span>
        </span>
    );
}
