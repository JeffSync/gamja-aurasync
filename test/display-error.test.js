/*
 * Tests de displayError (lib/irc-errors.js), le point d'entree unique de
 * App.showError : toute banniere passe par la traduction (D-056).
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IRCError } from "../lib/client.js";
import { displayError, REPLI_ERREUR, REPLI_FIN, REPLI_INTERNE } from "../lib/irc-errors.js";

let journal;
beforeEach(() => {
	journal = mock.method(console, "error", () => {});
});
afterEach(() => {
	mock.restoreAll();
});

const BANNI = "Tu ne peux pas rejoindre ce salon car tu es banni(e).";

test("IRCError 474 de join() : « banni(e) », pas le texte brut", () => {
	/* Kahen, banni de #AuraSync, clique « Rejoindre » dans le panneau Salons. */
	let err = new IRCError({ command: "474", params: ["Kahen", "#AuraSync", "Cannot join channel (+b)"] });
	assert.equal(err.message, "Cannot join channel (+b)");
	assert.equal(displayError(err), BANNI);
});

test("IRCError au texte anglais inconnu : repli, détail en console", () => {
	let err = new IRCError({ command: "999", params: ["Kahen", "Some brand new English refusal"] });
	assert.equal(displayError(err), REPLI_ERREUR);
	assert.equal(journal.mock.callCount(), 1);
	assert.match(journal.mock.calls[0].arguments.join(" "), /Some brand new English refusal/);
});

test("IRCError ERROR : texte de fin de connexion", () => {
	let err = new IRCError({ command: "ERROR", params: ["Closing Link: Kahen[1.2.3.4] (Something new)"] });
	assert.equal(displayError(err), REPLI_FIN);
});

test("IRCError en cause : traduite, l'enveloppe anglaise n'est pas affichée", () => {
	let cause = new IRCError({ command: "FAIL", params: ["BOUNCER", "INVALID", "BIND", "Unknown network"] });
	let err = new Error("Failed to bind to bouncer network", { cause });
	assert.equal(displayError(err), REPLI_ERREUR);
});

test("erreur native du navigateur : repli, jamais son texte anglais", () => {
	let err = new TypeError("Cannot read properties of undefined (reading 'name')");
	assert.equal(displayError(err), REPLI_INTERNE);
	assert.equal(journal.mock.callCount(), 1);
});

test("nos textes passent tels quels, causes comprises non affichées", () => {
	assert.equal(displayError("Ouvre un salon pour envoyer un message"), "Ouvre un salon pour envoyer un message");
	assert.equal(displayError(new Error("Erreur de connexion")), "Erreur de connexion");
	let err = new Error("Échec de l'envoi du fichier", { cause: new TypeError("Failed to fetch") });
	assert.equal(displayError(err), "Échec de l'envoi du fichier");
	assert.equal(journal.mock.callCount(), 0);
});

test("barrière « IRC » en début de mot seulement", () => {
	assert.equal(displayError("Tu as été expulsé(e) de #aide par Mirco."), "Tu as été expulsé(e) de #aide par Mirco.");
	assert.equal(displayError("Connexion à irc.aurasync.fr perdue"), REPLI_INTERNE);
	assert.equal(displayError(new Error("IRC down")), REPLI_INTERNE);
});

test("vide ou absent : repli", () => {
	assert.equal(displayError(""), REPLI_INTERNE);
	assert.equal(displayError(undefined), REPLI_INTERNE);
	assert.equal(displayError(new Error("")), REPLI_INTERNE);
});

/*
 * Garde sur la source : components/app.js ne se charge pas sous Node
 * (Preact, DOM). La banniere ne s'ecrit que dans showError, qui passe par
 * displayError ; un appelant futur ne peut donc pas la court-circuiter.
 */
test("app.js : la bannière ne s'écrit que par showError, via displayError", () => {
	let src = readFileSync(new URL("../components/app.js", import.meta.url), "utf8");
	let corps = /\n\tshowError\(err\) \{\n([\s\S]*?)\n\t\}\n/.exec(src);
	assert.ok(corps, "showError introuvable");
	assert.match(corps[1], /let text = displayError\(err\);/);
	assert.match(corps[1], /this\.setState\(\{ error: text \}\)/);
	let ecritures = [...src.matchAll(/setState\(\{\s*error:\s*([^,}\s]+)/g)].map((m) => m[1]);
	assert.deepEqual(ecritures.filter((v) => v !== "null"), ["text"]);
});
