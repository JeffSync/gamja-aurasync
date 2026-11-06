/*
 * L'insigne du role sur le site (D-066, point 8, revise le 7 novembre) :
 * celui du profil, apps/web/src/lib/components/icons/RoleEmblem.svelte du
 * depot aurasync, en variante « ring » (fleur de vie pour le fondateur,
 * insignes d'administrateur, d'operateur et de moderateur). Module pur :
 * test/insigne.test.js compare ces traces a ceux du site.
 *
 * Les valeurs « {stroke * k} » sont celles du fichier Svelte, recalculees
 * au rendu (components/insigne.js).
 */

/* Libelles de apps/web/src/lib/utils/roles.ts */
export const LIBELLES = {
	founder: "Fondateur",
	administrator: "Administrateur",
	operator: "Opérateur",
	moderator: "Modérateur",
};

/* Teinte de l'insigne sur le profil (emblemTint, /u/[pseudo]) : texte 300 */
export const TEINTES = {
	founder: "#67e8f9",
	administrator: "#c4b5fd",
	operator: "#fcd34d",
	moderator: "#6ee7b7",
};

export const TRAIT = 2.4;

export const DEGRADE = {
	id: "asRingGrad",
	attrs: { x1: "0", y1: "0", x2: "1", y2: "1" },
	stops: [
		{ offset: "0", "stop-color": "#22d3ee" },
		{ offset: "1", "stop-color": "#8b5cf6" },
	],
};

export const ANNEAU = {
	tag: "g", attrs: { class: "ring-base", style: "transform-origin:28px 28px" },
	enfants: [
		{ tag: "circle", attrs: { cx: "28", cy: "28", r: "22", stroke: "url(#asRingGrad)", "stroke-dasharray": "80 26", "stroke-linecap": "round", opacity: "0.85" } },
	],
};

function cercle(cx, cy, r) {
	return { tag: "circle", attrs: { cx, cy, r } };
}

export const TRACES = {
	founder: [
		{
			tag: "g", attrs: { "stroke-width": "1", opacity: "0.9" },
			enfants: [
				cercle("28", "28", "7"),
				cercle("35", "28", "7"), cercle("31.5", "34.06", "7"), cercle("24.5", "34.06", "7"),
				cercle("21", "28", "7"), cercle("24.5", "21.94", "7"), cercle("31.5", "21.94", "7"),
				cercle("38.5", "34.06", "7"), cercle("28", "40.12", "7"), cercle("17.5", "34.06", "7"),
				cercle("17.5", "21.94", "7"), cercle("28", "15.88", "7"), cercle("38.5", "21.94", "7"),
			],
		},
		{ tag: "circle", attrs: { cx: "28", cy: "28", r: "1.7", fill: "currentColor", stroke: "none" } },
	],
	administrator: [
		{ tag: "path", attrs: { d: "M28 16 L37 20 V28 C37 35 28 40 28 40 C28 40 19 35 19 28 V20 Z", fill: "currentColor", "fill-opacity": "0.12", "stroke-linejoin": "round" } },
	],
	operator: [
		{ tag: "path", attrs: { d: "M30 15 L20 30 H27 L26 41 L37 25 H30 L30 15 Z", fill: "currentColor", "fill-opacity": "0.12", "stroke-linejoin": "round" } },
	],
	moderator: [
		{ tag: "circle", attrs: { cx: "28", cy: "28", r: "9.5", "stroke-width": "{stroke * 1.4}" } },
		cercle("28", "28", "3.4"),
		{ tag: "line", attrs: { x1: "28", y1: "16.5", x2: "28", y2: "21.6", "stroke-width": "{stroke * 1.4}", "stroke-linecap": "round" } },
		{ tag: "line", attrs: { x1: "28", y1: "34.4", x2: "28", y2: "39.5", "stroke-width": "{stroke * 1.4}", "stroke-linecap": "round" } },
		{ tag: "line", attrs: { x1: "16.5", y1: "28", x2: "21.6", y2: "28", "stroke-width": "{stroke * 1.4}", "stroke-linecap": "round" } },
		{ tag: "line", attrs: { x1: "34.4", y1: "28", x2: "39.5", y2: "28", "stroke-width": "{stroke * 1.4}", "stroke-linecap": "round" } },
	],
};

/* Une valeur « {stroke * k} » resolue pour un trait donne. */
export function valeur(v, trait) {
	let m = /^\{stroke \* ([\d.]+)\}$/.exec(v);
	return m ? String(Math.round(trait * parseFloat(m[1]) * 1000) / 1000) : v;
}

/* L'insigne d'un role, ou null pour « user » et tout role inconnu. */
export function insigneDe(role) {
	if (!Object.prototype.hasOwnProperty.call(TRACES, role)) {
		return null;
	}
	return { role, libelle: LIBELLES[role], teinte: TEINTES[role], traces: TRACES[role] };
}
