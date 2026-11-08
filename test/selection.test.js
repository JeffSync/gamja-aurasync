/*
 * Tests de lib/selection.js et de son cablage dans App (D-065, point 9) :
 * les gestes du t'Chat mettent a jour la selection du compte, les
 * sanctions jamais.
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	API_SALONS,
	API_SELECTION,
	DELAI_ECRITURE_MS,
	cleSalon,
	lireCatalogue,
	salonModifiable,
	appliquerGestes,
	createSelection,
} from "../lib/selection.js";

globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
const { default: App } = await import("../components/app.js");
const { default: commands } = await import("../commands.js");
const channels = await import("../components/aurasync-channels.js");

let avertissements;
beforeEach(() => {
	avertissements = [];
	mock.method(console, "warn", (...a) => avertissements.push(a));
	mock.method(console, "error", () => {});
});
afterEach(() => {
	mock.restoreAll();
	channels.setCatalogue(null);
});

/* Reponse de GET /api/irc/channels, comme l'API la sert (extrait). */
function reponseApi(selection) {
	return {
		categories: [
			{
				id: "principaux", label: "Salons principaux", channels: [
					{ name: "#AuraSync", label: "AuraSync", description: "", fixed: true, discreet: false, remember: true },
					{ name: "#aide", label: "Aide", description: "", fixed: false, discreet: false, remember: true },
					{ name: "#abus", label: "Abus", description: "", fixed: false, discreet: true, remember: true, sensible: true },
				], 
			},
			{
				id: "thematiques", label: "Thématiques", channels: [
					{ name: "#cinéma", label: "Cinéma", description: "", fixed: false, discreet: false, remember: true },
					{ name: "#jeux", label: "Jeux", description: "", fixed: false, discreet: false, remember: true, sensible: false },
					{ name: "#musique", label: "Musique", description: "", fixed: false, discreet: false, remember: true },
					{ name: "#addictions", label: "Addictions", description: "", fixed: false, discreet: true, remember: false, sensible: true },
				], 
			},
			{
				id: "regions", label: "Régions", channels: [
					{ name: "#île-de-france", label: "Île-de-France", description: "", fixed: false, discreet: false, remember: true },
				], 
			},
		],
		selection,
	};
}

/*
 * Faux serveur : GET rend la selection du moment, PUT la remplace (filtree
 * comme le serveur : catalogue, ni fixe ni #addictions).
 */
function fauxServeur(selection = ["#aide"]) {
	let srv = { selection, appels: [], panne: null };
	srv.fetch = async (url, init = {}) => {
		srv.appels.push({ url, init });
		if (srv.panne === "reseau") {
			throw new TypeError("Failed to fetch");
		}
		if (srv.panne === "get" && url === API_SALONS) {
			throw new TypeError("Failed to fetch");
		}
		if (srv.panne === "http-corps") {
			return { ok: false, status: 503, json: async () => reponseApi(["#jeux"]) };
		}
		if (srv.panne === "http") {
			return { ok: false, status: 503, json: async () => ({}) };
		}
		if (srv.panne === "json" ) {
			return { ok: true, status: 200, json: async () => ({ autre: 1 }) };
		}
		if (url === API_SALONS) {
			return { ok: true, status: 200, json: async () => reponseApi(srv.selection.slice()) };
		}
		if (url === API_SELECTION && init.method === "PUT") {
			if (srv.panne === "put") {
				return { ok: false, status: 429, json: async () => ({}) };
			}
			let lu = lireCatalogue(reponseApi([]));
			srv.selection = JSON.parse(init.body).channels.filter((c) => salonModifiable(lu.salons, c));
			return { ok: true, status: 200, json: async () => ({ selection: srv.selection }) };
		}
		return { ok: false, status: 404, json: async () => ({}) };
	};
	srv.puts = () => srv.appels.filter((a) => a.init.method === "PUT").map((a) => JSON.parse(a.init.body).channels);
	return srv;
}

function minuteries() {
	let n = 0;
	let attente = new Map();
	return {
		attente,
		timers: {
			setTimeout: (fn, ms) => {
				attente.set(++n, { fn, ms });
				return n;
			},
			clearTimeout: (id) => attente.delete(id),
		},
		declencher() {
			let tout = [...attente.values()];
			attente.clear();
			tout.forEach((t) => t.fn());
		},
	};
}

function selection(srv, extra = {}) {
	let m = minuteries();
	let s = createSelection({ fetch: srv.fetch, timers: m.timers, ...extra });
	return { s, m };
}

