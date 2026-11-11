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
	// Un clap : la planche et ses lignes, le clapet ouvert (D-073)
	movie: [
		"M3.6 12.2h16.8v8.2H3.6z",
		"M6.6 15.3h6.4",
		"M6.6 17.9h3.8",
		"M3.6 9.6h16.8v2.6H3.6z",
		"M8.2 12.2L10.6 9.6",
		"M13.8 12.2L16.2 9.6",
		"M3.6 9.6L18.07 4.33L17.18 1.89L2.71 7.16z",
		"M7.73 8.1L9.1 4.83",
		"M13 6.18L14.36 2.92",
	],
	// La manette, deux cartes a jouer derriere elle (D-073)
	gamepad: [
		"M6.83 10.8L4.98 4.73L10.72 2.98L11.61 5.9",
		"M10.95 10.8L13.13 2.65L18.93 4.2L17.16 10.8",
		"M15.35 4.88L15.78 5.98L14.85 6.72L14.42 5.62z",
		"M8 10.8h8a4.4 4.4 0 014.4 4.4v.9a2.9 2.9 0 01-5.5 1.3l-.5-1H9.6l-.5 1a2.9 2.9 0 01-5.5-1.3v-.9A4.4 4.4 0 018 10.8z",
		"M7.4 13.4v2.4",
		"M6.2 14.6h2.4",
		"M16 14.6h.02",
	],
	// Une coupe, pour #sports (D-071, lot 4f ; avant, un ballon)
	trophy: [
		"M7.5 4.5h9v4.8a4.5 4.5 0 01-9 0z",
		"M7.5 6.2H5.2v1.2a2.8 2.8 0 002.7 2.8", "M16.5 6.2h2.3v1.2a2.8 2.8 0 01-2.7 2.8",
		"M12 13.8v3.2", "M10.2 17h3.6", "M8.5 19.6h7",
	],
	// Une chaine brisee, pour #addictions : trois maillons ovales, le
	// troisieme ouvert, deux eclats a son ouverture ; aucune substance
	// designee (D-071, lot 4f ; redessinee par D-073)
	chain: [
		"M10.05 13.22L10.22 13.59L10.31 14L10.31 14.45L10.23 14.91L10.06 15.38L9.8 15.85L9.47 16.31L9.07 16.74L8.62 17.14L8.12 17.49L7.59 17.79L7.03 18.02L6.47 18.19L5.91 18.28L5.38 18.31L4.88 18.25L4.42 18.13L4.02 17.93L3.69 17.67L3.43 17.35L3.26 16.98L3.17 16.57L3.17 16.13L3.26 15.66L3.43 15.19L3.68 14.72L4.01 14.26L4.41 13.83L4.86 13.43L5.36 13.08L5.9 12.78L6.45 12.55L7.02 12.38L7.57 12.29L8.11 12.27L8.61 12.32L9.06 12.44L9.46 12.64L9.79 12.9L10.05 13.22z",
		"M14.88 10.2L15.06 10.57L15.15 10.98L15.15 11.42L15.06 11.89L14.89 12.36L14.63 12.83L14.31 13.29L13.91 13.72L13.45 14.12L12.95 14.47L12.42 14.77L11.86 15L11.3 15.17L10.75 15.26L10.21 15.29L9.71 15.23L9.25 15.11L8.86 14.91L8.52 14.65L8.27 14.33L8.09 13.96L8 13.55L8 13.11L8.09 12.64L8.26 12.17L8.52 11.7L8.85 11.24L9.24 10.81L9.7 10.41L10.2 10.06L10.73 9.76L11.29 9.53L11.85 9.36L12.41 9.27L12.94 9.24L13.44 9.3L13.9 9.42L14.3 9.62L14.63 9.88L14.88 10.2z",
		"M14.98 7.72L15.26 7.31L15.59 6.91L15.97 6.55L16.39 6.21L16.84 5.91L17.32 5.65L17.82 5.45L18.32 5.3L18.81 5.2L19.3 5.16L19.75 5.18L20.18 5.26L20.57 5.4L20.91 5.59L21.19 5.83L21.41 6.12L21.57 6.44L21.66 6.81L21.69 7.19L21.64 7.6L21.53 8.02L21.34 8.44L21.1 8.86L20.79 9.26L20.44 9.64L20.04 10L19.6 10.32L19.13 10.59L18.64 10.82L18.14 11L17.65 11.13L17.16 11.19",
		"M13.55 6.85L12.4 6.15",
		"M17.72 12.75L18.18 14",
	],
	// La graine de vie, sept cercles, pour #spiritualite (D-073). La fleur
	// de vie reste l'insigne du Fondateur.
	spark: [
		"M7.1 12a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
		"M7.1 16.9a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
		"M2.86 14.45a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
		"M2.86 9.55a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
		"M7.1 7.1a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
		"M11.34 9.55a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
		"M11.34 14.45a4.9 4.9 0 1 0 9.8 0a4.9 4.9 0 1 0 -9.8 0z",
	],
	pin: ["M12 20.8s5.9-5.8 5.9-10a5.9 5.9 0 10-11.8 0c0 4.2 5.9 10 5.9 10z", "M12 13.1a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z"],
	chat: ["M4 5.4h16v10.2H9.4L5.2 19v-3.4H4z", "M8 9h8", "M8 12h5"],
	hash: ["M9.2 4.2L7.4 19.8", "M16.6 4.2l-1.8 15.6", "M4.6 9h15", "M4 15h15"],
};

/* Epaisseur propre a une icone, en fraction du trait commun (D-073) : un
   nombre pour tous ses traces, un tableau trace par trace. La graine de vie
   se bouche au trait commun ; les eclats de la chaine sont plus fins que
   ses maillons. Le trait commun vient du theme (--epaisseur-icone). */
const ICON_TRAITS = {
	spark: 0.62,
	chain: [1, 1, 1, 0.74, 0.74],
};

function traitIcone(iconName, i) {
	let t = ICON_TRAITS[iconName];
	if (t === undefined) {
		return 1;
	}
	return typeof t === "number" ? t : (t[i] ?? 1);
}

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
	let nom = ICONS[iconName] ? iconName : "hash";
	let style = (i) => {
		let t = traitIcone(nom, i);
		return t === 1 ? null : `stroke-width: calc(var(--epaisseur-icone, 1.9px) * ${t})`;
	};
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
			${paths.map((d, i) => html`<path d=${d} style=${style(i)}/>`)}
		</svg>
	`;
}

export { ICONS, ICON_TRAITS };
