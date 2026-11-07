/*
 * Le menu « Réglages » d'un salon (etape 5, lot B, D-068 points 2 a 4) :
 * qui le voit, ce qu'il propose, ce qu'il envoie, et comment il lit la
 * reponse du serveur.
 *
 * - Seuls % et @ du salon ont le menu ; un oper sans rang n'en a pas.
 * - Verrous : ceux du catalogue (champ `locked` de l'API), unis aux lettres
 *   annoncees par un 742 pendant la session (buf.verrous).
 * - Un reglage verrouille n'est jamais envoye, meme sur un clic force.
 * - L'interrupteur ne bascule qu'a l'echo : l'etat affiche est buf.modes.
 *
 * Module pur, sans DOM : teste par test/salon-reglages.test.js.
 */

import * as irc from "./irc.js";
import { refusReglageReserve, translateError } from "./irc-errors.js";
import {
	ANTIFLOOD_ACTIF, HISTORIQUE_ACTIF, REGLAGES, lireFlood, lireHistorique, reglage, unirVerrous,
} from "./reglages.js";

export const LECTURE = "Lecture des réglages…";
export const EQUIPE = "Réglé par l'équipe du réseau";
export const RESERVE_OP = "Réservé aux opérateurs du salon";
export const PLUS_DE_RANG = "Tu n'as plus de rang dans ce salon.";
export const POUR_BANNIR = "Pour bannir quelqu'un : sa fiche, avec un motif.";
export const REBOND_SUJET = "SalonSync a rétabli le sujet : il est réglé par l'équipe du réseau.";
export const REBOND_STATUT = "SalonSync a retiré le statut : cette personne n'est pas dans la liste d'accès du salon.";
export const SANS_REPONSE = "Le serveur n'a pas répondu. Réessaie dans un instant.";
export const CONNEXION_PERDUE = "La connexion au t'Chat est coupée.";
/* Un rebond de SalonSync (KEEPTOPIC, SECUREOPS) suit l'echo de pres. */
export const DELAI_REBOND = 2000;
/* Nom de ChanServ, avant et apres la bascule d'Anope (D-061). */
const SERVICE_SALONS = ["salonsync", "chanserv"];

/* Les interrupteurs, dans l'ordre du menu. n disparait s'il est verrouille. */
export const BASCULES = ["t", "m", "c", "S", "n"];
/* En lecture, avec la phrase de la valeur reelle. */
export const LECTURES = ["f", "H"];
/* Une seule ligne grisee : jamais proposees sur un salon officiel. */
export const FERMES = ["i", "k", "l", "s"];
export const LIGNE_FERMES = {
	libelle: "Sur invitation, clé, limite, secret",
	phrase: "Un salon officiel reste ouvert à toutes les personnes.",
};

/* « @ » (gere le salon), « % » (le modere) ou null. Le + ne compte pas. */
export function rangSalon(membership) {
	if (!membership) {
		return null;
	}
	if (/[~&@]/.test(membership)) {
		return "@";
	}
	return membership.includes("%") ? "%" : null;
}

/* Lettres verrouillees : catalogue ∪ 742 de la session. */
export function verrousSalon(catalogue, session) {
	return unirVerrous(catalogue || "", session || "");
}

/*
 * Lettres annoncees par un 742 que le catalogue ne connait pas : le
 * catalogue est en retard sur un LOCK ADD. Rien a dire hors catalogue.
 */
export function horsCatalogue(catalogue, annoncees) {
	if (typeof catalogue !== "string") {
		return "";
	}
	return unirVerrous("", annoncees).split("").filter((l) => !catalogue.includes(l)).join("");
}

