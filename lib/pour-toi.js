/*
 * Ce qui est « pour toi » dans le t'Chat (D-066, points 5 et 6) : les
 * mentions de ton pseudo dans un salon et les messages prives recus. Le
 * rose leur est reserve.
 *
 * - un message recu se classe ici (natureMessage), une seule fois ;
 * - chaque conversation compte ce qui est pour toi et non lu (buf.pourToi),
 *   remis a zero a la lecture ;
 * - la barre en tire ses marques : un point pour le non-lu, un badge rose
 *   « @n » pour les mentions, un nombre rose pour les messages prives ;
 * - une categorie repliee montre le total de ce qu'elle cache, et le
 *   bouton ☰ du mobile le total de ce qui est pour toi.
 *
 * L'historique rejoue (D-062) et l'accueil d'un salon ne comptent jamais.
 *
 * Module pur, sans DOM : teste par test/pour-toi.test.js.
 */

import { BufferType, Unread } from "../state.js";

/*
 * Un message recu, classe : { unread, pourToi }. `pourToi` vaut
 * "mention", "prive" ou null.
 * - deMoi : le message vient de soi (un autre onglet, l'echo) ;
 * - versMoi : il est adresse a son propre pseudo (message prive) ;
 * - dejaLu : il precede l'accuse de lecture enregistre.
 */
export function natureMessage(msg, { deMoi = false, versMoi = false, dejaLu = false } = {}) {
	let rien = { unread: Unread.NONE, pourToi: null };
	if (msg.command !== "PRIVMSG" && msg.command !== "NOTICE") {
		return rien;
	}
	if (deMoi || dejaLu || msg.accueil || msg.historique) {
		return rien;
	}
	if (msg.isHighlight) {
		return { unread: Unread.HIGHLIGHT, pourToi: "mention" };
	}
	if (versMoi) {
		return { unread: Unread.HIGHLIGHT, pourToi: "prive" };
	}
	return { unread: Unread.MESSAGE, pourToi: null };
}

/*
 * Ce qui est pour toi parmi les messages d'une conversation, en partant des
 * plus recents et jusqu'au premier deja lu : pour recompter apres un accuse
 * de lecture venu d'un autre appareil (MARKREAD).
 * - prive : la conversation est un message prive ;
 * - deMoi(nom), dejaLu(msg) : comme pour natureMessage.
 */
export function compterPourToi(messages, { prive, deMoi, dejaLu }) {
	let n = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		let msg = messages[i];
		if (msg.command !== "PRIVMSG" && msg.command !== "NOTICE") {
			continue;
		}
		if (dejaLu(msg)) {
			break;
		}
		let nature = natureMessage(msg, { deMoi: deMoi(msg.prefix.name), versMoi: prive });
		if (nature.pourToi) {
			n++;
		}
	}
	return n;
}

/*
 * Nombre a afficher pour une conversation. Apres un rechargement, l'etat
 * « mention » revient de la memoire du navigateur sans son compte : on
 * montre alors 1 plutot que rien.
 */
export function nombrePourToi(buf) {
	if (buf.unread !== Unread.HIGHLIGHT) {
		return 0;
	}
	return Math.max(buf.pourToi || 0, 1);
}

function pluriel(n, un, plusieurs) {
	return n + " " + (n > 1 ? plusieurs : un);
}

/*
 * La marque d'une conversation dans la barre, ou null :
 * { genre: "point" | "mention" | "prive", texte, label }.
 */
export function marqueBarre(buf) {
	if (buf.type === BufferType.SERVER) {
		return null;
	}
	if (buf.unread === Unread.HIGHLIGHT) {
		let n = nombrePourToi(buf);
		if (buf.type === BufferType.NICK) {
			return { genre: "prive", texte: String(n), label: pluriel(n, "message privé non lu", "messages privés non lus") };
		}
		return { genre: "mention", texte: "@" + n, label: pluriel(n, "mention", "mentions") };
	}
	if (buf.unread === Unread.MESSAGE) {
		return { genre: "point", texte: "", label: "Nouveaux messages" };
	}
	return null;
}

/*
 * Ce que cache une categorie repliee : le nombre de conversations a lire,
 * rose s'il y a une mention ou un message prive parmi elles. null si rien.
 */
export function totalCategorie(buffers) {
	let aLire = 0, pourToi = 0;
	for (let buf of buffers) {
		let marque = marqueBarre(buf);
		if (!marque) {
			continue;
		}
		aLire++;
		if (marque.genre !== "point") {
			pourToi += nombrePourToi(buf);
		}
	}
	if (aLire === 0) {
		return null;
	}
	let label = pluriel(aLire, "conversation à lire", "conversations à lire");
	if (pourToi > 0) {
		label += ", dont " + pluriel(pourToi, "message", "messages") + " pour toi";
	}
	return { texte: String(aLire), rose: pourToi > 0, label };
}

/* Total des mentions et des messages prives non lus : la pastille de ☰. */
export function totalPourToi(buffers) {
	let n = 0;
	for (let buf of buffers) {
		if (buf.type !== BufferType.SERVER) {
			n += nombrePourToi(buf);
		}
	}
	return n;
}

export function libellePourToi(n) {
	return pluriel(n, "message pour toi", "messages pour toi");
}

/*
 * Decoupe un texte selon les occurrences de son pseudo ([debut, fin], de
 * irc.highlightRanges) : [{ texte, moi }], dans l'ordre, sans morceau vide.
 */
export function segmentsMarques(texte, marques) {
	let segments = [];
	let pos = 0;
	for (let [debut, fin] of marques || []) {
		if (debut < pos || fin > texte.length || fin <= debut) {
			continue;
		}
		if (debut > pos) {
			segments.push({ texte: texte.slice(pos, debut), moi: false });
		}
		segments.push({ texte: texte.slice(debut, fin), moi: true });
		pos = fin;
	}
	if (pos < texte.length) {
		segments.push({ texte: texte.slice(pos), moi: false });
	}
	return segments;
}
