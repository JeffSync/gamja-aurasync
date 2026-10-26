/*
 * Traduction des textes renvoyes par le serveur (D-056).
 *
 * UnrealIRCd et Anope repondent en anglais. Rien de ce qu'ils disent ne
 * s'affiche tel quel : chaque texte passe par une table, par code numerique
 * et, quand la raison porte le sens (531, 404, 972, fins de connexion,
 * raisons de KICK), par motif ancre au debut du texte. Vocabulaire AuraSync :
 * « salon », « t'Chat », jamais « channel » ni « IRC » (D-001).
 *
 * Repli : un texte inconnu devient une phrase francaise generique ; le code
 * et le texte d'origine partent dans console.error. L'erreur n'est pas
 * avalee, l'anglais n'atteint jamais l'ecran.
 *
 * On traduit a l'affichage, jamais dans msg.params (D-021) : le client
 * compare ces valeurs ailleurs.
 *
 * Les motifs reposent sur les textes d'UnrealIRCd 6.2.7 et d'Anope 2.0.20 :
 * ils se relisent a chaque montee de version.
 *
 * Module pur, sans import : teste par test/irc-errors.test.js.
 */

export const REPLI_ERREUR = "Le t'Chat a refusé cette action.";
export const REPLI_FIN = "Tu as été déconnecté(e) du t'Chat.";
export const REPLI_INTERNE = "Une erreur est survenue dans le t'Chat. Recharge la page.";

/* Pseudos des services, pour reconnaitre un KICK ou un kill automatique. */
const SERVICES = ["ChanServ", "NickServ", "OperServ", "BotServ", "MemoServ", "HostServ", "Global"];

const MESSAGES = {
	/* Salons */
	"403": "Ce salon n'existe pas. Retrouve la liste complète dans le panneau Salons.",
	"404": "Tu ne peux pas écrire dans ce salon.",
	"405": "Tu as atteint le nombre maximum de salons ouverts. Quitte un salon avant d'en rejoindre un autre.",
	"470": "Ce salon est complet.",
	"471": "Ce salon est complet.",
	"473": "Ce salon est sur invitation.",
	"474": "Tu ne peux pas rejoindre ce salon car tu es banni(e).",
	"475": "Ce salon demande une clé d'accès.",
	"476": "Ce nom de salon n'est pas valide.",
	"477": "Ce salon demande d'être identifié(e).",
	"478": "La liste des bannissements de ce salon est pleine.",
	"482": "Tu n'as pas les droits nécessaires sur ce salon.",
	"489": "Ce salon demande une connexion sécurisée.",
	"499": "Seul le responsable du salon peut faire ça.",
	"500": "Trop de salons rejoints d'un coup. Patiente un instant et réessaie.",
	/* 520 : salon reserve aux operateurs. Le flou est voulu (D-056) : on ne
	 * revele pas l'existence d'un salon d'equipe. */
	"520": "Ce salon est sur invitation.",

	/* Membres et messages */
	"401": "Pseudo inconnu : ce membre n'existe pas.",
	"406": "Pseudo inconnu : ce membre n'existe pas.",
	"407": "Trop de destinataires pour un seul message.",
	"411": "Ton message n'a pas de destinataire.",
	"412": "Ton message est vide.",
	"417": "Ton message est trop long.",
	"439": "Tu ouvres trop de conversations à la fois. Patiente quelques secondes.",
	"441": "Ce membre n'est pas dans le salon.",
	"442": "Tu n'es pas dans ce salon.",
	"443": "Ce membre est déjà dans le salon.",
	"531": "Ce membre ne peut pas recevoir ton message.",

	/* Pseudo */
	"431": "Aucun pseudo indiqué.",
	"432": "Ce pseudo n'est pas valide.",
	"433": "Ce pseudo est déjà utilisé.",
	"436": "Ce pseudo est en conflit avec une autre connexion.",
	"437": "Ce pseudo est momentanément indisponible.",
	"447": "Tu ne peux pas changer de pseudo dans ce salon.",

	/* Commandes et connexion */
	"421": "Cette commande n'existe pas sur le t'Chat.",
	"451": "Action impossible dans l'état actuel de la connexion.",
	"461": "Il manque un paramètre à cette commande.",
	"462": "Action impossible dans l'état actuel de la connexion.",
	"464": "Mot de passe incorrect.",
	"465": "Ton accès au t'Chat est refusé.",
	"481": "Tu n'as pas les droits nécessaires.",
	"491": "Accès refusé.",

	/* Identification automatique (SASL) */
	"902": "La connexion au t'Chat a échoué. Recharge la page.",
	"904": "La connexion au t'Chat a échoué. Recharge la page.",
	"905": "La connexion au t'Chat a échoué. Recharge la page.",
	"906": "La connexion au t'Chat a échoué. Recharge la page.",
	"907": "La connexion au t'Chat a échoué. Recharge la page.",

	/* Refus au-dela de 568, que irc.isError ne connait pas */
	"696": "Ce réglage du salon n'est pas valide.",
	"972": "Tu ne peux pas faire ça.",
	"974": "Tu ne peux pas modifier ce réglage du salon.",
};

