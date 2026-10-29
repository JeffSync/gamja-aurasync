/*
 * Motifs des departs et deconnexions dans un salon (D-062).
 *
 * Chaque arrivee, depart ou deconnexion a sa ligne, avec son heure : rien
 * n'est replie ni retire (mise a jour de D-062 du 29 octobre).
 *
 * Les textes du serveur ne s'affichent jamais bruts (D-056) : une raison de
 * deconnexion connue est traduite, une raison inconnue est tue. Le texte
 * qu'une personne ecrit en quittant (« Quit: … ») n'est pas montre : les
 * logiciels y mettent leur publicite, en anglais. Le motif d'un PART, lui,
 * est ecrit par la personne qui part : il est montre, sauf les formules
 * par defaut des logiciels.
 */

/* Raisons de deconnexion posees par le serveur (UnrealIRCd 6.2.7). */
const QUITS = [
	/* Depart volontaire : le texte suit « Quit: », il n'est pas montre. */
	[/^Quit:/, null],
	[/^Changing host$/, null],
	[/^(Ping timeout|Read error|Write error|Connection closed|Connection reset|EOF from client|Client exited)/i, "connexion perdue"],
	[/^(Excess Flood|Max SendQ exceeded)/, "trop de messages envoyés d'un coup"],
	/* Kills automatiques des services : rien a dire aux autres. */
	[/^Killed (?:by \S+ )?\((?:\S+ \()?(Services nickname-enforcer kill|Q-Lined|(?:Defcon )?[Ss]ession limit exceeded|Too many invalid passwords)/, null],
	[/^Killed /, "déconnecté(e) par l'équipe"],
	[/^(Banned|User has been banned|[GKZ]-?Lined)/, "accès au t'Chat suspendu"],
];

/*
 * Formules par defaut des logiciels, comparees sans casse ni ponctuation
 * finale : sans interet, souvent en anglais. « Closing Window » est celle
 * d'AdiIRC, vue en production le 29 octobre.
 */
const PARTS_VIDES = new Set([
	"leaving", "left", "leaving channel", "part", "parting", "quit", "quitting",
	"bye", "goodbye", "bye bye", "cya", "see you",
	"closing window", "window closed", "page closed", "tab closed",
	"client exited", "client closed", "disconnected", "connection closed",
	"adiirc", "mirc", "hexchat", "xchat", "weechat", "irssi", "kiwiirc",
	"thelounge", "the lounge", "quassel", "konversation", "textual", "gamja",
]);

export function estFormuleParDefaut(texte) {
	let t = (texte || "").trim().toLowerCase().replace(/[.!…\s]+$/, "").replace(/\s+/g, " ");
	return PARTS_VIDES.has(t);
}

/*
 * Motif a afficher pour un depart, ou null. `pseudo` : celui qui part (une
 * raison egale au pseudo est la raison par defaut du serveur).
 */
export function motifDepart(commande, raison, pseudo) {
	raison = (raison || "").trim();
	if (!raison || raison === pseudo) {
		return null;
	}
	if (commande === "QUIT") {
		for (let [motif, traduction] of QUITS) {
			if (motif.test(raison)) {
				return traduction;
			}
		}
		console.warn("t'Chat : raison de déconnexion non traduite", raison);
		return null;
	}
	if (commande === "PART") {
		/* Jamais « IRC » a l'ecran, d'ou que vienne le texte. */
		if (estFormuleParDefaut(raison) || /IRC/i.test(raison)) {
			return null;
		}
		return "« " + raison + " »";
	}
	return null;
}
