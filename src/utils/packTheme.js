import { ANIMAL_AVATARS } from '../constants';
export const normalizeThemeId = id => ['halloween', 'music', 'cosmic', 'cinema', 'winter', 'arcade'].includes(id) ? id : 'default';
const keys = ['leaderboard','buzz','startGame','waitingForPlayers','surpriseQuestion','surpriseMechanicWheel','surpriseMechanicTable','prizeTitle','roundComplete','gameOver','finalStandings'];
export const PACK_THEMES = {
 default: { wheelSeparator: '#0f172a', avatars: ANIMAL_AVATARS, normal: ['❔'], surprise: ['🍿','🎉','🥳','🎁','🍾','🎂','✨','🪄'], copy: {} },
 halloween: { wheelSeparator: '#0f172a', effects: { 'surprise-heading': '#FDBA74', 'accent-shadow': '#f9731633', 'secondary-shadow': '#c084fc55', 'buzz-edge': '#9a3412', 'entrance-glow': 'rgba(249, 115, 22, 0.22)', 'selected-glow': '#f9731655', 'title-glow': '#c084fc44', 'panel-shadow': '#160f2080', 'disabled-text': '#887594', 'result-glow': '#f9731644' }, tableIcons: ['🍬'], wheelColors: ['#F97316', '#69447E', '#342044'], avatars: ['🎃','🦇','🕷️','🕸️','☠️','🧛','🧟','🍬','🔮','👽','🌕','🐈‍⬛','🧚','😈','🧙‍♂️'], normal: ['👻'], surprise: ['🍬','🍭','🍫','🍩','🍪','🧁','🍰','🍮'], copy: Object.fromEntries(keys.map(key => [key, 'halloween_' + key])), palette: { background: '#160F20', glow: '#2B163D', surface: '#24162F', raised: '#342044', border: '#69447E', accent: '#F97316', hover: '#FB923C', secondary: '#C084FC', text: '#FFF7ED', muted: '#D8C7E3', positive: '#BEF264' }, categoryShadow: '0 .08em 0 #160F20, 0 0 1.4rem #C084FC66' },
 music: {
  wheelSeparator: '#142D27',
  avatars: ['🦄','🦩','🐇','🐋','🐈','🐈‍⬛','🐷','🐼','🐨','🦀','🐲','🐣','🦥'],
  tableIcons: ['🦄','🦩','🐇','🐋','🐈','🐈‍⬛','🐷','🐼','🐨','🦀','🐲','🐣','🦥'],
  normal: ['🎵'], surprise: ['🪄','🎧','🎹','🎼','🎤','🎸','🥁','🎉','🎁'],
  copy: Object.fromEntries(keys.map(key => [key, 'music_' + key])),
  palette: { background: '#142D27', glow: '#25463A', surface: '#203C32', raised: '#2E4D3E', border: '#607C64', accent: '#E4B5C0', hover: '#EDC8D0', secondary: '#B6C99A', text: '#F2F3E9', muted: '#BECDBD', positive: '#CCDDB5' },
  categoryShadow: '0 .08em 0 #142D27, 0 0 1.4rem #B6C99A18',
  wheelColors: ['#3D5E4B', '#526E57', '#6A6267'],
  effects: { 'accent-shadow': '#E4B5C018', 'secondary-shadow': '#B6C99A22', 'buzz-edge': '#946E78', 'entrance-glow': '#E4B5C01F', 'selected-glow': '#E4B5C02B', 'title-glow': '#B6C99A18', 'panel-shadow': '#142D2766', 'disabled-text': '#A2B3A1', 'result-glow': '#E4B5C022' }
 },
 cosmic: {
  wheelSeparator: '#0f172a',
  avatars: ['🚀','🛸','🪐','👽','🤖','🌙','☄️','🌍','🌌','🛰️','🔭','👨‍🚀','👩‍🚀','🌞'],
  normal: ['⭐'], surprise: ['☄️','🌌','🪐','🚀','💫','🛸'], tableIcons: ['🪐'],
  copy: Object.fromEntries(keys.map(key => [key, 'cosmic_' + key])),
  palette: { background: '#0B1026', glow: '#1C2850', surface: '#141D38', raised: '#243253', border: '#526A97', accent: '#67E8F9', hover: '#A5F3FC', secondary: '#C4B5FD', text: '#F1F5FF', muted: '#B8C5E0', positive: '#A7F3D0' },
  categoryShadow: '0 .08em 0 #0B1026, 0 0 1.4rem #C4B5FD44',
  wheelColors: ['#24456A','#493D72','#1E5262'],
  effects: { 'accent-shadow': '#67E8F933', 'secondary-shadow': '#C4B5FD44', 'buzz-edge': '#277C92', 'entrance-glow': '#67E8F938', 'selected-glow': '#67E8F955', 'title-glow': '#C4B5FD44', 'panel-shadow': '#0B102680', 'disabled-text': '#B8C5E0', 'result-glow': '#67E8F944' }
 },
 cinema: {
  wheelSeparator: '#0f172a',
  avatars: ['🎥','🍿','🎭','🌟','🎟️','📽️','📺','🎞️','🏆','🎤','💃','🕺','🥂','🕶️'],
  normal: ['🎬'], surprise: ['🍿','🌟','🏆','🎟️','🥂','🎉'], tableIcons: ['🎟️'],
  copy: Object.fromEntries(keys.map(key => [key, 'cinema_' + key])),
  palette: { background: '#191317', glow: '#35202A', surface: '#2A1C24', raised: '#432A35', border: '#896773', accent: '#F3D394', hover: '#FFE4B2', secondary: '#E9A6B5', text: '#FFF5E7', muted: '#D6BEC5', positive: '#BDE5BD' },
  categoryShadow: '0 .08em 0 #191317, 0 0 1.4rem #E9A6B544',
  wheelColors: ['#694332','#593344','#3E344C'],
  effects: { 'accent-shadow': '#F3D39433', 'secondary-shadow': '#E9A6B544', 'buzz-edge': '#99713D', 'entrance-glow': '#F3D39438', 'selected-glow': '#F3D39455', 'title-glow': '#E9A6B544', 'panel-shadow': '#19131780', 'disabled-text': '#D6BEC5', 'result-glow': '#F3D39444' }
 },
 winter: {
  wheelSeparator: '#0f172a',
  avatars: ['🦊','🦌','🧣','☕','🐻‍❄️','🐧','⛄','🧤','🧦','🛷','🎿','🌲','🦉','🐺'],
  normal: ['❄️'], surprise: ['🎁','🎄','🎅','🍪','☕','✨','🎉'], tableIcons: ['🎁'],
  copy: Object.fromEntries(keys.map(key => [key, 'winter_' + key])),
  palette: { background: '#102B3F', glow: '#203D52', surface: '#16364B', raised: '#1D4056', border: '#7198AF', accent: '#FF8585', hover: '#FFA3A3', secondary: '#FFE09A', text: '#F5FCFF', muted: '#C4DEEA', positive: '#B8E8CF' },
  categoryShadow: '0 .08em 0 #102B3F, 0 0 1.4rem #FFE09A44',
  wheelColors: ['#943D48','#376982','#80602E'],
  effects: { 'accent-shadow': '#FF858533', 'secondary-shadow': '#FFE09A44', 'buzz-edge': '#A83E49', 'entrance-glow': '#FF858538', 'selected-glow': '#FF858555', 'title-glow': '#FFE09A44', 'panel-shadow': '#102B3F80', 'disabled-text': '#C4DEEA', 'result-glow': '#FF858544' }
 },
 arcade: {
  wheelSeparator: '#0f172a',
  avatars: ['🕹️','🤖','👽','🎮','🪙','⚡','💎','🔥','🏎️','🛸','🐉','🦾','🎯','🏆'],
  normal: ['👾'], surprise: ['🪙','⚡','💎','🏆','🎮','✨'], tableIcons: ['🪙'],
  copy: Object.fromEntries(keys.map(key => [key, 'arcade_' + key])),
  palette: { background: '#130D29', glow: '#302052', surface: '#211638', raised: '#35234E', border: '#80639D', accent: '#F9A8D4', hover: '#FBCFE8', secondary: '#5EEAD4', text: '#FFF8E7', muted: '#D2C1E4', positive: '#BEF264' },
  categoryShadow: '0 .08em 0 #130D29, 0 0 1.4rem #5EEAD444',
  wheelColors: ['#67305F','#245B59','#463676'],
  effects: { 'accent-shadow': '#F9A8D433', 'secondary-shadow': '#5EEAD444', 'buzz-edge': '#A3487A', 'entrance-glow': '#F9A8D438', 'selected-glow': '#F9A8D455', 'title-glow': '#5EEAD444', 'panel-shadow': '#130D2980', 'disabled-text': '#D2C1E4', 'result-glow': '#F9A8D444' }
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
