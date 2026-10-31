/*
 * D-062, de bout en bout : le routage d'App, le store et le rendu d'un
 * salon. Sa propre arrivee en premier, l'accueil dessous, les autres
 * evenements en francais ; une imitation de l'accueil reste dans l'onglet
 * serveur, masque.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Le rendu compare chaque message au jour courant (separateur de date) :
// l'horloge est figee au jour des messages, sinon le test change avec la
// date.
mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 29, 12) });

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State, SERVER_BUFFER } = await import("../state.js");
const { HOTE_SERVICES } = await import("../lib/accueil.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer, LogLine } = await import("../components/buffer.js");

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
		msg.tags = { ...(msg.tags || {}), time: (msg.tags && msg.tags.time) || new Date(Date.UTC(2026, 9, 29, 10, 0, t++)).toISOString() };
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
			buffer: buf, server, settings: { bufferEvents: "expand" },
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
	assert.match(l[2], /^\[\d\d:\d\d\] Léa a rejoint le salon$/);
	assert.match(l[3], /^\[\d\d:\d\d\] Bob a rejoint le salon$/);
	assert.match(l[4], /^\[\d\d:\d\d\] Léa s'est déconnecté\(e\) \(connexion perdue\)$/);
	assert.equal(l.length, 5);
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

test("une ligne par événement, jamais de groupe, même pour six arrivées", () => {
	let { recoit, rendu } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	let noms = ["Léa", "Bob", "Max", "Zoé", "Ana", "Tom"];
	for (let nom of noms) {
		recoit({ command: "JOIN", prefix: { name: nom }, params: ["#aide"] });
	}
	let l = rendu();
	assert.match(l[0], /Tu as rejoint #aide$/);
	assert.equal(l.length, 1 + noms.length);
	noms.forEach((nom, i) => assert.match(l[i + 1], new RegExp("^\\[\\d\\d:\\d\\d\\] " + nom + " a rejoint le salon$")));
	assert.doesNotMatch(l.join("\n"), /autres?|détail|masquer|ont rejoint/);
});

test("aucune reconnexion masquée : déconnexion et retour en une seconde, deux lignes", () => {
	let { recoit, rendu, presents } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	presents("Kahen", "Jeff", "Bob");
	recoit({ command: "PART", prefix: { name: "Jeff" }, params: ["#aide", "Closing Window"] });
	recoit({ command: "JOIN", prefix: { name: "Jeff" }, params: ["#aide"] });
	recoit({ command: "QUIT", prefix: { name: "Bob" }, params: ["Ping timeout: 180 seconds"] });
	recoit({ command: "JOIN", prefix: { name: "Bob" }, params: ["#aide"] });
	let l = rendu();
	assert.deepEqual(l.slice(1).map((x) => x.replace(/^\[\d\d:\d\d\] /, "")), [
		"Jeff a quitté le salon",
		"Jeff a rejoint le salon",
		"Bob s'est déconnecté(e) (connexion perdue)",
		"Bob a rejoint le salon",
	]);
});

test("changement de pseudo : une ligne", () => {
	let { recoit, rendu, presents } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	presents("Kahen", "Bob");
	recoit({ command: "NICK", prefix: { name: "Bob" }, params: ["Bobby"] });
	let l = rendu();
	assert.match(l[1], /Bob est désormais connu\(e\) sous le nom de Bobby$/);
});

test("les séparateurs restent : changement de jour entre deux événements", () => {
	let { recoit, rendu } = salon();
	recoit({ command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"] });
	recoit({ command: "JOIN", prefix: { name: "Léa" }, params: ["#aide"], tags: { time: "2026-10-30T12:00:00.000Z" } });
	let l = rendu();
	let jour = new Date("2026-10-30T12:00:00.000Z").toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
	assert.equal(l.length, 3);
	assert.equal(l[1], jour);
	assert.match(l[2], /Léa a rejoint le salon$/);
});
