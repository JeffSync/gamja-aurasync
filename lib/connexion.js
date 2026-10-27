/*
 * Decisions de connexion du t'Chat, sans DOM : teste par
 * test/connexion.test.js. lib/client.js et components/app.js les appliquent.
 *
 * - fin annoncee par un ERROR du serveur : definitive (kill, ban reseau,
 *   flood, identification refusee…) ou simple coupure (Ping timeout…) ;
 * - fermeture du WebSocket : quelle banniere, sans ecraser l'ERROR ;
 * - pseudo deja pris a l'enregistrement : combien d'essais (D-033 : le
 *   pseudo est celui du compte, on ne le change jamais) ;
 * - sanction depuis le menu pseudo : motif obligatoire (D-058, D-059).
 */

import { translateClosing, raisonFin, CONNEXION_PERDUE } from "./irc-errors.js";
import { commandesMuet } from "./mutisme.js";
import { RESTREINT } from "./shun.js";

export const MAX_ESSAIS_PSEUDO = 3;
export const DELAI_ESSAI_PSEUDO = 3000;
export const DEJA_CONNECTE = "Tu es déjà connecté(e) au t'Chat dans un autre onglet.";

/*
 * Fins que le serveur annonce mais qui ne sont qu'une coupure : on se
 * reconnecte. Textes d'UnrealIRCd 6.2.7 (ircd.c, socket.c, send.c). Toute
 * autre fin est definitive : un ban ou un kill ne doit pas boucler.
 */
const COUPURES = [
	/^Ping timeout/,
	/^Registration Timeout/,
	/^Read error/,
	/^Write error/,
	/^Connection closed/,
	/^Connection reset by peer/,
];

/*
 * Fin annoncee par un ERROR. Renvoie { reconnecter, message, bouton } :
 * message traduit (D-056), bouton de l'ecran de fin quand on ne se
 * reconnecte pas.
 */
export function finServeur(texte) {
	let raison = raisonFin(texte);
	if (COUPURES.some((motif) => motif.test(raison))) {
		return { reconnecter: true, message: CONNEXION_PERDUE, bouton: null };
	}
	return { reconnecter: false, message: translateClosing(texte), bouton: "Se reconnecter" };
}

/*
 * Identification SASL refusee. `err` (IRCError 904…) est traduite a
 * l'affichage, par displayError.
 */
export function finIdentification(err) {
	return { reconnecter: false, message: err, bouton: "Se reconnecter" };
}

/* Pseudo encore pris apres tous les essais. */
export function finPseudoPris() {
	return { reconnecter: false, message: DEJA_CONNECTE, bouton: "Réessayer" };
}

/*
 * Shun reconnu a la connexion (lib/shun.js, shunInscription) : ecran de fin,
 * sans reconnexion automatique, qui ne ferait que boucler.
 */
export function finRestreint() {
	return { reconnecter: false, message: RESTREINT, bouton: "Réessayer" };
}

/*
 * Delai avant la reconnexion automatique numero `essai` (0 pour la
 * premiere) depuis le dernier enregistrement reussi : 10 s, 30 s, puis
 * double a chaque essai, plafond 10 min. Le connect-flood d'UnrealIRCd
 * refuse une 4e connexion d'une meme IP en 60 s (conf.c : 3 par 60 s,
 * « Throttled ») : ce calendrier n'en fait jamais plus de 3 par 60 s,
 * premiere connexion comprise. Le compteur ne repart a zero qu'au 001 : une
 * connexion ouverte puis refusee avant l'enregistrement ne le remet pas a
 * zero.
 */
export const DELAI_RECONNEXION_MIN = 10 * 1000;
export const DELAI_RECONNEXION_MAX = 10 * 60 * 1000;

export function delaiReconnexion(essai) {
	if (essai <= 0) {
		return DELAI_RECONNEXION_MIN;
	}
	return Math.min(30 * 1000 * 2 ** (essai - 1), DELAI_RECONNEXION_MAX);
}

/*
 * Fermeture du WebSocket. `reconnexion` : le client va se reconnecter.
 * Renvoie le texte de la banniere, ou null pour ne rien afficher. Un ERROR
 * definitif coupe la reconnexion avant la fermeture : celle-ci se tait, et
 * n'ecrase pas son message.
 */
export function apresFermeture({ reconnexion }) {
	if (reconnexion) {
		return CONNEXION_PERDUE;
	}
	/* Fin annoncee, ou fermeture voulue par le client : deja dit. */
	return null;
}

/*
 * 433 a l'enregistrement : delai avant de redemander le meme pseudo, ou
 * null quand les essais sont epuises. `essais` : essais deja faits.
 */
export function reessaiPseudo(essais) {
	return essais < MAX_ESSAIS_PSEUDO ? DELAI_ESSAI_PSEUDO : null;
}

/* Le motif d'une sanction : texte non vide (D-058). */
export function motifValide(motif) {
	return typeof motif === "string" && motif.trim().length > 0;
}

/*
 * Messages a envoyer pour une sanction du menu pseudo, motif compris.
 * null sans motif : rien ne part. MODE ne porte pas de motif : c'est le
 * KICK qui le livre au membre, ou une NOTICE pour le mutisme (D-059).
 * `cible` : statut du membre vise dans le salon (« + », « % »…).
 */
export function commandesSanction(action, salon, pseudo, motif, cible) {
	if (!motifValide(motif)) {
		return null;
	}
	motif = motif.trim();
	switch (action) {
	case "kick":
		return [{ command: "KICK", params: [salon, pseudo, motif] }];
	case "ban":
		return [
			{ command: "MODE", params: [salon, "+b", pseudo + "!*@*"] },
			{ command: "KICK", params: [salon, pseudo, motif] },
		];
	case "mute":
		return commandesMuet(salon, pseudo, motif, cible);
	}
	return null;
}

/* Actions du menu pseudo qui demandent un motif. */
export function demandeMotif(action) {
	return action === "kick" || action === "ban" || action === "mute";
}