test("lireCatalogue : catégories, salons par clé, rang, sélection", () => {
	let lu = lireCatalogue(reponseApi(["#aide"]));
	assert.deepEqual(lu.categories.map((c) => c.id), ["principaux", "thematiques", "regions"]);
	assert.deepEqual(lu.selection, ["#aide"]);
	assert.equal(lu.salons.get("#aurasync").fixed, true);
	assert.equal(lu.salons.get("#addictions").remember, false);
	assert.equal(lu.salons.get("#abus").rang, 2);
	// D-066 : l'indicateur sensible, lu comme fixed et remember
	assert.equal(lu.salons.get("#abus").sensible, true);
	assert.equal(lu.salons.get("#addictions").sensible, true);
	assert.equal(lu.salons.get("#jeux").sensible, false);
	assert.equal(lu.salons.get("#aide").sensible, false, "absent : faux");
	assert.equal(lu.sensibleServi, true);
	// D-065, point 11 : l'indicateur discret (« moins de 3 personnes »)
	assert.equal(lu.salons.get("#abus").discreet, true);
	assert.equal(lu.salons.get("#jeux").discreet, false);
	assert.equal(lu.discretServi, true);
	// API anterieure a D-066 : aucun indicateur servi
	let ancienne = lireCatalogue({ categories: [{ id: "a", label: "A", channels: [{ name: "#abus" }] }], selection: [] });
	assert.equal(ancienne.sensibleServi, false);
	assert.equal(lu.salons.get("#île-de-france").category, "regions");
	for (let bad of [null, {}, { categories: [], selection: null }, { categories: [{ id: 1 }], selection: [] }, { categories: [{ id: "a", label: "A" }], selection: [] }]) {
		assert.equal(lireCatalogue(bad), null);
	}
	assert.deepEqual(lireCatalogue({ categories: [], selection: ["#aide", 3, null] }).selection, ["#aide"]);
	let sansDrapeaux = lireCatalogue({ categories: [{ id: "a", label: "A", channels: [{ name: "#x" }] }], selection: [] });
	assert.deepEqual(sansDrapeaux.salons.get("#x"), { name: "#x", label: "#x", display: "#x", category: "a", rang: 0, fixed: false, remember: true, sensible: false, discreet: false, locked: null });
	// D-068 : les verrous, lettres seules ; null si absents ou mal formes
	let salonsVerrous = [{ name: "#x", locked: "PntfHiklsDQ" }, { name: "#y", locked: "+n" }, { name: "#z", locked: 3 }];
	let verrous = lireCatalogue({ categories: [{ id: "a", label: "A", channels: salonsVerrous }], selection: [] });
	assert.equal(verrous.salons.get("#x").locked, "PntfHiklsDQ");
	assert.equal(verrous.salons.get("#y").locked, null);
	assert.equal(verrous.salons.get("#z").locked, null);
	let texte = lireCatalogue({ categories: [{ id: "a", label: "A", channels: [{ name: "#x", sensible: "oui" }] }], selection: [] });
	assert.equal(texte.salons.get("#x").sensible, false, "seul le booléen true compte");
});

test("salonModifiable : catalogue seulement, ni #AuraSync ni #addictions, nom canonique", () => {
	let { salons } = lireCatalogue(reponseApi([]));
	assert.equal(salonModifiable(salons, "#jeux"), "#jeux");
	assert.equal(salonModifiable(salons, "#JEUX"), "#jeux");
	assert.equal(salonModifiable(salons, "#cinéma"), "#cinéma");
	assert.equal(salonModifiable(salons, "#AuraSync"), null);
	assert.equal(salonModifiable(salons, "#aurasync"), null);
	assert.equal(salonModifiable(salons, "#addictions"), null);
	assert.equal(salonModifiable(salons, "#administration"), null);
	assert.equal(salonModifiable(salons, "#cercle-prive"), null);
	assert.equal(salonModifiable(salons, undefined), null);
	assert.equal(cleSalon("#CINé"), "#ciné");
});

