# New Question Pack theme — fill-in brief

Fill in the blanks below and return this file or paste the completed sections into chat.
Plain color names and descriptions are fine; hex codes are optional. Write **choose for me**
for any design decision you want handled during implementation. For wording, write
**keep default** to retain the normal app text. No coding is needed to complete this brief.

This describes one additional visual theme at the same customization level as Halloween.
It is a design brief, not an importable configuration or an in-app theme builder.

## 1. Name and idea

| Option | Your choice |
| --- | --- |
| Theme name — English | _____ |
| Theme name — Ukrainian | _____ |
| Short description — English (shown in the editor) | _____ |
| Short description — Ukrainian (shown in the editor) | _____ |
| Overall mood / inspiration (one sentence) | _____ |
| Internal ID (lowercase, e.g. `winter`; choose for me is fine) | _____ |

## 2. Colors

Fill all 11 rows, or provide your main colors and mark the rest **choose for me**.
The Halloween values are examples, not required defaults for your new theme.

| Option | Where it is used | Halloween example | Your choice |
| --- | --- | --- | --- |
| `background` | Room background; dark text on bright buttons | `#160F20` | _____ |
| `glow` | Center of the room background gradient; hovered board cells | `#2B163D` | _____ |
| `surface` | Panels, dialogs, question cards, wheel hub | `#24162F` | _____ |
| `raised` | Raised panels, available board cells, disabled buzzer | `#342044` | _____ |
| `border` | Panel outlines, table cells, wheel hub outline | `#69447E` | _____ |
| `accent` | Main buttons, points, category titles, room code, wheel pointer | `#F97316` | _____ |
| `hover` | Main-button hover and keyboard-focus outline | `#FB923C` | _____ |
| `secondary` | Secondary highlights, outlines, current-player emphasis | `#C084FC` | _____ |
| `text` | Main text | `#FFF7ED` | _____ |
| `muted` | Supporting labels | `#D8C7E3` | _____ |
| `positive` | Answer text and positive highlights | `#BEF264` | _____ |

## 3. Emoji

Separate emoji with spaces. Use nonempty lists and avoid duplicates within each list.
Fifteen contestant avatars match Halloween's current pool size; another pool size is possible.
Unused avatars are assigned first, followed by balanced repeats. Rejoining contestants keep
their avatar; the host keeps the crown. The room still supports 20 contestants plus the host.

| Option | Halloween example | Your choice |
| --- | --- | --- |
| Contestant avatar pool (`avatars`) | 🎃 🦇 🕷️ 🕸️ ☠️ 🧛 🧟 🍬 🔮 👽 🌕 🐈‍⬛ 🧚 😈 🧙‍♂️ | _____ |
| Ordinary-question floating background (`normal`) | 👻 | _____ |
| Surprise-question floating background (`surprise`) | 🍬 🍭 🍫 🍩 🍪 🧁 🍰 🍮 | _____ |
| Hidden-table unrevealed cell symbol | 🍬 | _____ |

## 4. Wording

These are all 11 text overrides currently used by Halloween. Fill both languages,
or write **translate for me** in one language. **Keep default** means the normal
localized app wording. Preserve `{round}` in the round-complete message; it inserts the round number.

| Option | Default English text | Your English text | Your Ukrainian text |
| --- | --- | --- | --- |
| `leaderboard` | Leaderboard | _____ | _____ |
| `buzz` | BUZZ | _____ | _____ |
| `startGame` | Start Game | _____ | _____ |
| `waitingForPlayers` | Waiting for players to join... | _____ | _____ |
| `surpriseQuestion` | Surprise Question | _____ | _____ |
| `surpriseMechanicWheel` | Wheel of Fortune | _____ | _____ |
| `surpriseMechanicTable` | Hidden Table | _____ | _____ |
| `prizeTitle` | PRIZE! | _____ | _____ |
| `roundComplete` | Round {round} complete | _____ | _____ |
| `gameOver` | GAME OVER | _____ | _____ |
| `finalStandings` | Final Standings | _____ | _____ |

