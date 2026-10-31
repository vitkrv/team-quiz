# Default / Стандартна — completed theme brief

Based on [the theme brief](pack-theme-brief.md). Internal ID: `default`.
The original Cortex Rush presentation: blue boards, yellow highlights, animal
avatars, and a red buzzer. Missing or unknown theme IDs resolve to this theme.

## Name and descriptions

| Language | Title | Editor description |
| --- | --- | --- |
| English | Default | The original Cortex Rush look: blue boards, yellow highlights, animal avatars, and the classic Buzz button. |
| Ukrainian | Стандартна | Оригінальний вигляд Cortex Rush: синє ігрове поле, жовті акценти, аватари тварин і класична кнопка відповіді. |

## Palette

Default has no `palette`, `effects`, or `categoryShadow` configuration in the theme
registry. It inherits each component's Tailwind utilities and base CSS. The editor
shows three representative swatches: background `#0f172a`, accent `#facc15`,
secondary `#60a5fa`. These are not a complete shared palette.

The rows below map the brief's fields to representative existing styles; they are
source references, not theme tokens to import. Colors vary by screen and state.

| Field in brief | Current Default treatment |
| --- | --- |
| `background` | Slate-900 (`#0f172a`); main game area also has a blue-950 to slate-900 radial gradient; lobby uses slate-to-black |
| `glow` | Component-specific gradients; no shared glow value |
| `surface` | Slate panels; ordinary question cards use blue-900 (`#1e3a8a`) |
| `raised` | Available board cells use blue-800 (`#1e40af`) |
| `border` | Slate-700 (`#334155`) and other component-specific border colors |
| `accent` | Yellow-400 (`#facc15`) for board points and headings; enabled buzzer is red-600 (`#dc2626`) |
| `hover` | Board cells: blue-700 (`#1d4ed8`); buzzer: red-500 (`#ef4444`); other controls retain their own styles |
| `secondary` | Picker swatch: blue-400 (`#60a5fa`); ordinary-question card border: blue-600 (`#2563eb`) |
| `text` | Primarily white (`#ffffff`), with component-specific slate text |
| `muted` | Commonly slate-400 (`#94a3b8`); disabled controls use other slate shades |
| `positive` | Answer text uses green-300 (`#86efac`) or green-400 (`#4ade80`) according to layout |

## Emoji

- Contestants: 🦊 🐼 🐨 🐯 🦁 🐮 🐸 🐵 🐔 🐧 🦅 🦉 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐢 🐍 🐙 🦑 🦞 🦀 🐡 🐠 🐬 🐳 🦖 🦕 🐉
- Ordinary-question background: ❔
- Surprise background: 🍿 🎉 🥳 🎁 🍾 🎂 ✨ 🪄
- Unrevealed hidden-table cells: each generated cell's own `icon`; no theme override.

The 32-avatar contestant pool uses unused avatars first, then balanced repeats if
needed. A room allows 20 contestants plus the crowned host, so new assignments can
stay unique within that capacity. Rejoining contestants keep an avatar in the pool.
Table icons are separate from contestant avatar assignment and hidden point values.

## Wording

Default has an empty `copy` map and uses the app's ordinary translations.

| Field | English | Ukrainian |
| --- | --- | --- |
| `leaderboard` | Leaderboard | Таблиця лідерів |
| `buzz` | BUZZ | ЖМЯК |
| `startGame` | Start Game | Почати гру |
| `waitingForPlayers` | Waiting for players to join... | Очікуємо на гравців... |
| `surpriseQuestion` | Surprise Question | Сюрприз-питання |
| `surpriseMechanicWheel` | Wheel of Fortune | Колесо фортуни |
| `surpriseMechanicTable` | Hidden Table | Прихована таблиця |
| `prizeTitle` | PRIZE! | ПРИЗ! |
| `roundComplete` | Round {round} complete | Раунд {round} завершено |
| `gameOver` | GAME OVER | ГРУ ЗАВЕРШЕНО |
| `finalStandings` | Final Standings | Фінальна таблиця |

## Finishing details

| Detail | Current treatment |
| --- | --- |
| Category shadow | Dark slate offset, yellow glow, and wider blue glow, defined in `.category-preview-name` |
| Primary button / surprise-card shadow | Component-specific utilities; surprise cards use yellow styling with a yellow-950 shadow |
| Hovered board glow | Blue glow plus dark inset lower edge |
| Disabled board text | Transparent text on slate-800/50 cells; points are hidden |
| Buzzer edge / raised shadow | Red-800 border, `#7f1d1d` lower shadow, translucent white inset highlight; disabled state is slate |
| Buzzer capitalization | Normal localized labels: BUZZ / ЖМЯК; no themed casing override |
| Surprise entrance glow | Blue radial glow, `rgba(1, 39, 138, 0.42)` |
| Selected contestant glow | Base reel styling; final selection has slate/yellow outline rings and a translucent yellow glow |
| Results title | Yellow-400 to yellow-600 text gradient with drop shadow |
| Panel shadow | Component-specific slate/dark shadows; no theme override |
| Wheel slices | Positive: `#115e59` / `#134e4a`; zero/negative: `#881337` / `#701a35`, alternating by slice index |
| Wheel text | Positive: `#ccfbf1`; zero/negative: `#ffe4e6` |
| Wheel separator | `#0f172a` |
| Ordinary background emoji | Grayscale and brightness-50 during play; Default question previews do not add the themed floating background |
| Surprise background emoji | Full color during play |
| Extra surprise heading | Hidden; the custom-theme-only heading is not displayed |
| Prize frame | Existing prize layout, without the custom-theme surface, outline, rounding, or padding override |

Default's full visual specification remains in its components and base CSS rather
than in a single theme object. Changing one representative swatch would not restyle
all Default screens.

The theme applies to game screens and shared results; editor chrome and pack listings
keep their normal appearance. Each room locks its theme at creation. Scoring,
timers, turn behavior, layout, and animation timing are unchanged.

This brief was checked against source; it does not claim browser verification.
For verification and pending browser checks, see [storage validation](game-storage-validation.md#predefined-pack-themes).
This documentation adds no runtime changes or deployment requirement.

Sources: [theme definitions](../src/utils/packTheme.js), [translations](../src/i18n.jsx),
[theme styles](../src/index.css), [active question](../src/views/game/ActiveQuestionView.jsx),
[theme picker](../src/components/PackThemePicker.jsx), and [avatar constants](../src/constants.js).