test("appliquerGestes : dans l'ordre, le dernier geste l'emporte, les autres salons ignorés", () => {
	let { salons } = lireCatalogue(reponseApi([]));
	let g = (ajout, nom) => ({ ajout, nom });
	assert.deepEqual(appliquerGestes(["#aide"], [g(true, "#jeux")], salons), ["#aide", "#jeux"]);
	assert.deepEqual(appliquerGestes(["#aide", "#jeux"], [g(false, "#JEUX")], salons), ["#aide"]);
	assert.deepEqual(appliquerGestes(["#aide"], [g(true, "#jeux"), g(false, "#jeux")], salons), ["#aide"]);
	assert.deepEqual(appliquerGestes(["#aide"], [g(false, "#jeux"), g(true, "#jeux")], salons), ["#aide", "#jeux"]);
	assert.deepEqual(appliquerGestes(["#aide"], [g(true, "#jeux"), g(true, "#Jeux")], salons), ["#aide", "#jeux"]);
	assert.deepEqual(appliquerGestes(["#aide"], [g(true, "#addictions"), g(true, "#AuraSync"), g(false, "#AuraSync"), g(true, "#x")], salons), ["#aide"]);
	assert.deepEqual(appliquerGestes(["#aide"], [g(false, "#aide")], salons), []);
});

test("rafale de gestes : une seule écriture, après le délai, avec la sélection complète", async () => {
	let srv = fauxServeur(["#aide"]);
	let { s, m } = selection(srv);
	s.ajouter("#jeux");
	s.ajouter("#musique");
	s.retirer("#aide");
	assert.equal(m.attente.size, 1, "un seul délai en attente");
	assert.equal([...m.attente.values()][0].ms, DELAI_ECRITURE_MS);
	assert.equal(DELAI_ECRITURE_MS, 1000);
	assert.equal(srv.appels.length, 0, "rien avant le délai");
	m.declencher();
	await s.attendre();
	assert.deepEqual(srv.puts(), [["#jeux", "#musique"]]);
	let put = srv.appels.find((a) => a.init.method === "PUT");
	assert.equal(put.url, "/api/irc/channels/selection");
	assert.equal(put.init.credentials, "same-origin");
	assert.equal(put.init.headers["Content-Type"], "application/json");
	assert.equal(srv.appels[0].url, "/api/irc/channels", "relue avant d'écrire");
});

test("un autre onglet a changé la sélection : son geste n'est pas effacé", async () => {
	let srv = fauxServeur(["#aide", "#jeux"]);
	let { s, m } = selection(srv);
	await s.charger();
	srv.selection = ["#aide", "#jeux", "#musique"]; // ajouté ailleurs
	s.retirer("#jeux");
	m.declencher();
	await s.attendre();
	assert.deepEqual(srv.selection, ["#aide", "#musique"]);
});

test("#AuraSync, #addictions, salon hors catalogue, salon de l'équipe : aucune écriture", async () => {
	let srv = fauxServeur(["#aide"]);
	let { s, m } = selection(srv);
	s.retirer("#AuraSync");
	s.ajouter("#addictions");
	s.retirer("#addictions");
	s.ajouter("#cercle-de-kahen");
	s.ajouter("#administration");
	s.ajouter("#aide"); // déjà là
	m.declencher();
	await s.attendre();
	assert.deepEqual(srv.puts(), []);
	assert.deepEqual(srv.selection, ["#aide"]);
});

test("geste vide ou non textuel : ignoré, aucun délai", () => {
	let srv = fauxServeur();
	let { s, m } = selection(srv);
	s.ajouter("");
	s.ajouter(undefined);
	s.retirer(null);
	assert.equal(m.attente.size, 0);
});

test("API indisponible : rien n'est écrit, rien ne lève, une ligne en console", async () => {
	for (let panne of ["reseau", "http", "json"]) {
		let srv = fauxServeur(["#aide"]);
		srv.panne = panne;
		let { s, m } = selection(srv);
		assert.equal(await s.charger(), null);
		s.ajouter("#jeux");
		m.declencher();
		await s.attendre();
		assert.deepEqual(srv.puts(), [], panne);
	}
	assert.ok(avertissements.length >= 6);
});

test("API tombée après une première lecture : pas d'écriture sur une sélection périmée", async () => {
	let srv = fauxServeur(["#aide"]);
	let { s, m } = selection(srv);
	await s.charger();
	srv.panne = "get";
	s.ajouter("#jeux");
	m.declencher();
	await s.attendre();
	assert.deepEqual(srv.puts(), []);
});

test("réponse en erreur avec un corps lisible : jamais utilisée", async () => {
	let srv = fauxServeur(["#aide"]);
	srv.panne = "http-corps";
	let { s } = selection(srv);
	assert.equal(await s.charger(), null);
	assert.equal(s.catalogue, null);
});

test("écriture refusée (429…) : rien ne lève, la sélection du serveur reste", async () => {
	let srv = fauxServeur(["#aide"]);
	srv.panne = "put";
	let { s, m } = selection(srv);
	s.ajouter("#jeux");
	m.declencher();
	await s.attendre();
	assert.deepEqual(srv.selection, ["#aide"]);
	assert.equal(avertissements.length, 1);
});

