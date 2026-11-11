/*
 * D-066, point 8 revise le 7 novembre : l'insigne de la fiche est celui du
 * profil du site, a l'identique. Ce test lit les sources du site dans le
 * depot aurasync (par defaut a cote de ce fork, ~/aurasync ; sinon la
 * variable AURASYNC_DEPOT) et compare trace par trace.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ANNEAU, DEGRADE, LIBELLES, TEINTES, TRACES, TRAIT, insigneDe, valeur } from "../lib/insigne.js";

const racine = process.env.AURASYNC_DEPOT
	|| path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../aurasync");
const WEB = path.join(racine, "apps/web/src");
const EMBLEME = path.join(WEB, "lib/components/icons/RoleEmblem.svelte");
const absent = existsSync(EMBLEME) ? false : "depot aurasync introuvable (" + racine + ") : AURASYNC_DEPOT=<chemin>";

const BALISES = new Set(["g", "circle", "path", "line", "linearGradient", "stop"]);

/* Les balises SVG d'un extrait Svelte, a plat : « <tag a=v …> » et « </tag> ». */
function jetonsSvelte(extrait) {
	let sans = extrait.replace(/<!--[\s\S]*?-->/g, "");
	let jetons = [];
	for (let m of sans.matchAll(/<(\/?)([A-Za-z]+)([^>]*?)(\/?)>/g)) {
		let [, fin, tag, corps, auto] = m;
		if (!BALISES.has(tag)) {
			continue;
		}
		if (fin) {
			jetons.push("</" + tag + ">");
			continue;
		}
		let attrs = {};
		for (let a of corps.matchAll(/([\w:-]+)=(?:"([^"]*)"|\{([^}]*)\})/g)) {
			attrs[a[1]] = a[2] !== undefined ? a[2] : "{" + a[3].trim().replace(/\s+/g, " ") + "}";
		}
		jetons.push(ouvrant(tag, attrs));
		if (auto) {
			jetons.push("</" + tag + ">");
		}
	}
	return jetons;
}

function ouvrant(tag, attrs) {
	return "<" + tag + Object.keys(attrs).sort().map((k) => " " + k + "=" + attrs[k]).join("") + ">";
}

function jetonsFork(traces) {
	let jetons = [];
	for (let t of traces) {
		jetons.push(ouvrant(t.tag, t.attrs));
		jetons.push(...jetonsFork(t.enfants || []));
		jetons.push("</" + t.tag + ">");
	}
	return jetons;
}

function entre(source, debut, fin) {
	let i = source.indexOf(debut);
	assert.ok(i >= 0, "repère introuvable dans RoleEmblem.svelte : " + debut);
	let j = source.indexOf(fin, i + debut.length);
	assert.ok(j >= 0, "repère introuvable dans RoleEmblem.svelte : " + fin);
	return source.slice(i + debut.length, j);
}

