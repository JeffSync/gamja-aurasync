/*
 * La fiche d'un pseudo (D-066, point 8, variante A) et les messages prives
 * (point 5). Module pur, sans DOM : teste par test/fiche.test.js.
 *
 * La fiche vient de GET /api/irc/users/:pseudo/card, servie a la meme
 * origine avec le cookie de session. Son champ `kind` decide de tout
 * l'affichage, cas par cas comme au §6.3 de l'analyse
 * (docs/journal/2026-11-06-tchat-apparence-analyse.md, depot aurasync) :
 * profil, bloque_par_moi, indisponible, service, temporaire.
 *
 * Ce que la fiche n'affiche jamais : adresse, masque, e-mail, realname,
 * horaires, liste des salons. Le WHOIS technique n'existe que pour l'equipe
 * (`equipe` dans la reponse), dans un repli ferme.
 */

export const URL_FICHE = "/api/irc/users/";
export const DUREE_CACHE = 5 * 60 * 1000;

/* Rang dans le salon, en libelle neutre (D-057, D-066). */
export function rangSalon(membership) {
	if (!membership) {
		return null;
	}
	// ~ et & n'existent plus depuis D-057 : s'ils reviennent, ils gerent
	if (/[~&@]/.test(membership)) {
		return "gère le salon";
	}
	if (membership.includes("%")) {
		return "modère le salon";
	}
	if (membership.includes("+")) {
		return "a la parole";
	}
	return null;
}

/* Role sur le site : libelle a la forme neutre, couleurs du site. */
export const ROLES = {
	founder: { label: "Fondateur(rice)", classe: "role-founder" },
	administrator: { label: "Administrateur(rice)", classe: "role-administrator" },
	operator: { label: "Opérateur(rice)", classe: "role-operator" },
	moderator: { label: "Modérateur(rice)", classe: "role-moderator" },
};

export const TEXTES = {
	monProfil: "Mon profil",
	voirProfil: "Voir le profil",
	message: "Message privé",
	mentionner: "Mentionner",
	prive: "Profil privé",
	bloque: "Tu as bloqué cette personne",
	indisponible: "Aucun profil AuraSync à ce nom",
	service: "Service du t'Chat",
	temporaire: "Pseudo temporaire",
	chargement: "Chargement de la fiche…",
	erreur: "Fiche indisponible pour le moment",
	details: "Détails techniques",
};

/* Initiale d'un pseudo, en capitale ; « ? » s'il n'y a pas de lettre. */
export function initiale(nom) {
	let m = /[\p{L}\p{N}]/u.exec(nom || "");
	return m ? m[0].toUpperCase() : "?";
}

/*
 * L'avatar a montrer : une image servie a la meme origine (/uploads/…), ou
 * l'initiale sur le degrade du site, ou l'initiale sur fond neutre, ou
 * l'icone d'un service. Une adresse d'une autre origine n'est jamais
 * chargee : la CSP l'interdirait, et rien ne doit partir vers un tiers.
 */
