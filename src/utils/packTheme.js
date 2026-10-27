import { ANIMAL_AVATARS } from '../constants';
export const normalizeThemeId = id => id === 'halloween' ? id : 'default';
const keys = ['leaderboard','buzz','startGame','waitingForPlayers','surpriseQuestion','surpriseMechanicWheel','surpriseMechanicTable','prizeTitle','roundComplete','gameOver','finalStandings'];
export const PACK_THEMES = {
 default: { avatars: ANIMAL_AVATARS, normal: ['❔'], surprise: ['🍿','🎉','🥳','🎁','🍾','🎂','✨','🪄'], copy: {} },
 halloween: { avatars: ['🎃','🦇','🕷️','🕸️','☠️','🧛','🧟','🍬','🔮','👽','🌕','🐈‍⬛','🧚','😈','🧙‍♂️'], normal: ['👻'], surprise: ['🍬','🍭','🍫','🍩','🍪','🧁','🍰','🍮'], copy: Object.fromEntries(keys.map(key => [key, 'halloween_' + key])), palette: { background: '#160F20', glow: '#2B163D', surface: '#24162F', raised: '#342044', border: '#69447E', accent: '#F97316', hover: '#FB923C', secondary: '#C084FC', text: '#FFF7ED', muted: '#D8C7E3', positive: '#BEF264' }, categoryShadow: '0 .08em 0 #160F20, 0 0 1.4rem #C084FC66' }
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
