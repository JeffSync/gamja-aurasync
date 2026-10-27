/*
 * Tests de lib/shun.js (decision pure) et du suivi par lib/client.js face a
 * un faux WebSocket : detection du /shun sans faux positif (D-059).
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { suivreLabel, decisionEnvoi, decisionSonde, sonde, shunInscription, RESTREINT, DELAI_REPONSE } from "../lib/shun.js";

const m = (command, params, tags = {}) => ({ command, params, tags });

test("suivi : message unique porteur du label", () => {
	let suivi = suivreLabel("7");
	assert.equal(suivi.recevoir(m("PRIVMSG", ["#aide", "autre"], { label: "6" })), null);
	assert.equal(suivi.recevoir(m("PRIVMSG", ["#aide", "sans label"])), null);
	let echo = m("PRIVMSG", ["#aide", "salut"], { label: "7" });
	assert.deepEqual(suivi.recevoir(echo), { type: "reponse", reponses: [echo] });
});

test("suivi : ACK seul", () => {
	let suivi = suivreLabel("7");
	assert.equal(suivi.recevoir(m("ACK", [], { label: "8" })), null);
	assert.deepEqual(suivi.recevoir(m("ACK", [], { label: "7" })), { type: "ack", reponses: [] });
});

test("suivi : BATCH labeled-response, jusqu'à sa fin", () => {
	let suivi = suivreLabel("7");
	assert.equal(suivi.recevoir(m("BATCH", ["+b1", "labeled-response"], { label: "7" })), null);
	let away = m("301", ["Kahen", "Lola", "absente"], { batch: "b1" });
	let echo = m("PRIVMSG", ["Lola", "salut"], { batch: "b1" });
	assert.equal(suivi.recevoir(away), null);
	assert.equal(suivi.recevoir(m("PRIVMSG", ["#jeux", "ailleurs"], { batch: "b2" })), null);
	assert.equal(suivi.recevoir(echo), null);
	assert.equal(suivi.recevoir(m("BATCH", ["-b2"])), null);
	assert.deepEqual(suivi.recevoir(m("BATCH", ["-b1"])), { type: "reponse", reponses: [away, echo] });
});

test("suivi : un BATCH d'un autre type porteur du label est une réponse", () => {
	let suivi = suivreLabel("7");
	let r = suivi.recevoir(m("BATCH", ["+b1", "chathistory", "#aide"], { label: "7" }));
	assert.equal(r.type, "reponse");
});

test("décisions : seul un ACK à la sonde est un shun", () => {
	assert.equal(decisionEnvoi({ type: "ack" }), "sonder");
	assert.equal(decisionEnvoi({ type: "reponse", reponses: [] }), "libre");
	for (let type of ["delai", "fermeture", "sans-label"]) {
		assert.equal(decisionEnvoi({ type }), "inconnu", type);
		assert.equal(decisionSonde({ type }), "inconnu", type);
	}
	assert.equal(decisionSonde({ type: "ack" }), "shun");
	assert.equal(decisionSonde({ type: "reponse", reponses: [] }), "libre");
	assert.deepEqual(sonde("Kahen"), { command: "MODE", params: ["Kahen"] });
});

test("à la connexion : seul un 451 après le 903 et avant le 001 est un shun", () => {
	assert.equal(shunInscription("451", { saslReussi: true, enregistre: false }), true);
	assert.equal(shunInscription("451", { saslReussi: false, enregistre: false }), false, "avant l'identification");
	assert.equal(shunInscription("451", { saslReussi: true, enregistre: true }), false, "après le 001");
	assert.equal(shunInscription("421", { saslReussi: true, enregistre: false }), false);
	assert.equal(shunInscription("462", { saslReussi: true, enregistre: false }), false);
});

test("texte : repli de D-058, ni « IRC » ni anglais", () => {
	assert.equal(RESTREINT, "Ton activité sur le t'Chat est restreinte : motif non précisé.");
	assert.doesNotMatch(RESTREINT, /IRC|shun/i);
});

/* ── Le vrai client ─────────────────────────────────────────────────── */

class FakeWebSocket {
	static derniere = null;
	readyState = 0;
	envoyes = [];
	ecouteurs = {};
	constructor(url) {
		this.url = url;
		FakeWebSocket.derniere = this;
	}
	addEventListener(type, fn) {
		(this.ecouteurs[type] ||= []).push(fn);
	}
	emettre(type, event) {
		for (let fn of this.ecouteurs[type] || []) {
			fn(event);
		}
	}
	send(raw) {
		this.envoyes.push(raw);
	}
	close() {
		this.readyState = 3;
	}
	ouvrir() {
		this.readyState = 1;
		this.emettre("open", {});
	}
	recevoir(raw) {
		if (this.readyState !== 1) {
			return;
		}
		this.emettre("message", { data: raw });
	}
	fermer(code) {
		this.readyState = 3;
		this.emettre("close", { code });
	}
	/* Label de la derniere ligne envoyee. */
	label() {
		let m = /^@label=([^ ;]+)/.exec(this.envoyes[this.envoyes.length - 1]);
		return m ? m[1] : null;
	}
	derniere() {
		return this.envoyes[this.envoyes.length - 1].replace(/^@\S+ /, "");
	}
}

