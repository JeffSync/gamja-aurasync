/*
 * Message d'accueil d'un salon (ENTRYMSG, D-062).
 *
 * Anope l'envoie a chaque arrivee, par le robot assigne au salon (AuraBot
 * sur les salons officiels) : NOTICE <pseudo> :[#salon] texte
 * (cs_entrymsg.cpp, OnJoinChannel ; PRIVMSG si le compte a demande les
 * messages prives au lieu des notices). Sans traitement, il part dans
 * l'onglet serveur, masque (D-012) : personne ne le voit.
 *
 * Il est range dans le salon, juste sous sa propre ligne d'arrivee, si et
 * seulement si :
 * 1. il est adresse a soi, pas a un salon ;
 * 2. l'expediteur est AuraBot ;
 * 3. son hote est celui des services. Une personne ne peut pas l'obtenir :
 *    son hote est masque, HostServ lui est ferme (D-054), CHGHOST et
 *    SETHOST sont reserves aux operateurs. La condition 2 seule ne suffit
 *    pas : pendant un redemarrage d'Anope, le pseudo AuraBot est libre
 *    quelques secondes (le ban nick de D-062 le ferme aussi) ;
 * 4. le texte commence par « [#salon] », et l'on est dans ce salon.
 * Sinon, la notice suit le chemin ordinaire (meme principe que les notices
 * de mutisme, D-059).
 */

export const ROBOT_ACCUEIL = "AuraBot";
export const HOTE_SERVICES = "services.aurasync.fr";

const FORME = /^\[([#&][^\s\]]*)\] ([\s\S]*\S[\s\S]*)$/;

/*
 * Lit un accueil : { salon, texte } ou null. `contexte` :
 * - cm(nom) : la casse du serveur ;
 * - estMoi(pseudo) ;
 * - salonRejoint(nom) : le nom du salon tel qu'on l'a ouvert, ou null si
 *   l'on n'y est pas.
 */
export function lireAccueil(msg, { cm, estMoi, salonRejoint }) {
	if (!msg || (msg.command !== "NOTICE" && msg.command !== "PRIVMSG")) {
		return null;
	}
	if (!msg.prefix || !msg.params || !estMoi(msg.params[0])) {
		return null;
	}
	if (cm(msg.prefix.name || "") !== cm(ROBOT_ACCUEIL)) {
		return null;
	}
	if ((msg.prefix.host || "").toLowerCase() !== HOTE_SERVICES) {
		return null;
	}
	let m = FORME.exec(msg.params[1] || "");
	if (!m) {
		return null;
	}
	let salon = salonRejoint(m[1]);
	if (!salon) {
		return null;
	}
	return { salon, texte: m[2] };
}

/*
 * Place un accueil dans la liste des messages d'un salon : juste sous la
 * derniere arrivee de soi, apres les accueils deja ranges sous elle (un
 * salon peut en avoir plusieurs, dans leur ordre). Sans arrivee de soi, a
 * la fin. Les messages arrivent dans l'ordre de reception, pas par heure :
 * une ligne du salon recue entre l'arrivee et l'accueil passe dessous.
 */
export function placerAccueil(list, msg) {
	let i = list.length - 1;
	while (i >= 0 && !list[i].arriveeSoi) {
		i--;
	}
	if (i < 0) {
		return list.concat(msg);
	}
	let j = i + 1;
	while (j < list.length && list[j].accueil) {
		j++;
	}
	return [...list.slice(0, j), msg, ...list.slice(j)];
}
