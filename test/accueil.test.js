/*
 * D-062 : l'accueil d'un salon (ENTRYMSG, par AuraBot) est range dans le
 * salon, juste sous sa propre arrivee. Une imitation reste ou elle est.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { lireAccueil, placerAccueil, HOTE_SERVICES } from "../lib/accueil.js";
import { State } from "../state.js";

const cm = (s) => s.toLowerCase();
const contexte = {
	cm,
	estMoi: (pseudo) => cm(pseudo) === "kahen",
	salonRejoint: (nom) => (["#aide", "#équipe"].includes(cm(nom)) ? cm(nom) : null),
};

function notice(texte, prefix = {}, cible = "Kahen", commande = "NOTICE") {
	return {
		command: commande,
		prefix: { name: "AuraBot", user: "Bot", host: HOTE_SERVICES, ...prefix },
		params: [cible, texte],
		tags: {},
	};
}

test("accueil reconnu : salon, texte sans « [#salon] »", () => {
	assert.deepEqual(lireAccueil(notice("[#aide] Bienvenue ! Lis la charte."), contexte),
		{ salon: "#aide", texte: "Bienvenue ! Lis la charte." });
});

test("accueil reconnu : casse du pseudo, du salon et de l'hôte, salon accentué", () => {
	let msg = notice("[#Aide] Salut", { name: "aurabot", host: "Services.AuraSync.fr" }, "KAHEN");
	assert.deepEqual(lireAccueil(msg, contexte), { salon: "#aide", texte: "Salut" });
	assert.deepEqual(lireAccueil(notice("[#équipe] Coucou"), contexte), { salon: "#équipe", texte: "Coucou" });
});

test("accueil en PRIVMSG (compte réglé en messages privés) : reconnu aussi", () => {
	assert.deepEqual(lireAccueil(notice("[#aide] Bienvenue", {}, "Kahen", "PRIVMSG"), contexte),
		{ salon: "#aide", texte: "Bienvenue" });
});

test("imitations refusées", () => {
	let refus = [
		["bon pseudo, mauvais hôte", notice("[#aide] Clique ici", { host: "masque.aurasync.fr" })],
		["bon pseudo, hôte absent", notice("[#aide] Clique ici", { host: undefined })],
		["hôte qui contient celui des services", notice("[#aide] x", { host: "services.aurasync.fr.evil.example" })],
		["autre service, bon hôte", notice("[#aide] x", { name: "SalonSync" })],
		["personne ordinaire", notice("[#aide] x", { name: "Kahen2", host: "abc.ip" })],
		["notice au salon, pas à soi", notice("[#aide] x", {}, "#aide")],
		["notice à quelqu'un d'autre", notice("[#aide] x", {}, "Lea")],
		["salon où l'on n'est pas", notice("[#jeux] x")],
		["texte sans « [#salon] »", notice("Bienvenue sur #aide")],
		["« [#salon] » sans texte", notice("[#aide] ")],
		["« [#salon] » sans espace", notice("[#aide]Bienvenue")],
		["pas un salon", notice("[aide] Bienvenue")],
		["CTCP", notice("\x01VERSION\x01")],
		["autre commande", { ...notice("[#aide] x"), command: "TOPIC" }],
		["sans préfixe", { ...notice("[#aide] x"), prefix: null }],
	];
	for (let [cas, msg] of refus) {
		assert.equal(lireAccueil(msg, contexte), null, cas);
	}
});

const m = (command, extra = {}) => ({ command, prefix: { name: "x" }, params: [], tags: {}, ...extra });

test("placerAccueil : juste sous sa propre arrivée", () => {
	let avant = m("PRIVMSG");
	let arrivee = m("JOIN", { arriveeSoi: true });
	let apres = m("PRIVMSG");
	let accueil = m("NOTICE", { accueil: { salon: "#aide", texte: "a" } });
	let list = [avant, arrivee, apres];
	let place = placerAccueil(list, accueil);
	assert.equal(place.length, 4);
	assert.equal(place[0], avant);
	assert.equal(place[1], arrivee);
	assert.equal(place[2], accueil);
	assert.equal(place[3], apres);
	assert.equal(list.length, 3, "la liste d'origine n'est pas modifiée");
});

test("placerAccueil : plusieurs accueils, dans leur ordre ; la dernière arrivée compte", () => {
	let ancienne = m("JOIN", { arriveeSoi: true });
	let arrivee = m("JOIN", { arriveeSoi: true });
	let a1 = m("NOTICE", { accueil: { texte: "1" } });
	let a2 = m("NOTICE", { accueil: { texte: "2" } });
	let ligne = m("PRIVMSG");
	let list = placerAccueil([ancienne, ligne, arrivee, ligne], a1);
	list = placerAccueil(list, a2);
	assert.deepEqual(list, [ancienne, ligne, arrivee, a1, a2, ligne]);
});

test("placerAccueil : sans arrivée de soi, à la fin", () => {
	let a = m("JOIN");
	let accueil = m("NOTICE", { accueil: { texte: "x" } });
	assert.deepEqual(placerAccueil([a], accueil), [a, accueil]);
	assert.deepEqual(placerAccueil([], accueil), [accueil]);
});

test("State.addMessage range l'accueil sous l'arrivée, le reste à la suite", () => {
	let client = { isChannel: (n) => n.startsWith("#"), cm };
	let state = State.create();
	let [sid, u] = State.createServer(state);
	state = { ...state, ...u };
	let [, ub] = State.createBuffer(state, "#aide", sid, client);
	state = { ...state, ...ub };
	let id = { server: sid, name: "#aide" };
	let t = (s) => ({ time: "2026-10-29T10:00:0" + s + ".000Z" });
	let arrivee = { command: "JOIN", prefix: { name: "Kahen" }, params: ["#aide"], tags: t(1), arriveeSoi: true };
	let ligne = { command: "PRIVMSG", prefix: { name: "Lea" }, params: ["#aide", "salut"], tags: t(2) };
	let accueil = { ...notice("[#aide] Bienvenue"), tags: t(3), accueil: { salon: "#aide", texte: "Bienvenue" } };
	for (let msg of [arrivee, ligne, accueil]) {
		state = { ...state, ...State.addMessage(state, msg, id) };
	}
	let buf = State.getBuffer(state, id);
	assert.deepEqual(buf.messages.map((x) => x.command), ["JOIN", "NOTICE", "PRIVMSG"]);
});