beforeEach(() => {
	globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
	globalThis.WebSocket = FakeWebSocket;
	Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
	mock.method(console, "log", () => {});
	mock.method(console, "info", () => {});
	mock.method(console, "error", () => {});
	mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
});
afterEach(() => {
	mock.timers.reset();
	mock.restoreAll();
});

const { default: Client } = await import("../lib/client.js");

const S = ":irc.aurasync.fr";

/* Une attente sans fin echoue au lieu de bloquer la suite. */
const LIMITE = { timeout: 2000 };

function connecte(caps = ["labeled-response", "echo-message", "batch"]) {
	let client = new Client({ url: "/socket", nick: "Kahen", username: "Kahen", realname: "Kahen" });
	let ws = FakeWebSocket.derniere;
	ws.ouvrir();
	ws.recevoir(S + " 001 Kahen :Welcome");
	for (let cap of caps) {
		client.caps.enabled.add(cap);
	}
	let restrictions = [];
	client.addEventListener("restriction", (e) => restrictions.push(e.detail.restreint));
	return { client, ws, restrictions };
}

/* Laisse passer les .then() en attente. */
const microtaches = () => new Promise((resolve) => globalThis.setImmediate(resolve));

test("message normal : l'écho suffit, pas de sonde, pas d'attente", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	assert.equal(ws.derniere(), "PRIVMSG #aide salut", "parti tout de suite");
	let label = ws.label();
	assert.ok(label);
	ws.recevoir(`@label=${label} :Kahen!k@h PRIVMSG #aide :salut`);
	assert.equal(await decision, "libre");
	assert.equal(ws.envoyes.filter((l) => / MODE /.test(" " + l.replace(/^@\S+ /, ""))).length, 0);
	assert.deepEqual(restrictions, []);
});

test("shun : ACK au message, ACK à la sonde → restreint", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	await microtaches();
	assert.equal(ws.derniere(), "MODE Kahen", "sonde");
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	assert.equal(await decision, "shun");
	assert.deepEqual(restrictions, [true]);
	assert.equal(client.restreint, true);
});

test("SILENCE ou JOIN déjà fait : ACK, mais la sonde répond 221 → pas de shun", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["Lola", "salut"] });
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	await microtaches();
	ws.recevoir(`@label=${ws.label()} ${S} 221 Kahen +iwxz`);
	assert.equal(await decision, "libre");
	assert.deepEqual(restrictions, []);
});

test("refus numérique (404) : pas de shun, le refus suit son chemin habituel", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	ws.recevoir(`@label=${ws.label()} ${S} 404 Kahen #aide :You are banned (#aide)`);
	assert.equal(await decision, "libre");
	assert.deepEqual(restrictions, []);
});

test("pas de réponse : délai, puis rien", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	mock.timers.tick(DELAI_REPONSE - 1);
	await microtaches();
	mock.timers.tick(1);
	assert.equal(await decision, "inconnu");
	assert.equal(ws.derniere(), "PRIVMSG #aide salut", "aucune sonde");
	assert.deepEqual(restrictions, []);
});

test("ACK puis la sonde reste sans réponse : rien", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	await microtaches();
	mock.timers.tick(DELAI_REPONSE);
	assert.equal(await decision, "inconnu");
	assert.deepEqual(restrictions, []);
});

test("coupure pendant l'attente : rien", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	ws.fermer(1006);
	assert.equal(await decision, "inconnu");
	assert.deepEqual(restrictions, []);
});

test("JOIN de la connexion : réponse en BATCH → normal ; ACK + sonde ACK → shun", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let normal = client.sendSuivi({ command: "JOIN", params: ["#aide,#jeux"] });
	let l = ws.label();
	ws.recevoir(`@label=${l} ${S} BATCH +x1 labeled-response`);
	ws.recevoir("@batch=x1 :Kahen!k@h JOIN #aide");
	ws.recevoir(`@batch=x1 ${S} 366 Kahen #aide :End of /NAMES list.`);
	ws.recevoir(`${S} BATCH -x1`);
	assert.equal(await normal, "libre");

	let shun = client.sendSuivi({ command: "JOIN", params: ["#aide,#jeux"] });
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	await microtaches();
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	assert.equal(await shun, "shun");
	assert.deepEqual(restrictions, [true]);
});

test("fin du shun : le message suivant passe, la restriction tombe", LIMITE, async () => {
	let { client, ws, restrictions } = connecte();
	let d1 = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "un"] });
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	await microtaches();
	ws.recevoir(`@label=${ws.label()} ${S} ACK`);
	assert.equal(await d1, "shun");
	let d2 = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "deux"] });
	ws.recevoir(`@label=${ws.label()} :Kahen!k@h PRIVMSG #aide :deux`);
	assert.equal(await d2, "libre");
	assert.deepEqual(restrictions, [true, false]);
});

test("sans labeled-response : envoi simple, aucune conclusion", LIMITE, async () => {
	let { client, ws, restrictions } = connecte(["echo-message"]);
	let decision = client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "salut"] });
	assert.equal(ws.envoyes[ws.envoyes.length - 1], "PRIVMSG #aide salut");
	assert.equal(await decision, "inconnu");
	assert.deepEqual(restrictions, []);
});

test("connexion fermée : lève tout de suite, comme send()", LIMITE, () => {
	let { client } = connecte();
	client.ws = null;
	assert.throws(() => client.sendSuivi({ command: "PRIVMSG", params: ["#aide", "x"] }));
});
