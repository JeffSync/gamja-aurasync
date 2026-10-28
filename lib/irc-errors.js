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
/* Une sanction sans motif (D-058) : jamais un texte vide ni anglais. */
export const MOTIF_NON_PRECISE = "motif non précisé";
export const CONNEXION_PERDUE = "Connexion perdue, reconnexion…";
export const REPLI_INTERNE = "Une erreur est survenue dans le t'Chat. Recharge la page.";

/*
 * Pseudos des services et des bots BotServ, pour reconnaitre un KICK ou un
 * kill automatique. AuraBot est le seul bot assigne aux salons.
 *
 * Les services prennent des noms AuraSync (D-061) : les deux jeux de noms
 * sont reconnus, avant et apres la bascule d'Anope. Les anciens restent
 * interdits a tout membre (ban nick, FORBID) : les garder est sans risque.
 */
const SERVICES = [
	"ChanServ", "NickServ", "OperServ", "BotServ", "MemoServ", "HostServ",
	"SalonSync", "PseudoSync", "OperSync", "BotSync", "MemoSync", "HostSync",
	"Global", "AuraBot",
];
/* OperServ KICK signe « Jeff (motif) », sous l'un ou l'autre nom. */
const OPERSERV = ["OperServ", "OperSync"];

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
	"401": "Pseudo inconnu : personne ne porte ce pseudo.",
	"406": "Pseudo inconnu : personne ne porte ce pseudo.",
	"407": "Trop de destinataires pour un seul message.",
	"411": "Ton message n'a pas de destinataire.",
	"412": "Ton message est vide.",
	"417": "Ton message est trop long.",
	"439": "Tu ouvres trop de conversations à la fois. Patiente quelques secondes.",
	"441": "Cette personne n'est pas dans le salon.",
	"442": "Tu n'es pas dans ce salon.",
	"443": "Cette personne est déjà dans le salon.",
	"531": "Cette personne ne peut pas recevoir ton message.",

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
		[/^User does not accept private messages containing swearing/, "Cette personne refuse les messages privés contenant des grossièretés."],
		[/^User does not accept private messages/, "Cette personne n'accepte pas les messages privés."],
		[/^User does not accept CTCPs/, "Cette personne n'accepte pas ce type de message."],
		[/^You must identify to a registered nick/, "Cette personne n'accepte que les messages des comptes identifiés."],
		[/^You must be connected via TLS/, "Cette personne n'accepte que les connexions sécurisées."],
		[/^Recipient is not connected via TLS/, "Cette personne n'a pas de connexion sécurisée : ton message ne lui a pas été envoyé."],
	],
	"404": [
		[/^Message blocked due to a text ban/, "Ce message contient un texte interdit dans ce salon."],
		[/^Message blocked: (.+)$/, (m) => m[1]],
		/* Ban et ~quiet (D-059) donnent le meme texte : message.c, defaut de
		   can_send_to_channel, quiet.c ne pose pas d'errmsg. */
		[/^You are banned/, "Tu ne peux plus écrire dans ce salon."],
		[/^You need voice/, "Ce salon est modéré : seules les personnes autorisées peuvent y écrire."],
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
	/* banned_client (quit.c) : « Banned (G-Lined): motif [ID: …] », motif
	 * masque s'il contient l'adresse du membre. Un AKILL d'Anope arrive en
	 * G-Line, motif « [Jeff] motif (ID: …) ». */
	[/^Banned \((?:[GKZ]-Lined|realname)\)(?:: (.*?))?(?: \[ID: [^\]]*\])?$/, (m) => "Ton accès au t'Chat est suspendu : " + motifBan(m[1])],
	[/^[GKZ]-?Lined/, "Ton accès au t'Chat est refusé."],
	/* authprompt : identification exigee et absente. */
	[/^Account required to connect/, "Le t'Chat n'a pas pu t'identifier : ta session sur AuraSync a peut-être expiré."],
	[/^Ping timeout/, CONNEXION_PERDUE],
	[/^(Excess Flood|Max SendQ exceeded)/, "Tu as été déconnecté(e) : trop de messages envoyés d'un coup."],
	[/^(Throttled|Too many connections|Too many unknown connections)/, "Trop de connexions depuis ton adresse. Patiente une minute avant de revenir."],
	[/^Registration Timeout/, "La connexion au t'Chat n'a pas abouti. Recharge la page."],
];

/*
 * Raisons de KICK posees par le serveur ou par Anope 2.0.20 (relevees dans
 * les sources : cs_kick, cs_ban, cs_akick, cs_set, cs_enforce, cs_suspend,
 * os_forbid, bs_kick, src/channels.cpp). Une traduction vide : rien a dire.
 */
