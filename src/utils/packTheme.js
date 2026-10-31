import { ANIMAL_AVATARS } from '../constants';
export const normalizeThemeId = id => ['halloween', 'music'].includes(id) ? id : 'default';
const keys = ['leaderboard','buzz','startGame','waitingForPlayers','surpriseQuestion','surpriseMechanicWheel','surpriseMechanicTable','prizeTitle','roundComplete','gameOver','finalStandings'];
export const PACK_THEMES = {
 default: { avatars: ANIMAL_AVATARS, normal: ['❔'], surprise: ['🍿','🎉','🥳','🎁','🍾','🎂','✨','🪄'], copy: {} },
 halloween: { tableIcons: ['🍬'], wheelColors: ['#F97316', '#69447E', '#342044'], avatars: ['🎃','🦇','🕷️','🕸️','☠️','🧛','🧟','🍬','🔮','👽','🌕','🐈‍⬛','🧚','😈','🧙‍♂️'], normal: ['👻'], surprise: ['🍬','🍭','🍫','🍩','🍪','🧁','🍰','🍮'], copy: Object.fromEntries(keys.map(key => [key, 'halloween_' + key])), palette: { background: '#160F20', glow: '#2B163D', surface: '#24162F', raised: '#342044', border: '#69447E', accent: '#F97316', hover: '#FB923C', secondary: '#C084FC', text: '#FFF7ED', muted: '#D8C7E3', positive: '#BEF264' }, categoryShadow: '0 .08em 0 #160F20, 0 0 1.4rem #C084FC66' },
 music: {
  avatars: ['🦄','🦩','🐇','🐋','🐈','🐈‍⬛','🐷','🐼','🐨','🦀','🐲','🐣','🦥'],
  tableIcons: ['🦄','🦩','🐇','🐋','🐈','🐈‍⬛','🐷','🐼','🐨','🦀','🐲','🐣','🦥'],
  normal: ['🎵'], surprise: ['🪄','🎧','🎹','🎼','🎤','🎸','🥁','🎉','🎁'],
  copy: Object.fromEntries(keys.map(key => [key, 'music_' + key])),
  palette: { background: '#142D27', glow: '#25463A', surface: '#203C32', raised: '#2E4D3E', border: '#607C64', accent: '#E4B5C0', hover: '#EDC8D0', secondary: '#B6C99A', text: '#F2F3E9', muted: '#BECDBD', positive: '#CCDDB5' },
  categoryShadow: '0 .08em 0 #142D27, 0 0 1.4rem #B6C99A18',
  wheelColors: ['#3D5E4B', '#526E57', '#6A6267'],
  effects: { 'accent-shadow': '#E4B5C018', 'secondary-shadow': '#B6C99A22', 'buzz-edge': '#946E78', 'entrance-glow': '#E4B5C01F', 'selected-glow': '#E4B5C02B', 'title-glow': '#B6C99A18', 'panel-shadow': '#142D2766', 'disabled-text': '#A2B3A1', 'result-glow': '#E4B5C022' }
 }
};
export const getPackTheme = id => PACK_THEMES[normalizeThemeId(id)];
export const themeTranslator = (t,id) => (key,params) => t(getPackTheme(id).copy[key] || key,params);
export function choosePlayerAvatar(players,uid,themeId,random = Math.random) {
 const pool = getPackTheme(themeId).avatars;
 if (pool.includes(players[uid]?.avatar)) return players[uid].avatar;
 const counts = pool.map(avatar => Object.entries(players).filter(([id,p]) => id !== uid && !p.isHost && p.avatar === avatar).length);
 const minimum = Math.min(...counts);
 const available = pool.filter((_,i) => counts[i] === minimum);
 return available[Math.floor(random() * available.length)];
}