export function avatarDe(fiche, pseudo) {
	let lettre = initiale(fiche && fiche.pseudo ? fiche.pseudo : pseudo);
	if (!fiche) {
		return { genre: "neutre", lettre };
	}
	switch (fiche.kind) {
	case "profil":
		if (typeof fiche.avatarUrl === "string" && /^\/uploads\/[^?#]+$/.test(fiche.avatarUrl) && !fiche.avatarUrl.includes("..")) {
			return { genre: "image", src: fiche.avatarUrl, lettre };
		}
		return { genre: "degrade", lettre };
	case "temporaire":
		return { genre: "degrade", lettre };
	case "service":
		return { genre: "service", lettre };
	default:
		// bloque_par_moi, indisponible, ou une reponse inconnue
		return { genre: "neutre", lettre };
	}
}

/*
 * Le contenu de la fiche, cas par cas (§6.3). `etat` : { fiche, chargement,
 * erreur }. Renvoie le titre, la ligne @pseudo, le badge de role, la note,
 * le lien du profil, les actions et le droit a la moderation.
 *
 * Actions : "query" (Message prive), "mention" (Mentionner).
 */
export function contenuFiche(pseudo, etat) {
	let fiche = etat && etat.fiche;
	let base = {
		titre: pseudo,
		pseudo: "@" + pseudo,
		role: null,
		note: null,
		sousNote: null,
		lien: null,
		actions: ["query", "mention"],
		moderation: true,
		avatar: avatarDe(null, pseudo),
	};
	if (!fiche) {
		// En attendant la reponse, ou si elle a echoue : rien sur la personne
		return { ...base, note: etat && etat.erreur ? TEXTES.erreur : TEXTES.chargement };
	}
	let avatar = avatarDe(fiche, pseudo);
	let lienProfil = (texte) => ({ texte, href: "/u/" + encodeURIComponent(fiche.pseudo || pseudo) });

	switch (fiche.kind) {
	case "profil": {
		let titre = fiche.displayName || fiche.pseudo;
		let role = ROLES[fiche.role] || null;
		let note = fiche.prive ? TEXTES.prive : null;
		let sousNote = fiche.statut || null;
		if (fiche.prive && !fiche.moi) {
			sousNote = null;
		}
		if (fiche.moi) {
			// Cas 1 : moi. Mon profil, et rien d'autre.
			return {
				...base, titre, pseudo: "@" + fiche.pseudo, role, note, sousNote, avatar,
				lien: lienProfil(TEXTES.monProfil), actions: [], moderation: false,
			};
		}
		// Cas 2, 3, 6 et 8
		return {
			...base, titre, pseudo: "@" + fiche.pseudo, role, note, sousNote, avatar,
			lien: lienProfil(TEXTES.voirProfil),
		};
	}
	case "bloque_par_moi":
		// Cas 4 : on reste adressable (D-050), mais pas de message prive propose
		return {
			...base, pseudo: "@" + fiche.pseudo, note: TEXTES.bloque, avatar,
			lien: lienProfil(TEXTES.voirProfil), actions: ["mention"],
		};
	case "service":
		// Cas 9 : ni lien, ni message prive, ni mention, ni moderation (D-053)
		return {
			...base, note: TEXTES.service, sousNote: fiche.libelle || null, avatar,
			actions: [], moderation: false,
		};
	case "temporaire":
		// Cas 10
		return { ...base, note: TEXTES.temporaire, avatar, actions: ["mention"] };
	default:
		// Cas 5 et 7, et toute reponse inconnue : rien ne trahit un blocage
		return { ...base, note: TEXTES.indisponible, avatar, actions: ["mention"] };
	}
}

/*
 * Cache des fiches en memoire, cinq minutes par pseudo (sans tenir compte
 * de la casse). Une requete en cours est partagee ; un echec n'est pas
 * garde. `options.fetch` et `options.now` servent aux tests.
 */
export function creerCacheFiches(options = {}) {
	let fetchFn = options.fetch || ((...args) => globalThis.fetch(...args));
	let now = options.now || (() => Date.now());
	let entrees = new Map();

	function cle(pseudo) {
		return pseudo.toLowerCase();
	}

	return {
		/* La fiche gardee et encore fraiche, ou null. */
		lire(pseudo) {
			let e = entrees.get(cle(pseudo));
			if (!e || !e.reponse || now() - e.t > DUREE_CACHE) {
				return null;
			}
			return e.reponse;
		},
		/* { card, equipe } ; rejette si la route ne repond pas 200. */
		charger(pseudo) {
			let k = cle(pseudo);
			let e = entrees.get(k);
			if (e && e.reponse && now() - e.t <= DUREE_CACHE) {
				return Promise.resolve(e.reponse);
			}
			if (e && e.enCours) {
				return e.enCours;
			}
			let enCours = Promise.resolve(fetchFn(URL_FICHE + encodeURIComponent(pseudo) + "/card", {
				credentials: "same-origin",
				headers: { Accept: "application/json" },
			})).then((res) => {
				if (!res.ok) {
					throw new Error("Fiche : HTTP " + res.status);
				}
				return res.json();
			}).then((corps) => {
				if (!corps || !corps.card || typeof corps.card.kind !== "string") {
					throw new Error("Fiche : réponse illisible");
				}
				let reponse = { card: corps.card, equipe: corps.equipe === true };
				entrees.set(k, { reponse, t: now() });
				return reponse;
			}).catch((err) => {
				entrees.delete(k);
				throw err;
			});
			entrees.set(k, { enCours });
			return enCours;
		},
		vider() {
			entrees.clear();
		},
	};
}

/*
 * Messages prives (point 5, variante A) : l'heure du dernier message RECU
 * dans la conversation, 0 s'il n'y en a pas. Un message recu est un PRIVMSG
 * ou un NOTICE dont l'auteur est la personne de la conversation. `cm` :
 * comparaison des pseudos sans casse, celle du serveur.
 */
export function dernierRecu(buf, cm) {
	let egal = cm || ((s) => s.toLowerCase());
	let nom = egal(buf.name);
	let messages = buf.messages || [];
	for (let i = messages.length - 1; i >= 0; i--) {
		let msg = messages[i];
		if ((msg.command === "PRIVMSG" || msg.command === "NOTICE") && msg.prefix && egal(msg.prefix.name) === nom) {
			let t = Date.parse(msg.tags && msg.tags.time);
			return Number.isNaN(t) ? 0 : t;
		}
	}
	return 0;
}

/* Le plus recent en haut ; a egalite, l'ordre d'ouverture. */
export function trierPrives(buffers, cm) {
	return buffers
		.map((buf, i) => ({ buf, i, t: dernierRecu(buf, cm) }))
		.sort((a, b) => b.t - a.t || a.i - b.i)
		.map((e) => e.buf);
}
