/*
 * Salons AuraSync dans la barre laterale et le panneau « Salons ».
 *
 * Les noms, les categories et les libelles des salons ouverts a tous
 * viennent du catalogue de l'API (GET /api/irc/channels, D-065), lu par
 * lib/selection.js : aucune liste de salons n'est ecrite ici. Ce fichier ne
 * garde que ce qui est propre au t'Chat :
 * - les icones, par salon et par categorie ;
 * - les salons de l'equipe (categorie « Gestion »), que l'API ne sert
 *   jamais ;
 * - les categories du t'Chat lui-meme (« Messages privés », « Autres »).
 *
 * Avant que le catalogue soit lu, ou si l'API ne repond pas, un salon
 * s'affiche sous son nom, dans « Autres » : rien ne casse.
 *
 * Les CLES d'icones sont en minuscules SANS ACCENT (iconKey) : un salon
 * renomme cote serveur (#cinema -> #cinéma) garde son icone. Ne jamais
 * accentuer une cle : ce serait refaire l'erreur de D-021, ou une chaine
 * d'affichage servait d'identifiant technique.
 *
 * Les icones suivent le style des AuraMojis du site : viewBox 24, trait de
 * 1.9, extremites arrondies, pas de remplissage. Leur couleur vient du
 * theme, par categorie (aurasync-theme.css, « Icones des salons »).
 */

import { html } from "../lib/index.js";

/* Traces des icones : tableaux de primitives, comme les AuraMojis. */
const ICONS = {
	shield: ["M12 3.2l7 2.8v5c0 4.2-2.9 7.6-7 8.6-4.1-1-7-4.4-7-8.6v-5z"],
	users: [
		"M9 11.5a3 3 0 100-6 3 3 0 000 6z",
		"M3.5 19.5c0-3 2.4-4.8 5.5-4.8s5.5 1.8 5.5 4.8",
		"M16.5 10.8a2.6 2.6 0 100-5.2",
		"M16.8 14.9c2.4.4 3.9 2 3.9 4.6",
	],
	terminal: ["M3.5 5.5h17v13h-17z", "M7 9.5l2.8 2.5-2.8 2.5", "M12.5 15h4.5"],
	// L'onde du logo AuraSync (D-066)
	pulse: ["M2.8 12h3.4l2.1-5.4 3.4 10.8 2.7-7.6 1.6 2.2h5.2"],
	lifebuoy: [
		"M12 20.2a8.2 8.2 0 100-16.4 8.2 8.2 0 000 16.4z",
		"M12 15.4a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z",
		"M6.2 6.2l3.4 3.4", "M14.4 14.4l3.4 3.4",
		"M17.8 6.2l-3.4 3.4", "M9.6 14.4l-3.4 3.4",
	],
	flag: ["M6 3.5v17", "M6 4.6h11.5l-2.6 4 2.6 4H6"],
	news: [
		"M3.5 6h13.5v13.5H3.5z", "M17 9.5h3.5v7.6a2.4 2.4 0 01-3.5 2.1",
		"M6.5 9.5h7.5", "M6.5 12.8h7.5", "M6.5 16h4.5",
	],
	// Un triangle simple, pour #politique (D-071, lot 4e ; avant, une urne)
	triangle: ["M12 4.4l8.6 15H3.4z"],
	desktop: ["M3.5 5.2h17v11.2h-17z", "M9.2 20.2h5.6", "M12 16.4v3.8"],
	music: [
		"M9.6 17.2a2.8 2.8 0 11-5.6 0 2.8 2.8 0 015.6 0z",
		"M20 14.6a2.8 2.8 0 11-5.6 0 2.8 2.8 0 015.6 0z",
		"M9.6 17.2V6.2L20 4v10.6",
	],
	movie: ["M3.4 8.6h17.2v11.2H3.4z", "M3.4 8.6L6 4.4h12l-2.6 4.2", "M9 4.4l-2.6 4.2", "M14 4.4l-2.6 4.2"],
	gamepad: [
		"M8 9.4h8a4.4 4.4 0 014.4 4.4v.9a2.9 2.9 0 01-5.5 1.3l-.5-1H9.6l-.5 1a2.9 2.9 0 01-5.5-1.3v-.9A4.4 4.4 0 018 9.4z",
		"M7.4 12v2.4", "M6.2 13.2h2.4", "M16 13.2h.02",
	],
	// Une coupe, pour #sports (D-071, lot 4f ; avant, un ballon)
	trophy: [
		"M7.5 4.5h9v4.8a4.5 4.5 0 01-9 0z",
		"M7.5 6.2H5.2v1.2a2.8 2.8 0 002.7 2.8", "M16.5 6.2h2.3v1.2a2.8 2.8 0 01-2.7 2.8",
		"M12 13.8v3.2", "M10.2 17h3.6", "M8.5 19.6h7",
	],
	// Une chaine brisee, pour #addictions : deux maillons qui se separent,
	// aucune substance designee (D-071, lot 4f ; avant, des mains)
	chain: [
		"M5.6 9.2h1.6a2.8 2.8 0 010 5.6H5.6a2.8 2.8 0 010-5.6z",
		"M16.8 9.2h1.6a2.8 2.8 0 010 5.6h-1.6a2.8 2.8 0 010-5.6z",
		"M12 5.4v2.4", "M12 16.2v2.4", "M14.6 6.4l-1 1.4", "M9.4 17.6l1-1.4",
	],
	spark: ["M12 3.4l2.1 5.3 5.3 2.1-5.3 2.1-2.1 5.3-2.1-5.3L4.6 10.8l5.3-2.1z", "M18.4 16.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"],
	pin: ["M12 20.8s5.9-5.8 5.9-10a5.9 5.9 0 10-11.8 0c0 4.2 5.9 10 5.9 10z", "M12 13.1a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z"],
	chat: ["M4 5.4h16v10.2H9.4L5.2 19v-3.4H4z", "M8 9h8", "M8 12h5"],
	hash: ["M9.2 4.2L7.4 19.8", "M16.6 4.2l-1.8 15.6", "M4.6 9h15", "M4 15h15"],
};

