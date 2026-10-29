/*
 * D-062 : motifs des departs et deconnexions, traduits ou tus, jamais un
 * texte brut du serveur ni une formule par defaut d'un logiciel.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { motifDepart, estFormuleParDefaut } from "../lib/evenements.js";
import { reglagesEffectifs, BufferEventsDisplayMode } from "../state.js";

test("motifs de déconnexion : traduits, ou tus", () => {
	let warn = console.warn;
	console.warn = () => {};
	try {
		assert.equal(motifDepart("QUIT", "Quit: Kahen", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "Quit: AdiIRC is updating", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "Kahen", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "Ping timeout: 180 seconds", "Kahen"), "connexion perdue");
		assert.equal(motifDepart("QUIT", "Read error", "Kahen"), "connexion perdue");
		assert.equal(motifDepart("QUIT", "Connection closed", "Kahen"), "connexion perdue");
		assert.equal(motifDepart("QUIT", "Excess Flood", "Kahen"), "trop de messages envoyés d'un coup");
		assert.equal(motifDepart("QUIT", "Max SendQ exceeded", "Kahen"), "trop de messages envoyés d'un coup");
		assert.equal(motifDepart("QUIT", "Killed (OperSync (spam))", "Kahen"), "déconnecté(e) par l'équipe");
		assert.equal(motifDepart("QUIT", "Killed by Jeff (spam)", "Kahen"), "déconnecté(e) par l'équipe");
		assert.equal(motifDepart("QUIT", "Killed (PseudoSync (Services nickname-enforcer kill))", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "Killed (Q-Lined)", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "Banned (G-Lined): spam [ID: 12]", "Kahen"), "accès au t'Chat suspendu");
		assert.equal(motifDepart("QUIT", "User has been banned", "Kahen"), "accès au t'Chat suspendu");
		assert.equal(motifDepart("QUIT", "Changing host", "Kahen"), null);
		assert.equal(motifDepart("QUIT", "*.net *.split", "Kahen"), null, "inconnu : tu");
	} finally {
		console.warn = warn;
	}
});

test("motifs de départ : celui de la personne, sauf formules et « IRC »", () => {
	assert.equal(motifDepart("PART", "à plus tard", "Kahen"), "« à plus tard »");
	assert.equal(motifDepart("PART", "Closing Window", "Jeff"), null, "défaut d'AdiIRC, vu en production");
	assert.equal(motifDepart("PART", "Kahen", "Kahen"), null);
	assert.equal(motifDepart("PART", "Rejoins-moi sur un autre IRC", "Kahen"), null);
	assert.equal(motifDepart("PART", undefined, "Kahen"), null);
	assert.equal(motifDepart("JOIN", "x", "Kahen"), null);
});

test("formules par défaut des logiciels : sans casse, ni ponctuation finale", () => {
	let defauts = [
		"Closing Window", "closing window", "CLOSING WINDOW", "Closing  Window.",
		"Leaving", "leaving...", "Quit", "Bye", "bye!", "Goodbye", "Client exited", "Page closed",
		"mIRC", "HexChat", "WeeChat", "KiwiIRC", "irssi", "AdiIRC", "The Lounge",
	];
	for (let t of defauts) {
		assert.equal(estFormuleParDefaut(t), true, t);
		assert.equal(motifDepart("PART", t, "Jeff"), null, t);
	}
	for (let t of ["Leaving for lunch", "bye tout le monde", "fenêtre fermée par erreur", ""]) {
		assert.equal(estFormuleParDefaut(t), false, t);
	}
	assert.equal(motifDepart("PART", "Leaving for lunch", "Jeff"), "« Leaving for lunch »");
});

test("réglages : arrivées et départs toujours affichés, une ligne chacun", () => {
	let defauts = { secondsInTimestamps: true, bufferEvents: BufferEventsDisplayMode.EXPAND };
	let r = reglagesEffectifs(defauts, { bufferEvents: BufferEventsDisplayMode.HIDE, secondsInTimestamps: false });
	assert.equal(r.bufferEvents, BufferEventsDisplayMode.EXPAND);
	assert.equal(r.secondsInTimestamps, false);
	assert.equal(reglagesEffectifs(defauts, { bufferEvents: "fold" }).bufferEvents, "expand");
	assert.equal(reglagesEffectifs(defauts, null).bufferEvents, "expand");
});
