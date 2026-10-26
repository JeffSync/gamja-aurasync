/*
 * Tests de lib/connexion.js : fins de connexion, reconnexion, pseudo deja
 * pris (D-033), motif des sanctions (D-058). Sans dependance.
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
	finServeur, finPseudoPris, apresFermeture, reessaiPseudo, motifValide,
	commandesSanction, demandeMotif, MAX_ESSAIS_PSEUDO, DELAI_ESSAI_PSEUDO, DEJA_CONNECTE,
} from "../lib/connexion.js";
import { CONNEXION_PERDUE, REPLI_FIN } from "../lib/irc-errors.js";

beforeEach(() => {
	mock.method(console, "error", () => {});
});
afterEach(() => {
	mock.restoreAll();
});

const fin = (raison) => "Closing Link: Kahen[1.2.3.4] (" + raison + ")";

/* [raison de l'ERROR, message attendu] : fins definitives. */
const DEFINITIVES = [
	/* Cas A : /kill Kahen test de déconnexion */
	["Killed by Jeff (test de déconnexion)", "Tu as été déconnecté(e) par l'équipe : test de déconnexion"],
	["Killed by Jeff ()", "Tu as été déconnecté(e) par l'équipe : motif non précisé"],
	/* banned_client (quit.c, 6.2.7), AKILL d'Anope en G-Line */
	["Banned (G-Lined): [Jeff] spam répété (ID: 5f3a) [ID: 1a2b3c]", "Ton accès au t'Chat est suspendu : spam répété"],
	["Banned (G-Lined): insultes", "Ton accès au t'Chat est suspendu : insultes"],
	["Banned (K-Lined): insultes [ID: 9z]", "Ton accès au t'Chat est suspendu : insultes"],
	["Banned (Z-Lined): proxy ouvert", "Ton accès au t'Chat est suspendu : proxy ouvert"],
	["Banned (G-Lined) [ID: 1a2b3c]", "Ton accès au t'Chat est suspendu : motif non précisé"],
	["Banned (G-Lined)", "Ton accès au t'Chat est suspendu : motif non précisé"],
	/* Flood, identification exigee (authprompt) */
	["Excess Flood", "Tu as été déconnecté(e) : trop de messages envoyés d'un coup."],
	["Max SendQ exceeded", "Tu as été déconnecté(e) : trop de messages envoyés d'un coup."],
	["Account required to connect", "Le t'Chat n'a pas pu t'identifier : ta session sur AuraSync a peut-être expiré."],
	["Killed by NickServ (Services nickname-enforcer kill)", "Tu as été déconnecté(e) : ce pseudo appartient à un autre compte."],
];

test("fin définitive : pas de reconnexion, message traduit, « Se reconnecter »", () => {
	for (let [raison, message] of DEFINITIVES) {
		assert.deepEqual(finServeur(fin(raison)), { reconnecter: false, message, bouton: "Se reconnecter" }, raison);
	}
});

test("fin inconnue : définitive, repli français", () => {
	assert.deepEqual(finServeur(fin("Something brand new")), { reconnecter: false, message: REPLI_FIN, bouton: "Se reconnecter" });
});

test("simple coupure annoncée par le serveur : reconnexion", () => {
	for (let raison of ["Ping timeout: 180 seconds", "Registration Timeout", "Read error", "Write error: Broken pipe", "Connection closed", "Connection reset by peer"]) {
		assert.deepEqual(finServeur(fin(raison)), { reconnecter: true, message: CONNEXION_PERDUE, bouton: null }, raison);
	}
});

test("fermeture du WebSocket : bannière seulement si l'on se reconnecte", () => {
	/* Cas B : 1006 seule, navigateur hors ligne. */
	assert.equal(apresFermeture({ reconnexion: true }), CONNEXION_PERDUE);
	/* Cas A : apres un ERROR definitif, la fermeture 1006 se tait. */
	assert.equal(apresFermeture({ reconnexion: false }), null);
});

test("pseudo déjà pris : 3 essais à quelques secondes, puis l'écran", () => {
	assert.equal(MAX_ESSAIS_PSEUDO, 3);
	assert.ok(DELAI_ESSAI_PSEUDO >= 1000 && DELAI_ESSAI_PSEUDO <= 10000);
	assert.equal(reessaiPseudo(0), DELAI_ESSAI_PSEUDO);
	assert.equal(reessaiPseudo(1), DELAI_ESSAI_PSEUDO);
	assert.equal(reessaiPseudo(2), DELAI_ESSAI_PSEUDO);
	assert.equal(reessaiPseudo(3), null);
	assert.equal(reessaiPseudo(4), null);
	assert.deepEqual(finPseudoPris(), { reconnecter: false, message: DEJA_CONNECTE, bouton: "Réessayer" });
	assert.equal(DEJA_CONNECTE, "Tu es déjà connecté(e) au t'Chat dans un autre onglet.");
});

test("motif d'une sanction : obligatoire (D-058)", () => {
	assert.equal(motifValide("spam"), true);
	assert.equal(motifValide(""), false);
	assert.equal(motifValide("   "), false);
	assert.equal(motifValide(undefined), false);
	assert.equal(commandesSanction("kick", "#aide", "Kahen", ""), null);
	assert.equal(commandesSanction("ban", "#aide", "Kahen", "  "), null);
});

test("sanction : le motif part dans le KICK", () => {
	assert.deepEqual(commandesSanction("kick", "#aide", "Kahen", " spam répété "), [
		{ command: "KICK", params: ["#aide", "Kahen", "spam répété"] },
	]);
	assert.deepEqual(commandesSanction("ban", "#aide", "Kahen", "insultes"), [
		{ command: "MODE", params: ["#aide", "+b", "Kahen!*@*"] },
		{ command: "KICK", params: ["#aide", "Kahen", "insultes"] },
	]);
	assert.equal(commandesSanction("voice", "#aide", "Kahen", "x"), null);
});

test("actions qui demandent un motif", () => {
	assert.ok(demandeMotif("kick"));
	assert.ok(demandeMotif("ban"));
	for (let action of ["voice", "devoice", "op", "deop", "mute", "whois", "query"]) {
		assert.ok(!demandeMotif(action), action);
	}
});

test("aucun texte de fin ne contient « IRC » ni d'anglais connu", () => {
	let sorties = [...DEFINITIVES.map(([r]) => finServeur(fin(r)).message), CONNEXION_PERDUE, DEJA_CONNECTE];
	for (let s of sorties) {
		assert.doesNotMatch(s, /IRC|Killed|Banned|Lined|Closing/i, s);
	}
});
