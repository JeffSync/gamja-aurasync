/*
 * Les reglages d'un salon (etape 5, D-068) : ce que fait chaque lettre de
 * mode, qui peut la poser, si le menu de reglages la proposera (lot B), et
 * la phrase francaise d'une ligne MODE du fil (D-056 : jamais « applique le
 * mode … »).
 *
 * Rangs relus dans les sources d'UnrealIRCd 6.2.7 (src/modules/chanmodes/,
 * fonction is_ok de chaque module ; api-channelmode.c:661-684 pour les deux
 * regles par defaut) : a relire a chaque montee de version, comme les motifs
 * de lib/irc-errors.js. Tout MODE d'un client local demande deja au moins %
 * (mode.c:165-170, sinon 482).
 *
 * Module pur, sans import : teste par test/reglages.test.js.
 */

/*
 * rang : « % » (modere le salon), « @ » (gere le salon), « oper » (equipe du
 * reseau), « services » (SalonSync), « serveur » (personne ne le pose a la
 * main).
 * menu : « oui » (propose, lot B), « lecture » (affiche, jamais modifiable),
 * « liste » (lot C), « fiche » (gestes sur une personne, lot 3), « non ».
 * pose / retire : la phrase du fil, apres « Jeff a ». `{v}` est la valeur
 * lue (limite, salon de renvoi, profil). Pour f et H, voir fragmentReglage.
 */
