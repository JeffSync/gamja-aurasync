/*
 * Ligne MODE +b / -b d'un salon : qui est banni (D-062).
 *
 * Le masque brut ne s'affiche jamais : « *!*@1169710B.3A7DD2AE.E66AA06A.IP »
 * ne dit rien a personne, et montre l'adresse masquee. On nomme la personne
 * quand le masque la designe, sinon « une adresse ».
 *
 * Masques rencontres :
 * - AuraBot (kickers, D-062) : *!*@hote, l'hote masque (BANTYPE 2) ;
 * - floodprot d'UnrealIRCd : ~time:N:*!*@hote (ou ~t:N:) ;
 * - l'equipe : pseudo!*@*, *!*@hote, ~account:Pseudo (le pseudo est celui
 *   du compte, D-033).
 * Les mutismes (~quiet:) sont traites a part (lib/mutisme.js, D-059).
 *
 * Logique pure, sans DOM : teste par test/ban.test.js.
 */

/* Retire une temporisation ~time:N: (ou ~t:N:) devant le masque. */
function sansDuree(masque) {
	return masque.replace(/^~(?:time|t):\d+:/, "");
}

/* Compte d'un ban ~account:Pseudo (ou ~a:), ou null. */
function compteBanni(masque) {
	let m = /^~(?:account|a):([^\s:*?]+)$/.exec(masque);
	return m ? m[1] : null;
}

/* Masque a jokers (* et ?) en expression, sans tenir compte de la casse. */
function versRegex(masque) {
	let echappe = masque.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp("^" + echappe + "$", "i");
}

/*
 * Vrai si le masque `nick!user@host` designe `pseudo`, dont la fiche `p`
 * ({ username, hostname }) peut manquer. Un ident ou un hote inconnu est
 * vide : seul un joker le couvre (« kahen!*@* »), jamais un hote precis.
 * Un ban etendu (~country:…) commence par « ~ » et ne correspond donc a
 * personne.
 */
export function correspond(masque, pseudo, p = {}) {
	if (!pseudo) {
		return false;
	}
	let cible = pseudo + "!" + (p.username || "") + "@" + (p.hostname || "");
	return versRegex(sansDuree(masque || "")).test(cible);
}

/*
 * Pseudo designe par un masque de ban, ou null (« une adresse »).
 * - `expulses` : pseudos expulses du salon avant cette ligne, du plus
 *   recent au plus ancien. Le premier qui correspond l'emporte : c'est le
 *   ban qu'AuraBot pose avec sa troisieme expulsion ;
 * - `presents` : pseudos connus du salon. Retenu seulement si un seul
 *   correspond : deux personnes derriere la meme adresse, c'est « une
 *   adresse » ;
 * - `personne(pseudo)` : { username, hostname }, ou undefined.
 */
export function cibleBan(masque, { expulses = [], presents = [], personne }) {
	let compte = compteBanni(masque || "");
	if (compte) {
		return compte;
	}
	for (let pseudo of expulses) {
		if (correspond(masque, pseudo, personne(pseudo))) {
			return pseudo;
		}
	}
	let trouves = presents.filter((pseudo) => correspond(masque, pseudo, personne(pseudo)));
	return trouves.length === 1 ? trouves[0] : null;
}

/*
 * Pseudos expulses dans `messages` avant l'indice `jusqua` (exclu), du plus
 * recent au plus ancien, sans doublon.
 */
export function expulsesAvant(messages, jusqua) {
	let vus = new Set();
	let liste = [];
	for (let i = jusqua - 1; i >= 0; i--) {
		let msg = messages[i];
		if (msg.command !== "KICK" || !msg.params || !msg.params[1]) {
			continue;
		}
		let pseudo = msg.params[1];
		if (!vus.has(pseudo.toLowerCase())) {
			vus.add(pseudo.toLowerCase());
			liste.push(pseudo);
		}
	}
	return liste;
}

/*
 * Verbe de la ligne, entre l'auteur et la personne : « a banni » Kahen,
 * « a levé le ban de » Kahen. Sans personne, la phrase est complete : « a
 * banni une adresse », « a levé le ban d'une adresse ».
 */
export function verbeBan(plusMoins, cible) {
	if (plusMoins === "+") {
		return cible ? "a banni" : "a banni une adresse";
	}
	return cible ? "a levé le ban de" : "a levé le ban d'une adresse";
}