const KICKS = [
	/* UnrealIRCd, floodprot. */
	[/^Flooding \(Your last message is too similar/, "messages répétés"],
	[/^Flooding/, "trop de messages en peu de temps"],
	/* ChanServ : RESTRICTED, AKICK, raison par defaut de KICK et BAN. */
	[/^You are not permitted to be on this channel/, "salon réservé"],
	[/^User has been banned from the channel/, "banni(e) du salon"],
	[/^Requested$/, ""],
	[/^This channel has been suspended\.$/, "salon suspendu"],
	[/^This channel may not be used\.$/, "salon suspendu"],
	[/^This channel has been forbidden: /, "salon interdit"],
	/* BotServ, kickers automatiques. */
	[/^Don't use bolds on this channel!$/, "pas de gras dans ce salon"],
	[/^Don't use colors on this channel!$/, "pas de couleurs dans ce salon"],
	[/^Don't use reverses on this channel!$/, "pas de texte inversé dans ce salon"],
	[/^Don't use italics on this channel!$/, "pas d'italique dans ce salon"],
	[/^Don't use underlines on this channel!$/, "pas de soulignement dans ce salon"],
	[/^Turn caps lock OFF!$/, "trop de majuscules"],
	[/^Watch your language!$/, "langage inapproprié"],
	[/^Don't use the word ".*" on this channel!$/, "mot interdit dans ce salon"],
	[/^Stop flooding!$/, "trop de messages en peu de temps"],
	[/^Stop repeating yourself!$/, "messages répétés"],
	[/^Don't use AMSGs!$/, "même message envoyé dans plusieurs salons"],
];

/*
 * ChanServ ENFORCE : « RESTRICTED enforced by Jeff ». Le vrai auteur est le
 * pseudo final.
 */
const ENFORCES = {
	RESTRICTED: "salon réservé",
	REGONLY: "salon réservé aux comptes identifiés",
	SSLONLY: "salon réservé aux connexions sécurisées",
	BANS: "banni(e) du salon",
	LIMIT: "salon complet",
};

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

/* Motif d'un ban reseau, sans l'auteur ni l'identifiant qu'Anope ajoute. */
function motifBan(motif) {
	motif = (motif || "").replace(/^\[[^\]]*\] /, "").replace(/ \(ID: [^)]*\)$/, "").trim();
	return motif || MOTIF_NON_PRECISE;
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
		return "Tu as été déconnecté(e) par l'équipe : " + MOTIF_NON_PRECISE;
	}
	/* Raison ecrite par un membre de l'equipe. */
	return "Tu as été déconnecté(e) par l'équipe : " + raison;
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
/* Raison d'un ERROR, sans « Closing Link: <client> (…) ». */
export function raisonFin(texte) {
	texte = texte || "";
	let m = /^Closing Link: \S+ \((.*)\)$/.exec(texte);
	return m ? m[1] : texte;
}

export function translateClosing(texte) {
	texte = texte || "";
	let raison = raisonFin(texte);
	let trouve = chercher(FINS, raison);
	if (trouve !== null) {
		return propre(trouve, REPLI_FIN, "ERROR", texte);
	}
	signaler("ERROR", texte);
	return REPLI_FIN;
}

/*
 * Analyse un KICK : vrai auteur et raison traduite (D-056). `auteur` est le
 * pseudo (ou le serveur) qui expulse, `raison` le texte recu. Renvoie
 * { auteur, raison } ; raison vaut "" quand aucun motif n'est arrive.
 *
 * Quand un service ou AuraBot expulse pour un membre de l'equipe, Anope
 * signe la raison (SIGNKICK, signkickformat « %m (%n) ») : « Requested
 * (Jeff) » pour un !kb sans motif. L'auteur affiche est alors Jeff. OperServ
 * KICK ecrit « Jeff (motif) ». Une expulsion par masque ajoute
 * « (Matches *!*@hote) », retire.
 */
function analyseBrute(raison, auteur) {
	raison = (raison || "").trim();
	auteur = auteur || "";
	if (!raison || raison === auteur) {
		return { auteur, raison: "" };
	}
	if (!SERVICES.includes(auteur)) {
		/* Le serveur (floodprot) ou un membre de l'equipe en direct. */
		let trouve = chercher(KICKS, raison);
		if (trouve !== null) {
			return { auteur, raison: trouve };
		}
		if (auteur.includes(".")) {
			signaler("KICK", raison);
			return { auteur, raison: "" };
		}
		return { auteur, raison: propre(raison, "", "KICK", raison) };
	}

	let origine = raison;
	let signe = null;
	let m;
	if (OPERSERV.includes(auteur) && (m = /^(\S+) \((.*)\)$/.exec(raison))) {
		[, signe, raison] = m;
	} else if ((m = /^(.*) \(([^()\s]+)\)$/.exec(raison))) {
		[, raison, signe] = m;
	} else if ((m = /^(\S+) enforced by (\S+)$/.exec(raison)) && ENFORCES[m[1]]) {
		return { auteur: m[2], raison: ENFORCES[m[1]] };
	}
	raison = raison.replace(/ \(Matches [^)]*\)$/, "").trim();

	let trouve = raison ? chercher(KICKS, raison) : "";
	if (trouve !== null) {
		return { auteur: signe || auteur, raison: trouve };
	}
	if (signe) {
		/* Motif ecrit par le membre de l'equipe qui a signe. */
		return { auteur: signe, raison: propre(raison, "", "KICK", origine) };
	}
	/* Texte anglais d'un service que la table ignore. */
	signaler("KICK", origine);
	return { auteur, raison: "" };
}

/*
 * D-058 : le membre voit toujours un motif. Sans motif (« Requested »
 * d'Anope, KICK sans raison, texte automatique inconnu) : « motif non
 * précisé ».
 */
export function analyseKick(raison, auteur) {
	let kick = analyseBrute(raison, auteur);
	return { auteur: kick.auteur, raison: kick.raison || MOTIF_NON_PRECISE };
}

/* Raison seule, pour l'afficher entre parentheses. */
export function translateKickReason(raison, auteur) {
	return analyseKick(raison, auteur).raison;
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