export const REGLAGES = {
	/* Listes et rangs : phrases construites par components/buffer.js
	 * (lib/ban.js, lib/mutisme.js), gardees telles quelles (D-058, D-059,
	 * D-062). Ici pour le rang et le menu seulement. */
	b: { rang: "%", menu: "liste", source: "mode.c:165", libelle: "Bannissements" },
	e: { rang: "%", menu: "liste", source: "mode.c:165", libelle: "Exemptions" },
	I: { rang: "%", menu: "liste", source: "mode.c:165", libelle: "Invitations permanentes" },
	o: { rang: "@", menu: "fiche", source: "chanop.c:68", libelle: "Statut opérateur" },
	h: { rang: "@", menu: "fiche", source: "halfop.c:75", libelle: "Statut modérateur" },
	v: { rang: "%", menu: "fiche", source: "voice.c:75", libelle: "Voix" },

	t: {
		rang: "%", menu: "oui", source: "topiclimit.c:49", libelle: "Sujet réservé",
		phrase: "Seuls les modérateurs et les opérateurs du salon peuvent changer le sujet.",
		pose: "réservé le sujet aux modérateurs et aux opérateurs", retire: "ouvert le sujet à tout le monde",
	},
	n: {
		rang: "%", menu: "oui", source: "noexternalmsgs.c:46", libelle: "Messages externes interdits",
		phrase: "Il faut être dans le salon pour y écrire.",
		pose: "interdit les messages externes", retire: "autorisé les messages externes",
	},
	m: {
		rang: "%", menu: "oui", source: "moderated.c:51", libelle: "Salon modéré",
		phrase: "Seules les personnes qui ont la parole (+) peuvent écrire.",
		pose: "activé le salon modéré", retire: "désactivé le salon modéré",
	},
	i: {
		rang: "%", menu: "oui", source: "inviteonly.c:46", libelle: "Sur invitation",
		phrase: "On n'entre que sur invitation d'un modérateur ou d'un opérateur.",
		pose: "mis le salon sur invitation", retire: "retiré l'invitation obligatoire",
	},
	k: {
		/* La cle n'est jamais affichee dans le fil. */
		rang: "%", menu: "oui", source: "key.c:109", libelle: "Clé d'accès",
		phrase: "Il faut connaître la clé pour entrer.",
		pose: "posé une clé d'accès", retire: "retiré la clé d'accès",
	},
	l: {
		rang: "%", menu: "oui", source: "limit.c:115", libelle: "Limite",
		phrase: "Au-delà d'un nombre de personnes, plus personne n'entre.",
		pose: "limité le salon à {v} personnes", retire: "retiré la limite de personnes",
	},
	s: {
		rang: "%", menu: "oui", source: "secret.c:46", libelle: "Salon secret",
		phrase: "Le salon n'apparaît ni dans la liste des salons ni dans le WHOIS des personnes qui n'y sont pas.",
		pose: "rendu le salon secret", retire: "rendu le salon public",
	},
	c: {
		rang: "@", menu: "oui", source: "nocolor.c:53", libelle: "Couleurs bloquées",
		phrase: "Un message en couleur est refusé.",
		pose: "bloqué les couleurs", retire: "autorisé les couleurs",
	},
	S: {
		rang: "@", menu: "oui", source: "stripcolor.c:53", libelle: "Couleurs retirées",
		phrase: "Les couleurs et la mise en forme sont effacées des messages.",
		pose: "retiré les couleurs des messages", retire: "rétabli les couleurs des messages",
	},
	f: {
		rang: "@", menu: "lecture", source: "floodprot.c:890", libelle: "Anti-flood",
		phrase: "Le salon refuse les messages envoyés trop vite.",
		pose: "réglé l'anti-flood", retire: "retiré l'anti-flood",
	},
	H: {
		/* restrict-channelmodes "H" (D-062) : opers et services seulement,
		 * avant meme le rang du salon (mode.c:1042-1048). */
		rang: "oper", menu: "lecture", source: "history.c:482, restrict-channelmodes", libelle: "Messages précédents",
		phrase: "Les derniers messages du salon sont montrés à l'arrivée.",
		pose: "activé les messages précédents", retire: "désactivé les messages précédents",
	},

	p: {
		rang: "%", menu: "non", source: "private.c:45", libelle: "Salon privé",
		pose: "rendu le salon privé", retire: "levé le statut privé du salon",
	},
	C: {
		rang: "%", menu: "non", source: "noctcp.c:50", libelle: "Commandes CTCP bloquées",
		pose: "bloqué les commandes CTCP", retire: "autorisé les commandes CTCP",
	},
	N: {
		rang: "%", menu: "non", source: "nonickchange.c:49", libelle: "Changements de pseudo bloqués",
		pose: "bloqué les changements de pseudo", retire: "autorisé les changements de pseudo",
	},
	K: {
		/* Demande +i (974 sinon). */
		rang: "%", menu: "non", source: "noknock.c:103", libelle: "Demandes d'invitation bloquées",
		pose: "bloqué les demandes d'invitation", retire: "autorisé les demandes d'invitation",
	},
	T: {
		rang: "@", menu: "non", source: "nonotice.c:48", libelle: "Avis au salon bloqués",
		pose: "bloqué les avis envoyés au salon", retire: "autorisé les avis envoyés au salon",
	},
	R: {
		rang: "%", menu: "non", source: "regonly.c:50", libelle: "Entrée réservée aux comptes identifiés",
		pose: "réservé l'entrée aux comptes identifiés", retire: "ouvert l'entrée aux comptes non identifiés",
	},
	M: {
		rang: "%", menu: "non", source: "regonlyspeak.c:51", libelle: "Parole réservée aux comptes identifiés",
		pose: "réservé la parole aux comptes identifiés", retire: "rendu la parole aux comptes non identifiés",
	},
	z: {
		rang: "@", menu: "non", source: "secureonly.c:52", libelle: "Connexions chiffrées seulement",
		pose: "réservé le salon aux connexions chiffrées", retire: "ouvert le salon aux connexions non chiffrées",
	},
	Z: {
		rang: "serveur", menu: "non", source: "issecure.c:113", libelle: "Toutes les connexions sont chiffrées",
		pose: "signalé que toutes les connexions du salon sont chiffrées", retire: "signalé qu'une connexion du salon n'est pas chiffrée",
	},
	r: {
		rang: "services", menu: "non", source: "isregistered.c:64", libelle: "Salon enregistré",
		pose: "enregistré le salon", retire: "retiré l'enregistrement du salon",
	},
	G: {
		rang: "@", menu: "non", source: "censor.c:50", libelle: "Mots interdits filtrés",
		pose: "activé le filtre des mots interdits", retire: "désactivé le filtre des mots interdits",
	},
	D: {
		rang: "@", menu: "non", source: "delayjoin.c:43", libelle: "Arrivées masquées",
		pose: "masqué les arrivées jusqu'au premier message", retire: "rétabli l'affichage des arrivées",
	},
	d: {
		rang: "serveur", menu: "non", source: "delayjoin.c:160", libelle: "Arrivées en attente",
		pose: "gardé des arrivées masquées", retire: "révélé les arrivées en attente",
	},
	Q: {
		rang: "@", menu: "non", source: "nokick.c:49", libelle: "Expulsions interdites",
		pose: "interdit les expulsions", retire: "autorisé les expulsions",
	},
	V: {
		rang: "@", menu: "non", source: "noinvite.c:51", libelle: "Invitations bloquées",
		pose: "bloqué les invitations", retire: "autorisé les invitations",
	},
	L: {
		rang: "@", menu: "non", source: "link.c:113", libelle: "Renvoi quand le salon est plein",
		pose: "renvoyé le salon plein vers {v}", retire: "retiré le renvoi du salon plein",
	},
	F: {
		rang: "@", menu: "non", source: "floodprot.c:1059", libelle: "Profil anti-flood",
		pose: "choisi le profil anti-flood « {v} »", retire: "retiré le profil anti-flood",
	},
	O: {
		rang: "oper", menu: "non", source: "operonly.c:101", libelle: "Salon de l'équipe",
		pose: "réservé le salon à l'équipe", retire: "ouvert le salon au-delà de l'équipe",
	},
	P: {
		rang: "oper", menu: "non", source: "permanent.c:42", libelle: "Salon permanent",
		pose: "rendu le salon permanent", retire: "retiré la permanence du salon",
	},
};

