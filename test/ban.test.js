/*
 * D-062 : une ligne de ban ne montre jamais le masque. Elle nomme la
 * personne visee, ou dit « une adresse ».
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { correspond, cibleBan, expulsesAvant, verbeBan } from "../lib/ban.js";

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State } = await import("../state.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer } = await import("../components/buffer.js");

const HOTE = "1169710B.3A7DD2AE.E66AA06A.IP";
const gens = {
	kahen: { nick: "Kahen", username: "kahen", hostname: HOTE },
	lea: { nick: "Lea", username: "lea", hostname: "AAAA.BBBB.CCCC.IP" },
	sam: { nick: "Sam", username: "sam", hostname: HOTE },
	anon: { nick: "Anon" },
};
const personne = (p) => gens[p.toLowerCase()];

test("correspond : jokers, casse, temporisation ; sans hôte, on ne conclut pas", () => {
	assert.equal(correspond("*!*@" + HOTE, gens.kahen.nick, gens.kahen), true);
	assert.equal(correspond("*!*@" + HOTE.toLowerCase(), gens.kahen.nick, gens.kahen), true);
	assert.equal(correspond("~time:60:*!*@" + HOTE, gens.kahen.nick, gens.kahen), true);
	assert.equal(correspond("~t:15:*!*@" + HOTE, gens.kahen.nick, gens.kahen), true);
	assert.equal(correspond("kah?n!*@*", gens.kahen.nick, gens.kahen), true);
	assert.equal(correspond("*!*@*.E66AA06A.IP", gens.kahen.nick, gens.kahen), true);
	assert.equal(correspond("*!*@" + HOTE, gens.lea.nick, gens.lea), false);
	assert.equal(correspond("*!*@" + HOTE, gens.anon.nick, gens.anon), false);
	assert.equal(correspond("*!*@" + HOTE, "Kahen", undefined), false, "fiche absente : hôte inconnu");
	assert.equal(correspond("kahen!*@*", "Kahen", undefined), true, "fiche absente, ban par pseudo");
	assert.equal(correspond("*!*@*", undefined, gens.kahen), false, "sans pseudo");
	assert.equal(correspond("*!*@*", "", gens.kahen), false);
	assert.equal(correspond("*!*@1169710B.3A7DD2AE.E66AA06A.IPX", gens.kahen.nick, gens.kahen), false, "ancré à la fin");
	assert.equal(correspond("x*!*@" + HOTE, gens.kahen.nick, gens.kahen), false, "ancré au début");
	assert.equal(correspond("*!*@1169710B+3A7DD2AE.E66AA06A.IP", gens.kahen.nick, gens.kahen), false, "le point n'est pas un joker");
	assert.equal(correspond(HOTE, gens.kahen.nick, gens.kahen), false, "pas un masque");
	assert.equal(correspond("*!*@AAAA.BBBB.CCCC.IP", "Lea", { ...gens.lea, hostname: "AAAAxBBBB.CCCC.IP" }), false, "le point est un point");
	assert.equal(correspond("kahen!*@1169710B", gens.kahen.nick, gens.kahen), false, "masque plus court que l'hôte");
	assert.equal(correspond("ahen!*@*", gens.kahen.nick, gens.kahen), false, "masque plus court que le pseudo");
	assert.equal(correspond("anon!*@*", gens.anon.nick, gens.anon), true, "ban par pseudo, hôte inconnu");
	assert.equal(correspond("*!*@*", gens.anon.nick, gens.anon), true);
	assert.equal(correspond("*!*@?", gens.anon.nick, gens.anon), false, "hôte inconnu : vide, pas un caractère");
	assert.equal(correspond("~country:RU", gens.kahen.nick, gens.kahen), false, "ban étendu");
	assert.equal(correspond("~realname:*", gens.kahen.nick, gens.kahen), false, "ban étendu à joker");
	assert.equal(correspond("~account:Kahen", gens.kahen.nick, gens.kahen), false);
});

test("cible : la personne expulsée juste avant l'emporte, même à adresse partagée", () => {
	let masque = "*!*@" + HOTE;
	assert.equal(cibleBan(masque, { expulses: ["Kahen"], presents: ["Sam", "Lea"], personne }), "Kahen");
	assert.equal(cibleBan(masque, { expulses: ["Lea", "Sam"], presents: [], personne }), "Sam", "la première qui correspond");
});

test("cible : une seule personne connue du salon correspond", () => {
	assert.equal(cibleBan("*!*@AAAA.BBBB.CCCC.IP", { expulses: [], presents: ["Kahen", "Lea"], personne }), "Lea");
	assert.equal(cibleBan("*!*@" + HOTE, { expulses: [], presents: ["Kahen", "Lea"], personne }), "Kahen");
});

test("cible : personne, ou plusieurs, ou un ban étendu : « une adresse »", () => {
	assert.equal(cibleBan("*!*@" + HOTE, { expulses: [], presents: ["Kahen", "Sam"], personne }), null, "adresse partagée");
	assert.equal(cibleBan("*!*@ZZZ.IP", { expulses: ["Kahen"], presents: ["Lea"], personne }), null);
	assert.equal(cibleBan("~country:RU", { expulses: [], presents: ["Kahen"], personne }), null);
	assert.equal(cibleBan("", { personne }), null);
	assert.equal(cibleBan(undefined, { personne }), null);
	assert.equal(cibleBan("*!*@" + HOTE, { presents: ["Anon"], personne }), null, "hôte inconnu");
	assert.equal(cibleBan("anon!*@*", { presents: ["Anon", "Kahen"], personne }), "Anon", "ban par pseudo");
	assert.equal(cibleBan("zoe!*@*", { presents: ["Zoe"], personne }), "Zoe", "fiche inconnue, ban par pseudo");
	assert.equal(cibleBan("~realname:*", { expulses: ["Kahen"], presents: ["Kahen"], personne }), null);
});

test("cible : ~account nomme le compte, ~time garde la personne", () => {
	assert.equal(cibleBan("~account:Kahen", { personne }), "Kahen");
	assert.equal(cibleBan("~a:Kahen", { personne }), "Kahen");
	assert.equal(cibleBan("~time:60:*!*@" + HOTE, { expulses: ["Kahen"], personne }), "Kahen");
});

test("expulsés avant : du plus récent au plus ancien, sans doublon, avant la ligne", () => {
	let msgs = [
		{ command: "KICK", params: ["#jeux", "Lea", "x"] },
		{ command: "PRIVMSG", params: ["#jeux", "salut"] },
		{ command: "KICK", params: ["#jeux", "Kahen", "x"] },
		{ command: "KICK", params: ["#jeux", "lea", "x"] },
		{ command: "MODE", params: ["#jeux", "+b", "*!*@x"] },
		{ command: "KICK", params: ["#jeux", "Sam", "x"] },
	];
	assert.deepEqual(expulsesAvant(msgs, 4), ["lea", "Kahen"]);
	assert.deepEqual(expulsesAvant(msgs, 0), []);
	assert.deepEqual(expulsesAvant([{ command: "KICK", params: ["#jeux"] }], 1), []);
});

test("verbe : ban et levée, avec ou sans personne", () => {
	assert.equal(verbeBan("+", "Kahen"), "a banni");
	assert.equal(verbeBan("+", null), "a banni une adresse");
	assert.equal(verbeBan("-", "Kahen"), "a levé le ban de");
	assert.equal(verbeBan("-", null), "a levé le ban d'une adresse");
});

/* De bout en bout : routage, store, rendu de #jeux. */

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

