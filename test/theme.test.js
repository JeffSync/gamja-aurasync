/*
 * Tests du theme AuraSync (D-066, lots 1 et 2) :
 * - aucune couleur ne depend du theme du systeme : chaque regle que
 *   style.css place sous @media (prefers-color-scheme: …) est redefinie
 *   par aurasync-theme.css, au meme selecteur, hors de toute media query ;
 * - contrastes WCAG AA : 4,5:1 pour le texte, 3:1 pour les reperes, sur
 *   les fonds les plus clairs mesures dans les captures ;
 * - icones des salons en couleur, jamais en rose, et leurs traces ;
 * - polices du site servies par le fork, plus aucune « Inter » ;
 * - lot 2 : mentions dans le fil, marques de la barre, pastille de ☰,
 *   entree « Notifications » et proposition, contrastes compris.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

globalThis.window = globalThis.window || {};

const { lireCatalogue } = await import("../lib/selection.js");
const channels = await import("../components/aurasync-channels.js");
const { default: BufferList, rangDansLaBarre } = await import("../components/buffer-list.js");
const { BufferType, Unread, ServerStatus } = await import("../state.js");

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

test("un nom de salon trop long passe a la ligne, sans etre coupe", () => {
	let nom = declsTheme(".chan-name");
	assert.equal(nom.get("white-space"), undefined);
	assert.equal(nom.get("text-overflow"), undefined);
	assert.equal(nom.get("overflow-wrap"), "anywhere");
	// L'icone (20 px) reste sur la premiere ligne (20 px)
	assert.equal(ETAT("#buffer-list li a", "align-items"), "flex-start");
	assert.equal(ETAT("#buffer-list li a", "line-height"), "20px");
});

test("salon actif : barre cyan de 3 px a 3:1", () => {
	let ombre = ETAT("#buffer-list li.active a", "box-shadow");
	assert.match(ombre, /^inset 3px 0 0 /);
	let barre = ombre.match(/var\(--[\w-]+\)|#[0-9a-f]{6}/i)[0];
	auMoins(couleur(barre).rgb, FOND_ACTIF, 3, "barre du salon actif");
});

test("focus clavier : anneau cyan de 2 px a 3:1, sur les salons, les categories et « Salons »", () => {
	for (let sel of ["#buffer-list li a:focus-visible", ".chan-group-title:focus-visible", "#chan-browse:focus-visible"]) {
		assert.match(ETAT(sel, "outline") || "", /^2px solid /, sel);
	}
	let anneau = ETAT("#buffer-list li a:focus-visible", "outline").match(/var\(--[\w-]+\)|#[0-9a-f]{6}/i)[0];
	auMoins(couleur(anneau).rgb, BARRE, 3, "anneau de focus");
	auMoins(couleur(anneau).rgb, FOND_ACTIF, 3, "anneau de focus sur le salon actif");
	assert.match(ETAT("#buffer-list li a:focus-visible", "outline"), /^2px solid/);
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
});

/* ── Lot 2 : ce qui est « pour toi » ─────────────────────────────────── */

const ROSE = () => couleur("var(--aura-pour-toi)").rgb;
const FOND_MENTION = sur(ETAT("#buffer .logline.highlight", "background-color"), FOND_FIL);

test("mention dans le fil : filet rose de 3 px, fond leger, l'auteur garde sa couleur, ton pseudo marque", () => {
	assert.deepEqual(ROSE(), [0xf4, 0x72, 0xb6]);
	let ligne = declsTheme("#buffer .logline.highlight");
	assert.equal(ligne.get("box-shadow"), "inset 3px 0 0 var(--aura-pour-toi)");
	auMoins(ROSE(), FOND_MENTION, 3, "filet de la mention");
	auMoins(couleur("var(--aura-text)").rgb, FOND_MENTION, 4.5, "texte d'une ligne de mention");
	// L'auteur : sa couleur de pseudo, plus de fond rose
	assert.equal(ETAT("#buffer .highlight .nick", "background-color"), "transparent");
	for (let n = 1; n <= 16; n++) {
		assert.equal(ETAT(`#buffer .highlight .nick-${n}`, "color"), ETAT(`#buffer .nick-${n}`, "color"), `pseudo ${n}`);
		auMoins(couleur(ETAT(`#buffer .nick-${n}`, "color")).rgb, FOND_MENTION, 4.5, `pseudo ${n} sur une mention`);
	}
	// Les regles nick-N viennent apres celle de .highlight .nick : elles gagnent
	assert.ok(THEME.indexOf("#buffer .highlight .nick-1") > THEME.indexOf("#buffer .highlight .nick {"));
	let mark = declsTheme("#buffer mark.moi");
	assert.equal(mark.get("font-weight"), "700");
	let fondMark = sur(mark.get("background-color"), hex(FOND_MENTION));
	auMoins(couleur(mark.get("color")).rgb, fondMark, 4.5, "ton pseudo marque");
});

