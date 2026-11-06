/*
 * Tests de lib/autojoin.js : salons rejoints a la connexion (D-065).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	ONE_SHOT_KEY,
	ONE_SHOT_CHANNELS,
	configAutojoin,
	takeOneShot,
	connectAutojoin,
	buffersToRestore,
} from "../lib/autojoin.js";

function memoire(valeurs = {}) {
	let m = new Map(Object.entries(valeurs));
	return {
		m,
		getItem: (k) => (m.has(k) ? m.get(k) : null),
		removeItem: (k) => m.delete(k),
	};
}

test("config.json : tableau ou chaine, chaines seulement", () => {
	assert.deepEqual(configAutojoin(["#AuraSync", "#aide"]), ["#AuraSync", "#aide"]);
	assert.deepEqual(configAutojoin("#AuraSync"), ["#AuraSync"]);
	assert.deepEqual(configAutojoin(""), []);
	assert.deepEqual(configAutojoin(undefined), []);
	assert.deepEqual(configAutojoin(["#AuraSync", 3, null, ""]), ["#AuraSync"]);
});

test("cle a usage unique : lue puis effacee", () => {
	let s = memoire({ [ONE_SHOT_KEY]: JSON.stringify(["#addictions"]) });
	assert.deepEqual(takeOneShot(() => s), ["#addictions"]);
	assert.equal(s.m.has(ONE_SHOT_KEY), false);
	assert.deepEqual(takeOneShot(() => s), []);
});

test("cle a usage unique : seulement les salons jamais enregistres", () => {
	assert.deepEqual(ONE_SHOT_CHANNELS, ["#addictions"]);
	let s = memoire({ [ONE_SHOT_KEY]: JSON.stringify(["#administration", "#jeux", "#ADDICTIONS", 4]) });
	assert.deepEqual(takeOneShot(() => s), ["#addictions"]);
	assert.deepEqual(takeOneShot(() => memoire({ [ONE_SHOT_KEY]: JSON.stringify(["#équipe"]) })), []);
});

test("cle a usage unique : illisible, absente ou stockage bloque", () => {
	let s = memoire({ [ONE_SHOT_KEY]: "{pas du json" });
	assert.deepEqual(takeOneShot(() => s), []);
	assert.equal(s.m.has(ONE_SHOT_KEY), false, "effacee meme illisible");
	assert.deepEqual(takeOneShot(() => memoire({ [ONE_SHOT_KEY]: "\"#addictions\"" })), []);
	assert.deepEqual(takeOneShot(() => memoire()), []);
	assert.deepEqual(takeOneShot(() => {
		throw new Error("SecurityError");
	}), []);
});

test("connexion : le config.json d'abord, puis la cle, sans doublon", () => {
	assert.deepEqual(connectAutojoin(["#AuraSync", "#aide"], ["#addictions"]), ["#AuraSync", "#aide", "#addictions"]);
	assert.deepEqual(connectAutojoin(["#AuraSync"], []), ["#AuraSync"]);
	assert.deepEqual(connectAutojoin(["#AuraSync", "#Addictions"], ["#addictions"]), ["#AuraSync", "#Addictions"]);
});

test("memoire : les conversations privees seulement, jamais un salon", () => {
	let isChannel = (n) => n.startsWith("#");
	let buffers = [
		{ name: "*" },
		{ name: "#jeux" },
		{ name: "#bretagne", closed: false },
		{ name: "Kahen" },
		{ name: "Margaux", closed: true },
		{ name: "#aide", closed: true },
	];
	assert.deepEqual(buffersToRestore(buffers, isChannel), ["Kahen"]);
	assert.deepEqual(buffersToRestore([], isChannel), []);
});

test("app.js : l'autojoin du compte gagne, ?channels= et #salon ignores", () => {
	let src = readFileSync(new URL("../components/app.js", import.meta.url), "utf8");
	assert.ok(!src.includes("queryParams.channels"), "?channels= encore lu");
	assert.ok(!src.includes("handled by store.Buffer"), "connexion memorisee : autojoin encore vide");
	assert.ok(!src.includes("window.location.hash.split"), "#salon de l'adresse encore rejoint");
	assert.ok(!src.includes("withoutChannel"));
	// Sans condition : la connexion memorisee recoit aussi les salons du compte
	assert.match(src, /\(buffersToRestore\)\n\t\tconnectParams\.autojoin = autojoin;\n/);
	assert.match(src, /buffersToRestore\(this\.bufferStore\.list\(client\.params\)/);
	assert.match(src, /takeOneShot\(\(\) => window\.localStorage\)/);
});