function jeux() {
	let client = {
		nick: "Jeff", cm, isMyNick: (n) => cm(n) === "jeff", isChannel: (n) => n.startsWith("#"),
		isupport: { statusMsg: () => null, membershipModes: () => [{ prefix: "@", mode: "o" }], chanModes: () => ["beI", "k", "l", "imnpst"] }, serverPrefix: { name: "irc.aurasync.fr" },
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
		msg.tags = { time: new Date(Date.UTC(2026, 9, 31, 10, 0, t++)).toISOString() };
		let dest = App.prototype.routeMessage.call(app, sid, msg);
		app.state = { ...app.state, ...State.handleMessage(app.state, msg, sid, client) };
		for (let name of dest) {
			app.state = { ...app.state, ...State.addMessage(app.state, msg, { server: sid, name }) };
		}
	}
	function lignes() {
		let buf = State.getBuffer(app.state, { server: sid, name: "#jeux" });
		let server = { ...app.state.servers.get(sid), membershipModes: [], cm };
		let b = new Buffer({
			buffer: buf, server, settings: { bufferEvents: "expand" },
			onNickClick() {}, onChannelClick() {}, onVerifyClick() {},
		});
		return texte(b.render()).split("\n").map((l) => l.replace(/\s+/g, " ").trim())
			.filter((l) => l && l !== "Nouveaux messages");
	}
	recoit({ command: "JOIN", prefix: { name: "Jeff", user: "jeff", host: "equipe.IP" }, params: ["#jeux"] });
	recoit({ command: "JOIN", prefix: { name: "Kahen", user: "kahen", host: HOTE }, params: ["#jeux"] });
	recoit({ command: "JOIN", prefix: { name: "Lea", user: "lea", host: "AAAA.BBBB.CCCC.IP" }, params: ["#jeux"] });
	return { recoit, lignes };
}

