/*
 * Tests du theme AuraSync (D-066, lot 1) :
 * - aucune couleur ne depend du theme du systeme : chaque regle que
 *   style.css place sous @media (prefers-color-scheme: …) est redefinie
 *   par aurasync-theme.css, au meme selecteur, hors de toute media query ;
 * - contrastes WCAG AA : 4,5:1 pour le texte, 3:1 pour les reperes, sur
 *   les fonds les plus clairs mesures dans les captures ;
 * - polices du site servies par le fork, plus aucune « Inter ».
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

globalThis.window = globalThis.window || {};


const racine = new URL("../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, racine), "utf8");
const STYLE = lire("style.css");
const THEME = lire("aurasync-theme.css");

/*
 * Fonds de reference, les plus clairs mesures sur les captures du lot 1
 * (docs/journal/2026-11-06-tchat-lot1.md) : tout le texte est clair, donc
 * le fond le plus clair est le pire cas.
 */
const FOND_BARRE = "#102738"; // barre des salons, sous l'orbe cyan
const FOND_FIL = "#1a273f";   // fil, sous le filigrane du logo

/* ── Lecture du CSS ───────────────────────────────────────────────────── */

/*
 * CSS -> [{ media, selecteurs, decls }]. Suffit pour ces deux feuilles :
 * regles simples et un niveau de @media ou @keyframes (media : sa tete). Les @font-face sont gardees sous
 * le selecteur « @font-face ».
 */
