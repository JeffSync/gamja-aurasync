/*
 * Sanctions automatiques d'AuraBot dans les salons (D-062, anti-flood).
 *
 * Les kickers de BotSync, portes par AuraBot, expulsent pour flood,
 * repetition ou majuscules, puis bannissent a la troisieme expulsion du
 * meme type. Anope envoie l'expulsion avant le ban : la personne expulsee
 * ne voit jamais le MODE +b, et n'apprend son ban qu'au refus 474 en
 * revenant. Ce module lui dit ce qui l'attend, puis pourquoi elle ne peut
 * pas revenir.
 *
 * La memoire des expulsions est celle de la session (une Map tenue par
 * App) : rien n'est ecrit dans le navigateur.
 *
 * Logique pure, sans DOM : teste par test/sanction-auto.test.js.
 */

import {
	analyseKick, MOTIF_FLOOD, MOTIF_REPETITION, MOTIF_MAJUSCULES,
} from "./irc-errors.js";

/* Le robot de BotSync assigne aux salons officiels. */
export const ROBOT_KICKERS = "AuraBot";

/*
 * Duree du ban automatique, ecrite en dur : le client ne peut pas lire le
 * BANEXPIRE de BotSync (« /msg BotSync SET BANEXPIRE #salon 1h », D-062).
 * Si BANEXPIRE change, ces deux constantes changent avec lui.
 */
export const DUREE_BAN_AUTO = "une heure";
export const DUREE_BAN_AUTO_MS = 60 * 60 * 1000;

const MOTIFS_AUTO = [MOTIF_FLOOD, MOTIF_REPETITION, MOTIF_MAJUSCULES];

export const AVERTISSEMENT = "Attention : après plusieurs expulsions, tu seras banni(e) du salon pendant " + DUREE_BAN_AUTO + ".";

/*
 * Motif d'une expulsion automatique d'AuraBot qui compte pour le ban, ou
 * null. Un KICK signe par l'equipe (« … (Jeff) ») n'en est pas une : son
 * auteur est la personne qui signe. Le filet d'UnrealIRCd non plus : son
 * auteur est le serveur.
 */
export function expulsionAuto(auteur, raison) {
	let kick = analyseKick(raison, auteur);
	if ((kick.auteur || "").toLowerCase() !== ROBOT_KICKERS.toLowerCase()) {
		return null;
	}
	return MOTIFS_AUTO.includes(kick.raison) ? kick.raison : null;
}

/* Cle de la memoire : un salon d'un serveur, a la casse du serveur. */
export function cleSalon(serverID, salon, cm) {
	return serverID + " " + cm(salon);
}

/* Retient la derniere expulsion automatique d'un salon. */
export function noterExpulsion(memoire, cle, motif, maintenant) {
	memoire.set(cle, { motif, heure: maintenant });
}

/* Revenir dans le salon efface la trace : le ban suivant serait autre. */
export function oublierExpulsion(memoire, cle) {
	memoire.delete(cle);
}

/*
 * Texte du refus 474 juste apres une expulsion automatique dans ce salon,
 * ou null : le texte ordinaire s'applique alors (ban pose a la main, ou
 * expulsion trop ancienne pour que le ban automatique tienne encore).
 */
export function refusApresExpulsion(memoire, cle, salon, maintenant) {
	let trace = memoire.get(cle);
	if (!trace) {
		return null;
	}
	let ecoule = maintenant - trace.heure;
	if (ecoule < 0 || ecoule >= DUREE_BAN_AUTO_MS) {
		return null;
	}
	return "Tu ne peux pas rejoindre " + salon + " pendant " + DUREE_BAN_AUTO
		+ ", après plusieurs expulsions pour " + trace.motif + ".";
}
