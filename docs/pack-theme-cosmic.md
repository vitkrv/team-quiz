# Cosmic Voyage — completed theme brief

Based on [the theme brief](pack-theme-brief.md). This document records the implemented presentation; it is not an importable configuration or an in-app theme builder.

## 1. Name and idea

| Option | Choice |
| --- | --- |
| Theme name — English | Cosmic Voyage |
| Theme name — Ukrainian | Космічна подорож |
| Short description — English (shown in the editor) | Explore midnight-blue space with cyan starlight, lavender highlights, and cosmic surprises. |
| Short description — Ukrainian (shown in the editor) | Подорожуйте космосом із темно-синім тлом, блакитним сяйвом зірок, лавандовими акцентами та космічними сюрпризами. |
| Overall mood / inspiration | Curious and adventurous, inspired by space exploration and distant galaxies. |
| Internal ID | `cosmic` |

Use for science, space, technology, or a general-knowledge expedition.

## 2. Colors

| Option | Where it is used | Value |
| --- | --- | --- |
| `background` | Room background; dark text on bright buttons | `#0B1026` |
| `glow` | Center of the room background gradient; hovered board cells | `#1C2850` |
| `surface` | Panels, dialogs, question cards, wheel hub, picked-pack lobby card, leaderboard heading, round-break panel | `#141D38` |
| `raised` | Raised panels, available board cells, disabled buzzer, round-break score rows | `#243253` |
| `border` | Panel outlines, table cells, wheel hub outline | `#526A97` |
| `accent` | Main buttons, points, category titles, room code, wheel pointer | `#67E8F9` |
| `hover` | Main-button hover and keyboard-focus outline | `#A5F3FC` |
| `secondary` | Secondary highlights, outlines, current-player emphasis | `#C4B5FD` |
| `text` | Main text | `#F1F5FF` |
| `muted` | Supporting labels | `#B8C5E0` |
| `positive` | Answer text and positive highlights | `#A7F3D0` |

## 3. Emoji

Use exactly one emoji type in the ordinary-question background, distinct from every contestant avatar in this theme. Surprise-question backgrounds may contain multiple emoji.

| Option | Choice |
| --- | --- |
| Contestant avatar pool (`avatars`) | 🚀 🛸 🪐 👽 🤖 🌙 ☄️ 🌍 🌌 🛰️ 🔭 👨‍🚀 👩‍🚀 🌞 |
| Ordinary-question floating background (`normal`) | ⭐ |
| Surprise-question floating background (`surprise`) | ☄️ 🌌 🪐 🚀 💫 🛸 |
| Hidden-table unrevealed cell symbol | 🪐 |

All 14 contestant avatars are assigned before balanced repeats. Rejoining contestants keep their avatar; the host keeps the crown. Rooms support 20 contestants plus the host. The hidden-table symbol is decorative and does not affect point assignment.

## 4. Wording

All 11 overrides are explicit below, including entries that match ordinary app wording. Preserve `{round}` in both round-complete messages; it inserts the round number.

| Option | Default English text | English text | Ukrainian text |
| --- | --- | --- | --- |
| `leaderboard` | Leaderboard | Mission Rankings | Рейтинг екіпажу |
| `buzz` | BUZZ | Signal! | Сигнал! |
| `startGame` | Start Game | Launch Mission | Розпочати місію |
| `waitingForPlayers` | Waiting for players to join... | Waiting for the crew to gather… | Чекаємо, поки збереться екіпаж… |
| `surpriseQuestion` | Surprise Question | Cosmic Anomaly | Космічна аномалія |
| `surpriseMechanicWheel` | Wheel of Fortune | Orbit of Fortune | Орбіта удачі |
| `surpriseMechanicTable` | Hidden Table | Uncharted Planets | Незвідані планети |
| `prizeTitle` | PRIZE! | Mission Reward! | Нагорода за місію! |
| `roundComplete` | Round {round} complete | Round {round}: mission complete! | Раунд {round}: місію виконано! |
| `gameOver` | GAME OVER | Mission Accomplished! | Місію завершено! |
| `finalStandings` | Final Standings | Final Mission Rankings | Підсумковий рейтинг екіпажу |

## 5. Finishing details

