/*
 * D-067 : une personne suspendue sur le site n'entre pas dans le t'Chat, et
 * le t'Chat ne se connecte jamais qu'avec les identifiants que config.json
 * vient de livrer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
let stockage = new Map();
globalThis.window.localStorage = {
	getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
	setItem: (k, v) => stockage.set(k, String(v)),
	removeItem: (k) => stockage.delete(k),
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.window.location = { search: "", hash: "", toString: () => "https://www.aurasync.fr/tchat-app/" };

const { messageSuspension, refusSuspension } = await import("../lib/suspension.js");
const { default: App } = await import("../components/app.js");

/* La cle de store.autoconnect (store.js, prefixe gamja_) */
const CLE_STOCK = "gamja_autoconnect";

/* Texte A du 12 novembre (D-075) : plus de « le t'Chat t'est fermé ». */
test("texte : daté si la suspension a une fin, sans date sinon, « banni » si définitive", () => {
	assert.equal(
		messageSuspension("2030-11-20T13:30:00.000Z"),
		"Ton compte est suspendu jusqu'au 20 novembre 2030 à 14:30. Tu ne peux pas accéder au t'Chat d'ici là.",
	);
	assert.equal(messageSuspension(null), "Ton compte est suspendu. Tu ne peux pas accéder au t'Chat pour le moment.");
	assert.equal(messageSuspension("pas une date"), messageSuspension(null));
	assert.equal(messageSuspension(null, true), "Ton compte est banni. Tu ne peux plus accéder au t'Chat.");
	for (let t of [messageSuspension(null), messageSuspension("2030-01-01T00:00:00Z"), messageSuspension(null, true)]) {
		assert.doesNotMatch(t, /t'est fermé/);
		assert.doesNotMatch(t, /\bIRC\b|membre|\bvous\b|\bvotre\b/i);
	}
});

test("le motif du GLINE donne la même phrase que l'écran de config.json", async () => {
	const { MESSAGE_SUSPENDU, MESSAGE_BANNI } = await import("../lib/suspension.js");
	const { translateClosing } = await import("../lib/irc-errors.js");
	const fin = (motif) => translateClosing("Closing Link: Kahen[1.2.3.4] (Banned (G-Lined): " + motif + ")");
	assert.equal(fin("Compte suspendu"), MESSAGE_SUSPENDU);
	assert.equal(fin("Compte banni"), MESSAGE_BANNI);
});

test("seul un 403 « suspended » ferme le t'Chat", () => {
	assert.deepEqual(refusSuspension(403, { error: "suspended", expiresAt: null }), {
		suspendu: { message: messageSuspension(null) },
	});
	assert.deepEqual(refusSuspension(403, { error: "suspended", expiresAt: null, banned: true }), {
		suspendu: { message: "Ton compte est banni. Tu ne peux plus accéder au t'Chat." },
	});
	// Seul true compte : une API ancienne, sans le champ, garde « suspendu »
	assert.deepEqual(refusSuspension(403, { error: "suspended", expiresAt: null, banned: "oui" }), {
		suspendu: { message: messageSuspension(null) },
	});
	assert.equal(refusSuspension(403, { error: "autre" }), null);
	assert.equal(refusSuspension(403, null), null);
	assert.equal(refusSuspension(401, { error: "suspended" }), null);
	assert.equal(refusSuspension(500, { error: "suspended" }), null);
});

/* handleConfig, la vraie methode, sur un faux App. */
function faux() {
	let connexions = [];
	let app = {
		state: { connectParams: { url: null, nick: null, autoconnect: false, saslPlain: null } },
		setState(maj) {
			this.state = { ...this.state, ...maj };
		},
		connect(params) {
			connexions.push(params);
		},
	};
	return { app, connexions };
}

const CONFIG_OK = {
	server: {
		url: "/socket", autojoin: ["#AuraSync"], auth: "optional", nick: "Jeff", autoconnect: true,
		saslPlain: { username: "Jeff", password: "frais" },
	},
};

test("suspendu(e) : écran de fermeture, aucune connexion, même avec des identifiants gardés dans le navigateur", async () => {
	stockage.set(CLE_STOCK, JSON.stringify({ url: "/socket", nick: "Jeff", saslPlain: { username: "Jeff", password: "ancien" } }));
	let { app, connexions } = faux();
	await App.prototype.handleConfig.call(app, { server: {}, ...refusSuspension(403, { error: "suspended", expiresAt: null }) });
	assert.deepEqual(connexions, []);
	assert.deepEqual(app.state.suspendu, { message: messageSuspension(null) });
	assert.equal(app.state.connectForm, false);
	stockage.clear();
});

test("config.json sans identifiants : les identifiants gardés dans le navigateur ne servent pas, et sont effacés", async () => {
	stockage.set(CLE_STOCK, JSON.stringify({ url: "/socket", nick: "Jeff", saslPlain: { username: "Jeff", password: "ancien" } }));
	let { app, connexions } = faux();
	await App.prototype.handleConfig.call(app, { server: { url: "/socket", autojoin: "#AuraSync", auth: "optional" } });
	assert.deepEqual(connexions, []);
	assert.equal(app.state.connectParams.saslPlain, null);
	assert.equal("saslPlain" in JSON.parse(stockage.get(CLE_STOCK)), false);
	stockage.clear();
});

test("témoin : config.json livre des identifiants, le t'Chat se connecte avec eux, jamais avec les anciens", async () => {
	stockage.set(CLE_STOCK, JSON.stringify({ url: "/socket", nick: "Jeff", saslPlain: { username: "Jeff", password: "ancien" } }));
	let { app, connexions } = faux();
	await App.prototype.handleConfig.call(app, structuredClone(CONFIG_OK));
	assert.equal(connexions.length, 1);
	assert.deepEqual(connexions[0].saslPlain, { username: "Jeff", password: "frais" });
	assert.equal(app.state.suspendu, undefined);
	stockage.clear();

	let sansStock = faux();
	await App.prototype.handleConfig.call(sansStock.app, structuredClone(CONFIG_OK));
	assert.equal(sansStock.connexions.length, 1);
});
