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
		moderator: entre(s, "{:else if role === 'moderator'}", "{/if}"),
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
	assert.deepEqual(JSON.parse(/const known = (\[[^\]]*\])/.exec(s)[1].replace(/'/g, "\"")).sort(), Object.keys(TRACES).sort());
});

test("insigne : libellés de roles.ts et teintes du profil du site", { skip: absent }, () => {
	let roles = readFileSync(path.join(WEB, "lib/utils/roles.ts"), "utf8");
	let libelles = Object.fromEntries([...roles.matchAll(/(\w+): \{ label: '([^']+)'/g)].map((m) => [m[1], m[2]]));
	assert.deepEqual(LIBELLES, libelles);
	// emblemTint de /u/[pseudo] : texte 300 de Tailwind
	let page = readFileSync(path.join(WEB, "routes/u/[pseudo]/+page.svelte"), "utf8");
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
