/*
 * Anti-flood d'UnrealIRCd, cote t'Chat (mission 2 de l'etape 3, antiflood
 * §3.2 et §5.5, points 1 et 5) : l'avis aux % et @ traduit sans la
 * commande /MODE, et le +m / -m pose par le serveur.
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
	translateServerNotice,
	translateServerMode,
	DUREE_MODERATION_AUTO,
	MODERATION_POSEE,
	MODERATION_LEVEE,
	REPLI_AVIS,
} from "../lib/irc-errors.js";

globalThis.window = globalThis.window || {};
const { LogLine } = await import("../components/buffer.js");

let erreurs;
beforeEach(() => {
	erreurs = [];
	mock.method(console, "error", (...a) => erreurs.push(a));
});
afterEach(() => {
	mock.restoreAll();
});

/* Texte d'UnrealIRCd 6.2.7, floodprot.c:1848-1851. */
function avis(type, limite, secondes, mode, salon = "#aide") {
	return "*** Channel " + type + " detected (limit is " + limite + " per " + secondes + " seconds), setting mode +" + mode
		+ ". Type \"/MODE " + salon + " +F\" to get more information on channel flood protection.";
}

test("avis du profil aurasync : la phrase du §3.2, mot pour mot", () => {
	assert.equal(
		translateServerNotice(avis("msg/noticeflood", 60, 15, "m"), "#aide"),
		"Flood détecté dans #aide : plus de 60 messages en 15 secondes. Le salon est en mode modéré pendant 2 minutes.",
	);
	assert.equal(DUREE_MODERATION_AUTO, "2 minutes");
	assert.deepEqual(erreurs, []);
});

