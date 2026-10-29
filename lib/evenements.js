/*
 * Arrivees, departs et deconnexions dans un salon (D-062).
 *
 * Les textes du serveur ne s'affichent jamais bruts (D-056) : une raison de
 * deconnexion connue est traduite, une raison inconnue est tue. Le texte
 * qu'une personne ecrit en quittant (« Quit: … ») n'est pas montre : les
 * logiciels y mettent leur publicite, en anglais. Le motif d'un PART, lui,
 * est ecrit par la personne qui part : il est montre, sauf les formules
 * par defaut des logiciels.
 */

/* Au-dela, « et N autres ». */
export const PLAFOND_PSEUDOS = 3;

/*
 * Une deconnexion suivie du retour de la meme personne dans ce delai est
 * une reconnexion (page rechargee, reseau mobile) : les deux lignes sont
 * retirees d'un groupe. Au-dela, ce sont deux evenements, montres.
 */
export const DELAI_RECONNEXION_MS = 60 * 1000;

const VERBES = {
	JOIN: ["a rejoint le salon", "ont rejoint le salon"],
	PART: ["a quitté le salon", "ont quitté le salon"],
	QUIT: ["s'est déconnecté(e)", "se sont déconnecté(e)s"],
};

export function verbe(commande, nombre) {
	let v = VERBES[commande];
	return v ? v[nombre > 1 ? 1 : 0] : null;
}

/* Pseudos distincts, dans l'ordre : { visibles, autres }. */
export function plafonner(pseudos, plafond = PLAFOND_PSEUDOS) {
	let uniques = [...new Set(pseudos)];
	if (uniques.length <= plafond) {
		return { visibles: uniques, autres: 0 };
	}
	return { visibles: uniques.slice(0, plafond), autres: uniques.length - plafond };
}

export function texteAutres(n) {
	return n === 1 ? "1 autre" : n + " autres";
}

/*
 * Morceaux d'une liste de pseudos, pour le rendu : chaque pseudo est un
 * { pseudo }, « et N autres » un { autres: N }, le reste du texte.
 */
export function morceauxListe({ visibles, autres }) {
	let noms = visibles.map((pseudo) => ({ pseudo }));
	if (autres > 0) {
		noms.push({ autres });
	}
	let out = [];
	noms.forEach((nom, i) => {
		if (i > 0) {
			out.push(i === noms.length - 1 ? " et " : ", ");
		}
		out.push(nom);
	});
	return out;
}

/*
 * Resume d'un groupe : par commande, dans l'ordre ou chacune apparait
 * (« Bob a quitté le salon, Bob a rejoint le salon » : parti, puis
 * revenu), la liste plafonnee et le verbe accorde au nombre de personnes.
 */
export function resumerGroupe(messages) {
	let parCommande = new Map();
	for (let msg of messages) {
		if (!VERBES[msg.command]) {
			continue;
		}
		if (!parCommande.has(msg.command)) {
			parCommande.set(msg.command, []);
		}
		parCommande.get(msg.command).push(msg.prefix.name);
	}
	let out = [];
	for (let [commande, pseudos] of parCommande) {
		let liste = plafonner(pseudos);
		let nombre = liste.visibles.length + liste.autres;
		out.push({ commande, liste, verbe: verbe(commande, nombre) });
	}
	return out;
}

/* Le meme resume en texte : pour les tests et la lecture d'ecran. */
export function texteGroupe(messages) {
	return resumerGroupe(messages).map(({ liste, verbe }) => {
		let noms = morceauxListe(liste).map((m) => {
			if (typeof m === "string") {
				return m;
			}
			return m.pseudo !== undefined ? m.pseudo : texteAutres(m.autres);
		}).join("");
		return noms + " " + verbe;
	}).join(", ");
}

/*
 * Retire d'une suite d'evenements les reconnexions (QUIT puis JOIN de la
 * meme personne en moins de DELAI_RECONNEXION_MS) et les NICK sans effet.
 * Un PART suivi d'un JOIN reste : c'est un choix de la personne, montre.
 */
export function retirerReconnexions(messages, cm = (s) => s) {
	let quits = new Map();
	let garder = messages.map(() => true);
	messages.forEach((msg, i) => {
		let nom = cm(msg.prefix.name);
		if (msg.command === "QUIT") {
			quits.set(nom, i);
		} else if (msg.command === "JOIN" && quits.has(nom)) {
			let q = quits.get(nom);
			quits.delete(nom);
			let ecart = new Date(msg.tags.time) - new Date(messages[q].tags.time);
			if (ecart >= 0 && ecart < DELAI_RECONNEXION_MS) {
				garder[q] = false;
				garder[i] = false;
			}
		} else if (msg.command === "NICK" && msg.prefix.name === msg.params[0]) {
			garder[i] = false;
		}
	});
	return messages.filter((_msg, i) => garder[i]);
}

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

/* Formules par defaut des logiciels, sans interet. */
const PARTS_VIDES = /^(leaving|bye|part|quit|goodbye)\.?$/i;

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
		if (PARTS_VIDES.test(raison) || /IRC/i.test(raison)) {
			return null;
		}
		return "« " + raison + " »";
	}
	return null;
}
