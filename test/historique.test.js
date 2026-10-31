/*
 * D-062, point 3 : l'historique d'un salon. Sous « Messages précédents »,
 * au-dessus de sa propre arrivee et de l'accueil ; jamais de notification
 * ni de mention.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { marquerHistorique, avantHistorique, SEPARATEUR_HISTORIQUE } from "../lib/historique.js";

// Le rendu compare chaque message au jour courant (separateur de date).
mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 31, 12) });

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State } = await import("../state.js");
const { HOTE_SERVICES } = await import("../lib/accueil.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer } = await import("../components/buffer.js");

const LOT = { type: "chathistory", params: ["#aide"] };

test("marquage : un message du lot chathistory, même imbriqué, n'est jamais une mention", () => {
	let m = marquerHistorique({ command: "PRIVMSG", batch: LOT, isHighlight: true });
	assert.equal(m.historique, true);
	assert.equal(m.isHighlight, false);
	let imbrique = marquerHistorique({ command: "PRIVMSG", batch: { type: "autre", parent: LOT } });
	assert.equal(imbrique.historique, true);
	let direct = marquerHistorique({ command: "PRIVMSG", isHighlight: true });
	assert.equal(direct.historique, undefined);
	assert.equal(direct.isHighlight, true, "un message en direct garde sa mention");
	let autreLot = marquerHistorique({ command: "PRIVMSG", batch: { type: "netsplit" } });
	assert.equal(autreLot.historique, undefined);
});

test("séparateur : avant le premier message d'une suite venue de l'historique", () => {
	let h = { historique: true };
	let d = {};
	assert.equal(avantHistorique(undefined, h), true, "en tête du salon");
	assert.equal(avantHistorique(d, h), true, "après un message en direct");
	assert.equal(avantHistorique(h, h), false, "dans la suite");
	assert.equal(avantHistorique(h, d), false);
	assert.equal(avantHistorique(undefined, d), false);
	assert.equal(SEPARATEUR_HISTORIQUE, "Messages précédents");
});

/* De bout en bout : routage, preparation, store et rendu de #aide. */

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
		let rendu = C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props);
		return texte(rendu);
	}
	let t = texte(v.props && v.props.children);
	return v.type === "div" ? "\n" + t + "\n" : t;
}

const cm = (s) => s.toLowerCase();

function salon() {
	let client = {
		nick: "Kahen", cm, params: {}, isMyNick: (n) => cm(n) === "kahen", isChannel: (n) => n.startsWith("#"),
		isupport: { statusMsg: () => null, membershipModes: () => [{ prefix: "@", mode: "o" }] },
		serverPrefix: { name: "irc.aurasync.fr" },
	};
	let state = State.create();
	let [sid, u] = State.createServer(state);
	state = { ...state, ...u };
	state = { ...state, ...State.updateServer(state, sid, { cm }) };
	let app = {
		state, clients: new Map([[sid, client]]),
		bufferStore: { get: () => null, put: () => false },
		setState(f, cb) {
			this.state = { ...this.state, ...(typeof f === "function" ? f(this.state) : f) };
			if (cb) {
				cb();
			}
		},
		updateDocumentTitle() {},
		messageNotifications: new Set(),
		createBuffer() {},
	};
	for (let nom of ["accueilDe", "salonMutisme", "routeMessage", "prepareChatMessage", "handleChatMessage", "setBufferState"]) {
		app[nom] = App.prototype[nom];
	}
	let t = 0;
	const heure = (s) => new Date(Date.UTC(2026, 9, 31, 10, 0, s)).toISOString();
	/* Un message en direct, comme handleMessage. */
	function recoit(msg) {
		msg.tags = { time: heure(100 + t++) };
		let dest = app.routeMessage(sid, msg);
		app.state = { ...app.state, ...State.handleMessage(app.state, msg, sid, client) };
		for (let name of dest) {
			app.state = { ...app.state, ...State.addMessage(app.state, msg, { server: sid, name }) };
		}
	}
	/* Une page d'historique, comme handleBufferScrollTop. */
	function historique(...lignes) {
		for (let [s, auteur, texte] of lignes) {
			let msg = { command: "PRIVMSG", prefix: { name: auteur }, params: ["#aide", texte], tags: { time: heure(s) }, batch: LOT };
			app.prepareChatMessage(sid, msg);
			for (let name of app.routeMessage(sid, msg)) {
				app.state = { ...app.state, ...State.addMessage(app.state, msg, { server: sid, name }) };
			}
		}
	}
	function rendu() {
		let buf = State.getBuffer(app.state, { server: sid, name: "#aide" });
		let server = { ...app.state.servers.get(sid), users: new Map(), membershipModes: [], cm };
		let b = new Buffer({
			buffer: buf, server, settings: { bufferEvents: "expand" },
			onNickClick() {}, onChannelClick() {}, onVerifyClick() {},
		});
		return texte(b.render()).split("\n").map((l) => l.replace(/\s+/g, " ").trim())
			.filter((l) => l && l !== "Nouveaux messages");
	}
	return { app, sid, recoit, historique, rendu };
}

