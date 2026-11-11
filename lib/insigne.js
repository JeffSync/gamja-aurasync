/*
 * L'insigne du role sur le site (D-066, point 8, revise le 7 novembre) :
 * celui du profil, apps/web/src/lib/components/icons/RoleEmblem.svelte du
 * depot aurasync, en variante « ring » (fleur de vie pour le fondateur,
 * insignes d'administrateur, d'operateur et de moderateur, redessines le
 * 11 novembre : ailes, halo, balance). Module pur :
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

/* L'anneau qui tourne : r 22 pour le Fondateur (inchange), r 26,2 pour les
   insignes « ange », dont les ailes toucheraient le petit (D-073). */
export const ANNEAU = { tag: "g", attrs: { class: "ring-base", style: "transform-origin:28px 28px" } };

export const CERCLES_ANNEAU = {
	fondateur: { tag: "circle", attrs: { cx: "28", cy: "28", r: "22", stroke: "url(#asRingGrad)", "stroke-dasharray": "80 26", "stroke-linecap": "round", opacity: "0.85" } },
	equipe: { tag: "circle", attrs: { cx: "28", cy: "28", r: "26.2", stroke: "url(#asRingGrad)", "stroke-width": "1.6", "stroke-dasharray": "104 30", opacity: "0.8" } },
};

function cercle(cx, cy, r) {
	return { tag: "circle", attrs: { cx, cy, r } };
}

function plein(d) {
	return { tag: "path", attrs: { d, fill: "currentColor", "fill-opacity": "0.14" } };
}

function trait(d) {
	return { tag: "path", attrs: { d } };
}

function miroir(...enfants) {
	return { tag: "g", attrs: { transform: "matrix(-1 0 0 1 56 0)" }, enfants };
}

/*
 * Planche « Roles et infini », relue le 11 novembre a 17 h 35 :
 * Administrateur, le bouclier aux ailes deployees (A) ; Operateur, le buste
 * au halo pose (A) ; Moderateur, la balance. Dessines dans un carre de 48
 * (4 a 52). Sous 24 px, la version simplifiee (PETITS). Le Fondateur est
 * celui de la production.
 */
const BOUCLIER = plein("M28 17.5 L35 20.6 V27.6 C35 33 28 37 28 37 C28 37 21 33 21 27.6 V20.6 Z");
const AILE = "M21.3 22.6 C17 18.6 11.6 16.6 5.6 16.9 C7.6 19.3 9.6 20.5 11.9 21.1 C9.4 21.8 7.9 23.3 7.4 24.9 C9.9 25.5 12.7 25.1 14.7 24.5 C12.9 25.9 12.1 27.5 12.1 29.1 C15.6 28.7 18.7 27.5 21.1 25.9";
const AILE_PETITE = "M21.2 22.4 C16 18.6 10.6 17.2 5.8 17.6 C8.2 23.2 13.4 27.6 21.1 26.2 Z";
const PLATEAU = "M10.8 29 H20 C20 32 18 33.8 15.4 33.8 C12.8 33.8 10.8 32 10.8 29 Z";
const CORDES = "M15.4 19.6 L11.8 29 M15.4 19.6 L19 29";
const PLATEAU_PETIT = "M10.4 28.4 H19.6 C19.6 31.8 17.6 33.6 15 33.6 C12.4 33.6 10.4 31.8 10.4 28.4 Z";
const CORDES_PETITES = "M14.6 19.6 L11.4 28.4 M14.6 19.6 L18.6 28.4";

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
	administrator: [BOUCLIER, plein(AILE), miroir(plein(AILE))],
	operator: [
		{ tag: "circle", attrs: { cx: "28", cy: "28", r: "5.2", fill: "currentColor", "fill-opacity": "0.14" } },
		plein("M17.6 42 C17.6 36 22.2 33.6 28 33.6 C33.8 33.6 38.4 36 38.4 42 Z"),
		{ tag: "ellipse", attrs: { cx: "28", cy: "17.4", rx: "7.4", ry: "2.3" } },
	],
	moderator: [
		trait("M28 15 V40 M21.5 40.6 H34.5 M15.4 19.6 H40.6"),
		{ tag: "circle", attrs: { cx: "28", cy: "14.6", r: "1.8", fill: "currentColor", stroke: "none" } },
		trait(CORDES), plein(PLATEAU),
		miroir(trait(CORDES), plein(PLATEAU)),
	],
};

/* Sous 24 px (le Fondateur n'en a pas : son insigne de fiche est l'anneau). */
export const PETITS = {
	administrator: [BOUCLIER, plein(AILE_PETITE), miroir(plein(AILE_PETITE))],
	operator: [
		{ tag: "circle", attrs: { cx: "28", cy: "28.6", r: "5.4", fill: "currentColor", "fill-opacity": "0.14" } },
		plein("M17 43 C17 36.8 22 34.4 28 34.4 C34 34.4 39 36.8 39 43 Z"),
		{ tag: "ellipse", attrs: { cx: "28", cy: "17.6", rx: "8.2", ry: "2.6" } },
	],
	moderator: [
		trait("M28 15 V40 M21 40.6 H35 M14.6 19.6 H41.4"),
		plein(PLATEAU_PETIT), trait(CORDES_PETITES),
		miroir(plein(PLATEAU_PETIT), trait(CORDES_PETITES)),
	],
};

/* Trait d'un insigne « ange » a sa taille (RoleEmblem.svelte) ; le
   Fondateur garde TRAIT. */
export function traitDe(role, taille) {
	if (role === "founder") {
		return TRAIT;
	}
	return taille < 24 ? 3.4 : taille >= 80 ? 1.9 : 2.4;
}

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
	return { role, libelle: LIBELLES[role], teinte: TEINTES[role], traces: TRACES[role], petits: PETITS[role] || TRACES[role] };
}
