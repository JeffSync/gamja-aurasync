/*
 * Une personne suspendue sur le site n'entre pas dans le t'Chat (D-067).
 *
 * config.json (GET /api/irc/gamja-config) lui repond 403, raison
 * « suspended », avec la fin de la suspension si elle en a une, `banned`
 * pour une suspension definitive (texte A du 12 novembre, D-075), et sans
 * identifiant. Le t'Chat affiche alors un ecran de fermeture, sans bouton de
 * reconnexion. Le texte est compose ici, avec la date de la reponse : le
 * meme que celui de la page /tchat.
 *
 * Module pur, sans DOM : teste par test/suspension.test.js.
 */

const PARIS = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export const MESSAGE_SUSPENDU = "Ton compte est suspendu. Tu ne peux pas accéder au t'Chat pour le moment.";
export const MESSAGE_BANNI = "Ton compte est banni. Tu ne peux plus accéder au t'Chat.";

/* Le texte affiche : banni, ou date si la suspension a une fin lisible. */
export function messageSuspension(fin, banni = false) {
	if (banni) {
		return MESSAGE_BANNI;
	}
	let date = typeof fin === "string" ? new Date(fin) : null;
	if (date && !Number.isNaN(date.getTime())) {
		return "Ton compte est suspendu jusqu'au " + PARIS.format(date) + ". Tu ne peux pas accéder au t'Chat d'ici là.";
	}
	return MESSAGE_SUSPENDU;
}

/*
 * La reponse de config.json lue : { suspendu: { message } } pour un refus
 * de suspension, null pour tout le reste (le t'Chat suit alors son chemin
 * habituel). Seuls le code 403 et la raison « suspended » comptent.
 */
export function refusSuspension(statut, corps) {
	if (statut !== 403 || !corps || corps.error !== "suspended") {
		return null;
	}
	return { suspendu: { message: messageSuspension(corps.expiresAt, corps.banned === true) } };
}
