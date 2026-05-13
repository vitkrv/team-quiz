export const generateRoomCode = () => Math.floor(100000 + Math.random() * 900000).toString();
export const generateId = () => Math.random().toString(36).substring(2, 9);
