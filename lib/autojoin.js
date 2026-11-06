/*
 * Salons rejoints a la connexion (D-065).
 *
 * La liste vient du config.json servi par l'API : #AuraSync puis les salons
 * choisis sur /tchat, enregistres sur le compte. Elle gagne toujours, meme
 * avec une connexion memorisee : le t'Chat ne rejoint plus les salons de sa
 * memoire (gamja_buffers), ni ceux d'un ?channels= ou d'un #salon dans
 * l'adresse. Les conversations privees de la session, elles, sont rouvertes.
 *
 * Un salon jamais enregistre sur le compte (#addictions, article 9 du RGPD)
 * passe par une cle a usage unique du navigateur, posee par /tchat juste
 * avant l'ouverture et effacee ici a la lecture.
 */

export const ONE_SHOT_KEY = "aurasync_tchat_ouverture";

/* Les seuls salons admis par la cle : ceux que le compte ne retient jamais
 * (remember: false dans apps/api/src/config/tchat-channels.ts).
 *
 * Ce n'est PAS l'indicateur `sensible` (D-066) : #abus est sensible mais
 * retenu sur le compte, et la cle se lit a la connexion, avant le catalogue
 * de l'API. En deriver la liste changerait ce qu'elle admet. */
export const ONE_SHOT_CHANNELS = ["#addictions"];

/* Casse ASCII seule, comme UnrealIRCd pour les noms de salon. */
function asciiLower(s) {
	return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/* L'autojoin du config.json : tableau ou chaine, chaines seulement. */
export function configAutojoin(value) {
	if (typeof value === "string") {
		return value ? [value] : [];
	}
	if (Array.isArray(value)) {
		return value.filter((c) => typeof c === "string" && c);
	}
	return [];
}

/*
 * Lit et efface la cle a usage unique. `getStorage` rend le stockage ;
 * il peut lever (navigation privee, stockage bloque). Ne rend que des salons de
 * ONE_SHOT_CHANNELS, sous leur nom canonique.
 */
export function takeOneShot(getStorage) {
	let raw;
	try {
		let storage = getStorage();
		raw = storage.getItem(ONE_SHOT_KEY);
		storage.removeItem(ONE_SHOT_KEY);
	} catch {
		return [];
	}
	let list;
	try {
		list = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(list)) {
		return [];
	}
	let wanted = new Set(list.filter((c) => typeof c === "string").map((c) => asciiLower(c.normalize("NFC"))));
	return ONE_SHOT_CHANNELS.filter((c) => wanted.has(asciiLower(c)));
}

/* Les salons de la connexion : ceux du config.json, puis ceux de la cle. */
export function connectAutojoin(fromConfig, oneShot) {
	let seen = new Set(fromConfig.map(asciiLower));
	return fromConfig.concat(oneShot.filter((c) => !seen.has(asciiLower(c))));
}

/*
 * Tampons de la memoire a rouvrir a la connexion : les conversations
 * privees seulement. Les salons viennent du compte, pas de la memoire.
 */
export function buffersToRestore(buffers, isChannel) {
	let names = [];
	for (let buf of buffers) {
		if (buf.name === "*" || buf.closed || isChannel(buf.name)) {
			continue;
		}
		names.push(buf.name);
	}
	return names;
}
