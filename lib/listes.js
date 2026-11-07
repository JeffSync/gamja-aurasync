/*
 * Les listes du menu « Réglages » (etape 5, lot C, D-068 points 5 et 6) :
 * bannissements, personnes muettes, exemptions, invitations permanentes.
 *
 * - Lecture : 367/368 (b), 348/349 (e), 346/347 (I), par client.fetchListe ;
 *   jamais dans le fil. Puis les MODE recus pendant que le menu est ouvert.
 * - Chaque entree : qui (libelleMasque, jamais une adresse reelle), l'auteur
 *   (coupe au « ! »), la date, l'echeance d'un ~time:N:, « anti-flood ».
 * - Retirer renvoie le masque EXACT recu, jamais un masque recalcule.
 * - Un ban se pose depuis la fiche (motif et duree), jamais d'ici.
 *
 * Module pur, sans DOM : teste par test/listes.test.js.
 */

import { libelleMasque } from "./ban.js";
export { DUREES, DUREE_PAR_DEFAUT, masqueBan } from "./ban.js";
import { commandesParole, pseudoMuet } from "./mutisme.js";
import { estServeur, nomServeur } from "./serveur.js";

export const TITRES = {
	bans: "Bannissements",
	muets: "Personnes muettes",
	exemptions: "Exemptions",
	invitations: "Invitations permanentes",
};
export const VIDES = {
	bans: "Aucun bannissement.",
	muets: "Aucune personne muette.",
	exemptions: "Aucune exemption.",
	invitations: "Aucune invitation permanente.",
};
export const LECTURE_LISTE = "Lecture de la liste…";
export const LISTE_ILLISIBLE = "La liste n'a pas pu être lue.";
/* Lettre de chaque rubrique : les muets sont des ~quiet: de la liste b (D-059). */
export const LETTRES = { bans: "b", muets: "b", exemptions: "e", invitations: "I" };

/* Robot des kickers (D-062) ; le serveur signe les bans de floodprot. */
const ROBOTS = ["aurabot"];

/* Une entree de liste, d'apres un 367, 348 ou 346 : [moi, salon, masque, auteur, date]. */
export function lireEntree(msg) {
	let p = msg.params;
	let date = Number(p[4]);
	return { masque: p[2], auteur: p[3] || null, date: Number.isFinite(date) && date > 0 ? date : null };
}

/* Minutes d'un ~time:N: en tete du masque, ou null. */
export function minutesBan(masque) {
	let m = /^~(?:time|t):(\d+):/.exec(masque || "");
	return m ? Number(m[1]) : null;
}

/* « 1 heure », « 24 heures », « 7 jours », « 10 minutes »… */
export function libelleDuree(minutes) {
	let accord = (n, un, plusieurs) => n + " " + (n > 1 ? plusieurs : un);
	if (minutes % 1440 === 0 && minutes > 1440) {
		return accord(minutes / 1440, "jour", "jours");
	}
	if (minutes % 60 === 0) {
		return accord(minutes / 60, "heure", "heures");
	}
	return accord(minutes, "minute", "minutes");
}

const PARIS = "Europe/Paris";
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS });
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: PARIS });
const JOUR_AN = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: PARIS });
const CLE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: PARIS });
const AN = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: PARIS });

function jour(d, maintenant) {
	let fmt = AN.format(d) === AN.format(maintenant) ? JOUR : JOUR_AN;
	return fmt.format(d).replace(/^1 /, "1er ");
}

/* « aujourd'hui à 14:02 », « le 6 novembre à 14:02 » (annee si elle differe). */
export function dateEntree(secondes, maintenant) {
	if (!secondes) {
		return null;
	}
	let d = new Date(secondes * 1000);
	if (CLE.format(d) === CLE.format(maintenant)) {
		return "aujourd'hui à " + HEURE.format(d);
	}
	return "le " + jour(d, maintenant) + " à " + HEURE.format(d);
}

/* « jusqu'à 15:02 » aujourd'hui, sinon « jusqu'au 8 novembre à 15:02 ». */
export function echeance(secondes, minutes, maintenant) {
	if (!secondes || minutes === null) {
		return null;
	}
	let fin = new Date((secondes + minutes * 60) * 1000);
	if (CLE.format(fin) === CLE.format(maintenant)) {
		return "jusqu'à " + HEURE.format(fin);
	}
	return "jusqu'au " + jour(fin, maintenant) + " à " + HEURE.format(fin);
}

/* L'auteur, pseudo seul : set::ban-setter peut donner pseudo!ident@hote. */
export function auteurEntree(auteur) {
	if (!auteur) {
		return null;
	}
	let pseudo = auteur.split("!")[0];
	return estServeur(pseudo) ? nomServeur() : pseudo;
}