const accueil = {
	command: "NOTICE",
	prefix: { name: "AuraBot", user: "Bot", host: HOTE_SERVICES },
	params: ["Kahen", "[#aide] Bienvenue ! Lis la charte."],
};

test("arrivée : « Messages précédents », l'historique, puis « Tu as rejoint » et l'accueil", () => {
	let { recoit, historique, rendu } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	recoit({ ...accueil });
	// L'historique arrive apres : le t'Chat le demande a l'ouverture du salon.
	historique([1, "Léa", "salut tout le monde"], [2, "Bob", "Kahen tu es là ?"]);
	recoit({ command: "PRIVMSG", prefix: { name: "Léa" }, params: ["#aide", "bienvenue Kahen"] });
	let l = rendu();
	assert.equal(l[0], SEPARATEUR_HISTORIQUE, l.join("\n"));
	assert.match(l[1], /« Léa » salut tout le monde$/);
	assert.match(l[2], /« Bob » Kahen tu es là \?$/);
	assert.match(l[3], /Tu as rejoint #aide$/);
	assert.match(l[4], /Bienvenue ! Lis la charte\.$/);
	assert.match(l[5], /« Léa » bienvenue Kahen$/);
	assert.equal(l.length, 6);
});

test("défilement vers le passé : une page plus ancienne passe sous le même séparateur", () => {
	let { recoit, historique, rendu } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	historique([10, "Léa", "récent"]);
	historique([5, "Bob", "ancien"]);
	let l = rendu();
	assert.deepEqual(l.filter((x) => x === SEPARATEUR_HISTORIQUE).length, 1, l.join("\n"));
	assert.equal(l[0], SEPARATEUR_HISTORIQUE);
	assert.match(l[1], /« Bob » ancien$/);
	assert.match(l[2], /« Léa » récent$/);
	assert.match(l[3], /Tu as rejoint #aide$/);
});

test("sans historique, pas de séparateur", () => {
	let { recoit, rendu } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	recoit({ ...accueil });
	assert.ok(!rendu().includes(SEPARATEUR_HISTORIQUE));
});

test("l'historique ne notifie pas et ne compte pas comme mention", () => {
	let notifications = 0;
	class FausseNotification {
		static permission = "granted";
		constructor() {
			notifications++;
		}
		addEventListener() {}
	}
	globalThis.window.Notification = FausseNotification;
	globalThis.Notification = FausseNotification;
	globalThis.document = { hasFocus: () => false };
	try {
		let { app, sid, recoit } = salon();
		recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
		const t = (s) => new Date(Date.UTC(2026, 9, 31, 9, 0, s)).toISOString();
		// Comme fetchBacklog : l'historique passe par handleChatMessage.
		app.handleChatMessage(sid, "#aide", { command: "PRIVMSG", prefix: { name: "Bob" }, params: ["#aide", "Kahen, regarde"], tags: { time: t(1) }, batch: LOT });
		app.handleChatMessage(sid, "#aide", { command: "NOTICE", prefix: { name: "Bob" }, params: ["#aide", "Kahen !"], tags: { time: t(2) }, batch: LOT });
		// Un message prive venu d'un historique (le serveur n'en garde pas
		// aujourd'hui) ne notifie pas davantage.
		app.handleChatMessage(sid, "Bob", { command: "PRIVMSG", prefix: { name: "Bob" }, params: ["Kahen", "coucou"], tags: { time: t(2) }, batch: LOT });
		let buf = State.getBuffer(app.state, { server: sid, name: "#aide" });
		assert.equal(notifications, 0);
		assert.notEqual(buf.unread, "highlight");
		assert.ok(buf.messages.filter((m) => m.historique).every((m) => m.isHighlight === false));
		// Temoin : la meme mention en direct notifie.
		app.handleChatMessage(sid, "#aide", { command: "PRIVMSG", prefix: { name: "Bob" }, params: ["#aide", "Kahen, regarde"], tags: { time: t(3) } });
		assert.equal(notifications, 1);
		assert.equal(State.getBuffer(app.state, { server: sid, name: "#aide" }).unread, "highlight");
	} finally {
		delete globalThis.window.Notification;
		delete globalThis.Notification;
		delete globalThis.document;
	}
});