| Option | Choice |
| --- | --- |
| Category heading shadow (`categoryShadow`) | `0 .08em 0 #0B1026, 0 0 1.4rem #C4B5FD44` |
| Primary button shadow | `0 4px 16px #67E8F933` |
| Hovered board-cell glow | `0 0 18px #C4B5FD44` |
| Disabled board-cell text | `#B8C5E0` |
| Buzzer edge and raised shadow | Edge `#277C92`; shadow `0 8px 0 #277C92`; inset highlight `inset 0 10px 20px #ffffff4d`. Pressed state retains only the inset highlight. |
| Buzzer label capitalization | Preserve the supplied text in both languages; no uppercase transform. |
| Surprise-question entrance glow | Radial gradient from `#67E8F938` at center to transparent at 51%. |
| Selected contestant ball glow | `0 0 24px #67E8F955`; result rings `0 0 0 3px #0B1026` and `0 0 0 5px #67E8F9`, plus `0 0 32px #67E8F944`. |
| Results title shadow | `0 0 20px #C4B5FD44` |
| Surprise-card shadow | `0 0 24px #67E8F933` |
| Secondary-border panel shadow | `0 8px 24px #0B102680` |
| Wheel slice colors (three repeating colors) | `#24456A`, `#493D72`, `#1E5262` |
| Wheel number color | `#F1F5FF` |
| Wheel slice separator | Dark slate `#0f172a` (shared with Default). |
| Ordinary background emoji appearance | Full color; no grayscale or dimming filter. |
| Extra surprise heading inside the question card | Visible on surprise questions, using `surpriseQuestion` wording and accent `#67E8F9`. |
| Prize frame | Surface fill `#141D38`, 2px solid accent outline `#67E8F9`, 1rem corner radius, and 1rem padding. |

The palette also controls the room gradient, panel fills, borders, focus outlines, board states, room code, current-player highlight, wheel pointer/hub, and surprise table/reel. No additional exceptions are required.

## 6. Scope and implementation handoff

The theme covers pack board/question previews and themed game screens: lobby, category introductions, board, ordinary/surprise questions, game dialogs, RPS, round breaks, prize presentation, and results. The editor shell and pack listings retain their normal appearance. Pack icons and prize images remain separate pack content. Scoring, timers, media behavior, layout, typography, animation timing, and turn behavior are unchanged.

Save the pack to make its theme available to newly created rooms. Each room locks its theme at creation and retains it in shared results, even after the frozen pack is deleted. Editing the source pack theme later does not restyle an existing room. Missing or unknown theme IDs fall back to Default; no migration is required.

Implementation references and maintenance checklist:

- Keep `cosmic` registered and normalized in [packTheme.js](../src/utils/packTheme.js), including its palette, emoji, effects, wheel colors, and wording keys.
- Keep both languages’ name, description, and overrides in [i18n.jsx](../src/i18n.jsx).
- [PackThemePicker.jsx](../src/components/PackThemePicker.jsx) derives selector options from the theme registry and resolves the localized description.
- [PackThemeScope.jsx](../src/components/PackThemeScope.jsx) exposes palette/effect CSS variables and opts into the shared custom-theme styles in [index.css](../src/index.css).
- [ActiveQuestionView.jsx](../src/views/game/ActiveQuestionView.jsx) reads wheel colors, table symbols, and floating backgrounds from the theme; preserve preview behavior in [PackCreator.jsx](../src/views/PackCreator.jsx) and the extra surprise heading in [QuestionPresenter.jsx](../src/components/QuestionPresenter.jsx).
- Keep `cosmic` in the [Firestore rules](../firestore.rules) allowlist and preserve room-theme immutability.
- Maintain coverage in [verify-game-storage.mjs](../scripts/verify-game-storage.mjs) for avatar balancing/rejoining, concurrent joins, persistence, source edits, room-theme immutability, retained results, and legacy fallback.

For future implementation changes, run:

```powershell
npm run lint
npm run build
```

Start a dedicated local Firestore Emulator in one terminal:

```powershell
firebase emulators:start --only firestore --project demo-game-storage
```

Run the single storage entry point in a second terminal, replacing the port if necessary:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
node scripts/verify-game-storage.mjs
```

Follow [storage validation](game-storage-validation.md) for prerequisites, isolation, and interpreting expected negative-case permission errors. Stop the dedicated Emulator when finished. The implementation was previously verified with lint/build and 66 passing storage scenario groups; that does not constitute browser verification.

Browser checks remain pending until explicitly requested: English/Ukrainian, desktop/mobile, host/contestant/spectator, editor previews through shared results, lobby, category introductions, ordinary/surprise questions, answer reveal, wheel/table, dialogs, RPS, round breaks, and prize presentation. Check keyboard focus, reduced motion, long headings, and returning to Default or unthemed screens.

Coordinate the updated Firestore rules and frontend release when deployment is explicitly authorized. No Worker change, new dependencies, indexes, or migration are needed. These checks do not deploy anything.

The theme object defines `wheelSeparator: #0f172a`; shared wheel rendering reads that field without checking theme names. Shared heading styling uses `effects['surprise-heading']` when provided, otherwise the palette’s `accent`. This theme uses its accent for the surprise heading. All shadow/glow/edge colors come from the theme’s `effects` object; theme-specific choices belong in that object rather than CSS selectors or component branches.
