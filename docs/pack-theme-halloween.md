# Halloween / Гелловін — completed theme brief

Based on [the theme brief](pack-theme-brief.md). Internal ID: `halloween`.
A playful Halloween atmosphere with pumpkin orange and purple, spooky avatars,
sweet surprises, and glowing headings. Available all year.

## Name and descriptions

| Language | Title | Editor description |
| --- | --- | --- |
| English | Halloween | A Halloween atmosphere with pumpkin orange and purple colors, glowing category titles, spooky avatars, sweet surprise backgrounds, and playful game headings. Available all year. |
| Ukrainian | Гелловін | Атмосфера Гелловіну: гарбузово-помаранчеві та фіолетові кольори, сяючі назви категорій, моторошні аватари, солодощі на тлі сюрпризів і тематичні заголовки. Доступна цілий рік. |

## Palette

| Field | Value | Intent |
| --- | --- | --- |
| `background` | `#160F20` | Deep purple room background; dark button text |
| `glow` | `#2B163D` | Purple gradient and hovered board cells |
| `surface` | `#24162F` | Panels, question cards, wheel hub |
| `raised` | `#342044` | Raised panels and available board cells |
| `border` | `#69447E` | Muted purple outlines |
| `accent` | `#F97316` | Pumpkin orange |
| `hover` | `#FB923C` | Light orange hover and focus |
| `secondary` | `#C084FC` | Lavender highlights |
| `text` | `#FFF7ED` | Warm off-white |
| `muted` | `#D8C7E3` | Pale purple supporting text |
| `positive` | `#BEF264` | Lime answer text and positive highlights |

## Emoji

- Contestants: 🎃 🦇 🕷️ 🕸️ ☠️ 🧛 🧟 🍬 🔮 👽 🌕 🐈‍⬛ 🧚 😈 🧙‍♂️
- Ordinary-question background: 👻
- Surprise background: 🍬 🍭 🍫 🍩 🍪 🧁 🍰 🍮
- Unrevealed hidden-table cells: 🍬 on every cell.

All 15 contestant avatars are used before balanced repeats; rejoining contestants
keep their avatar and the host retains the crown. The room supports 20 contestants
plus the host. Table decoration does not affect hidden point assignment.

## Wording

| Field | English | Ukrainian |
| --- | --- | --- |
| `leaderboard` | Witch’s Wall of Fame | Відьомська стіна слави |
| `buzz` | Scream! | Кричи! |
| `startGame` | Begin the Haunting | Почати моторошну гру |
| `waitingForPlayers` | Waiting for the coven to gather… | Чекаємо, поки збереться відьомське коло… |
| `surpriseQuestion` | Trick or Treat! | Цукерки або капості! |
| `surpriseMechanicWheel` | Wheel of Treats | Колесо ласощів |
| `surpriseMechanicTable` | Mystery Treats | Таємні ласощі |
| `prizeTitle` | The Witch’s Treasure! | Відьомський скарб! |
| `roundComplete` | Round {round}: spell complete! | Раунд {round}: закляття завершено! |
| `gameOver` | The Haunting Is Over! | Моторошну гру завершено! |
| `finalStandings` | Witch’s Wall of Fame | Відьомська стіна слави |

## Finishing details

| Detail | Choice |
| --- | --- |
| Category shadow | `0 .08em 0 #160F20, 0 0 1.4rem #C084FC66` |
| Primary button / surprise-card shadow color | `#f9731633` |
| Hovered board glow | `#c084fc55` |
| Disabled board text | `#887594` |
| Buzzer edge / raised shadow | `#9a3412`, translucent white inset highlight `#ffffff4d` |
| Buzzer capitalization | Preserve supplied text, e.g. “Scream!” |
| Surprise entrance glow | `rgba(249, 115, 22, 0.22)` |
| Selected contestant glow | `#f9731655` |
| Results title glow | `#c084fc44` |
| Panel shadow | `#160f2080` |
| Selected result glow | `#f9731644`, background/accent outline rings |
| Wheel slices | `#F97316`, `#69447E`, `#342044` |
| Wheel text / separator | `#FFF7ED` / `#0f172a` |
| Ordinary background emoji | Full color during play; floating emoji also appear in question previews |
| Extra surprise heading | Visible, orange-300 (`#fdba74`), using `surpriseQuestion` wording |
| Prize frame | Purple surface, orange outline, 1rem rounding and padding |

The palette controls the room gradient, panel fills, focus outlines, board states,
room code, current-player highlight, wheel pointer/hub, and surprise table/reel.
Additional finishing colors above are CSS fallbacks when no effect override is supplied.

The theme applies to game screens and shared results; editor chrome and pack listings
keep their normal appearance. Each room locks its theme at creation. Scoring,
timers, turn behavior, layout, and animation timing are unchanged.

This brief was checked against source; it does not claim browser verification.
For verification and pending browser checks, see [storage validation](game-storage-validation.md#predefined-pack-themes).
This documentation adds no runtime changes or deployment requirement.

Sources: [theme definitions](../src/utils/packTheme.js), [translations](../src/i18n.jsx),
[theme styles](../src/index.css), [active question](../src/views/game/ActiveQuestionView.jsx),
[theme picker](../src/components/PackThemePicker.jsx), and [avatar constants](../src/constants.js).