test("barre : point gris pour le non-lu, badge rose pour une mention ou un message prive", () => {
	let fondEntree = FOND_SURVOL;
	auMoins(couleur(ETAT(".marque-point", "background-color")).rgb, fondEntree, 3, "point du non-lu");
	assert.ok(teinte(couleur(ETAT(".marque-point", "background-color")).rgb) < 290, "le point n'est pas rose");
	let badge = declsTheme(".marque-mention");
	assert.equal(resoudre(badge.get("background-color")), "#f472b6");
	auMoins(couleur(badge.get("background-color")).rgb, FOND_ACTIF, 3, "badge sur le salon actif");
	auMoins(couleur(badge.get("background-color")).rgb, BARRE, 3, "badge sur la barre");
	auMoins(couleur(badge.get("color")).rgb, couleur(badge.get("background-color")).rgb, 4.5, "texte du badge");
	assert.deepEqual(declsTheme(".marque-prive"), declsTheme(".marque-mention"));
	// Le nom d'un salon mentionne n'est plus rose : le badge porte le rose
	assert.notEqual(resoudre(ETAT("#buffer-list li.unread-highlight a", "color")), "#f472b6");
	// Categorie repliee : total gris ou rose
	let total = declsTheme(".chan-group-total");
	assert.equal(total.get("display"), "none");
	auMoins(couleur(total.get("color")).rgb, sur(total.get("background-color"), FOND_BARRE), 4.5, "total d'une categorie");
	assert.equal(ETAT(".chan-group:not([open]) > .chan-group-title > .chan-group-total", "display"), "inline-block");
	assert.equal(ETAT(".chan-group:not([open]) > .chan-group-title > .chan-group-count.a-lire", "display"), "none");
	assert.equal(resoudre(ETAT(".chan-group-total.pour-toi", "background-color")), "#f472b6");
	// Pastille de ☰
	let pastille = declsTheme(".pastille-pour-toi");
	assert.equal(pastille.get("position"), "absolute");
	auMoins(couleur(ETAT(".pastille-pour-toi", "background-color")).rgb, couleur("var(--aura-bg)").rgb, 3, "pastille de ☰");
	assert.match(THEME, /\.hdr-toggle-left \{[^}]*position: relative;/);
});

