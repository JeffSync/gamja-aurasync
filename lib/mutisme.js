/*
 * Mutisme de salon (D-059), sans DOM : teste par test/mutisme.test.js.
 * components/app.js, nick-menu.js et buffer.js les appliquent.
 *
 * Un MODE n'a pas de champ de raison : le motif part dans une NOTICE au
 * membre, juste apres le MODE +b ~quiet:. La levee le previent aussi.
 * Cote membre, cette NOTICE arrive d'un pseudo ordinaire sans conversation
 * ouverte : Gamja la rangerait dans l'onglet serveur, masque (D-012). On la
 * reconnait a son texte, et on la range dans le salon qu'elle nomme, si son
 * auteur y est moderateur.
 */

import { motifValide } from "./connexion.js";

/* Masque pose par le t'Chat. UnrealIRCd 6 accepte ~q: et ecrit ~quiet:. */
export function masqueMuet(pseudo) {
	return "~quiet:" + pseudo + "!*@*";
}

export function noticeMuet(salon, motif) {
	return "Tu ne peux plus écrire dans " + salon + " : " + motif;
}

export function noticeParole(salon) {
	return "Tu peux de nouveau écrire dans " + salon + ".";
}

/*
 * NOTICE de sanction : le tag +draft/channel-context (module channel-context
 * d'UnrealIRCd) la rattache au salon pour les clients qui le lisent.
 */
function notice(salon, pseudo, texte) {
	return { tags: { "+draft/channel-context": salon }, command: "NOTICE", params: [pseudo, texte] };
}

/*
 * Rendre muet : null sans motif, rien ne part (D-058). UnrealIRCd ne
 * soumet pas au ~quiet un membre qui a la voix (message.c : « vhoaq ») :
 * on la lui retire, sinon la notice mentirait. `cible` : son statut.
 */
export function commandesMuet(salon, pseudo, motif, cible) {
	if (!motifValide(motif)) {
		return null;
	}
	let msgs = [];
	if (cible && cible.includes("+")) {
		msgs.push({ command: "MODE", params: [salon, "-v", pseudo] });
	}
	msgs.push(
		{ command: "MODE", params: [salon, "+b", masqueMuet(pseudo)] },
		notice(salon, pseudo, noticeMuet(salon, motif.trim())),
	);
	return msgs;
}

/* Rendre la parole : pas de motif, le membre est prevenu. */
export function commandesParole(salon, pseudo) {
	return [
		{ command: "MODE", params: [salon, "-b", masqueMuet(pseudo)] },
		notice(salon, pseudo, noticeParole(salon)),
	];
}

/*
 * Pseudo vise par un masque de mutisme pose sur un pseudo seul
 * (~quiet:Kahen!*@*, ou ~q: tape dans un client d'equipe), sinon null.
 * Un masque d'hote (~quiet:*!*@hote) ne nomme personne.
 */
export function pseudoMuet(masque) {
	let m = /^~(?:quiet|q):([^!@*?]+)!\*@\*$/.exec(masque || "");
	return m ? m[1] : null;
}

/* La liste des bans du salon rend-elle `pseudo` muet ? */
export function estMuet(masques, pseudo, cm) {
	return masques.some((masque) => {
		let cible = pseudoMuet(masque);
		return cible !== null && cm(cible) === cm(pseudo);
	});
}

const MUET = /^Tu ne peux plus écrire dans (#\S+) : (.+)$/;
const PAROLE = /^Tu peux de nouveau écrire dans (#\S+)\.$/;

/* Lit une NOTICE de mutisme : { salon, muet, motif } ou null. */
export function lireNotice(texte) {
	let m = MUET.exec(texte || "");
	if (m) {
		return { salon: m[1], muet: true, motif: m[2] };
	}
	m = PAROLE.exec(texte || "");
	if (m) {
		return { salon: m[1], muet: false, motif: null };
	}
	return null;
}

/* Rangs qui peuvent rendre muet : modérateur %, opérateur @ et au-dessus. */
export function peutRendreMuet(membership) {
	return Boolean(membership) && /[%@&~]/.test(membership);
}

/*
 * NOTICE recue : le salon ou la ranger, ou null. Seul un moderateur du salon
 * nomme peut l'y faire apparaitre : un membre ordinaire qui enverrait le
 * meme texte reste dans l'onglet serveur. `membreDe(salon, pseudo)` donne le
 * statut de l'auteur dans ce salon (undefined s'il n'y est pas).
 */
export function salonDeNotice(texte, auteur, membreDe) {
	let notice = lireNotice(texte);
	if (!notice || !peutRendreMuet(membreDe(notice.salon, auteur))) {
		return null;
	}
	return notice.salon;
}
