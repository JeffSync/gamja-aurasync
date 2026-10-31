/*
 * Historique des salons (D-062, point 3).
 *
 * Le serveur garde les 50 derniers messages d'un salon, 7 jours au plus
 * (+H 50:7d). A l'ouverture d'un salon, le t'Chat les demande par
 * CHATHISTORY ; ils arrivent dans un lot « chathistory ». Ils s'affichent
 * au-dessus de sa propre arrivee, sous un separateur « Messages
 * précédents » : la personne sait qu'ils ont ete ecrits avant elle.
 *
 * Rien de l'historique ne notifie ni ne compte comme mention : une mention
 * vieille de six jours n'appelle pas la personne.
 *
 * Logique pure, sans DOM : teste par test/historique.test.js.
 */

import { findBatchByType } from "./irc.js";

export const SEPARATEUR_HISTORIQUE = "Messages précédents";

/*
 * Marque un message recu de l'historique : msg.historique, et jamais de
 * mention (isHighlight). A appeler avant tout calcul de mention.
 */
export function marquerHistorique(msg) {
	if (findBatchByType(msg, "chathistory")) {
		msg.historique = true;
		msg.isHighlight = false;
	}
	return msg;
}

/*
 * Vrai si le separateur « Messages précédents » se pose avant `msg` : le
 * premier message d'une suite venue de l'historique. `precedent` est le
 * message affiche juste avant, ou undefined.
 */
export function avantHistorique(precedent, msg) {
	return !!msg.historique && !(precedent && precedent.historique);
}
