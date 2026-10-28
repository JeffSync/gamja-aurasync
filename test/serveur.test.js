/*
 * D-001 : une ligne venue du serveur ne montre jamais son nom
 * (« irc.aurasync.fr applique le mode +m ») ; elle est signee « le t'Chat ».
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { estServeur, nomServeur } from "../lib/serveur.js";
import { kickBanner } from "../lib/kick.js";

// buffer.js lit window.Notification au chargement.
globalThis.window = globalThis.window || {};
const { LogLine } = await import("../components/buffer.js");

/* Texte visible d'un arbre preact (sans DOM). */
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
	// SettingsContext.Consumer : ses enfants sont une fonction des reglages.
	if (v.props && typeof v.props.children === "function") {
		return texte(v.props.children({ secondsInTimestamps: false }));
	}
	if (typeof v.type === "function") {
		let C = v.type;
		let rendu = C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props);
		return texte(rendu);
	}
	return texte(v.props && v.props.children);
}

const SERVEUR = "irc.aurasync.fr";

function ligne(msg) {
	let server = { users: new Map(), cm: (s) => s.toLowerCase(), membershipModes: [] };
	let buffer = { type: "channel", name: "#aide", members: new Map(), redacted: new Set() };
	msg = { tags: { time: "2026-10-28T10:00:00.000Z" }, key: 1, ...msg };
	let l = new LogLine({ message: msg, buffer, server, redacted: false,
		onNickClick: () => {}, onChannelClick: () => {}, onVerifyClick: () => {} });
	return texte(l.render()).replace(/\s+/g, " ").trim();
}

test("estServeur : un nom avec un point, ou « * »", () => {
	assert.equal(estServeur(SERVEUR), true);
	assert.equal(estServeur("*"), true);
	assert.equal(estServeur("Kahen"), false);
	assert.equal(estServeur("PseudoSync"), false);
	assert.equal(estServeur(undefined), false);
	assert.equal(nomServeur(), "Le t'Chat");
	assert.equal(nomServeur(false), "le t'Chat");
});

test("MODE posé par le serveur : « Le t'Chat a activé… »", () => {
	let t = ligne({ command: "MODE", prefix: { name: SERVEUR }, params: ["#aide", "+m"] });
	assert.match(t, /Le t'Chat a activé le mode modération du salon/);
	assert.doesNotMatch(t, /irc/i);
});

test("MODE inconnu posé par le serveur : pas de nom de serveur", () => {
	let t = ligne({ command: "MODE", prefix: { name: SERVEUR }, params: ["#aide", "+M"] });
	assert.match(t, /Le t'Chat applique le mode \+M/);
	assert.doesNotMatch(t, /aurasync\.fr/);
});

test("NOTICE du serveur dans un salon : signée « Le t'Chat »", () => {
	let t = ligne({ command: "NOTICE", prefix: { name: SERVEUR }, params: ["%#aide", "Flood"] });
	assert.match(t, /Le t'Chat/);
	assert.doesNotMatch(t, /aurasync\.fr/);
});

test("KICK par le serveur : « par le t'Chat », en minuscule", () => {
	let t = ligne({ command: "KICK", prefix: { name: SERVEUR }, params: ["#aide", "Kahen", "Flooding (Limit is 8 lines per 10 seconds)"] });
	assert.match(t, /a été expulsé\(e\) par le t'Chat \(/);
	assert.doesNotMatch(t, /aurasync\.fr/);
});

test("une personne reste nommée", () => {
	let t = ligne({ command: "MODE", prefix: { name: "Jeff", user: "jeff", host: "x" }, params: ["#aide", "+m"] });
	assert.match(t, /Jeff a activé le mode modération du salon/);
	t = ligne({ command: "KICK", prefix: { name: "Jeff", user: "jeff", host: "x" }, params: ["#aide", "Kahen", "spam"] });
	assert.match(t, /par Jeff/);
});

test("bannière d'expulsion par le serveur : sans « par »", () => {
	assert.equal(kickBanner("#aide", SERVEUR, "Flooding"), "Tu as été expulsé(e) de #aide (trop de messages en peu de temps).");
});
