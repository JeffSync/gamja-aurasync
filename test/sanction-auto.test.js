/*
 * D-062 : expulsions automatiques d'AuraBot. L'avertissement avant le ban,
 * puis le refus 474 qui dit pourquoi et pour combien de temps.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	expulsionAuto, cleSalon, noterExpulsion, oublierExpulsion, refusApresExpulsion,
	AVERTISSEMENT, DUREE_BAN_AUTO, DUREE_BAN_AUTO_MS, ROBOT_KICKERS,
} from "../lib/sanction-auto.js";

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { default: App } = await import("../components/app.js");

const cm = (s) => s.toLowerCase();

test("constantes : une heure, comme BANEXPIRE", () => {
	assert.equal(DUREE_BAN_AUTO, "une heure");
	assert.equal(DUREE_BAN_AUTO_MS, 3600000);
	assert.equal(ROBOT_KICKERS, "AuraBot");
	assert.equal(AVERTISSEMENT, "Attention : après plusieurs expulsions, tu seras banni(e) du salon pendant une heure.");
});

test("expulsion automatique : les trois kickers d'AuraBot, en français et en anglais", () => {
	let cas = [
		["Arrêtez d'envoyer autant de messages !", "trop de messages en peu de temps"],
		["Stop flooding!", "trop de messages en peu de temps"],
		["Arrêtez de vous répéter !", "messages répétés"],
		["Stop repeating yourself!", "messages répétés"],
		["Cessez d'utiliser tant de majuscules !", "trop de majuscules"],
		["Turn caps lock OFF!", "trop de majuscules"],
	];
	for (let [raison, motif] of cas) {
		assert.equal(expulsionAuto("AuraBot", raison), motif, raison);
		assert.equal(expulsionAuto("aurabot", raison), motif, "casse du pseudo");
	}
});

test("expulsion automatique : ni l'équipe, ni le serveur, ni les autres kickers", () => {
	let pas = [
		["Jeff", "Stop flooding!"],
		["AuraBot", "Stop flooding! (Jeff)"],
		["AuraBot", "calme-toi (Jeff)"],
		["irc.aurasync.fr", "Flooding (Limit is 10 lines per 10 seconds)"],
		["SalonSync", "Arrêtez de vous répéter !"],
		["AuraBot", "N'utilisez pas de couleurs sur ce canal !"],
		["AuraBot", "Surveillez votre langage !"],
		["AuraBot", "Requested (Jeff)"],
		["AuraBot", ""],
		["AuraBot", undefined],
	];
	for (let [auteur, raison] of pas) {
		assert.equal(expulsionAuto(auteur, raison), null, auteur + " / " + raison);
	}
});

test("474 : juste après une expulsion automatique, le salon, la durée et le motif", () => {
	let memoire = new Map();
	let cle = cleSalon(1, "#Jeux", cm);
	assert.equal(cle, cleSalon(1, "#jeux", cm), "casse du salon");
	assert.notEqual(cle, cleSalon(2, "#jeux", cm), "un autre serveur");
	noterExpulsion(memoire, cle, "trop de messages en peu de temps", 1000);
	assert.equal(refusApresExpulsion(memoire, cle, "#jeux", 1000),
		"Tu ne peux pas rejoindre #jeux pendant une heure, après plusieurs expulsions pour trop de messages en peu de temps.");
	assert.equal(refusApresExpulsion(memoire, cle, "#jeux", 1000 + DUREE_BAN_AUTO_MS - 1) !== null, true);
});

test("474 : sans expulsion récente, ou dans un autre salon, rien (texte ordinaire)", () => {
	let memoire = new Map();
	let cle = cleSalon(1, "#jeux", cm);
	assert.equal(refusApresExpulsion(memoire, cle, "#jeux", 1000), null, "aucune expulsion");
	noterExpulsion(memoire, cle, "messages répétés", 1000);
	assert.equal(refusApresExpulsion(memoire, cleSalon(1, "#aide", cm), "#aide", 1000), null, "autre salon");
	assert.equal(refusApresExpulsion(memoire, cle, "#jeux", 1000 + DUREE_BAN_AUTO_MS), null, "une heure passée");
	assert.equal(refusApresExpulsion(memoire, cle, "#jeux", 999), null, "horloge reculée");
	oublierExpulsion(memoire, cle);
	assert.equal(refusApresExpulsion(memoire, cle, "#jeux", 1000), null, "revenu(e) dans le salon");
});

test("474 dans App : refusBanAuto lit la mémoire de la session", () => {
	let app = { expulsionsAuto: new Map(), clients: new Map([[1, { cm }]]) };
	let refus = (salon) => App.prototype.refusBanAuto.call(app, 1, { command: "474", params: ["Kahen", salon, "Cannot join channel (+b)"] });
	assert.equal(refus("#jeux"), null, "sans expulsion");
	noterExpulsion(app.expulsionsAuto, cleSalon(1, "#jeux", cm), "trop de majuscules", Date.now());
	assert.equal(refus("#JEUX"), "Tu ne peux pas rejoindre #JEUX pendant une heure, après plusieurs expulsions pour trop de majuscules.");
	assert.equal(refus("#aide"), null);
	assert.equal(App.prototype.refusBanAuto.call(app, 1, { command: "473", params: ["Kahen", "#jeux", "x"] }), null, "autre refus");
	assert.equal(App.prototype.refusBanAuto.call(app, 1, undefined), null);
	assert.equal(App.prototype.refusBanAuto.call(app, 2, { command: "474", params: ["Kahen", "#jeux", "x"] }), null, "serveur inconnu");
});
