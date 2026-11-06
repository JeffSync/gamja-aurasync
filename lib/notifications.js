/*
 * Notifications du t'Chat (D-066, point 7) : ce qu'elles disent, et quand
 * elles partent.
 *
 * Regle de vie privee, sans exception ni option : une notification ne
 * contient JAMAIS le texte d'un message. Le navigateur ne dit pas si
 * l'ecran est verrouille : la regle vaut toujours.
 * - message prive : « t'Chat », « Nouveau message privé », sans le pseudo :
 *   savoir qui t'ecrit est deja une information ;
 * - salon sensible (indicateur `sensible` de GET /api/irc/channels :
 *   #abus, #addictions) : « t'Chat », « Nouvelle mention dans un salon
 *   d'écoute », sans le nom du salon ni le pseudo. Voir « #addictions » sur
 *   un ecran verrouille revele une demarche de soin (article 9 du RGPD) ;
 * - autre salon : « Kahen t'a mentionné(e) », « dans #jeux ».
 *
 * On notifie seulement si l'onglet est cache, sans focus, ou si la
 * conversation n'est pas celle qu'on lit. Une notification par conversation
 * (tag), remplacee sans bruit (renotify: false), qui ne reste pas a l'ecran
 * (requireInteraction: false). Aucun son du t'Chat : le systeme joue le sien.
 *
 * La permission se demande sur un geste seulement : l'entree
 * « Notifications » de la barre, ou la proposition faite une fois dans la
 * conversation a la premiere mention ou au premier message prive.
 *
 * Textes en francais, tutoiement, dans la table ci-dessous (D-056) : aucun
 * texte du serveur n'y entre, seulement un pseudo et un nom de salon.
 *
 * Module pur, sans DOM : teste par test/notifications.test.js.
 */

export const TEXTES = {
	titre: "t'Chat",
	prive: "Nouveau message privé",
	ecouteMention: "Nouvelle mention dans un salon d'écoute",
	ecouteInvitation: "Nouvelle invitation dans un salon d'écoute",
	mention: (pseudo) => pseudo + " t'a mentionné(e)",
	invitation: (pseudo) => pseudo + " t'invite",
	dans: (salon) => "dans " + salon,

	menu: "Notifications",
	activer: "Activer",
	activees: "Activées",
	bloquees: "Bloquées par le navigateur : à réactiver dans ses réglages",
	indisponibles: "Ce navigateur ne permet pas les notifications",
	proposition: "Tu veux être prévenu(e) quand on te mentionne ?",
	nonMerci: "Non merci",
};

/* Le refus de la proposition, retenu dans ce navigateur. */
export const CLE_REFUS = "aurasync_tchat_notif_refus";

/*
 * Titre et texte d'une notification.
 * - nature : "mention", "prive" ou "invitation" ;
 * - salon : true si la conversation est un salon ; un message, meme une
 *   mention, dans une conversation privee est un message prive ;
 * - sensible : le salon est un salon d'ecoute ;
 * - auteur, nom : le pseudo de l'auteur, le nom du salon.
 */
export function contenuNotification({ nature, salon, sensible, auteur, nom }) {
	if (nature === "prive" || !salon) {
		return { title: TEXTES.titre, body: TEXTES.prive };
	}
	if (sensible) {
		let body = nature === "invitation" ? TEXTES.ecouteInvitation : TEXTES.ecouteMention;
		return { title: TEXTES.titre, body };
	}
	let title = nature === "invitation" ? TEXTES.invitation(auteur) : TEXTES.mention(auteur);
	return { title, body: TEXTES.dans(nom) };
}

/*
 * Faut-il notifier ? Seulement si la personne ne lit pas deja cette
 * conversation : onglet cache, fenetre sans focus, ou autre conversation
 * affichee.
 */
export function doitNotifier({ cache, focus, affichee }) {
	return cache || !focus || !affichee;
}

/* Une notification par conversation : la suivante remplace la precedente. */
export function tagConversation(nom) {
	return "tchat:" + nom.toLowerCase();
}

/*
 * Ce qu'on passe a showNotification. `data` sert au clic (ouvrir la
 * conversation) ; il ne s'affiche jamais.
 */
export function optionsNotification(contenu, { conversation, serveur, icone }) {
	return {
		body: contenu.body,
		tag: tagConversation(conversation),
		renotify: false,
		requireInteraction: false,
		icon: icone,
		data: { conversation, serveur },
	};
}

/*
 * Etat de la permission : "indisponible", "default", "granted" ou "denied".
 * `Notification` est window.Notification, ou undefined.
 */
export function etatPermission(Notification) {
	if (!Notification || typeof Notification.permission !== "string") {
		return "indisponible";
	}
	return Notification.permission;
}

/* Le libelle de l'entree « Notifications », et si elle est cliquable. */
export function entreeMenu(permission) {
	switch (permission) {
	case "granted":
		return { texte: TEXTES.activees, action: false };
	case "denied":
		return { texte: TEXTES.bloquees, action: false };
	case "default":
		return { texte: TEXTES.activer, action: true };
	default:
		return { texte: TEXTES.indisponibles, action: false };
	}
}

/*
 * La proposition dans la conversation : une seule fois, tant que la
 * permission n'est ni accordee ni refusee, et jamais apres « Non merci ».
 */
export function peutProposer({ permission, refus, dejaProposee }) {
	return permission === "default" && !refus && !dejaProposee;
}
