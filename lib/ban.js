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

/* Durees proposees par la fiche (minutes ; null : sans fin). */
export const DUREES = [
	{ id: "1h", libelle: "1 heure", minutes: 60 },
	{ id: "24h", libelle: "24 heures", minutes: 1440 },
	{ id: "7j", libelle: "7 jours", minutes: 10080 },
	{ id: "sans-fin", libelle: "Sans fin", minutes: null },
];
export const DUREE_PAR_DEFAUT = "1h";

/* Masque d'un ban pose depuis la fiche : ~time:N:~account:X, ou ~account:X. */
export function masqueBan(compte, duree) {
	let d = DUREES.find((x) => x.id === duree);
	if (!d || !compte) {
		return null;
	}
	let masque = "~account:" + compte;
	return d.minutes === null ? masque : "~time:" + d.minutes + ":" + masque;
}

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
	let compte = compteBanni(sansDuree(masque || ""));
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
 * Le KICK qui accompagne un ban (lot C) : celui de la meme personne par le
 * meme auteur, juste avant la ligne (la fiche expulse puis bannit, comme
 * AuraBot). null s'il n'y en a pas parmi les trois messages precedents.
 */
export function kickDuBan(messages, jusqua, auteur, cible, cm) {
	for (let i = jusqua - 1; i >= 0 && i >= jusqua - 3; i--) {
		let msg = messages[i];
		if (msg.command === "KICK" && msg.prefix && msg.params[1]
			&& cm(msg.prefix.name) === cm(auteur) && cm(msg.params[1]) === cm(cible)) {
			return msg;
		}
	}
	return null;
}

/*
 * Masque d'adresse d'UnrealIRCd (cloak-method ip) : quatre segments, trois
 * empreintes hexadecimales et « IP », « 1169710B.3A7DD2AE.E66AA06A.IP ». Un
 * segment peut etre remplace par un joker (« *.3A7DD2AE.E66AA06A.IP »).
 */
const MASQUE_ADRESSE = /^(?:[0-9A-F]+|\*)\.(?:[0-9A-F]+|\*)\.(?:[0-9A-F]+|\*)\.IP$/i;
/* Hote virtuel du reseau (vhost de HostSync ou d'un bloc oper). */
const VHOST = /^(?:[a-z0-9-]+\.)*aurasync\.fr$/i;

/*
 * Ce qu'on peut ecrire d'un masque, partout dans le fork (D-068, point 6) :
 * - `~account:X` → « le compte X » ;
 * - `X!*@*` → « le pseudo X » ;
 * - un masque d'adresse ou un vhost du reseau → le masque tel quel, comme
 *   le WHOIS le montre a tous (note du 7 novembre sur D-066) ;
 * - `*!*@*` → « tout le monde » ;
 * - une IP litterale, un hote non masque, tout ce qu'on ne reconnait pas →
 *   « une adresse » : jamais affiche, a personne ;
 * - un autre ban etendu (`~text:`, `~country:`…) → « une règle particulière ».
 * La temporisation `~time:N:` et les enveloppes `~quiet:`, `~join:`,
 * `~nickchange:` sont retirees d'abord.
 * Rend { texte, genre, nom } : `nom` est le compte ou le pseudo, s'il y en a.
 */
export function libelleMasque(masque) {
	let m = sansDuree(masque || "").replace(/^~(?:quiet|q|join|j|nickchange|n):/, "");
	let compte = compteBanni(m);
	if (compte) {
		return { texte: "le compte " + compte, genre: "compte", nom: compte };
	}
	if (m.startsWith("~")) {
		return { texte: "une règle particulière", genre: "regle", nom: null };
	}
	let p = /^([^!@\s]+)!([^@\s]+)@(\S+)$/.exec(m);
	if (!p) {
		let seul = /^([^!@*?\s~]+)$/.exec(m);
		if (seul) {
			return { texte: "le pseudo " + seul[1], genre: "pseudo", nom: seul[1] };
		}
		return { texte: "une adresse", genre: "adresse", nom: null };
	}
	let [, pseudo, ident, hote] = p;
	if (hote === "*" && ident === "*") {
		if (pseudo === "*") {
			return { texte: "tout le monde", genre: "tous", nom: null };
		}
		if (!/[*?]/.test(pseudo)) {
			return { texte: "le pseudo " + pseudo, genre: "pseudo", nom: pseudo };
		}
	}
	if (MASQUE_ADRESSE.test(hote) || VHOST.test(hote)) {
		return { texte: m, genre: "masque", nom: null };
	}
	return { texte: "une adresse", genre: "adresse", nom: null };
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