test("entree « Notifications » et proposition : lisibles, sans rose, cachees avec le tiroir", () => {
	auMoins(couleur(ETAT(".notif-titre", "color")).rgb, BARRE, 4.5, "« Notifications »");
	auMoins(couleur(ETAT(".notif-entree", "color")).rgb, BARRE, 4.5, "etat des notifications");
	auMoins(couleur(ETAT(".notif-granted .notif-etat", "color")).rgb, BARRE, 4.5, "« Activées »");
	let activer = declsTheme(".notif-activer");
	auMoins(couleur(activer.get("color")).rgb, couleur(resoudre(activer.get("background"))).rgb, 4.5, "bouton « Activer »");
	let prop = declsTheme("#buffer .proposition-notif");
	let fondProp = sur(prop.get("background-color"), FOND_FIL);
	auMoins(couleur(prop.get("color")).rgb, fondProp, 4.5, "texte de la proposition");
	auMoins(couleur(ETAT("#buffer .proposition-notif .proposition-refuser", "color")).rgb, fondProp, 4.5, "« Non merci »");
	for (let sel of [".notif-activer:focus-visible", "#buffer .proposition-notif button:focus-visible"]) {
		assert.match(ETAT(sel, "outline") || "", /^2px solid var\(--aura-cyan\)/, sel);
	}
	// Le rose reste a « pour toi »
	let bloc = THEME.slice(THEME.indexOf("/* ── Notifications (D-066"), THEME.indexOf("/* ── Message d'erreur flottant"));
	assert.doesNotMatch(bloc, /pour-toi|f472b6|244, 114, 182/);
	// En mobile, l'entree suit le tiroir des salons
	assert.match(THEME, /#buffer-list #aurasync-logo,\s*#buffer-list \.notif-entree \{\s*display: none;/);
	assert.match(THEME, /#buffer-list\.expand \.notif-entree \{\s*display: flex;/);
});

/* ── Icones des salons ────────────────────────────────────────────────── */

const CATEGORIES = ["gestion", "principaux", "thematiques", "regions", "prives", "autres"];

/* Melange en oklab, comme color-mix(in oklab, a p, b). */
function oklab(rgb) {
	let [r, g, b] = rgb.map((v) => {
		v /= 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	let l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	let m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	let s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	];
}
function depuisOklab([L, A, B]) {
	let l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	let m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	let s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
	let lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
	];
	return lin.map((v) => {
		v = Math.min(1, Math.max(0, v));
		v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
		return Math.round(v * 255);
	});
}
function melange(a, b, p) {
	let [x, y] = [oklab(couleur(a).rgb), oklab(couleur(b).rgb)];
	return depuisOklab(x.map((v, k) => v * p + y[k] * (1 - p)));
}

test("icones : une couleur par categorie, 3:1 au moins, jamais en rose", () => {
	let rose = couleur("var(--aura-pour-toi)").rgb;
	for (let cat of CATEGORIES) {
		let c = couleur(`var(--icone-${cat})`).rgb;
		auMoins(c, BARRE, 3, `icone ${cat}`);
		auMoins(c, FOND_ACTIF, 3, `icone ${cat} sur le salon actif`);
		let h = teinte(c);
		assert.ok(h < 290 || h > 350, `icone ${cat} : ${hex(c)} est rose`);
		assert.notEqual(hex(c), hex(rose));
	}
	// Chaque categorie de la barre a sa regle
	for (let cat of CATEGORIES.filter((c) => c !== "autres")) {
		assert.equal(declsTheme(`.cat-${cat}`).get("--icone-categorie"), `var(--icone-${cat})`);
	}
	assert.equal(declsTheme(".chan-group").get("--icone-categorie"), "var(--icone-autres)");
});

test("icones : le degrade cyan -> violet reste a 3:1 tout du long", () => {
	for (let k = 0; k <= 20; k++) {
		let c = melange("var(--icone-debut)", "var(--icone-fin)", 1 - k / 20);
		auMoins(c, BARRE, 3, `degrade a ${k * 5} %`);
		auMoins(c, FOND_ACTIF, 3, `degrade a ${k * 5} % sur le salon actif`);
		let h = teinte(c);
		assert.ok(h < 290 || h > 350, `degrade a ${k * 5} % : ${hex(c)} est rose`);
	}
});

test("icones : une seule variable bascule entre les deux variantes", () => {
	assert.equal(VARS.get("--icone-poids-categorie"), "100%");
	let icone = declsTheme(".chan-icon").get("color");
	assert.match(icone, /var\(--icone-poids-categorie\)/);
	assert.match(icone, /var\(--rang, 0\)/);
	assert.match(icone, /var\(--icone-debut\)/);
	assert.match(icone, /var\(--icone-fin\)/);
	assert.equal(declsTheme(".chan-icon").get("width"), "20px");
});

test("icones : traces de pulse, ballot et ball, une icone par salon", () => {
	channels.setCatalogue(lireCatalogue({
		categories: [
			{ id: "principaux", label: "Salons principaux", channels: [{ name: "#AuraSync" }, { name: "#aide" }] },
			{ id: "thematiques", label: "Thématiques", channels: [{ name: "#politique" }, { name: "#sports" }, { name: "#cinéma" }] },
			{ id: "regions", label: "Régions", channels: [{ name: "#bretagne" }, { name: "#île-de-france" }] },
		],
		selection: [],
	}));
	let icone = (n) => channels.channelMeta(n).icon;
	assert.equal(icone("#AuraSync"), "pulse");
	assert.equal(icone("#politique"), "ballot");
	assert.equal(icone("#sports"), "ball");
	assert.equal(icone("#cinéma"), "movie");
	assert.equal(icone("#aide"), "lifebuoy");
	assert.equal(icone("#bretagne"), "pin");
	assert.equal(icone("#île-de-france"), "pin");
	assert.equal(icone("#administration"), "shield");
	for (let nom of ["pulse", "ballot", "ball"]) {
		assert.ok(channels.ICONS[nom].length > 0);
		for (let d of channels.ICONS[nom]) {
			assert.match(d, /^M[\d.\s,a-zA-Z-]+$/);
		}
	}
	for (let ancien of ["home", "columns", "trophy"]) {
		assert.equal(channels.ICONS[ancien], undefined, `${ancien} n'est plus utilisee`);
	}
	channels.setCatalogue(null);
});

/* ── Barre : categorie et rang de chaque entree ───────────────────────── */

test("rangDansLaBarre : de 0 en haut a 1 en bas", () => {
	assert.equal(rangDansLaBarre(0, 1), 0);
	assert.equal(rangDansLaBarre(0, 5), 0);
	assert.equal(rangDansLaBarre(2, 5), 0.5);
	assert.equal(rangDansLaBarre(4, 5), 1);
	assert.equal(rangDansLaBarre(1, 3), 0.5);
	assert.equal(rangDansLaBarre(1, 4), 0.333);
});

/* Noeuds d'un arbre de vnodes Preact, en profondeur, dans l'ordre. */
function* noeuds(v) {
	if (Array.isArray(v)) {
		for (let x of v) {
			yield* noeuds(x);
		}
	} else if (v && typeof v === "object") {
		yield v;
		yield* noeuds(v.props && v.props.children);
	}
}

test("barre : chaque categorie porte sa classe, chaque entree son rang", () => {
	channels.setCatalogue(lireCatalogue({
		categories: [
			{ id: "principaux", label: "Salons principaux", channels: [{ name: "#AuraSync" }, { name: "#aide" }] },
			{ id: "regions", label: "Régions", channels: [{ name: "#bretagne" }] },
		],
		selection: [],
	}));
	let liste = [
		["*", BufferType.SERVER], ["#équipe", BufferType.CHANNEL], ["#aide", BufferType.CHANNEL],
		["#AuraSync", BufferType.CHANNEL], ["#bretagne", BufferType.CHANNEL],
		["#cercle", BufferType.CHANNEL], ["Kahen", BufferType.NICK],
	];
	let buffers = new Map(liste.map(([name, type], k) => [k, { id: k, name, type, server: 1, unread: Unread.NONE }]));
	let servers = new Map([[1, { status: ServerStatus.REGISTERED, users: new Map() }]]);
	let arbre = BufferList({
		buffers, servers, bouncerNetworks: new Map(), activeBuffer: 2,
		onBufferClick() {}, onBufferClose() {}, onOpenChannelList() {},
	});
	let tout = [...noeuds(arbre)];
	let groupes = tout.filter((n) => n.type === "details").map((n) => n.props.class);
	assert.deepEqual(groupes, [
		"chan-group cat-prives",
		"chan-group cat-gestion",
		"chan-group cat-principaux",
		"chan-group cat-regions",
		"chan-group cat-autres",
	]);
	let entrees = tout.filter((n) => n.props && n.props.buffer && "rang" in n.props);
	assert.deepEqual(entrees.map((n) => n.props.buffer.name), ["Kahen", "#équipe", "#AuraSync", "#aide", "#bretagne", "#cercle"]);
	assert.deepEqual(entrees.map((n) => n.props.rang), [0, 0.2, 0.4, 0.6, 0.8, 1]);
	channels.setCatalogue(null);
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

test("logo de base du site, recadre, dans un cadre degrade ; icone maskable declaree", () => {
	let logo = declsTheme("#aurasync-logo");
	assert.match(logo.get("background"), /url\("\.\/logo-site\.png"\) center \/ auto 54px/);
	assert.equal(logo.get("height"), "68px", "taille du bandeau du lot 1");
	assert.match(logo.get("background"), /linear-gradient\(120deg, var\(--aura-cyan\), var\(--aura-violet\)\) border-box/);
	assert.equal(logo.get("border"), "1.5px solid transparent");
	// Aucun halo qui deborde sur les salons
	let survol = declsTheme("#aurasync-logo:hover");
	assert.equal(survol.has("transform"), false);
	assert.doesNotMatch(survol.get("filter") || "", /drop-shadow/);
	assert.ok(existsSync(new URL("logo-site.png", racine)));
	assert.equal(existsSync(new URL("tchat-logo-titre.png", racine)), false, "l'ancien logo-titre est retire");
	assert.doesNotMatch(THEME, /tchat-logo-titre/);
	// Le filigrane du fil garde le logo complet
	assert.match(declsTheme("#buffer").get("background"), /tchat-logo\.png/);

	let manifeste = JSON.parse(lire("manifest.json"));
	let maskable = manifeste.icons.filter((i) => i.purpose === "maskable");
	assert.deepEqual(maskable, [{ src: "./favicon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }]);
	assert.ok(existsSync(new URL("favicon-512-maskable.png", racine)));
});