/* Icone par salon (cle SANS ACCENT), puis par categorie. */
const ICONES_SALONS = {
	administration: "shield",
	equipe: "users",
	services: "terminal",
	aurasync: "pulse",
	aide: "lifebuoy",
	abus: "flag",
	actualite: "news",
	politique: "triangle",
	informatique: "desktop",
	musique: "music",
	cinema: "movie",
	jeux: "gamepad",
	sports: "trophy",
	addictions: "chain",
	spiritualite: "spark",
};
const ICONES_CATEGORIES = { regions: "pin" };

/* Salons de l'equipe : jamais au catalogue de l'API. Libelle, puis nom
   d'affichage (D-071), qui ne differe du nom reel que par la casse. */
const GESTION = {
	administration: { label: "Administration", display: "#Administration" },
	equipe: { label: "Équipe", display: "#Équipe" },
	services: { label: "Services", display: "#Services" },
};

// Messages prives en tete de la barre (D-066, point 5) : la categorie
// n'apparait que s'il existe une conversation.
const AVANT = [
	{ id: "prives", label: "Messages privés" },
	{ id: "gestion", label: "Gestion" },
];
const APRES = [{ id: "autres", label: "Autres" }];

/* Le catalogue lu a l'API : { categories, salons } (lib/selection.js). */
let catalogue = null;

export function setCatalogue(lu) {
	catalogue = lu && lu.salons instanceof Map ? lu : null;
}

/* Categories, dans l'ordre d'affichage. */
export function categories() {
	return AVANT.concat(catalogue ? catalogue.categories : [], APRES);
}

/*
 * Nom de salon -> cle d'icone : sans prefixe, minuscules, sans diacritiques
 * (NFD isole les accents, qu'on jette).
 */