function majuscule(texte) {
	return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/* Valeur d'un reglage « Autres réglages actifs » : jamais la cle (k). */
function texteAutre(lettre, valeur) {
	let r = reglage(lettre);
	let libelle = r ? r.libelle : "Un réglage du salon";
	if (typeof valeur !== "string" || !valeur) {
		return libelle;
	}
	switch (lettre) {
	case "l":
		return `${libelle} : ${valeur} personnes`;
	case "L":
	case "F":
		return `${libelle} : ${valeur}`;
	}
	return libelle;
}

/*
 * Les lignes du menu, d'apres l'etat lu (buf.modes), les verrous et le rang
 * de la personne. Chaque interrupteur : { lettre, libelle, phrase, actif,
 * etat } ; etat « libre », « verrou » (Réglé par l'équipe) ou « reserve »
 * (c et S pour un %).
 */
export function lignesReglages(modes, verrous, rang) {
	modes = modes || {};
	verrous = verrous || "";
	let bascules = [];
	for (let lettre of BASCULES) {
		if (lettre === "n" && verrous.includes("n")) {
			continue;
		}
		let r = reglage(lettre);
		let etat = "libre";
		if (verrous.includes(lettre)) {
			etat = "verrou";
		} else if (r.rang === "@" && rang !== "@") {
			etat = "reserve";
		}
		bascules.push({ lettre, libelle: r.libelle, phrase: r.phrase, actif: lettre in modes, etat });
	}

	let lectures = LECTURES.map((lettre) => {
		let r = reglage(lettre);
		let texte = "Désactivé";
		if (lettre in modes) {
			let lu = lettre === "f" ? lireFlood(modes.f) : lireHistorique(modes.H);
			texte = lu ? majuscule(lu) : (lettre === "f" ? ANTIFLOOD_ACTIF : HISTORIQUE_ACTIF);
		}
		return { lettre, libelle: r.libelle, texte, actif: lettre in modes };
	});

	let montres = new Set([...bascules.map((b) => b.lettre), ...LECTURES]);
	let ordre = Object.keys(REGLAGES);
	let autres = Object.keys(modes)
		.filter((l) => !montres.has(l))
		.sort((a, b) => {
			let ia = ordre.indexOf(a), ib = ordre.indexOf(b);
			return (ia < 0 ? ordre.length : ia) - (ib < 0 ? ordre.length : ib);
		})
		.map((lettre) => ({ lettre, texte: texteAutre(lettre, modes[lettre]) }));

	return { bascules, lectures, fermes: LIGNE_FERMES, autres };
}

/*
 * Le MODE d'un geste, ou null : seuls les interrupteurs libres partent. Un
 * reglage verrouille, reserve a @ pour un %, ou hors du menu n'est jamais
 * envoye, quoi que dise l'interface.
 */
export function envoiMode(salon, lettre, modes, verrous, rang) {
	if (!rang || !BASCULES.includes(lettre)) {
		return null;
	}
	let ligne = lignesReglages(modes, verrous, rang).bascules.find((b) => b.lettre === lettre);
	if (!ligne || ligne.etat !== "libre") {
		return null;
	}
	return { command: "MODE", params: [salon, (ligne.actif ? "-" : "+") + lettre] };
}

/* Octets d'un texte en UTF-8 : TOPICLEN se compte en octets. */
export function octets(texte) {
	return new TextEncoder().encode(texte || "").length;
}

/* Le sujet tel qu'il partira : une ligne, sans retour a la ligne. */
export function sujetAEnvoyer(saisi) {
	return (saisi || "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/* Compteur et boutons du sujet. */
export function etatSujet(saisi, actuel, max) {
	let texte = sujetAEnvoyer(saisi);
	let n = octets(texte);
	let trop = n > max;
	let identique = texte === (actuel || "");
	return {
		texte,
		octets: n,
		max,
		trop,
		identique,
		peutChanger: texte !== "" && !trop && !identique,
		peutRetirer: Boolean(actuel),
	};
}

/* Le refus d'une reponse du serveur, en francais, ou null. */
export function lireRefus(msg) {
	if (msg.command === "NOTICE") {
		return refusReglageReserve(msg.params[msg.params.length - 1]);
	}
	if (msg.command === irc.ERR_MLOCKRESTRICTED || irc.isError(msg.command)) {
		return translateError(msg.command, msg.params[msg.params.length - 1]);
	}
	return null;
}

/*
 * Issue d'un envoi suivi (client.sendLabeled) :
 * - { refus, verrou } : refus du serveur, a montrer sous le reglage ; un
 *   742 grise aussi la ligne (state.js tient buf.verrous) ;
 * - { echo } : le serveur a applique le changement ;
 * - {} : rien a dire (ACK : deja dans cet etat ; ou pas de labeled-response).
 */
export function issueEnvoi(resultat) {
	switch (resultat && resultat.type) {
	case "delai":
		return { refus: SANS_REPONSE };
	case "fermeture":
		return { refus: CONNEXION_PERDUE };
	case "reponse":
		break;
	default:
		return {};
	}
	for (let msg of resultat.reponses) {
		let refus = lireRefus(msg);
		if (refus) {
			return { refus, verrou: msg.command === irc.ERR_MLOCKRESTRICTED };
		}
	}
	if (resultat.reponses.some((m) => m.command === "MODE" || m.command === "TOPIC")) {
		return { echo: true };
	}
	return {};
}

export function estServiceSalons(nick) {
	return typeof nick === "string" && SERVICE_SALONS.includes(nick.toLowerCase());
}

/* SalonSync remet le sujet du salon (KEEPTOPIC, ou sujet regle par l'equipe). */
export function rebondSujet(msg, salon, cm) {
	return msg.command === "TOPIC" && msg.prefix && estServiceSalons(msg.prefix.name)
		&& cm(msg.params[0]) === cm(salon);
}

/*
 * SalonSync retire le statut qu'on vient de donner (SECUREOPS). `changements`
 * : [{ mode, add, arg }] du MODE ; `modes` : lettres de rang guettees.
 */
export function rebondStatut(msg, changements, salon, cible, modes, cm) {
	if (msg.command !== "MODE" || !msg.prefix || !estServiceSalons(msg.prefix.name)) {
		return false;
	}
	if (cm(msg.params[0]) !== cm(salon)) {
		return false;
	}
	return changements.some((c) => !c.add && modes.includes(c.mode) && c.arg && cm(c.arg) === cm(cible));
}

/* « Salon créé le 12 mars 2026 », d'apres le 329 (secondes). */
export function dateCreation(secondes) {
	let n = Number(secondes);
	if (!Number.isFinite(n) || n <= 0) {
		return null;
	}
	let jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
		.format(new Date(n * 1000))
		.replace(/^1 /, "1er ");
	return "Salon créé le " + jour;
}

/*
 * Guette sur `cible` (le client : evenements « message ») un message qui
 * satisfait `test`, pendant `delai` ms. Resout true s'il arrive, false sinon.
 */
export function guetter(cible, test, delai = DELAI_REBOND) {
	return new Promise((resolve) => {
		let timeoutID;
		let ecoute = (event) => {
			if (test(event.detail.message)) {
				fin(true);
			}
		};
		let fin = (vu) => {
			clearTimeout(timeoutID);
			cible.removeEventListener("message", ecoute);
			resolve(vu);
		};
		timeoutID = setTimeout(() => fin(false), delai);
		cible.addEventListener("message", ecoute);
	});
}
