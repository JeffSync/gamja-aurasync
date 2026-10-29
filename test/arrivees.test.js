/*
 * D-062, de bout en bout : le routage d'App, le store et le rendu d'un
 * salon. Sa propre arrivee en premier, l'accueil dessous, les autres
 * evenements en francais ; une imitation de l'accueil reste dans l'onglet
 * serveur, masque.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State, SERVER_BUFFER } = await import("../state.js");
const { HOTE_SERVICES } = await import("../lib/accueil.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer, LogLine, FoldGroup } = await import("../components/buffer.js");

/* Texte visible d'un arbre preact (sans DOM), une ligne par div. */
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

function lignes(v) {
	return texte(v).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const cm = (s) => s.toLowerCase();

function salon() {
	let client = {
		nick: "Kahen", cm, isMyNick: (n) => cm(n) === "kahen", isChannel: (n) => n.startsWith("#"),
		isupport: { statusMsg: () => null, membershipModes: () => [{ prefix: "@", mode: "o" }] }, serverPrefix: { name: "irc.aurasync.fr" },
	};
	let state = State.create();
	let [sid, u] = State.createServer(state);
	state = { ...state, ...u };
	state = { ...state, ...State.updateServer(state, sid, { cm }) };
	let app = { state, clients: new Map([[sid, client]]) };
	app.accueilDe = App.prototype.accueilDe;
	app.salonMutisme = App.prototype.salonMutisme;
	let t = 0;
	function recoit(msg) {
		msg.tags = { ...(msg.tags || {}), time: new Date(Date.UTC(2026, 9, 29, 10, 0, t++)).toISOString() };
		let dest = App.prototype.routeMessage.call(app, sid, msg);
		app.state = { ...app.state, ...State.handleMessage(app.state, msg, sid, client) };
		for (let name of dest) {
			app.state = { ...app.state, ...State.addMessage(app.state, msg, { server: sid, name }) };
		}
		return dest;
	}
	function rendu(name = "#aide") {
		let buf = State.getBuffer(app.state, { server: sid, name });
		let server = { ...app.state.servers.get(sid), users: new Map(), membershipModes: [], cm };
		let b = new Buffer({
			buffer: buf, server, settings: { bufferEvents: "fold" },
			onNickClick() {}, onChannelClick() {}, onVerifyClick() {}, 
		});
		// Le separateur « Nouveaux messages » depend des accuses de lecture.
		return lignes(b.render()).filter((l) => l !== "Nouveaux messages");
	}
	/* Les personnes deja presentes, comme a l'arrivee (NAMES). */
	function presents(...noms) {
		recoit({
			command: "366", prefix: { name: "irc.aurasync.fr" }, params: ["Kahen", "#aide", "End of /NAMES list."],
			list: [{ params: ["Kahen", "=", "#aide", noms.join(" ")] }], 
		});
	}
	return { recoit, rendu, presents };
}

const accueil = (texte, prefix = {}) => ({
	command: "NOTICE",
	prefix: { name: "AuraBot", user: "Bot", host: HOTE_SERVICES, ...prefix },
	params: ["Kahen", texte],
});

test("sa propre arrivée en premier, l'accueil juste dessous, puis les autres", () => {
	let { recoit, rendu } = salon();
	assert.deepEqual(recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] }), ["#aide"]);
	// Une ligne du salon recue avant l'accueil ne s'intercale pas.
	recoit({ command: "JOIN", prefix: { name: "Léa" }, params: ["#aide"] });
	assert.deepEqual(recoit(accueil("[#aide] Bienvenue ! Lis la charte.")), ["#aide"]);
	recoit({ command: "JOIN", prefix: { name: "Bob" }, params: ["#aide"] });
	recoit({ command: "QUIT", prefix: { name: "Léa" }, params: ["Ping timeout: 180 seconds"] });
	let l = rendu();
	assert.match(l[0], /Tu as rejoint #aide$/);
	assert.match(l[1], /Bienvenue ! Lis la charte\.$/);
	assert.doesNotMatch(l[1], /AuraBot|\[#aide\]/);
	assert.match(l[2], /Léa et Bob ont rejoint le salon, Léa s'est déconnecté\(e\) détail$/);
	assert.equal(l.length, 3);
});

test("arrivée et départ seuls : une ligne chacun, avec le motif traduit", () => {
	let { recoit, rendu, presents } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	presents("Kahen", "Léa", "@Bob");
	recoit({ command: "PRIVMSG", prefix: { name: "Léa" }, params: ["#aide", "salut"] });
	recoit({ command: "QUIT", prefix: { name: "Léa" }, params: ["Ping timeout: 180 seconds"] });
	recoit({ command: "PRIVMSG", prefix: { name: "Bob" }, params: ["#aide", "oh"] });
	recoit({ command: "PART", prefix: { name: "Bob" }, params: ["#aide", "à demain"] });
	let l = rendu();
	assert.match(l[2], /Léa s'est déconnecté\(e\) \(connexion perdue\)$/);
	assert.match(l[4], /Bob a quitté le salon \(« à demain »\)$/);
});

test("une déconnexion volontaire ne montre jamais le texte du logiciel", () => {
	let { recoit, rendu, presents } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	presents("Kahen", "Léa");
	recoit({ command: "PRIVMSG", prefix: { name: "Léa" }, params: ["#aide", "salut"] });
	recoit({ command: "QUIT", prefix: { name: "Léa" }, params: ["Quit: AdiIRC is updating"] });
	let l = rendu();
	assert.match(l[2], /Léa s'est déconnecté\(e\)$/);
});

test("imitation de l'accueil : reste dans l'onglet serveur, masqué", () => {
	let { recoit } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	assert.deepEqual(recoit(accueil("[#aide] Clique ici", { host: "abc.ip.aurasync" })), [SERVER_BUFFER]);
	assert.deepEqual(recoit(accueil("[#jeux] Bienvenue")), [SERVER_BUFFER]);
});

test("l'historique ne rejoue ni sa propre arrivée ni l'accueil", () => {
	let { recoit } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	let batch = { type: "chathistory", params: ["#aide"] };
	assert.deepEqual(recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"], batch }), []);
});

test("groupe de six arrivées : trois pseudos, « et 3 autres », détail au clic", () => {
	let msgs = ["Kahen", "Léa", "Bob", "Max", "Zoé", "Ana"].map((nom, i) => ({
		command: "JOIN", prefix: { name: nom }, params: ["#aide"], key: i + 1,
		tags: { time: "2026-10-29T10:00:0" + i + ".000Z" },
	}));
	let server = { users: new Map(), cm, membershipModes: [] };
	let buffer = { type: "channel", name: "#aide", members: new Map(), redacted: new Set() };
	let props = {
		messages: msgs, buffer, server, onNickClick() {},
		renderLigne: (msg) => new LogLine({
			message: msg, buffer, server, redacted: false,
			onNickClick() {}, onChannelClick() {}, onVerifyClick() {}, 
		}).render(),
	};
	let g = new FoldGroup(props);
	let ferme = lignes(g.render());
	assert.equal(ferme.length, 1);
	assert.match(ferme[0], /Kahen, Léa, Bob et 3 autres ont rejoint le salon détail$/);
	assert.equal(g.shouldComponentUpdate(props, { ouvert: true }), true, "le clic redessine le groupe");
	g.state = { ouvert: true };
	let ouvert = lignes(g.render());
	assert.match(ouvert[0], /masquer$/);
	assert.equal(ouvert.length, 7);
	assert.match(ouvert[6], /Ana a rejoint le salon$/);
});

test("invitation reçue, en français", () => {
	let server = { users: new Map(), cm, membershipModes: [] };
	let buffer = { type: "server", name: "*", members: new Map(), redacted: new Set() };
	let msg = {
		command: "INVITE", prefix: { name: "Jeff" }, params: ["Kahen", "#équipe"], key: 1,
		tags: { time: "2026-10-29T10:00:00.000Z" }, 
	};
	let l = lignes(new LogLine({
		message: msg, buffer, server, redacted: false,
		onNickClick() {}, onChannelClick() {}, onVerifyClick() {}, 
	}).render());
	assert.match(l[0], /Jeff t'invite dans #équipe$/);
	assert.doesNotMatch(l[0], /invited|by/);
});

test("salon sans accueil : sa propre arrivée reste seule, pas dans le groupe", () => {
	let { recoit, rendu } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	recoit({ command: "JOIN", prefix: { name: "Léa" }, params: ["#aide"] });
	recoit({ command: "JOIN", prefix: { name: "Bob" }, params: ["#aide"] });
	let l = rendu();
	assert.match(l[0], /Tu as rejoint #aide$/);
	assert.match(l[1], /Léa et Bob ont rejoint le salon détail$/);
	assert.equal(l.length, 2);
});

test("salon affiché : une reconnexion disparaît, un départ suivi d'un retour reste", () => {
	let { recoit, rendu, presents } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	presents("Kahen", "Léa", "Bob");
	recoit({ command: "PRIVMSG", prefix: { name: "Bob" }, params: ["#aide", "salut"] });
	recoit({ command: "QUIT", prefix: { name: "Léa" }, params: ["Ping timeout: 180 seconds"] });
	recoit({ command: "JOIN", prefix: { name: "Léa" }, params: ["#aide"] });
	recoit({ command: "PART", prefix: { name: "Bob" }, params: ["#aide"] });
	recoit({ command: "JOIN", prefix: { name: "Bob" }, params: ["#aide"] });
	let l = rendu();
	assert.equal(l.length, 3);
	assert.match(l[2], /Bob a quitté le salon, Bob a rejoint le salon détail$/);
	assert.doesNotMatch(l[2], /Léa/);
});
