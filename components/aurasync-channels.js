/*
 * Metadonnees des salons AuraSync : categorie, icone, libelle.
 *
 * Source de verite unique pour la barre laterale du t'Chat. Le nom technique
 * du salon reste en minuscules sans accent (contrainte IRC) ; le libelle
 * affiche est derive ici.
 *
 * Les icones suivent le style des AuraMojis du site : viewBox 24, trait de
 * 1.9, extremites arrondies, pas de remplissage.
 */

import { html } from "../lib/index.js";

export const CATEGORIES = [
	{ id: "gestion", label: "Gestion" },
	{ id: "principaux", label: "Principaux" },
	{ id: "thematiques", label: "Thématiques" },
	{ id: "regions", label: "Régions" },
	{ id: "prives", label: "Messages privés" },
	{ id: "autres", label: "Autres" },
];

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
	home: ["M4 10.6L12 4.2l8 6.4V19.5H4z", "M9.8 19.5v-5h4.4v5"],
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
	columns: ["M12 3.4l8.2 4.8H3.8z", "M6.3 11v6.4", "M12 11v6.4", "M17.7 11v6.4", "M3.6 20.4h16.8"],
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
	trophy: [
		"M8.2 4.4h7.6v4.8a3.8 3.8 0 01-7.6 0z",
		"M8.2 6.2H5.4v1a3.2 3.2 0 003.1 3.2",
		"M15.8 6.2h2.8v1a3.2 3.2 0 01-3.1 3.2",
		"M12 13v4.2", "M9.4 19.6h5.2",
	],
	hands: [
		"M12 19.8s-5.6-3.6-5.6-7.6A3.4 3.4 0 0112 9.4a3.4 3.4 0 015.6 2.8c0 4-5.6 7.6-5.6 7.6z",
		"M12 4.4v2.6", "M8.4 5.6l1 2.2", "M15.6 5.6l-1 2.2",
	],
	spark: ["M12 3.4l2.1 5.3 5.3 2.1-5.3 2.1-2.1 5.3-2.1-5.3L4.6 10.8l5.3-2.1z", "M18.4 16.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"],
	pin: ["M12 20.8s5.9-5.8 5.9-10a5.9 5.9 0 10-11.8 0c0 4.2 5.9 10 5.9 10z", "M12 13.1a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z"],
	chat: ["M4 5.4h16v10.2H9.4L5.2 19v-3.4H4z", "M8 9h8", "M8 12h5"],
	hash: ["M9.2 4.2L7.4 19.8", "M16.6 4.2l-1.8 15.6", "M4.6 9h15", "M4 15h15"],
};

/* Salon technique -> categorie + icone. */
export const CHANNELS = {
	administration: { cat: "gestion", icon: "shield" },
	equipe: { cat: "gestion", icon: "users" },
	services: { cat: "gestion", icon: "terminal" },

	aurasync: { cat: "principaux", icon: "home", label: "AuraSync", rank: 1 },
	aide: { cat: "principaux", icon: "lifebuoy", rank: 2 },
	abus: { cat: "principaux", icon: "flag", rank: 3 },

	actualite: { cat: "thematiques", icon: "news" },
	politique: { cat: "thematiques", icon: "columns" },
	informatique: { cat: "thematiques", icon: "desktop" },
	musique: { cat: "thematiques", icon: "music" },
	cinema: { cat: "thematiques", icon: "movie" },
	jeux: { cat: "thematiques", icon: "gamepad" },
	sports: { cat: "thematiques", icon: "trophy" },
	addictions: { cat: "thematiques", icon: "hands" },
	spiritualite: { cat: "thematiques", icon: "spark" },
};

/* Les treize regions partagent la meme icone. */
for (let r of [
	"auvergne-rhone-alpes", "bourgogne-franche-comte", "bretagne",
	"centre-val-de-loire", "corse", "grand-est", "hauts-de-france",
	"ile-de-france", "normandie", "nouvelle-aquitaine", "occitanie",
	"pays-de-la-loire", "provence-alpes-cote-dazur",
]) {
	CHANNELS[r] = { cat: "regions", icon: "pin" };
}

/* Nom technique -> libelle affiche : majuscule sur chaque segment. */
export function channelLabel(name) {
	let bare = name.replace(/^[#&]+/, "");
	let meta = CHANNELS[bare.toLowerCase()];
	if (meta && meta.label) {
		return meta.label;
	}
	return bare
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("-");
}

export function channelMeta(name) {
	let bare = name.replace(/^[#&]+/, "").toLowerCase();
	return CHANNELS[bare] || null;
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