test("geste pendant une écriture : un second lot, qui attend la fin du premier et part de son résultat", async () => {
	let srv = fauxServeur(["#aide"]);
	let fetchReel = srv.fetch;
	let ouvrir;
	let porte = new Promise((r) => (ouvrir = r));
	let enVol = 0, maxEnVol = 0;
	srv.fetch = async (url, init) => {
		enVol++;
		maxEnVol = Math.max(maxEnVol, enVol);
		try {
			if (init && init.method === "PUT" && srv.puts().length === 0) {
				await porte;
			}
			return await fetchReel(url, init);
		} finally {
			enVol--;
		}
	};
	let { s, m } = selection(srv);
	s.ajouter("#jeux");
	m.declencher();
	await new Promise((r) => setTimeout(r, 0));
	s.ajouter("#musique");
	m.declencher();
	ouvrir();
	await s.attendre();
	await s.attendre();
	assert.deepEqual(srv.puts(), [["#aide", "#jeux"], ["#aide", "#jeux", "#musique"]]);
	assert.equal(maxEnVol, 1, "une requête à la fois");
});

test("charger : la sélection et le catalogue de l'API, transmis à onCatalogue", async () => {
	let srv = fauxServeur(["#jeux"]);
	let recus = [];
	let { s } = selection(srv, { onCatalogue: (lu) => recus.push(lu) });
	let lu = await s.charger();
	assert.deepEqual(lu.selection, ["#jeux"]);
	assert.equal(recus.length, 1);
	assert.equal(s.catalogue, lu);
	assert.equal(srv.appels[0].init.credentials, "same-origin");
});

/* --- Cablage dans App --- */

function fauxApp(buffers) {
	let gestes = [];
	let app = {
		state: { buffers: new Map(buffers.map((b) => [b.id, b])), servers: new Map(), activeBuffer: buffers[0] ? buffers[0].id : null },
		clients: new Map([[1, { send() {}, unmonitor() {}, params: {}, cm: (s) => s.toLowerCase(), nick: "Kahen", caps: { enabled: new Set() } }]]),
		selection: { ajouter: (n) => gestes.push(["+", n]), retirer: (n) => gestes.push(["-", n]) },
		bufferStore: { put() {}, clear() {} },
		expulsionsAuto: new Map(),
		switchBuffer() {},
		setState() {},
		showError() {},
		disconnect() {},
	};
	app.close = (id) => App.prototype.close.call(app, id);
	app.partir = (nom) => App.prototype.partir.call(app, nom);
	return { app, gestes };
}

const salonJeux = { id: 2, server: 1, name: "#jeux", type: "channel", joined: true };
const prive = { id: 3, server: 1, name: "Margaux", type: "nick" };
const serveur = { id: 1, server: 1, name: "*", type: "server" };

test("« Partir » d'un salon : retiré de la sélection ; une conversation privée non", () => {
	let { app, gestes } = fauxApp([salonJeux, prive]);
	App.prototype.close.call(app, 2);
	App.prototype.close.call(app, 3);
	assert.deepEqual(gestes, [["-", "#jeux"]]);
});

test("expulsion (et ban qui suit) : la sélection n'est jamais touchée", () => {
	let { app, gestes } = fauxApp([salonJeux]);
	App.prototype.handleSelfKick.call(app, 1, {
		command: "KICK", prefix: { name: "AuraBot" }, params: ["#jeux", "Kahen", "Arrêtez d'envoyer autant de messages !"],
	});
	assert.deepEqual(gestes, []);
});

