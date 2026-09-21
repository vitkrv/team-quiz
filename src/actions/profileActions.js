import { doc, setDoc } from 'firebase/firestore';
import { appId, db } from '../firebase';

export async function saveUsername(userId, value) {
    const username = value.trim();
    if (!username || username.length > 18) throw new Error('Invalid username');
    await setDoc(doc(db, 'artifacts', appId, 'users', userId), {
        username, updatedAt: Date.now()
    }, { merge: true });
    return username;
}
