/*
 * lib/client.js face a un faux WebSocket : ordre reel des evenements d'un
 * kill (ERROR puis fermeture 1006), d'une coupure seule, d'un pseudo deja
 * pris a l'enregistrement, et du QUIT a la sortie de page.
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

class FakeWebSocket {
	static OPEN = 1;
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
	/* Cote serveur. */
	ouvrir() {
		this.readyState = 1;
		this.emettre("open", {});
	}
	recevoir(raw) {
		/* WHATWG : un message recu apres close() n'est pas delivre. */
		if (this.readyState !== 1) {
			return;
		}
		this.emettre("message", { data: raw });
	}
	fermer(code) {
		this.readyState = 3;
		this.emettre("close", { code });
	}
}

let fenetre;
beforeEach(() => {
	fenetre = { ecouteurs: {} };
	globalThis.window = {
		addEventListener: (type, fn) => {
			fenetre.ecouteurs[type] = fn;
		},
		removeEventListener: (type) => {
			delete fenetre.ecouteurs[type];
		},
	};
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
const { displayError } = await import("../lib/irc-errors.js");

function nouveauClient() {
	let client = new Client({ url: "/socket", nick: "Kahen", username: "Kahen", realname: "Kahen" });
	let journal = { erreurs: [], fins: [] };
	client.addEventListener("error", (e) => journal.erreurs.push(e.detail.message));
	client.addEventListener("fin", (e) => journal.fins.push(e.detail));
	let ws = FakeWebSocket.derniere;
	ws.ouvrir();
	return { client, ws, journal };
}

test("A. kill : l'ERROR reste, la fermeture 1006 ne l'écrase pas, pas de reconnexion", () => {
	let { client, ws, journal } = nouveauClient();
	ws.recevoir("ERROR :Closing Link: Kahen[1.2.3.4] (Killed by Jeff (test de déconnexion))");
	ws.fermer(1006);
	assert.deepEqual(journal.fins, [{ reconnecter: false, message: "Tu as été déconnecté(e) par l'équipe : test de déconnexion", bouton: "Se reconnecter" }]);
	assert.deepEqual(journal.erreurs, []);
	assert.equal(client.autoReconnect, false);
	mock.timers.tick(15 * 60 * 1000);
	assert.equal(FakeWebSocket.derniere, ws, "aucune nouvelle connexion");
});

test("A. G-line : le 465 qui précède ne coupe pas avant l'ERROR et son motif", () => {
	let { ws, journal } = nouveauClient();
	ws.recevoir(":irc.aurasync.fr 465 Kahen :You are not welcome on this network. G-Lined: insultes. Email x");
	ws.recevoir("ERROR :Closing Link: Kahen[1.2.3.4] (Banned (G-Lined): insultes [ID: 1a])");
	ws.fermer(1006);
	assert.equal(journal.fins.length, 1);
	assert.equal(journal.fins[0].message, "Ton accès au t'Chat est suspendu : insultes");
	assert.deepEqual(journal.erreurs, []);
});

test("A. identification refusée : écran de fin traduit, pas de reconnexion", async () => {
	let client = new Client({
		url: "/socket", nick: "Kahen", username: "Kahen", realname: "Kahen",
		saslPlain: { username: "Kahen", password: "x" },
	});
	let fins = [];
	client.addEventListener("fin", (e) => fins.push(e.detail));
	let ws = FakeWebSocket.derniere;
	ws.ouvrir();
	ws.recevoir(":irc.aurasync.fr CAP * LS :sasl=PLAIN");
	ws.recevoir(":irc.aurasync.fr CAP * ACK :sasl");
	ws.recevoir("AUTHENTICATE +");
	ws.recevoir(":irc.aurasync.fr 904 Kahen :SASL authentication failed");
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(fins.length, 1);
	assert.equal(fins[0].reconnecter, false);
	assert.equal(displayError(fins[0].message), "La connexion au t'Chat a échoué. Recharge la page.");
	assert.equal(client.autoReconnect, false);
});

test("B. coupure sans ERROR : bannière de reconnexion, nouvelle connexion avec délai", () => {
	let { client, ws, journal } = nouveauClient();
	ws.fermer(1006);
	assert.deepEqual(journal.erreurs, ["Connexion perdue, reconnexion…"]);
	assert.deepEqual(journal.fins, []);
	assert.equal(client.autoReconnect, true);
	mock.timers.tick(10 * 1000);
	assert.notEqual(FakeWebSocket.derniere, ws, "reconnecte");
});

test("B. Ping timeout annoncé : reconnexion aussi", () => {
	let { ws, journal } = nouveauClient();
	ws.recevoir("ERROR :Closing Link: Kahen[1.2.3.4] (Ping timeout: 180 seconds)");
	ws.fermer(1006);
	assert.deepEqual(journal.fins, []);
	mock.timers.tick(10 * 1000);
	assert.notEqual(FakeWebSocket.derniere, ws);
});

test("C. 433 à l'enregistrement : même pseudo redemandé 3 fois, puis l'écran", () => {
	let { client, ws, journal } = nouveauClient();
	let nicks = () => ws.envoyes.filter((l) => l.startsWith("NICK "));
	assert.deepEqual(nicks(), ["NICK Kahen"]);
	for (let i = 1; i <= 3; i++) {
		ws.recevoir(":irc.aurasync.fr 433 * Kahen :Nickname is already in use.");
		assert.deepEqual(journal.fins, []);
		mock.timers.tick(3000);
		assert.deepEqual(nicks(), Array(i + 1).fill("NICK Kahen"), "jamais un autre pseudo (D-033)");
	}
	ws.recevoir(":irc.aurasync.fr 433 * Kahen :Nickname is already in use.");
	assert.deepEqual(journal.fins, [{ reconnecter: false, message: "Tu es déjà connecté(e) au t'Chat dans un autre onglet.", bouton: "Réessayer" }]);
	assert.deepEqual(journal.erreurs, []);
	assert.equal(client.autoReconnect, false);
});

test("C. 433 puis pseudo libéré : connexion normale", () => {
	let { client, ws, journal } = nouveauClient();
	ws.recevoir(":irc.aurasync.fr 433 * Kahen :Nickname is already in use.");
	mock.timers.tick(3000);
	ws.recevoir(":irc.aurasync.fr 001 Kahen :Welcome");
	assert.equal(client.status, Client.Status.REGISTERED);
	assert.deepEqual(journal.fins, []);
});

test("C. sortie de page : QUIT envoyé, l'ERROR qui répond ne fait rien", () => {
	let { client, ws, journal } = nouveauClient();
	client.quit();
	assert.ok(ws.envoyes.includes("QUIT"));
	ws.recevoir("ERROR :Closing Link: Kahen[1.2.3.4] (Quit: Kahen)");
	ws.fermer(1000);
	assert.deepEqual(journal.fins, []);
	assert.deepEqual(journal.erreurs, []);
	assert.equal(client.autoReconnect, false);
});