export function iconKey(name) {
	return name
		.replace(/^[#&]+/, "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

/* Casse ASCII seule, comme le serveur et l'API. */
function cleCatalogue(name) {
	return name.normalize("NFC").replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/*
 * { cat, icon, label, display, rank } d'un salon connu (catalogue ou
 * equipe), ou null. `rank` suit l'ordre du catalogue dans les salons principaux.
 */
export function channelMeta(name) {
	if (typeof name !== "string") {
		return null;
	}
	let key = iconKey(name);
	let salon = catalogue ? catalogue.salons.get(cleCatalogue(name)) : null;
	if (salon) {
		return {
			cat: salon.category,
			icon: ICONES_SALONS[key] || ICONES_CATEGORIES[salon.category] || "hash",
			label: salon.label,
			display: salon.display || salon.name,
			rank: salon.category === "principaux" ? salon.rang + 1 : undefined,
		};
	}
	if (GESTION[key]) {
		return { cat: "gestion", icon: ICONES_SALONS[key], label: GESTION[key].label, display: GESTION[key].display };
	}
	return null;
}

/*
 * Salon d'ecoute (indicateur `sensible` de l'API, D-066) : une notification
 * n'en donne jamais le nom. Tant que le catalogue n'est pas lu, tout salon
 * est traite comme sensible, et de meme si l'API ne sert pas l'indicateur
 * (fork deploye avant l'API) : dans le doute, on se tait.
 */
export function salonSensible(name) {
	if (!catalogue || !catalogue.sensibleServi) {
		return true;
	}
	let salon = typeof name === "string" ? catalogue.salons.get(cleCatalogue(name)) : null;
	return Boolean(salon && salon.sensible);
}

/*
 * Salon discret (indicateur `discreet` de l'API, D-065, point 11) : sous
 * 3 personnes, on dit « moins de 3 », jamais le chiffre. Sans l'indicateur
 * (catalogue pas lu, API plus ancienne), #abus et #addictions le restent.
 */
const DISCRETS = new Set(["abus", "addictions"]);
export function salonDiscret(name) {
	if (typeof name !== "string") {
		return false;
	}
	if (catalogue && catalogue.discretServi) {
		let salon = catalogue.salons.get(cleCatalogue(name));
		return Boolean(salon && salon.discreet);
	}
	return DISCRETS.has(iconKey(name));
}

/*
 * Nombre de personnes d'un salon, en tete de la colonne (D-066, note du
 * 8 novembre au soir) : { texte, label }. Le texte est court, a cote de
 * l'icone de profil ; le libelle est la phrase entiere, pour les lecteurs
 * d'ecran. Salon discret sous 3 : « moins de 3 personnes ».
 */
export function comptePersonnes(name, nombre) {
	if (salonDiscret(name) && nombre < 3) {
		return { texte: "< 3", label: "moins de 3 personnes" };
	}
	return { texte: String(nombre), label: `${nombre} personne${nombre > 1 ? "s" : ""}` };
}

/*
 * Lettres verrouillees d'un salon selon le catalogue (D-068, point 2), ou
 * null : salon hors catalogue, catalogue pas encore lu, ou API qui ne sert
 * pas le champ. Le 742 du serveur complete en direct (buf.verrous).
 */
export function verrousCatalogue(name) {
	if (!catalogue || typeof name !== "string") {
		return null;
	}
	let salon = catalogue.salons.get(cleCatalogue(name));
	return salon && typeof salon.locked === "string" ? salon.locked : null;
}

/*
 * Nom d'affichage d'un salon (D-071) : #Aide pour #aide, #Île-de-France
 * pour #île-de-france. Un salon hors catalogue garde son nom brut. Seul ce
 * que le t'Chat ecrit lui-meme passe par ici : les lignes du serveur et des
 * services gardent le nom reel.
 */
export function channelDisplay(name) {
	let meta = channelMeta(name);
	return meta && meta.display ? meta.display : name;
}

/* Nom technique -> libelle affiche ; le nom sans « # » s'il est inconnu. */
export function channelLabel(name) {
	let meta = channelMeta(name);
	return meta ? meta.label : name.replace(/^[#&]+/, "");
}

export function channelIcon(iconName) {
	let paths = ICONS[iconName] || ICONS.hash;
	return html`
		<svg
			class="chan-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.9"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			${paths.map((d) => html`<path d=${d}/>`)}
		</svg>
	`;
}

export { ICONS };
