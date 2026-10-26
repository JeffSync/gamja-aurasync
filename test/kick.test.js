/*
 * Tests de lib/kick.js : expulsion du membre lui-meme, sans dependance.
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { isSelfKick, nextBuffer, kickBanner, withoutChannel } from "../lib/kick.js";

/* Casse RFC 1459, celle du serveur. */
const cm = (s) => s.toLowerCase().replace(/\[/g, "{").replace(/\]/g, "}").replace(/\\/g, "|").replace(/~/g, "^");

beforeEach(() => {
	mock.method(console, "error", () => {});
});
afterEach(() => {
	mock.restoreAll();
});

test("est-ce moi ?", () => {
	assert.equal(isSelfKick("Kahen", "Kahen", cm), true);
	assert.equal(isSelfKick("KAHEN", "kahen", cm), true);
	assert.equal(isSelfKick("Kahen[1]", "kahen{1}", cm), true);
	assert.equal(isSelfKick("Jeff", "Kahen", cm), false);
	assert.equal(isSelfKick("Kahen2", "Kahen", cm), false);
	assert.equal(isSelfKick(undefined, "Kahen", cm), false);
	assert.equal(isSelfKick("Kahen", undefined, cm), false);
});

const salons = [
	{ id: 1, name: "#aide" },
	{ id: 2, name: "#Équipe" },
	{ id: 3, name: "#aurasync" },
	{ id: 4, name: "#musique" },
];

test("onglet suivant : #AuraSync d'abord, quelle que soit sa place", () => {
	assert.equal(nextBuffer(salons, 2, cm), 3);
	assert.equal(nextBuffer(salons, 1, cm), 3);
});

test("onglet suivant : le premier salon sans #AuraSync", () => {
	let sans = salons.filter((b) => b.id !== 3);
	assert.equal(nextBuffer(sans, 2, cm), 1);
	assert.equal(nextBuffer(sans, 1, cm), 2);
	assert.equal(nextBuffer(salons, 3, cm), 1);
});

test("onglet suivant : aucun salon restant", () => {
	assert.equal(nextBuffer([{ id: 7, name: "#aide" }], 7, cm), null);
	assert.equal(nextBuffer([], 7, cm), null);
});

test("bannière sans raison : pas de « (X) »", () => {
	/* Sans raison, UnrealIRCd met le pseudo de l'auteur. */
	assert.equal(kickBanner("#aide", "Jeff", "Jeff"), "Tu as été expulsé(e) de #aide par Jeff.");
	assert.equal(kickBanner("#aide", "Jeff", ""), "Tu as été expulsé(e) de #aide par Jeff.");
	assert.equal(kickBanner("#aide", "Jeff", undefined), "Tu as été expulsé(e) de #aide par Jeff.");
});

test("bannière avec raison traduite", () => {
	assert.equal(kickBanner("#aide", "Jeff", "calme-toi"), "Tu as été expulsé(e) de #aide par Jeff (calme-toi).");
	/* ChanServ RESTRICTED (#Équipe, D-024). */
	assert.equal(
		kickBanner("#Équipe", "ChanServ", "You are not permitted to be on this channel."),
		"Tu as été expulsé(e) de #Équipe par ChanServ (salon réservé).",
	);
	/* Texte anglais d'un service inconnu de la table : rien plutot que l'anglais. */
	assert.equal(kickBanner("#aide", "ChanServ", "Some new English reason"), "Tu as été expulsé(e) de #aide par ChanServ.");
});

test("bannière : le serveur n'est pas nommé", () => {
	assert.equal(
		kickBanner("#aide", "irc.aurasync.fr", "Flooding (Limit is 5 lines per 3 seconds)"),
		"Tu as été expulsé(e) de #aide (trop de messages en peu de temps).",
	);
	assert.ok(!/IRC/i.test(kickBanner("#aide", "irc.aurasync.fr", "")));
});

test("URL : le salon sort du paramètre channels", () => {
	let search = "?channels=" + encodeURIComponent("#AuraSync,#aide,#Équipe");
	assert.equal(withoutChannel(search, "#aide", cm), "?channels=" + encodeURIComponent("#AuraSync,#Équipe"));
	assert.equal(withoutChannel(search, "#AIDE", cm), "?channels=" + encodeURIComponent("#AuraSync,#Équipe"));
	assert.equal(withoutChannel(search, "#Équipe", cm), "?channels=" + encodeURIComponent("#AuraSync,#aide"));
});

test("URL : autres paramètres gardés, paramètre vidé retiré", () => {
	assert.equal(withoutChannel("?debug=1&channels=%23aide", "#aide", cm), "?debug=1");
	assert.equal(withoutChannel("?channels=%23aide", "#aide", cm), "");
	/* Separateur non encode, comme dans un lien tape a la main. */
	assert.equal(withoutChannel("?channels=%23aide,%23jeux&debug=1", "#jeux", cm), "?channels=%23aide&debug=1");
});

test("URL : rien à changer", () => {
	assert.equal(withoutChannel("", "#aide", cm), null);
	assert.equal(withoutChannel("?debug=1", "#aide", cm), null);
	assert.equal(withoutChannel("?channels=%23jeux", "#aide", cm), null);
});