/* Le reglage d'une lettre, ou null (lettre inconnue du fork). */
export function reglage(lettre) {
	return Object.prototype.hasOwnProperty.call(REGLAGES, lettre) ? REGLAGES[lettre] : null;
}

/*
 * Phrase d'un rang donne ou retire, apres « Jeff a » et avant le pseudo
 * (lot B) : « donné le statut opérateur à » Kahen. Jamais « les privilèges
 * de opérateur ». `prefixe` : celui de PREFIX (@, %, +).
 */
const PHRASES_RANG = {
	"@": ["donné le statut opérateur à", "retiré le statut opérateur à"],
	"%": ["donné le statut modérateur à", "retiré le statut modérateur à"],
	"+": ["donné la voix à", "retiré la voix à"],
};

export function phraseRang(prefixe, ajoute) {
	let p = PHRASES_RANG[prefixe] || ["donné un statut à", "retiré un statut à"];
	return ajoute ? p[0] : p[1];
}

/* Repli d'une valeur que la table ne sait pas lire (D-056). */
export const ANTIFLOOD_ACTIF = "Anti-flood actif";
export const HISTORIQUE_ACTIF = "Messages précédents actifs";
/* Une lettre inconnue du fork, dans une ligne du fil. */
export const REGLAGE_INCONNU = "changé un réglage du salon";

/* Types de floodprot.c:67-76. t et r comptent par personne. */
const TYPES_FLOOD = {
	c: ["commande CTCP", "commandes CTCP"],
	j: ["arrivée", "arrivées"],
	k: ["demande d'invitation", "demandes d'invitation"],
	m: ["message", "messages"],
	n: ["changement de pseudo", "changements de pseudo"],
	p: ["collage", "collages"],
	t: ["ligne", "lignes"],
	r: ["répétition", "répétitions"],
};

function accord(n, [un, plusieurs]) {
	return n + " " + (n > 1 ? plusieurs : un);
}

/*
 * Valeur de +f, « [10t#d,5r#d]:10 » : « plus de 10 lignes ou 5 répétitions
 * en 10 secondes : les messages en trop sont refusés ». La suite apres « : »
 * ne vient que si toutes les actions sont « d » (drop). null si la valeur
 * n'est pas lisible : l'appelant prend ANTIFLOOD_ACTIF.
 */