## 5. Finishing details

These match existing Halloween presentation details. They currently live in CSS or
components rather than the theme palette. **Match my palette** is an easy answer for
color effects; **same as Halloween** keeps the existing effect style.

| Option | Current Halloween treatment | Your choice |
| --- | --- | --- |
| Category heading shadow (`categoryShadow`) | Dark offset shadow plus soft purple glow | _____ |
| Primary button shadow | Soft orange shadow | _____ |
| Hovered board-cell glow | Soft purple glow | _____ |
| Disabled board-cell text | Muted purple (`#887594`) | _____ |
| Buzzer edge and raised shadow | Dark orange (`#9a3412`) with a translucent white inset highlight | _____ |
| Buzzer label capitalization | Preserves supplied text, e.g. “Scream!” | _____ |
| Surprise-question entrance glow | Translucent orange radial glow | _____ |
| Selected contestant ball glow | Orange glow; result also has background/accent outline rings | _____ |
| Results title shadow | Soft purple glow | _____ |
| Surprise-card shadow | Soft orange glow | _____ |
| Secondary-border panel shadow | Dark translucent shadow | _____ |
| Wheel slice colors (three repeating colors) | `#F97316`, `#69447E`, `#342044` | _____ |
| Wheel number color | `#FFF7ED` | _____ |
| Wheel slice separator | Dark slate (`#0f172a`), shared with Default | _____ |
| Ordinary background emoji appearance | Full color (Default uses grayscale/dimming during play) | _____ |
| Extra surprise heading inside the question card | Visible, orange text; uses `surpriseQuestion` wording above | _____ |
| Prize frame | Surface fill, accent outline, rounded corners and padding | _____ |

The palette already controls the room gradient, panel fills, borders, focus outlines,
board states, room code, current-player highlight, wheel pointer/hub, and surprise table/reel.
Those do not need separate choices unless you want a specific exception.

## 6. Scope and implementation handoff

The theme covers pack board/question previews and themed game screens: lobby,
category introductions, board, ordinary/surprise questions, game dialogs, RPS,
round breaks, prize presentation, and results. The editor shell and pack listings
retain their normal appearance. Pack icons and prize images remain separate pack content.
Scoring, timers, media behavior, layout, typography, and animation timing retain their current behavior.

Saving a pack makes its theme available to newly created rooms. Each room locks its
theme at creation and retains it in shared results, even after the frozen pack is deleted.
Changing the pack theme later does not restyle an existing room.

Implementation checklist for the developer after the brief is filled:

- Register and normalize the new ID in [packTheme.js](../src/utils/packTheme.js).
- Add both languages' name, description, and chosen overrides in [i18n.jsx](../src/i18n.jsx).
- Add the selector option and description handling in [PackThemePicker.jsx](../src/components/PackThemePicker.jsx).
- Add equivalent scoped styles in [index.css](../src/index.css), including the currently Halloween-specific decorations.
- Extend theme-specific wheel colors, table symbol, and background treatment in [ActiveQuestionView.jsx](../src/views/game/ActiveQuestionView.jsx), plus preview behavior in [PackCreator.jsx](../src/views/PackCreator.jsx) and the extra heading in [QuestionPresenter.jsx](../src/components/QuestionPresenter.jsx).
- Allow the new ID in [firestore.rules](../firestore.rules); keep room theme immutability.
- Update theme documentation and relevant cases in the existing [storage validation harness](game-storage-validation.md).
- Run `npm run lint`, `npm run build`, and `node scripts/verify-game-storage.mjs` against the dedicated Emulator described in that guide. Coordinate rules/frontend releases when deployment is authorized.
- Browser checks remain pending until explicitly requested: English/Ukrainian, desktop/mobile, host/contestant/spectator, previews through shared results, keyboard focus, reduced motion, long headings, and returning to unthemed screens.

Source reference: [theme scope](../src/components/PackThemeScope.jsx) exposes the palette and category shadow as CSS variables. Additional visual decisions above come from the current Halloween styles and component branches. No new runtime customization controls are implied by this brief.