test("insigne : les tracés du fork sont ceux de RoleEmblem.svelte (variante ring)", { skip: absent }, () => {
	let s = readFileSync(EMBLEME, "utf8");
	let blocs = {
		founder: entre(s, "{#if role === 'founder'}", "{:else}"),
		administrator: entre(s, "{:else if role === 'administrator'}", "{:else if role === 'operator'}"),
		operator: entre(s, "{:else if role === 'operator'}", "{:else if role === 'moderator'}"),
		// D-073 : « user » suit le Modérateur, dessiné pour l'organigramme du site seul
		moderator: entre(s, "{:else if role === 'moderator'}", "{:else if role === 'user'}"),
	};
	assert.deepEqual(Object.keys(TRACES).sort(), Object.keys(blocs).sort());
	for (let [role, extrait] of Object.entries(blocs)) {
		assert.deepEqual(jetonsFork(TRACES[role]), jetonsSvelte(extrait), "tracé de " + role);
	}
	// L'anneau et son degrade
	let anneau = entre(s, "{#if ring}", "{/if}");
	let degrade = [ouvrant("linearGradient", { id: DEGRADE.id, ...DEGRADE.attrs }),
		...DEGRADE.stops.flatMap((st) => [ouvrant("stop", st), "</stop>"]), "</linearGradient>"];
	assert.deepEqual([...degrade, ...jetonsFork([ANNEAU])], jetonsSvelte(anneau));
	// Cadre, trait par defaut et roles reconnus
	assert.match(s, /viewBox=\{ring \? '0 0 56 56'/);
	assert.equal(parseFloat(/stroke = ([\d.]+)/.exec(s)[1]), TRAIT);
	// « user » n'a pas d'insigne public : le site ne le dessine que dans l'organigramme
	let connus = JSON.parse(/const known = (\[[^\]]*\])/.exec(s)[1].replace(/'/g, "\"")).filter((r) => r !== "user");
	assert.deepEqual(connus.sort(), Object.keys(TRACES).sort());
});

test("insigne : libellés de roles.ts et teintes du profil du site", { skip: absent }, () => {
	let roles = readFileSync(path.join(WEB, "lib/utils/roles.ts"), "utf8");
	let libelles = Object.fromEntries([...roles.matchAll(/(\w+): \{ label: '([^']+)'/g)].map((m) => [m[1], m[2]]));
	assert.deepEqual(LIBELLES, libelles);
	// emblemTint de la carte de profil : texte 300 de Tailwind
	// D-073 : la carte de profil est un composant, partagé avec l'aperçu
	let page = readFileSync(path.join(WEB, "lib/components/CarteProfil.svelte"), "utf8");
	let tint = /emblemTint = \(\{([^}]*)\}/.exec(page)[1];
	let tailwind300 = { cyan: "#67e8f9", violet: "#c4b5fd", amber: "#fcd34d", emerald: "#6ee7b7" };
	let teintes = Object.fromEntries([...tint.matchAll(/(\w+): 'text-(\w+)-300'/g)].map((m) => [m[1], tailwind300[m[2]]]));
	assert.deepEqual(TEINTES, teintes);
});

test("insigne : rôle inconnu ou « user » sans insigne ; traits du modérateur recalculés", () => {
	assert.equal(insigneDe("user"), null);
	assert.equal(insigneDe(null), null);
	assert.equal(insigneDe("toString"), null);
	assert.deepEqual(insigneDe("founder"), { role: "founder", libelle: "Fondateur", teinte: "#67e8f9", traces: TRACES.founder });
	assert.equal(valeur("{stroke * 1.4}", 2.4), "3.36");
	assert.equal(valeur("9.5", 2.4), "9.5");
	for (let l of Object.values(LIBELLES)) {
		assert.doesNotMatch(l, /\(|rice/);
	}
});

/* ── Seconde retouche du 7 novembre : anneau de l'avatar et @pseudo ──── */

const THEME = readFileSync(new URL("../aurasync-theme.css", import.meta.url), "utf8");

/* Les declarations d'une regle CSS, valeurs normalisees (var(--color-x) du site resolues). */
function declarations(css, selecteur, couleurs = {}) {
	let i = css.indexOf("\n" + selecteur + " {");
	assert.ok(i >= 0, "règle introuvable : " + selecteur);
	let corps = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i)).replace(/\/\*[\s\S]*?\*\//g, "");
	let d = {};
	for (let decl of corps.split(";")) {
		let k = decl.indexOf(":");
		if (k < 0) {
			continue;
		}
		let v = decl.slice(k + 1).trim().replace(/var\((--color-[\w-]+)\)/g, (m, nom) => couleurs[nom] || m).replace(/\s+/g, " ");
		d[decl.slice(0, k).trim()] = v;
	}
	return d;
}

test("anneau et @pseudo : av-aura et handle-grad du site, à l'identique", { skip: absent }, () => {
	let site = readFileSync(path.join(WEB, "routes/layout.css"), "utf8");
	let couleurs = Object.fromEntries([...site.matchAll(/(--color-[\w-]+): (#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
	for (let sel of [".av-aura", ".av-aura > *", ".av-aura::before", ".av-aura::after", ".handle-grad"]) {
		let attendu = declarations(site, sel, couleurs);
		let fork = declarations(THEME, sel);
		for (let [k, v] of Object.entries(attendu)) {
			assert.equal(fork[k], v, sel + " { " + k + " }");
		}
	}
});

test("anneau : figé, comme sur le site hors de la carte du profil ; hors du flux, il ne pousse rien", () => {
	assert.doesNotMatch(THEME, /av-pulse|av-spin/, "aucune animation de l'anneau dans le t'Chat");
	for (let sel of [".av-aura::before", ".av-aura::after"]) {
		let d = declarations(THEME, sel);
		assert.equal(d.position, "absolute", sel);
		assert.equal(d["pointer-events"], "none", sel);
	}
});

test("débordement : les entrées de la fiche comptent leur rembourrage, les salons reviennent à la ligne", () => {
	let item = declarations(THEME, ".nick-menu-item");
	assert.equal(item.width, "100%");
	assert.equal(item["box-sizing"], "border-box", "sans lui, le lien « Voir le profil » dépasse de 20 px");
	let val = declarations(THEME, ".fiche-whois .whois-val");
	assert.equal(val["min-width"], "0");
	let salon = declarations(THEME, ".whois-chans .whois-salon");
	assert.equal(salon["max-width"], "100%");
	assert.equal(salon["overflow-wrap"], "anywhere");
});