/*
 * Motifs par code : [expression ancree au debut, traduction]. La traduction
 * est une chaine, ou une fonction qui recoit les captures. Le premier motif
 * qui correspond l'emporte : les plus precis d'abord.
 */
const MOTIFS = {
	"531": [
		/* Notre spamfilter (D-054) : la raison est la notre, on la montre nue. */
		[/^Message blocked: (.+)$/, (m) => m[1]],
		[/^DCC blocked/, "Ce fichier ne peut pas être envoyé."],
		[/^User does not accept private messages containing swearing/, "Ce membre refuse les messages privés contenant des grossièretés."],
		[/^User does not accept private messages/, "Ce membre n'accepte pas les messages privés."],
		[/^User does not accept CTCPs/, "Ce membre n'accepte pas ce type de message."],
		[/^You must identify to a registered nick/, "Ce membre n'accepte que les messages des comptes identifiés."],
		[/^You must be connected via TLS/, "Ce membre n'accepte que les connexions sécurisées."],
		[/^Recipient is not connected via TLS/, "Ce membre n'a pas de connexion sécurisée : ton message ne lui a pas été envoyé."],
	],
	"404": [
		[/^Message blocked due to a text ban/, "Ce message contient un texte interdit dans ce salon."],
		[/^Message blocked: (.+)$/, (m) => m[1]],
		[/^You are banned/, "Tu es banni(e) de ce salon : tes messages n'y sont pas transmis."],
		[/^You need voice/, "Ce salon est modéré : seuls les membres autorisés peuvent y écrire."],
		[/^You must have a registered nick/, "Seuls les comptes identifiés peuvent écrire dans ce salon."],
		[/^No external channel messages/, "Rejoins le salon pour y écrire."],
		[/^Color is not permitted/, "Les couleurs ne sont pas autorisées dans ce salon."],
		[/^Control codes/, "La mise en forme (gras, couleurs…) n'est pas autorisée dans ce salon."],
		[/^CTCPs are not permitted/, "Ce type de message n'est pas autorisé dans ce salon."],
		[/^NOTICEs are not permitted/, "Ce type de message n'est pas autorisé dans ce salon."],
		[/^Swearing is not permitted/, "Les grossièretés ne sont pas autorisées dans ce salon."],
		[/^Flooding \(Your last message is too similar/, "Message non envoyé : il ressemble trop aux précédents."],
		[/^Flooding/, "Message non envoyé : tu écris trop vite. Patiente un instant."],
		[/^Channel is being flooded/, "Le salon est saturé, ton message n'a pas été transmis. Réessaie dans un instant."],
	],
	"972": [
		[/^\S+ is a channel (owner|admin|operator)/, "Tu ne peux pas expulser un opérateur du salon."],
		[/^\S+ is a halfop/, "Tu ne peux pas expulser un modérateur du salon."],
		[/^\S+ is a Service Bot/, "Tu ne peux pas expulser un service du t'Chat."],
		[/^You cannot change the topic on \S+ while being banned/, "Tu ne peux pas changer le sujet d'un salon dont tu es banni(e)."],
		[/^Voice \(\+v\) or higher is required in order to change the topic/, "Ce salon est modéré : tu ne peux pas en changer le sujet."],
		[/^Command blocked: (.+)$/, (m) => m[1]],
		[/^Message rejected, your \S+ client MUST use UTF-8/, "Message refusé : il contient des caractères non pris en charge."],
	],
	"974": [
		[/^You are not an IRC operator/, "Ce réglage est réservé à l'équipe du t'Chat."],
		[/^\+i must be set/, "Ce réglage demande que le salon soit sur invitation."],
	],
	"696": [
		[/^Channel key contains forbidden characters/, "La clé du salon contient des caractères interdits, ou elle est trop longue."],
		[/^Channel limit \(\+l\) needs to be a positive number/, "La limite du salon doit être un nombre positif."],
	],
};

/* Raisons des kills automatiques des services (Anope 2.0.20). */
const KILLS_SERVICES = [
	[/^Services nickname-enforcer kill/, "Tu as été déconnecté(e) : ce pseudo appartient à un autre compte."],
	[/^Q-Lined/, "Tu as été déconnecté(e) : ce pseudo est réservé."],
	[/^(Defcon )?[Ss]ession limit exceeded/, "Trop de connexions simultanées depuis ton adresse."],
	[/^Too many invalid passwords/, "Trop de tentatives d'identification."],
];

/* Fins de connexion : motifs sur la raison, une fois « Closing Link » retire. */
const FINS = [
	[/^Killed (?:by (\S+) )?\((.*)\)$/, (m) => finKill(m[1], m[2])],
	[/^You are not welcome on this/, "Ton accès au t'Chat est refusé."],
	[/^[GKZ]-?Lined/, "Ton accès au t'Chat est refusé."],
	[/^Ping timeout/, "La connexion au t'Chat a été perdue. Reconnexion…"],
	[/^(Excess Flood|Max SendQ exceeded)/, "Tu as été déconnecté(e) : trop de messages envoyés d'un coup."],
	[/^(Throttled|Too many connections|Too many unknown connections)/, "Trop de connexions depuis ton adresse. Patiente une minute avant de revenir."],
	[/^Registration Timeout/, "La connexion au t'Chat n'a pas abouti. Recharge la page."],
];

/* Raisons de KICK posees par le serveur ou par Anope. */
const KICKS = [
	[/^Flooding \(Your last message is too similar/, "messages répétés"],
	[/^Flooding/, "trop de messages en peu de temps"],
	[/^You are not permitted to be on this channel/, "salon réservé"],
	[/^User has been banned from the channel/, "banni(e) du salon"],
	/* Raison par defaut de ChanServ KICK : rien a dire. */
	[/^Requested$/, ""],
];

function chercher(motifs, texte) {
	for (let [motif, traduction] of motifs) {
		let m = motif.exec(texte);
		if (m) {
			return typeof traduction === "function" ? traduction(m) : traduction;
		}
	}
	return null;
}

function signaler(code, texte) {
	console.error("t'Chat : texte serveur non traduit", code, texte);
}

/* Derniere barriere : jamais « IRC » a l'ecran, d'ou que vienne le texte. */
function propre(texte, repli, code, origine) {
	if (/IRC/i.test(texte)) {
		signaler(code, origine);
		return repli;
	}
	return texte;
}

function finKill(auteur, raison) {
	let connue = chercher(KILLS_SERVICES, raison);
	if (connue !== null) {
		return connue;
	}
	let parService = !auteur || SERVICES.includes(auteur);
	if (parService || !raison) {
		/* Raison automatique inconnue, ou absente : on ne l'affiche pas. */
		if (raison) {
			signaler("KILL", raison);
		}
		return "Tu as été déconnecté(e) par l'équipe du t'Chat.";
	}
	/* Raison ecrite par un membre de l'equipe. */
	return "Tu as été déconnecté(e) par l'équipe du t'Chat : " + raison;
}

/*
 * Traduit une erreur numerique. `command` est le code (« 473 », « FAIL »),
 * `texte` le dernier parametre du message serveur.
 */
export function translateError(command, texte) {
	texte = texte || "";
	let motifs = MOTIFS[command];
	if (motifs) {
		let trouve = chercher(motifs, texte);
		if (trouve !== null) {
			return propre(trouve, MESSAGES[command] || REPLI_ERREUR, command, texte);
		}
	}
	if (MESSAGES[command]) {
		if (motifs) {
			/* Code connu, raison inconnue : on garde la trace du detail perdu. */
			signaler(command, texte);
		}
		return MESSAGES[command];
	}
	signaler(command, texte);
	return REPLI_ERREUR;
}

/* Traduit le texte d'un ERROR (fin de connexion imposee par le serveur). */
export function translateClosing(texte) {
	texte = texte || "";
	let m = /^Closing Link: \S+ \((.*)\)$/.exec(texte);
	let raison = m ? m[1] : texte;
	let trouve = chercher(FINS, raison);
	if (trouve !== null) {
		return propre(trouve, REPLI_FIN, "ERROR", texte);
	}
	signaler("ERROR", texte);
	return REPLI_FIN;
}

/*
 * Traduit la raison d'un KICK, pour l'afficher entre parentheses. Renvoie ""
 * quand il n'y a rien a afficher. `auteur` est le pseudo (ou le serveur)
 * qui expulse : sans raison, UnrealIRCd met son pseudo a la place.
 */
export function translateKickReason(raison, auteur) {
	raison = (raison || "").trim();
	if (!raison || raison === auteur) {
		return "";
	}
	let trouve = chercher(KICKS, raison);
	if (trouve !== null) {
		return trouve;
	}
	let automatique = !auteur || auteur.includes(".") || SERVICES.includes(auteur);
	if (automatique) {
		/* Texte anglais d'un service ou du serveur que la table ignore. */
		signaler("KICK", raison);
		return "";
	}
	/* Raison ecrite par un membre de l'equipe. */
	return propre(raison, "", "KICK", raison);
}

/*
 * Erreur remontee par le client (evenement « error ») : une IRCError porte
 * le message d'origine dans `msg`. Les autres erreurs viennent du client
 * lui-meme et sont deja en francais (« Erreur de connexion »…).
 */
export function translateClientError(err) {
	if (err && err.msg && typeof err.msg.command === "string") {
		let msg = err.msg;
		let texte = msg.params && msg.params.length > 0 ? msg.params[msg.params.length - 1] : "";
		if (msg.command === "ERROR") {
			return translateClosing(texte);
		}
		return translateError(msg.command, texte);
	}
	return err;
}

/*
 * Point d'entree unique de tout texte affiche en banniere : App.showError
 * l'appelle lui-meme, pour qu'aucun appelant ne puisse l'oublier.
 *
 * - IRCError, ou erreur dont une cause est une IRCError (join, whois,
 *   roundtrip, evenement « error ») : traduite par la table (D-056) ;
 * - erreur native du navigateur (TypeError, DOMException…) : son texte est
 *   anglais, repli generique ;
 * - Error du client ou chaine : nos textes, deja francais. Les causes ne
 *   sont pas affichees (elles partent dans la console avec l'erreur).
 *
 * La barriere ne vise que le mot « IRC » en debut de mot : un pseudo
 * comme « Mirco » passe, « irc.aurasync.fr » non (D-001).
 */
export function displayError(err) {
	for (let e = err; e; e = e.cause) {
		if (e.msg && typeof e.msg.command === "string") {
			return translateClientError(e);
		}
	}
	let texte;
	if (err instanceof Error) {
		if (err.name !== "Error") {
			signaler(err.name, err.message);
			return REPLI_INTERNE;
		}
		texte = err.message;
	} else {
		texte = err === null || err === undefined ? "" : String(err);
	}
	if (!texte) {
		return REPLI_INTERNE;
	}
	if (/(^|[^a-z])irc/i.test(texte)) {
		signaler("banniere", texte);
		return REPLI_INTERNE;
	}
	return texte;
}

/* Refus que irc.isError ne compte pas (codes au-dela de 568). */
export function isRefusal(command) {
	return command === "696" || command === "972" || command === "974";
}

export { MESSAGES, MOTIFS };