/* Les ~quiet: (eventuellement temporises) sont des mutismes, pas des bans. */
export function estMutisme(masque) {
	return /^(?:~(?:time|t):\d+:)?~(?:quiet|q):/.test(masque || "");
}

/* « Compte Kahen », « Pseudo Kahen », sinon le libelle de la fiche. */
function qui(masque) {
	let l = libelleMasque(masque);
	if (l.genre === "compte") {
		return "Compte " + l.nom;
	}
	if (l.genre === "pseudo") {
		return "Pseudo " + l.nom;
	}
	return l.texte.charAt(0).toUpperCase() + l.texte.slice(1);
}

/*
 * Ce que le menu montre d'une entree : { masque, qui, auteur, date,
 * echeance, antiflood, muet }. `qui` vient de libelleMasque : jamais une IP
 * litterale ni un hote non masque.
 */
export function vueEntree(entree, maintenant = new Date()) {
	let pseudo = entree.auteur ? entree.auteur.split("!")[0] : "";
	return {
		masque: entree.masque,
		qui: qui(entree.masque),
		auteur: auteurEntree(entree.auteur),
		date: dateEntree(entree.date, maintenant),
		echeance: echeance(entree.date, minutesBan(entree.masque), maintenant),
		antiflood: Boolean(pseudo) && (ROBOTS.includes(pseudo.toLowerCase()) || estServeur(pseudo)),
		muet: estMutisme(entree.masque),
	};
}

/*
 * Les rubriques a montrer, dans l'ordre, avec leurs entrees ; une liste
 * encore en lecture vaut null, illisible vaut « erreur ».
 * - bannissements et muets : % et @ ;
 * - exemptions : @ seulement ;
 * - invitations permanentes : seulement si le salon est +i.
 */
export function rubriques(listes, rang, modes) {
	listes = listes || {};
	let b = listes.b;
	let sortie = [];
	let filtre = (garde) => (Array.isArray(b) ? b.filter((e) => garde(estMutisme(e.masque))) : b);
	sortie.push({ id: "bans", lettre: "b", entrees: filtre((m) => !m) });
	sortie.push({ id: "muets", lettre: "b", entrees: filtre((m) => m) });
	if (rang === "@") {
		sortie.push({ id: "exemptions", lettre: "e", entrees: listes.e });
	}
	if (modes && "i" in modes) {
		sortie.push({ id: "invitations", lettre: "I", entrees: listes.I });
	}
	return sortie;
}

/* Les listes a lire a l'ouverture : b toujours, e pour un @, I si +i. */
export function listesALire(rang, modes) {
	let l = ["b"];
	if (rang === "@") {
		l.push("e");
	}
	if (modes && "i" in modes) {
		l.push("I");
	}
	return l;
}

/*
 * Une liste apres un MODE recu : ajout (sans doublon) ou retrait du masque.
 * Le serveur compare les masques sans tenir compte de la casse.
 */
export function appliquerListe(liste, ajoute, masque, auteur, date) {
	if (!Array.isArray(liste) || !masque) {
		return liste;
	}
	let meme = (e) => e.masque.toLowerCase() === masque.toLowerCase();
	if (ajoute) {
		return liste.some(meme) ? liste : [...liste, { masque, auteur, date }];
	}
	return liste.filter((e) => !meme(e));
}

/*
 * Retirer une entree : le masque exact du 367/348/346. Pour un mutisme, la
 * personne est prevenue (D-059) : `notice` part apres l'echo seulement.
 * Rend { mode, notice } ; notice null si le masque ne nomme personne.
 */
export function commandesRetrait(salon, lettre, masque) {
	let mode = { command: "MODE", params: [salon, "-" + lettre, masque] };
	let notice = null;
	if (lettre === "b" && estMutisme(masque)) {
		let pseudo = pseudoMuet(masque);
		if (pseudo) {
			notice = commandesParole(salon, pseudo, masque)[1];
		}
	}
	return { mode, notice };
}

/* Un pseudo du t'Chat (RFC 2812), comme la route de la fiche. */
const PSEUDO = /^[A-Za-z[\]\\`_^{|}][A-Za-z0-9[\]\\`_^{|}-]{0,31}$/;

/* Exempter (e) ou inviter en permanence (I) un compte : MODE, ou null. */
export function commandeAjout(salon, lettre, pseudo) {
	let p = (pseudo || "").trim();
	if (!["e", "I"].includes(lettre) || !PSEUDO.test(p)) {
		return null;
	}
	return { command: "MODE", params: [salon, "+" + lettre, "~account:" + p] };
}

/* « 12 / 60 » : entrees de la lettre (b compte bans et muets ensemble). */
export function compteur(listes, lettre, max) {
	let l = listes && listes[lettre];
	if (!Array.isArray(l)) {
		return null;
	}
	return max ? `${l.length} / ${max}` : String(l.length);
}