test("avis : jamais la commande /MODE, jamais l'anglais", () => {
	for (let [type, mode] of [["msg/noticeflood", "m"], ["CTCPflood", "C"], ["nickflood", "N"], ["knockflood", "K"], ["joinflood", "i"], ["pasteflood", "M"], ["joinflood", "R"]]) {
		let t = translateServerNotice(avis(type, 7, 15, mode), "#jeux");
		assert.doesNotMatch(t, /MODE|\+F|detected|limit|Channel|setting|IRC/, t);
		assert.match(t, /^Flood détecté dans #jeux : plus de 7 \S/);
	}
});

test("avis : chaque type nommé en français", () => {
	let t = (type) => translateServerNotice(avis(type, 8, 15, "N"), "#aide");
	assert.match(t("CTCPflood"), /plus de 8 commandes CTCP en 15 secondes\. Les changements de pseudo/);
	assert.match(t("nickflood"), /8 changements de pseudo en/);
	assert.match(t("knockflood"), /8 demandes d'invitation en/);
	assert.match(t("joinflood"), /8 arrivées en/);
	assert.match(t("pasteflood"), /8 collages en/);
	assert.match(t("repeating"), /8 messages répétés en/);
});

test("avis : la durée n'est dite que pour le profil aurasync", () => {
	assert.match(translateServerNotice(avis("msg/noticeflood", 30, 15, "m"), "#x"), /mode modéré pour un moment\.$/);
	assert.match(translateServerNotice(avis("msg/noticeflood", 60, 10, "m"), "#x"), /mode modéré pour un moment\.$/);
	assert.match(translateServerNotice(avis("msg/noticeflood", 60, 15, "m"), "#x"), /pendant 2 minutes\.$/);
});

test("avis : mode sans phrase, une seule phrase", () => {
	assert.equal(translateServerNotice(avis("msg/noticeflood", 9, 15, "Q"), "#x"), "Flood détecté dans #x : plus de 9 messages en 15 secondes.");
});

test("NOTICE inconnue du serveur : repli français, détail en console, jamais de masque", () => {
	let variante = "*** Channel joinflood detected (limit is 30 per 15 seconds), mostly caused by 'unknown-users', setting mode +b ~time:5:~security-group:unknown-users";
	for (let texte of [variante, "*** Channel bizarreflood detected (limit is 3 per 5 seconds), setting mode +m.", "Something else", "", undefined]) {
		assert.equal(translateServerNotice(texte, "#aide"), REPLI_AVIS);
	}
	assert.equal(erreurs.length, 5);
	assert.doesNotMatch(REPLI_AVIS, /IRC|membre/i);
});

test("+m / -m du serveur : les deux phrases du §3.2", () => {
	assert.equal(translateServerMode("+", "m"), "Le t'Chat a ralenti le salon pendant 2 minutes : trop de messages en même temps.");
	assert.equal(translateServerMode("-", "m"), "Le t'Chat a rouvert le salon à tout le monde.");
	assert.equal(MODERATION_POSEE, translateServerMode("+", "m"));
	assert.equal(MODERATION_LEVEE, translateServerMode("-", "m"));
	assert.equal(translateServerMode("+", "M"), null);
	assert.equal(translateServerMode("+", "i"), null);
});

/* Rendu des lignes, sans DOM (meme methode que test/serveur.test.js). */
function texte(v) {
	if (v === null || v === undefined || typeof v === "boolean") {
		return "";
	}
	if (typeof v === "string" || typeof v === "number") {
		return String(v);
	}
	if (Array.isArray(v)) {
		return v.map(texte).join("");
	}
	if (v.props && typeof v.props.children === "function") {
		return texte(v.props.children({ secondsInTimestamps: false }));
	}
	if (typeof v.type === "function") {
		let C = v.type;
		let rendu = C.prototype && C.prototype.render ? new C(v.props).render() : C.call({ props: v.props }, v.props);
		return texte(rendu);
	}
	return texte(v.props && v.props.children);
}

function ligne(msg, buffer = { type: "channel", name: "#aide", members: new Map(), redacted: new Set() }) {
	let server = { users: new Map(), cm: (s) => s.toLowerCase(), membershipModes: [], statusMsg: "%@" };
	msg = { tags: { time: "2026-11-06T10:00:00.000Z" }, key: 1, ...msg };
	let l = new LogLine({
		message: msg, buffer, server, redacted: false,
		onNickClick: () => {}, onChannelClick: () => {}, onVerifyClick: () => {}, 
	});
	return texte(l.render()).replace(/\s+/g, " ").trim();
}

test("rendu : l'avis aux % et @ est traduit dans le salon", () => {
	let t = ligne({ command: "NOTICE", prefix: { name: "irc.aurasync.fr" }, params: ["%#aide", avis("msg/noticeflood", 60, 15, "m")] });
	assert.match(t, /Le t'Chat/);
	assert.match(t, /Flood détecté dans #aide : plus de 60 messages en 15 secondes\. Le salon est en mode modéré pendant 2 minutes\./);
	assert.doesNotMatch(t, /MODE|detected|aurasync\.fr/);
});

test("rendu : une NOTICE d'une personne n'est pas touchée", () => {
	let t = ligne({ command: "NOTICE", prefix: { name: "Jeff" }, params: ["%#aide", "*** Channel msg/noticeflood detected (limit is 60 per 15 seconds), setting mode +m."] });
	assert.match(t, /Channel msg\/noticeflood detected/);
});

test("rendu : +m et -m par le serveur ; par une personne, la ligne habituelle", () => {
	let serveur = (signe) => ligne({ command: "MODE", prefix: { name: "irc.aurasync.fr" }, params: ["#aide", signe + "m"] });
	assert.match(serveur("+"), /Le t'Chat a ralenti le salon pendant 2 minutes : trop de messages en même temps\./);
	assert.match(serveur("-"), /Le t'Chat a rouvert le salon à tout le monde\./);
	let jeff = ligne({ command: "MODE", prefix: { name: "Jeff" }, params: ["#aide", "-m"] });
	assert.match(jeff, /Jeff a désactivé le salon modéré/);
});
