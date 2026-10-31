# Music / Музикальна — completed theme brief

Based on [the theme brief](pack-theme-brief.md). Internal ID: `music`.
This theme is for music quizzes, with a light, playful mood, dark green surfaces,
soft rose accents, and matcha highlights. Colors are muted while text stays readable.

## Name and descriptions

| Language | Title | Editor description |
| --- | --- | --- |
| English | Music | A gentle music quiz atmosphere with dark green, soft rose and matcha colors, playful creatures, and musical surprises. |
| Ukrainian | Музикальна | Легка атмосфера музичної вікторини: темно-зелене тло, ніжні рожеві й матча-відтінки, кумедні створіння та музичні сюрпризи. |

## Palette

| Field | Value | Intent |
| --- | --- | --- |
| `background` | `#142D27` | Dark forest green |
| `glow` | `#25463A` | Gentle green gradient |
| `surface` | `#203C32` | Green panels |
| `raised` | `#2E4D3E` | Softly raised green surfaces |
| `border` | `#607C64` | Muted sage outlines |
| `accent` | `#E4B5C0` | Soft rose |
| `hover` | `#EDC8D0` | Pale rose |
| `secondary` | `#B6C99A` | Matcha |
| `text` | `#F2F3E9` | Warm off-white |
| `muted` | `#BECDBD` | Pale sage |
| `positive` | `#CCDDB5` | Light matcha |

## Emoji

- Contestants: 🦄 🦩 🐇 🐋 🐈 🐈‍⬛ 🐷 🐼 🐨 🦀 🐲 🐣 🦥
- Ordinary-question background: 🎵
- Surprise background: 🪄 🎧 🎹 🎼 🎤 🎸 🥁 🎉 🎁
- Unrevealed hidden-table cells cycle through the same 13 creatures in order.

All 13 contestant avatars are used before balanced repeats; rejoining contestants
keep their avatar and the host retains the crown. Table symbols are presentation
only and do not affect hidden point assignment.

## Wording

| Field | English | Ukrainian |
| --- | --- | --- |
| `leaderboard` | The Hit Parade | Хіт-парад |
| `buzz` | Tap! | Тиць |
| `startGame` | Let the Music Play | Нехай лунає музика |
| `waitingForPlayers` | Waiting for the band to gather… | Чекаємо, поки збереться гурт… |
| `surpriseQuestion` | A Musical Surprise! | Музичний сюрприз! |
| `surpriseMechanicWheel` | Wheel of Melodies | Колесо мелодій |
| `surpriseMechanicTable` | Hidden Creatures | Приховані створіння |
| `prizeTitle` | The Encore Prize! | Приз на біс! |
| `roundComplete` | Round {round}: a lovely performance! | Раунд {round}: чудове виконання! |
| `gameOver` | That’s a Wrap! | Фінальний акорд! |
| `finalStandings` | The Hit Parade | Хіт-парад |

## Finishing details

| Detail | Choice |
| --- | --- |
| Category shadow | `0 .08em 0 #142D27, 0 0 1.4rem #B6C99A18` |
| Primary button / surprise-card shadow color | `#E4B5C018` |
| Hovered board glow | `#B6C99A22` |
| Disabled board text | `#A2B3A1` |
| Buzzer edge / raised shadow | `#946E78`, existing translucent white inset highlight |
| Buzzer capitalization | Preserve supplied text |
| Surprise entrance glow | `#E4B5C01F` |
| Selected contestant glow | `#E4B5C02B` |
| Results title glow | `#B6C99A18` |
| Panel shadow | `#142D2766` |
| Selected result glow | `#E4B5C022`, background/accent outline rings |
| Wheel slices | `#3D5E4B`, `#526E57`, `#6A6267` |
| Wheel text / separator | `#F2F3E9` / `#142D27` |
| Ordinary background emoji | Full color |
| Extra surprise heading | Visible, soft rose |
| Prize frame | Green surface, rose outline, existing rounding and padding |

The theme applies to previews and game screens, including shared results. Editor
chrome and pack listings keep their existing appearance. Room themes lock at
creation. Scoring, timers, turn behavior, layout, and animation timing are unchanged.

For verification and pending browser checks, see [storage validation](game-storage-validation.md#predefined-pack-themes).
Release requires the updated Firestore theme allowlist and frontend together;
no Worker change, migration, or new dependencies are needed.