export function lireFlood(valeur) {
	let m = /^\[([^\]]+)\]:(\d+)$/.exec(valeur || "");
	if (!m) {
		return null;
	}
	let parties = [];
	let actions = [];
	for (let item of m[1].split(",")) {
		let p = /^(\d+)([a-z])(?:#([A-Za-z])(\d*))?$/.exec(item);
		if (!p || !TYPES_FLOOD[p[2]]) {
			return null;
		}
		parties.push(accord(Number(p[1]), TYPES_FLOOD[p[2]]));
		actions.push(p[3] || "");
	}
	let secondes = Number(m[2]);
	if (!parties.length || secondes <= 0) {
		return null;
	}
	let phrase = "plus de " + parties.join(" ou ") + " en " + accord(secondes, ["seconde", "secondes"]);
	if (actions.every((a) => a === "d")) {
		phrase += " : les messages en trop sont refusés";
	}
	return phrase;
}

const UNITES = {
	s: ["seconde", "secondes"], m: ["minute", "minutes"], h: ["heure", "heures"],
	d: ["jour", "jours"], w: ["semaine", "semaines"],
};

/*
 * Valeur de +H, « 50:7d » : « les 50 derniers messages, 7 jours au plus ».
 * null si illisible : l'appelant prend HISTORIQUE_ACTIF.
 */
export function lireHistorique(valeur) {
	let m = /^(\d+):(\d+)([smhdw])$/.exec(valeur || "");
	if (!m || Number(m[1]) <= 0 || Number(m[2]) <= 0) {
		return null;
	}
	let lignes = Number(m[1]);
	let debut = lignes > 1 ? "les " + lignes + " derniers messages" : "le dernier message";
	return debut + ", " + accord(Number(m[2]), UNITES[m[3]]) + " au plus";
}

/*
 * Le morceau de phrase d'un reglage, apres « Jeff a » : « activé le salon
 * modéré ». null pour une lettre inconnue du fork, et pour les listes et les
 * rangs, que components/buffer.js construit lui-meme.
 */
export function fragmentReglage(lettre, ajoute, valeur) {
	let r = reglage(lettre);
	if (!r || !r.pose) {
		return null;
	}
	if (!ajoute) {
		return r.retire;
	}
	if (lettre === "f") {
		let lu = lireFlood(valeur);
		return lu ? r.pose + " (" + lu + ")" : r.pose;
	}
	if (lettre === "H") {
		let lu = lireHistorique(valeur);
		return lu ? r.pose + " (" + lu + ")" : r.pose;
	}
	if (r.pose.includes("{v}")) {
		return valeur ? r.pose.replace("{v}", valeur) : r.pose.replace(/ (?:à|vers) \{v\}.*$| « \{v\} »/, "");
	}
	return r.pose;
}

/*
 * Les morceaux d'une phrase, separes comme en francais : « a, b et c ».
 * Les morceaux peuvent etre des chaines ou des noeuds (createNick) : on
 * rend une liste a deplier dans le gabarit.
 */
export function assembler(morceaux) {
	let sortie = [];
	morceaux.forEach((m, i) => {
		if (i > 0) {
			sortie.push(i === morceaux.length - 1 ? " et " : ", ");
		}
		sortie.push(m);
	});
	return sortie;
}

/*
 * Etat des modes d'un salon, { lettre: valeur }, apres un changement. Une
 * lettre sans valeur vaut true. Les listes (classe A de CHANMODES) et les
 * rangs n'y entrent pas : `type` est la classe de la lettre (« A », « B »,
 * « C », « D ») ou null (inconnue, gardee si elle arrive par un 324).
 */
export function appliquerMode(modes, lettre, ajoute, valeur, type) {
	if (type === "A") {
		return modes;
	}
	let suite = { ...modes };
	if (ajoute) {
		suite[lettre] = valeur === null || valeur === undefined ? true : valeur;
	} else {
		delete suite[lettre];
	}
	return suite;
}

/*
 * Lettres verrouillees d'un salon, apres un 742 qui annonce `annoncees`
 * (lettres seules, sans + ni -, unreal4.cpp:1692). Sans doublon, dans
 * l'ordre d'arrivee.
 */
export function unirVerrous(actuels, annoncees) {
	let vus = new Set(actuels || "");
	let sortie = actuels || "";
	for (let c of annoncees || "") {
		if (/[A-Za-z]/.test(c) && !vus.has(c)) {
			vus.add(c);
			sortie += c;
		}
	}
	return sortie;
}