const AURABOT = { name: "AuraBot", user: "Bot", host: "services.aurasync.fr" };

test("ligne de ban d'AuraBot : la personne expulsée juste avant, jamais le masque", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "KICK", prefix: AURABOT, params: ["#jeux", "Kahen", "Arrêtez d'envoyer autant de messages !"] });
	recoit({ command: "MODE", prefix: AURABOT, params: ["#jeux", "+b", "*!*@" + HOTE] });
	recoit({ command: "MODE", prefix: AURABOT, params: ["#jeux", "-b", "*!*@" + HOTE] });
	let l = lignes();
	assert.ok(l.some((x) => /Kahen a été expulsé\(e\) par AuraBot \(trop de messages en peu de temps\)/.test(x)), l.join("\n"));
	assert.ok(l.some((x) => /AuraBot a banni Kahen$/.test(x)), l.join("\n"));
	assert.ok(l.some((x) => /AuraBot a levé le ban de Kahen$/.test(x)), l.join("\n"));
	assert.ok(!l.some((x) => x.includes(HOTE) || x.includes("*!*@")), "aucun masque à l'écran");
});

test("ligne de ban sans correspondance : « une adresse »", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: { name: "Jeff", user: "jeff", host: "equipe.IP" }, params: ["#jeux", "+b", "*!*@ZZZ.YYY.IP"] });
	recoit({ command: "MODE", prefix: { name: "Jeff", user: "jeff", host: "equipe.IP" }, params: ["#jeux", "-b", "*!*@ZZZ.YYY.IP"] });
	let l = lignes();
	assert.ok(l.some((x) => /Jeff a banni une adresse$/.test(x)), l.join("\n"));
	assert.ok(l.some((x) => /Jeff a levé le ban d'une adresse$/.test(x)), l.join("\n"));
	assert.ok(!l.some((x) => x.includes("ZZZ")), "aucun masque à l'écran");
});

test("ligne de ban : une personne présente, seule à correspondre", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: { name: "Jeff", user: "jeff", host: "equipe.IP" }, params: ["#jeux", "+b", "*!*@AAAA.BBBB.CCCC.IP"] });
	assert.ok(lignes().some((x) => /Jeff a banni Lea$/.test(x)), lignes().join("\n"));
});
