/*
 * Une personne suspendue sur le site n'entre pas dans le t'Chat (D-067).
 *
 * config.json (GET /api/irc/gamja-config) lui repond 403, raison
 * « suspended », avec la fin de la suspension si elle en a une, et sans
 * identifiant. Le t'Chat affiche alors un ecran de fermeture, sans bouton de
 * reconnexion. Le texte est compose ici, avec la date de la reponse : le
 * meme que celui de la page /tchat.
 *
 * Module pur, sans DOM : teste par test/suspension.test.js.
 */

const PARIS = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

/* Le texte affiche, date si la suspension a une fin lisible. */
export function messageSuspension(fin) {
	let date = typeof fin === "string" ? new Date(fin) : null;
	if (date && !Number.isNaN(date.getTime())) {
		return "Ton compte est suspendu jusqu'au " + PARIS.format(date) + " : le t'Chat t'est fermé pendant ce temps.";
	}
	return "Ton compte est suspendu : le t'Chat t'est fermé pendant ce temps.";
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
	return { suspendu: { message: messageSuspension(corps.expiresAt) } };
}