function analyser(css) {
	css = css.replace(/\/\*[\s\S]*?\*\//g, "");
	let regles = [];
	let i = 0;

	function bloc(media) {
		while (i < css.length) {
			let ouvre = css.indexOf("{", i);
			let ferme = css.indexOf("}", i);
			if (ferme !== -1 && (ouvre === -1 || ferme < ouvre)) {
				i = ferme + 1;
				return;
			}
			if (ouvre === -1) {
				i = css.length;
				return;
			}
			let tete = css.slice(i, ouvre).trim();
			i = ouvre + 1;
			// @media, @keyframes… : un bloc de regles imbrique
			if (tete.startsWith("@") && !tete.startsWith("@font-face")) {
				bloc(tete);
				continue;
			}
			let fin = css.indexOf("}", i);
			let corps = css.slice(i, fin);
			i = fin + 1;
			let decls = new Map();
			for (let d of corps.split(";")) {
				let k = d.indexOf(":");
				if (k > 0) {
					decls.set(d.slice(0, k).trim(), d.slice(k + 1).trim());
				}
			}
			regles.push({
				media,
				selecteurs: tete.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
				decls,
			});
		}
	}
	bloc(null);
	return regles;
}

const regleStyle = analyser(STYLE);
const regleTheme = analyser(THEME);

/* Une propriete, ou un raccourci qui la couvre. */
const RACCOURCIS = {
	"background-color": ["background"],
	"border-color": ["border"],
	"outline": [],
};

/* Declarations du theme, hors media, pour un selecteur. */
function declsTheme(selecteur) {
	let props = new Map();
	for (let r of regleTheme) {
		if (r.media === null && r.selecteurs.includes(selecteur)) {
			for (let [k, v] of r.decls) {
				props.set(k, v);
			}
		}
	}
	return props;
}

/* Variables de :root du theme, resolues (var() imbriques compris). */
const VARS = declsTheme(":root");
function resoudre(valeur) {
	let v = valeur;
	for (let n = 0; n < 10 && /var\(/.test(v); n++) {
		v = v.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/, (_, nom, repli) => {
			if (VARS.has(nom)) {
				return VARS.get(nom);
			}
			assert.ok(repli, `variable inconnue ${nom}`);
			return repli;
		});
	}
	return v.replace(/\s*\/\*.*\*\/\s*/, "").trim();
}

/* ── Couleurs et contrastes ───────────────────────────────────────────── */

/* "#rrggbb" ou "rgba(r, g, b, a)" -> { rgb: [r, g, b], a } */
function couleur(texte) {
	let v = resoudre(texte);
	let m = v.match(/^#([0-9a-f]{6})$/i);
	if (m) {
		return { rgb: [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)), a: 1 };
	}
	m = v.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
	assert.ok(m, `couleur illisible : ${texte} -> ${v}`);
	return { rgb: [m[1], m[2], m[3]].map(Number), a: m[4] === undefined ? 1 : Number(m[4]) };
}

/* Une couleur, translucide ou non, posee sur un fond opaque. */
function sur(texte, fond) {
	let c = couleur(texte);
	let f = couleur(fond).rgb;
	return c.rgb.map((v, k) => Math.round(v * c.a + f[k] * (1 - c.a)));
}

function luminance(rgb) {
	let [r, g, b] = rgb.map((v) => {
		v /= 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
	let [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

function hex(rgb) {
	return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/* Teinte HSL, en degres. */
function teinte(rgb) {
	let [r, g, b] = rgb.map((v) => v / 255);
	let max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
	if (d === 0) {
		return 0;
	}
	let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return (h * 60 + 360) % 360;
}

function auMoins(rgbTexte, rgbFond, minimum, quoi) {
	let c = contraste(rgbTexte, rgbFond);
	assert.ok(
		c >= minimum,
		`${quoi} : ${hex(rgbTexte)} sur ${hex(rgbFond)} = ${c.toFixed(2)}:1, il faut ${minimum}:1`,
	);
}

/* ── Independance du theme du systeme ─────────────────────────────────── */

test("le theme ne depend jamais de prefers-color-scheme", () => {
	assert.equal(/prefers-color-scheme/.test(THEME.replace(/\/\*[\s\S]*?\*\//g, "")), false);
	assert.equal(VARS.get("color-scheme"), "dark");
});

test("chaque regle de style.css sous prefers-color-scheme est redefinie par le theme", () => {
	let blocs = regleStyle.filter((r) => r.media && /prefers-color-scheme/.test(r.media));
	assert.ok(blocs.length > 20, "style.css a change : relire ses blocs prefers-color-scheme");
	let manquants = [];
	for (let r of blocs) {
		for (let sel of r.selecteurs) {
			let theme = declsTheme(sel);
			for (let prop of r.decls.keys()) {
				let couvert = theme.has(prop) || (RACCOURCIS[prop] || []).some((p) => theme.has(p));
				if (!couvert) {
					manquants.push(`${sel} { ${prop} }`);
				}
			}
		}
	}
	assert.deepEqual(manquants, []);
});

test("etats de la barre et seize couleurs de pseudo : definis par le theme", () => {
	let attendus = [
		["#buffer-list li a", "color"],
		["#buffer-list li a:hover", "color"],
		["#buffer-list li a:hover", "background-color"],
		["#buffer-list li.unread-message a", "color"],
		["#buffer-list li.unread-highlight a", "color"],
		["#buffer-list li.active a", "color"],
		["#buffer-list li.active a", "background-color"],
		["#buffer-list li.active a", "box-shadow"],
		["#buffer .highlight .nick", "color"],
		["#buffer .highlight .nick", "background-color"],
	];
	for (let n = 1; n <= 16; n++) {
		attendus.push([`#buffer .nick-${n}`, "color"]);
	}
	for (let [sel, prop] of attendus) {
		assert.ok(declsTheme(sel).has(prop), `${sel} { ${prop} } manque dans le theme`);
	}
});

/* ── Contrastes ───────────────────────────────────────────────────────── */

const ETAT = (sel, prop) => declsTheme(sel).get(prop);
const FOND_ACTIF = sur(ETAT("#buffer-list li.active a:hover", "background-color"), FOND_BARRE);
const FOND_SURVOL = sur(ETAT("#buffer-list li a:hover", "background-color"), FOND_BARRE);
const BARRE = couleur(FOND_BARRE).rgb;
const FIL = couleur(FOND_FIL).rgb;

test("texte de la barre : 4,5:1 dans chaque etat", () => {
	let texte = (sel) => couleur(ETAT(sel, "color")).rgb;
	auMoins(texte("#buffer-list li a"), BARRE, 4.5, "salon au repos");
	auMoins(texte("#buffer-list li a:hover"), FOND_SURVOL, 4.5, "salon survole");
	auMoins(texte("#buffer-list li.unread-message a"), FOND_SURVOL, 4.5, "salon non lu");
	auMoins(texte("#buffer-list li.unread-highlight a"), FOND_SURVOL, 4.5, "salon avec mention");
	auMoins(texte("#buffer-list li.active a"), FOND_ACTIF, 4.5, "salon actif");
	auMoins(couleur("var(--aura-hash)").rgb, FOND_SURVOL, 4.5, "diese");
	auMoins(texte("#buffer-list li.active .chan-hash"), FOND_ACTIF, 4.5, "diese du salon actif");
	auMoins(couleur(ETAT(".chan-group-title", "color")).rgb, BARRE, 4.5, "titre de categorie");
	auMoins(couleur("var(--aura-text-dim)").rgb, FIL, 4.5, "texte discret sur le fil");
	auMoins(couleur(ETAT("#chan-browse", "color")).rgb, BARRE, 4.5, "bouton « Salons »");
});

test("salon actif : barre cyan de 3 px a 3:1", () => {
	let ombre = ETAT("#buffer-list li.active a", "box-shadow");
	assert.match(ombre, /^inset 3px 0 0 /);
	let barre = ombre.match(/var\(--[\w-]+\)|#[0-9a-f]{6}/i)[0];
	auMoins(couleur(barre).rgb, FOND_ACTIF, 3, "barre du salon actif");
});

test("seize couleurs de pseudo : 4,5:1 sur le fil, aucune en rose", () => {
	let vues = new Set();
	for (let n = 1; n <= 16; n++) {
		let c = couleur(ETAT(`#buffer .nick-${n}`, "color")).rgb;
		auMoins(c, FIL, 4.5, `pseudo ${n}`);
		let h = teinte(c);
		assert.ok(h < 290 || h > 350, `pseudo ${n} : ${hex(c)} est rose`);
		vues.add(hex(c));
	}
	assert.equal(vues.size, 16, "deux couleurs de pseudo identiques");
	let marque = sur(ETAT("#buffer .highlight .nick", "background-color"), FOND_FIL);
	auMoins(couleur(ETAT("#buffer .highlight .nick", "color")).rgb, marque, 4.5, "pseudo d'une mention");
});

/* ── Polices, logo, icone de la PWA ───────────────────────────────────── */

test("polices du site servies par le fork, avec leur licence, sans « Inter »", () => {
	let fontes = regleTheme.filter((r) => r.selecteurs.includes("@font-face"));
	let fichiers = fontes.map((r) => r.decls.get("src").match(/url\("\.\/([^"]+)"\)/)[1]);
	assert.deepEqual(fichiers.sort(), [
		"fonts/hanken-grotesk-latin-ext-wght-normal.woff2",
		"fonts/hanken-grotesk-latin-wght-normal.woff2",
		"fonts/sora-latin-ext-wght-normal.woff2",
		"fonts/sora-latin-wght-normal.woff2",
	]);
	for (let f of fichiers) {
		assert.ok(existsSync(new URL(f, racine)), f);
	}
	for (let licence of ["fonts/OFL-hanken-grotesk.txt", "fonts/OFL-sora.txt"]) {
		assert.match(lire(licence), /SIL Open Font License, Version 1\.1/);
		assert.ok(lire("index.html").includes(`<link rel="license" href="./${licence}">`), licence);
	}
	// Rien d'une autre origine
	assert.equal(/url\(\s*["']?(https?:)?\/\//.test(THEME), false);
	assert.equal(/\bInter\b/.test(THEME), false);
	assert.match(resoudre(declsTheme("body").get("font-family")), /^"Hanken Grotesk Variable"/);
});

