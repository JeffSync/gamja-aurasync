/*
 * Tests de lib/mutisme.js : mutisme de salon, motif et notice (D-059).
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
	masqueMuet, noticeMuet, noticeParole, commandesMuet, commandesParole,
	pseudoMuet, estMuet, lireNotice, peutRendreMuet, salonDeNotice,
} from "../lib/mutisme.js";
import { commandesSanction, demandeMotif } from "../lib/connexion.js";

const cm = (s) => s.toLowerCase().replace(/\[/g, "{").replace(/\]/g, "}").replace(/\\/g, "|").replace(/~/g, "^");

beforeEach(() => {
	mock.method(console, "error", () => {});
});
afterEach(() => {
	mock.restoreAll();
});

const CONTEXTE = { "+draft/channel-context": "#aide" };

test("rendre muet : MODE puis NOTICE avec le motif", () => {
	assert.deepEqual(commandesMuet("#aide", "Kahen", " insultes répétées ", ""), [
		{ command: "MODE", params: ["#aide", "+b", "~quiet:Kahen!*@*"] },
		{ tags: CONTEXTE, command: "NOTICE", params: ["Kahen", "Tu ne peux plus écrire dans #aide : insultes répétées"] },
	]);
	/* Par le menu, comme expulser et bannir. */
	assert.ok(demandeMotif("mute"));
	assert.deepEqual(commandesSanction("mute", "#aide", "Kahen", "spam"), commandesMuet("#aide", "Kahen", "spam"));
});

test("rendre muet : rien ne part sans motif (D-058)", () => {
	assert.equal(commandesMuet("#aide", "Kahen", ""), null);
	assert.equal(commandesMuet("#aide", "Kahen", "   "), null);
	assert.equal(commandesSanction("mute", "#aide", "Kahen", undefined), null);
});

test("rendre muet un membre qui a la voix : la voix part d'abord", () => {
	let msgs = commandesMuet("#aide", "Kahen", "spam", "+");
	assert.deepEqual(msgs[0], { command: "MODE", params: ["#aide", "-v", "Kahen"] });
	assert.equal(msgs.length, 3);
	assert.equal(commandesMuet("#aide", "Kahen", "spam", "").length, 2);
	assert.equal(commandesMuet("#aide", "Kahen", "spam", undefined).length, 2);
	assert.equal(commandesSanction("mute", "#aide", "Kahen", "spam", "+").length, 3);
});

test("rendre la parole : MODE -b puis NOTICE", () => {
	assert.deepEqual(commandesParole("#aide", "Kahen"), [
		{ command: "MODE", params: ["#aide", "-b", "~quiet:Kahen!*@*"] },
		{ tags: CONTEXTE, command: "NOTICE", params: ["Kahen", "Tu peux de nouveau écrire dans #aide."] },
	]);
});

test("masque : pseudo visé, ~quiet: ou ~q:", () => {
	assert.equal(masqueMuet("Kahen"), "~quiet:Kahen!*@*");
	assert.equal(pseudoMuet("~quiet:Kahen!*@*"), "Kahen");
	assert.equal(pseudoMuet("~q:Kahen!*@*"), "Kahen");
	assert.equal(pseudoMuet("~quiet:*!*@1.2.3.4"), null);
	assert.equal(pseudoMuet("~quiet:Kah*!*@*"), null);
	assert.equal(pseudoMuet("Kahen!*@*"), null);
	assert.equal(pseudoMuet("~account:Kahen"), null);
	assert.equal(pseudoMuet(undefined), null);
});

test("est-il muet ? d'après la liste des bans", () => {
	let liste = ["*!*@5.6.7.8", "~quiet:Jeff[1]!*@*", "~q:Lola!*@*"];
	assert.equal(estMuet(liste, "jeff{1}", cm), true);
	assert.equal(estMuet(liste, "LOLA", cm), true);
	assert.equal(estMuet(liste, "Kahen", cm), false);
	assert.equal(estMuet([], "Kahen", cm), false);
});

test("notice reçue : lue", () => {
	assert.deepEqual(lireNotice(noticeMuet("#aide", "spam : liens")), { salon: "#aide", muet: true, motif: "spam : liens" });
	assert.deepEqual(lireNotice(noticeParole("#Équipe")), { salon: "#Équipe", muet: false, motif: null });
	assert.equal(lireNotice("Tu ne peux plus écrire dans #aide : "), null);
	assert.equal(lireNotice("salut"), null);
	assert.equal(lireNotice(undefined), null);
});

test("qui peut rendre muet : % et au-dessus (D-059)", () => {
	for (let m of ["%", "@", "&", "~", "@+", "%+"]) {
		assert.ok(peutRendreMuet(m), m);
	}
	for (let m of ["", "+", undefined, null]) {
		assert.ok(!peutRendreMuet(m), String(m));
	}
});

test("notice rangée dans le salon seulement si un modérateur l'envoie", () => {
	let statuts = { "#aide": { Jeff: "@", Lola: "%", Toto: "", Vic: "+" } };
	let membreDe = (salon, pseudo) => (statuts[salon] || {})[pseudo];
	let texte = noticeMuet("#aide", "spam");
	assert.equal(salonDeNotice(texte, "Jeff", membreDe), "#aide");
	assert.equal(salonDeNotice(texte, "Lola", membreDe), "#aide");
	assert.equal(salonDeNotice(noticeParole("#aide"), "Jeff", membreDe), "#aide");
	/* Un membre ordinaire ne peut pas faire croire à un mutisme. */
	assert.equal(salonDeNotice(texte, "Toto", membreDe), null);
	assert.equal(salonDeNotice(texte, "Vic", membreDe), null);
	assert.equal(salonDeNotice(texte, "Inconnu", membreDe), null);
	assert.equal(salonDeNotice(noticeMuet("#autre", "x"), "Jeff", membreDe), null);
	assert.equal(salonDeNotice("bonjour", "Jeff", membreDe), null);
});

test("aucun texte de mutisme en anglais ni « IRC »", () => {
	for (let s of [noticeMuet("#aide", "spam"), noticeParole("#aide")]) {
		assert.doesNotMatch(s, /IRC|quiet|banned/i, s);
	}
});
