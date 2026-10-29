/*
 * D-062 : arrivees, departs et deconnexions, en francais, groupes plafonnes
 * a trois pseudos, motifs traduits, jamais un texte brut du serveur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	texteGroupe, plafonner, verbe, motifDepart, retirerReconnexions, texteAutres,
} from "../lib/evenements.js";
import { reglagesEffectifs, BufferEventsDisplayMode } from "../state.js";

let n = 0;
function ev(command, nom, secondes = 0, params = []) {
	n++;
	return {
		command, prefix: { name: nom }, params,
		tags: { time: new Date(Date.UTC(2026, 9, 29, 10, 0, 0) + secondes * 1000).toISOString() },
		key: n,
	};
}
const joins = (...noms) => noms.map((nom) => ev("JOIN", nom));

test("groupe d'arrivées : 1, 2, 3 pseudos, puis « et N autres »", () => {
	assert.equal(texteGroupe(joins("Kahen")), "Kahen a rejoint le salon");
	assert.equal(texteGroupe(joins("Kahen", "Léa")), "Kahen et Léa ont rejoint le salon");
	assert.equal(texteGroupe(joins("Kahen", "Léa", "Bob")), "Kahen, Léa et Bob ont rejoint le salon");
	assert.equal(texteGroupe(joins("Kahen", "Léa", "Bob", "Max")), "Kahen, Léa, Bob et 1 autre ont rejoint le salon");
	assert.equal(texteGroupe(joins("Kahen", "Léa", "Bob", "Max", "Zoé", "Ana")),
		"Kahen, Léa, Bob et 3 autres ont rejoint le salon");
});

test("groupe mêlé : arrivées, départs, déconnexions, accord au nombre", () => {
	let msgs = [ev("JOIN", "Kahen"), ev("PART", "Léa"), ev("QUIT", "Bob"), ev("JOIN", "Max"), ev("QUIT", "Zoé")];
	assert.equal(texteGroupe(msgs),
		"Kahen et Max ont rejoint le salon, Léa a quitté le salon, Bob et Zoé se sont déconnecté(e)s");
	assert.equal(texteGroupe([ev("QUIT", "Bob")]), "Bob s'est déconnecté(e)");
	assert.equal(texteGroupe([ev("PART", "A"), ev("PART", "B")]), "A et B ont quitté le salon");
	assert.equal(texteGroupe([ev("QUIT", "A"), ev("JOIN", "B"), ev("QUIT", "C")]),
		"A et C se sont déconnecté(e)s, B a rejoint le salon", "dans l'ordre d'apparition");
});

test("une même personne n'est comptée qu'une fois", () => {
	assert.equal(texteGroupe(joins("Kahen", "Kahen", "Léa")), "Kahen et Léa ont rejoint le salon");
	assert.deepEqual(plafonner(["a", "b", "a", "c", "d"]), { visibles: ["a", "b", "c"], autres: 1 });
});

test("verbes et textes", () => {
	assert.equal(verbe("JOIN", 1), "a rejoint le salon");
	assert.equal(verbe("JOIN", 2), "ont rejoint le salon");
	assert.equal(verbe("PART", 1), "a quitté le salon");
	assert.equal(verbe("QUIT", 2), "se sont déconnecté(e)s");
	assert.equal(verbe("NICK", 1), null);
	assert.equal(texteAutres(1), "1 autre");
	assert.equal(texteAutres(2), "2 autres");
});

test("aucun texte de groupe ne contient « membre » ni « IRC », ni d'anglais", () => {
	let t = texteGroupe([...joins("A", "B", "C", "D"), ev("PART", "E"), ev("QUIT", "F"), ev("QUIT", "G")]);
	assert.doesNotMatch(t, /membre|IRC|\b(and|has|have|joined|left|quit)\b/i);
});

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
	assert.equal(motifDepart("PART", "Leaving", "Kahen"), null);
	assert.equal(motifDepart("PART", "bye.", "Kahen"), null);
	assert.equal(motifDepart("PART", "Kahen", "Kahen"), null);
	assert.equal(motifDepart("PART", "Rejoins-moi sur un autre IRC", "Kahen"), null);
	assert.equal(motifDepart("PART", undefined, "Kahen"), null);
	assert.equal(motifDepart("JOIN", "x", "Kahen"), null);
});

test("reconnexion en moins d'une minute : retirée ; au-delà, montrée", () => {
	let q = ev("QUIT", "Kahen", 0, ["Ping timeout: 180 seconds"]);
	let j = ev("JOIN", "kahen", 59);
	let autre = ev("JOIN", "Léa", 10);
	assert.deepEqual(retirerReconnexions([q, autre, j], (s) => s.toLowerCase()), [autre]);
	let tard = ev("JOIN", "Kahen", 60);
	assert.deepEqual(retirerReconnexions([q, tard]), [q, tard]);
});

test("départ volontaire puis retour : les deux restent", () => {
	let p = ev("PART", "Kahen", 0);
	let j = ev("JOIN", "Kahen", 5);
	assert.deepEqual(retirerReconnexions([p, j]), [p, j]);
});

test("arrivée puis déconnexion : les deux restent ; NICK sans effet retiré", () => {
	let j = ev("JOIN", "Kahen", 0);
	let q = ev("QUIT", "Kahen", 5);
	let nick = ev("NICK", "Bob", 6, ["Bob"]);
	assert.deepEqual(retirerReconnexions([j, q, nick]), [j, q]);
});

test("réglages : un « masquer » mémorisé ne cache plus les arrivées", () => {
	let defauts = { secondsInTimestamps: true, bufferEvents: BufferEventsDisplayMode.FOLD };
	let r = reglagesEffectifs(defauts, { bufferEvents: BufferEventsDisplayMode.HIDE, secondsInTimestamps: false });
	assert.equal(r.bufferEvents, BufferEventsDisplayMode.FOLD);
	assert.equal(r.secondsInTimestamps, false);
	assert.equal(reglagesEffectifs(defauts, { bufferEvents: "expand" }).bufferEvents, "fold");
	assert.equal(reglagesEffectifs(defauts, null).bufferEvents, "fold");
});