test("/part : le salon nommé ou le salon courant, comme « Partir »", () => {
	let { app } = fauxApp([salonJeux, prive]);
	let fermes = [];
	app.close = (id) => fermes.push(id);
	App.prototype.partir.call(app, "#JEUX");
	App.prototype.partir.call(app);
	assert.deepEqual(fermes, [2, 2]);
	assert.throws(() => App.prototype.partir.call(app, "#musique"), /Tu n'es pas dans #musique/);
	app.state.activeBuffer = 3;
	assert.throws(() => App.prototype.partir.call(app), /Ouvre le salon à quitter/);
	app.state.activeBuffer = null;
	assert.throws(() => App.prototype.partir.call(app, "#jeux"), /Aucun salon ouvert/);
	let { app: app2, gestes } = fauxApp([salonJeux]);
	commands.get("part").execute(app2, ["#jeux"]);
	assert.deepEqual(gestes, [["-", "#jeux"]]);
});

test("rejoindre : ajouté une fois le JOIN accepté, jamais sur un refus", async () => {
	let { app, gestes } = fauxApp([]);
	let reponse;
	app.open = () => reponse;
	reponse = Promise.resolve(true);
	App.prototype.rejoindre.call(app, "#jeux");
	reponse = Promise.resolve(false); // refus 474, deja affiche par open()
	App.prototype.rejoindre.call(app, "#musique");
	reponse = undefined; // une personne, pas un salon
	App.prototype.rejoindre.call(app, "Margaux");
	await new Promise((r) => setTimeout(r, 0));
	assert.deepEqual(gestes, [["+", "#jeux"]]);
});

test("/join passe par rejoindre ; la déconnexion ne retire rien", () => {
	let appels = [];
	commands.get("join").execute({ rejoindre: (...a) => appels.push(a) }, ["#jeux"]);
	commands.get("join").execute({ rejoindre: (...a) => appels.push(a) }, ["#jeux", "cle"]);
	assert.deepEqual(appels, [["#jeux"], ["#jeux", null, "cle"]]);
	let { app, gestes } = fauxApp([serveur, salonJeux]);
	App.prototype.close.call(app, 1);
	assert.deepEqual(gestes, []);
});

test("app.js : chaque geste de rejoindre passe par rejoindre, et la sélection n'apparaît nulle part ailleurs", () => {
	let src = readFileSync(new URL("../components/app.js", import.meta.url), "utf8");
	let corps = (nom) => {
		let i = src.indexOf("\n\t" + nom + "(");
		assert.ok(i >= 0, nom);
		return src.slice(i, src.indexOf("\n\t}\n", i));
	};
	assert.match(corps("handleChannelListJoin"), /this\.rejoindre\(name\)/);
	assert.match(corps("handleJoinSubmit"), /this\.rejoindre\(/);
	assert.match(corps("handleJoinClick"), /this\.rejoindre\(buf\.name, buf\.server\)/);
	assert.doesNotMatch(corps("handleSelfKick"), /selection/);
	assert.doesNotMatch(corps("refusBanAuto"), /selection/);
	assert.equal((src.match(/this\.selection\.(ajouter|retirer)\(/g) || []).length, 2, "un seul ajout, un seul retrait");
	assert.match(src, /this\.selection\.charger\(\);/);
});

/* --- Catalogue dans la barre laterale --- */

test("barre latérale : catalogue de l'API, icônes du t'Chat, salons de l'équipe", () => {
	assert.deepEqual(channels.categories().map((c) => c.id), ["prives", "gestion", "autres"], "avant lecture");
	assert.equal(channels.channelMeta("#jeux"), null);
	assert.equal(channels.channelLabel("#île-de-france"), "île-de-france", "avant lecture : le nom, sans #");
	channels.setCatalogue(lireCatalogue(reponseApi([])));
	assert.deepEqual(channels.categories().map((c) => c.label), ["Messages privés", "Gestion", "Salons principaux", "Thématiques", "Régions", "Autres"]);
	assert.deepEqual(channels.channelMeta("#jeux"), { cat: "thematiques", icon: "gamepad", label: "Jeux", display: "#jeux", rank: undefined });
	assert.deepEqual(channels.channelMeta("#Abus"), { cat: "principaux", icon: "flag", label: "Abus", display: "#abus", rank: 3 });
	assert.equal(channels.channelMeta("#île-de-france").icon, "pin");
	assert.equal(channels.channelMeta("#cinéma").icon, "movie");
	assert.equal(channels.channelLabel("#île-de-france"), "Île-de-France");
	assert.deepEqual(channels.channelMeta("#équipe"), { cat: "gestion", icon: "users", label: "Équipe", display: "#Équipe" });
	assert.equal(channels.channelMeta("#cercle"), null);
	assert.equal(channels.channelLabel("#cercle"), "cercle");
	channels.setCatalogue({ pas: "un catalogue" });
	assert.equal(channels.channelMeta("#jeux"), null);
});

test("aurasync-channels.js : plus aucun libellé de salon du catalogue écrit en dur", () => {
	let src = readFileSync(new URL("../components/aurasync-channels.js", import.meta.url), "utf8");
	for (let libelle of ["Bourgogne-Franche-Comté", "Pays de la Loire", "Provence-Alpes", "Spiritualité", "Actualité", "Cinéma", "Principaux\""]) {
		assert.ok(!src.includes(libelle), libelle);
	}
});
