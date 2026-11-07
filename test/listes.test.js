/*
 * Etape 5, lot C (D-068, points 5 et 6) : les listes du menu « Réglages »
 * et la duree des bans. Lecture des listes, libelle de chaque forme de
 * masque (jamais une IP), echeance, retrait du masque exact, rubriques
 * selon le rang, choix de duree et masque envoye, phrase du fil.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
	DUREES, LECTURE_LISTE, TITRES, VIDES, appliquerListe, auteurEntree, commandeAjout, commandesRetrait, compteur,
	dateEntree, echeance, estMutisme, libelleDuree, lireEntree, listesALire, masqueBan, minutesBan, rubriques, vueEntree,
} from "../lib/listes.js";
import { estMuet, pseudoMuet, noticeParole } from "../lib/mutisme.js";
import { POUR_BANNIR } from "../lib/salon-reglages.js";
import * as irc from "../lib/irc.js";

globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State } = await import("../state.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer } = await import("../components/buffer.js");
const { default: SalonListes } = await import("../components/salon-listes.js");
const { default: MotifForm } = await import("../components/motif-form.js");
const { default: Client } = await import("../lib/client.js");

const cm = (s) => s.toLowerCase();
const CHANMODES = ["beI", "fkL", "lFH", "cdimnprstzCDGKMNOPQRSTVZ"];
const RANGS_SALON = [{ prefix: "@", mode: "o" }, { prefix: "%", mode: "h" }, { prefix: "+", mode: "v" }];
const JEFF = { name: "Jeff", user: "jeff", host: "admin.aurasync.fr" };
const CLOAK = "1169710B.3A7DD2AE.E66AA06A.IP";
/* 7 novembre 2026, 14:02 a Paris (13:02 UTC) */
const POSE = Date.UTC(2026, 10, 7, 13, 2) / 1000;
const MAINTENANT = new Date(Date.UTC(2026, 10, 7, 13, 30));

/* ── Rendu (meme methode que salon-reglages.test.js) ──────────────── */

function deplier(v) {
	if (v === null || v === undefined || typeof v === "boolean" || typeof v === "string" || typeof v === "number") {
		return v;
	}
	if (Array.isArray(v)) {
		return v.map(deplier);
	}
	if (v.props && typeof v.props.children === "function") {
		return deplier(v.props.children({ secondsInTimestamps: false }));
	}
	if (typeof v.type === "function") {
		let C = v.type;
		return deplier(C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props));
	}
	return { ...v, props: { ...v.props, children: deplier(v.props && v.props.children) } };
}
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
	let t = texte(v.props && v.props.children);
	return ["li", "p", "h3", "div", "section"].includes(v.type) ? "\n" + t + "\n" : t;
}
function tous(v, t, sortie = []) {
	if (Array.isArray(v)) {
		v.forEach((x) => tous(x, t, sortie));
	} else if (v && typeof v === "object") {
		if (t(v)) {
			sortie.push(v);
		}
		tous(v.props && v.props.children, t, sortie);
	}
	return sortie;
}
const classe = (nom) => (v) => typeof v.props.class === "string" && v.props.class.split(/\s+/).includes(nom);
async function attendre() {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

/* ── Masques et entrees ────────────────────────────────────────────── */

const ENTREES = [
	["~account:Kahen", "Compte Kahen"],
	["~a:Kahen", "Compte Kahen"],
	["~time:60:~account:Kahen", "Compte Kahen"],
	["Kahen!*@*", "Pseudo Kahen"],
	["*!*@" + CLOAK, "*!*@" + CLOAK],
	["*!*@*.3A7DD2AE.E66AA06A.IP", "*!*@*.3A7DD2AE.E66AA06A.IP"],
	["*!*@fondateur.aurasync.fr", "*!*@fondateur.aurasync.fr"],
	["*!*@203.0.113.7", "Une adresse"],
	["*!*@2001:db8::1", "Une adresse"],
	["Kahen!*@box-17.example.net", "Une adresse"],
	["*!*@*.example.net", "Une adresse"],
	["~time:30:*!*@198.51.100.24", "Une adresse"],
	["*!*@*", "Tout le monde"],
	["~text:block:*pub*", "Une règle particulière"],
	["~country:FR", "Une règle particulière"],
	["~quiet:Kahen!*@*", "Pseudo Kahen"],
	["~quiet:~account:Kahen", "Compte Kahen"],
	["~time:60:~quiet:~account:Kahen", "Compte Kahen"],
];

test("qui : chaque forme de masque a son libellé ; jamais une IP ni un hôte non masqué", () => {
	for (let [masque, attendu] of ENTREES) {
		let v = vueEntree({ masque, auteur: "Jeff", date: POSE }, MAINTENANT);
		assert.equal(v.qui, attendu, masque);
		assert.doesNotMatch(v.qui, /203\.0|198\.51|2001:db8|example\.net/, masque);
	}
});

test("lireEntree : masque, auteur, date d'un 367 ; date absente ou illisible", () => {
	assert.deepEqual(lireEntree({ params: ["Jeff", "#jeux", "~account:Kahen", "Jeff!jeff@admin.aurasync.fr", String(POSE)] }),
		{ masque: "~account:Kahen", auteur: "Jeff!jeff@admin.aurasync.fr", date: POSE });
	assert.deepEqual(lireEntree({ params: ["Jeff", "#jeux", "x!*@*"] }), { masque: "x!*@*", auteur: null, date: null });
	assert.equal(lireEntree({ params: ["Jeff", "#jeux", "x!*@*", "Jeff", "zut"] }).date, null);
});

test("auteur : pseudo seul, coupé au « ! » ; le serveur signé « Le t'Chat » ; anti-flood", () => {
	assert.equal(auteurEntree("Jeff!jeff@admin.aurasync.fr"), "Jeff");
	assert.equal(auteurEntree("Jeff"), "Jeff");
	assert.equal(auteurEntree("irc.aurasync.fr"), "Le t'Chat");
	assert.equal(auteurEntree(null), null);
	let v = (auteur) => vueEntree({ masque: "~time:10:*!*@" + CLOAK, auteur, date: POSE }, MAINTENANT);
	assert.equal(v("AuraBot!Bot@services.aurasync.fr").antiflood, true);
	assert.equal(v("irc.aurasync.fr").antiflood, true);
	assert.equal(v("Jeff").antiflood, false);
	assert.equal(v(null).antiflood, false);
});

test("date et échéance : heure de Paris, « aujourd'hui », « jusqu'à 15:02 », sinon la date", () => {
	assert.equal(dateEntree(POSE, MAINTENANT), "aujourd'hui à 14:02");
	assert.equal(dateEntree(Date.UTC(2026, 10, 1, 9, 5) / 1000, MAINTENANT), "le 1er novembre à 10:05");
	assert.equal(dateEntree(Date.UTC(2025, 11, 24, 18) / 1000, MAINTENANT), "le 24 décembre 2025 à 19:00");
	assert.equal(dateEntree(null, MAINTENANT), null);
	assert.equal(echeance(POSE, 60, MAINTENANT), "jusqu'à 15:02");
	assert.equal(echeance(POSE, 1440, MAINTENANT), "jusqu'au 8 novembre à 14:02");
	assert.equal(echeance(POSE, null, MAINTENANT), null, "sans fin");
	assert.equal(echeance(null, 60, MAINTENANT), null, "date inconnue : pas d'échéance inventée");
	assert.equal(minutesBan("~time:60:~account:Kahen"), 60);
	assert.equal(minutesBan("~t:5:*!*@x"), 5);
	assert.equal(minutesBan("~account:Kahen"), null);
	let v = vueEntree({ masque: "~time:60:~account:Kahen", auteur: "Jeff", date: POSE }, MAINTENANT);
	assert.equal(v.echeance, "jusqu'à 15:02");
});

test("durées : libellés et masques de la fiche", () => {
	assert.deepEqual(DUREES.map((d) => d.libelle), ["1 heure", "24 heures", "7 jours", "Sans fin"]);
	assert.equal(masqueBan("Kahen", "1h"), "~time:60:~account:Kahen");
	assert.equal(masqueBan("Kahen", "24h"), "~time:1440:~account:Kahen");
	assert.equal(masqueBan("Kahen", "7j"), "~time:10080:~account:Kahen");
	assert.equal(masqueBan("Kahen", "sans-fin"), "~account:Kahen");
	assert.equal(masqueBan("Kahen", "2h"), null);
	assert.equal(masqueBan("", "1h"), null);
	assert.equal(libelleDuree(60), "1 heure");
	assert.equal(libelleDuree(1440), "24 heures");
	assert.equal(libelleDuree(10080), "7 jours");
	assert.equal(libelleDuree(10), "10 minutes");
	assert.equal(libelleDuree(1), "1 minute");
	assert.equal(libelleDuree(90), "90 minutes");
});

test("mutisme : pseudoMuet reconnaît ~quiet:~account:X, temporisé ou non ; un hôte ne nomme personne", () => {
	assert.equal(pseudoMuet("~quiet:Kahen!*@*"), "Kahen");
	assert.equal(pseudoMuet("~q:Kahen!*@*"), "Kahen");
	assert.equal(pseudoMuet("~quiet:~account:Kahen"), "Kahen");
	assert.equal(pseudoMuet("~q:~a:Kahen"), "Kahen");
	assert.equal(pseudoMuet("~time:60:~quiet:~account:Kahen"), "Kahen");
	assert.equal(pseudoMuet("~quiet:*!*@" + CLOAK), null);
	assert.equal(pseudoMuet("~account:Kahen"), null, "un ban n'est pas un mutisme");
	assert.equal(pseudoMuet("~quiet:~account:Ka*"), null);
	assert.ok(estMuet(["~quiet:~account:kahen"], "Kahen", cm));
	assert.ok(estMutisme("~time:5:~quiet:*!*@x"));
	assert.ok(!estMutisme("~account:Kahen"));
});

/* ── Rubriques ─────────────────────────────────────────────────────── */

const LISTE_B = [
	{ masque: "~time:60:~account:Kahen", auteur: "Jeff!jeff@admin.aurasync.fr", date: POSE },
	{ masque: "~time:10:*!*@" + CLOAK, auteur: "AuraBot", date: POSE },
	{ masque: "~quiet:Lea!*@*", auteur: "Kahen", date: POSE },
	{ masque: "~quiet:~account:Sami", auteur: "Jeff", date: POSE },
];

test("rubriques : bans et muets séparés ; exemptions au @ seulement ; invitations si +i", () => {
	let ids = (rang, modes) => rubriques({ b: LISTE_B, e: [], I: [] }, rang, modes).map((r) => r.id);
	assert.deepEqual(ids("@", {}), ["bans", "muets", "exemptions"]);
	assert.deepEqual(ids("%", {}), ["bans", "muets"]);
	assert.deepEqual(ids("%", { i: true }), ["bans", "muets", "invitations"]);
	assert.deepEqual(ids("@", { i: true }), ["bans", "muets", "exemptions", "invitations"]);
	let [bans, muets] = rubriques({ b: LISTE_B }, "@", {});
	assert.deepEqual(bans.entrees.map((e) => e.masque), [LISTE_B[0].masque, LISTE_B[1].masque]);
	assert.deepEqual(muets.entrees.map((e) => e.masque), [LISTE_B[2].masque, LISTE_B[3].masque]);
	assert.equal(rubriques({ b: null }, "@", {})[0].entrees, null, "en lecture");
	assert.equal(rubriques({ b: "erreur" }, "@", {})[1].entrees, "erreur");
	assert.deepEqual(listesALire("@", {}), ["b", "e"]);
	assert.deepEqual(listesALire("%", {}), ["b"]);
	assert.deepEqual(listesALire("%", { i: true }), ["b", "I"]);
});

test("compteur : la liste entière sur MAXLIST ; MAXLIST lu dans le 005", () => {
	assert.equal(compteur({ b: LISTE_B }, "b", 60), "4 / 60");
	assert.equal(compteur({ b: null }, "b", 60), null);
	assert.equal(compteur({ e: [] }, "e", null), "0");
	let is = new irc.Isupport();
	assert.equal(is.maxList("b"), null);
	is.parse(["MAXLIST=b:60,e:60,I:60"]);
	assert.deepEqual(["b", "e", "I", "q"].map((l) => is.maxList(l)), [60, 60, 60, null]);
	let groupe = new irc.Isupport();
	groupe.parse(["MAXLIST=beI:100"]);
	assert.equal(groupe.maxList("I"), 100);
});

test("en direct : ajout sans doublon, retrait sans tenir compte de la casse", () => {
	let l = appliquerListe([], true, "~account:Kahen", "Jeff", POSE);
	assert.deepEqual(l, [{ masque: "~account:Kahen", auteur: "Jeff", date: POSE }]);
	assert.equal(appliquerListe(l, true, "~account:kahen", "Jeff", POSE), l);
	assert.deepEqual(appliquerListe(l, false, "~ACCOUNT:KAHEN"), []);
	assert.equal(appliquerListe(null, true, "x"), null, "liste encore en lecture : rien d'inventé");
});

/* ── Retrait et ajout ──────────────────────────────────────────────── */

test("retrait : le masque exact reçu ; un mutisme prévient la personne ; un hôte, personne", () => {
	assert.deepEqual(commandesRetrait("#jeux", "b", "~time:60:~account:Kahen"), {
		mode: { command: "MODE", params: ["#jeux", "-b", "~time:60:~account:Kahen"] }, notice: null,
	});
	let r = commandesRetrait("#jeux", "b", "~quiet:~account:Sami");
	assert.deepEqual(r.mode, { command: "MODE", params: ["#jeux", "-b", "~quiet:~account:Sami"] }, "jamais recalculé en ~quiet:Sami!*@*");
	assert.deepEqual(r.notice.params, ["Sami", noticeParole("#jeux")]);
	assert.equal(commandesRetrait("#jeux", "b", "~q:Lea!*@*").mode.params[2], "~q:Lea!*@*");
	assert.equal(commandesRetrait("#jeux", "b", "~quiet:*!*@" + CLOAK).notice, null);
	assert.deepEqual(commandesRetrait("#jeux", "e", "~account:Robot").mode.params, ["#jeux", "-e", "~account:Robot"]);
});

test("ajout : +e ou +I ~account:X, pseudo valide seulement", () => {
	assert.deepEqual(commandeAjout("#jeux", "e", " Robot "), { command: "MODE", params: ["#jeux", "+e", "~account:Robot"] });
	assert.deepEqual(commandeAjout("#cercle", "I", "Lea"), { command: "MODE", params: ["#cercle", "+I", "~account:Lea"] });
	for (let p of ["", "1abc", "a b", "*", "Kahen!*@*", "~account:x", "a".repeat(33)]) {
		assert.equal(commandeAjout("#jeux", "e", p), null, JSON.stringify(p));
	}
	assert.equal(commandeAjout("#jeux", "b", "Kahen"), null, "jamais un ban depuis le menu");
});

/* ── Client ────────────────────────────────────────────────────────── */

test("fetchListe : MODE #salon +e, fin 349 du salon, refus rejeté ; fetchBanList garde sa forme", async () => {
	let envoye = null;
	let messages = [];
	let faux = {
		cm,
		roundtrip(msg, done) {
			envoye = msg;
			return new Promise((resolve, reject) => {
				for (let m of messages) {
					try {
						let r = done(m);
						if (r) {
							resolve(r);
							return;
						}
					} catch (err) {
						reject(err);
						return;
					}
				}
			});
		},
	};
	faux.fetchListe = Client.prototype.fetchListe;
	let e1 = { command: "348", params: ["Jeff", "#jeux", "~account:Robot", "Jeff", String(POSE)] };
	messages = [
		{ command: "349", params: ["Jeff", "#autre", "End"], list: [] },
		{ command: "349", params: ["Jeff", "#JEUX", "End"], list: [e1] },
	];
	assert.deepEqual(await faux.fetchListe("#jeux", "e"), [e1]);
	assert.deepEqual(envoye, { command: "MODE", params: ["#jeux", "+e"] });
	messages = [{ command: "347", params: ["Jeff", "#jeux", "End"], list: [] }];
	assert.deepEqual(await faux.fetchListe("#jeux", "I"), []);
	messages = [{ command: "482", params: ["Jeff", "#jeux", "You're not a channel operator"] }];
	await assert.rejects(faux.fetchListe("#jeux", "e"));
	await assert.rejects(faux.fetchListe("#jeux", "q"));
	messages = [{ command: "368", params: ["Jeff", "#jeux", "End"], list: [{ params: ["Jeff", "#jeux", "~quiet:Lea!*@*"] }] }];
	assert.deepEqual(await Client.prototype.fetchBanList.call(faux, "#jeux"), ["~quiet:Lea!*@*"]);
});

test("367 à 368, 348 à 349, 346 à 347 : jamais dans le fil", () => {
	let app = Object.create(App.prototype);
	app.state = State.create();
	app.clients = new Map([["s", { isChannel: (n) => n.startsWith("#"), cm }]]);
	for (let c of ["367", "368", "348", "349", "346", "347"]) {
		assert.deepEqual(App.prototype.routeMessage.call(app, "s", { command: c, params: ["Jeff", "#jeux", "x!*@*", "Jeff", "1"], tags: {} }), [], c);
	}
});

/* ── L'App ─────────────────────────────────────────────────────────── */

class FauxClient extends EventTarget {
	constructor() {
		super();
		this.nick = "Jeff";
		this.cm = cm;
		this.envoyes = [];
		this.suivis = [];
		this.lues = [];
		this.listes = {};
		this.reponse = { type: "ack", reponses: [] };
		this.isupport = new irc.Isupport();
		this.isupport.parse(["CHANMODES=" + CHANMODES.join(","), "PREFIX=(ohv)@%+", "MAXLIST=b:60,e:60,I:60"]);
	}
	isMyNick(n) {
		return cm(n) === "jeff";
	}
	isChannel(n) {
		return n.startsWith("#");
	}
	send(msg) {
		this.envoyes.push(msg);
	}
	sendLabeled(msg, labels) {
		let label = "L" + (this.suivis.length + 1);
		labels.add(label);
		this.suivis.push(msg);
		return Promise.resolve(typeof this.reponse === "function" ? this.reponse(msg, label) : this.reponse);
	}
	fetchListe(salon, lettre) {
		this.lues.push(lettre);
		let r = this.listes[lettre];
		return r instanceof Promise ? r : Promise.resolve(r || []);
	}
}

function monter({ salon = "#jeux", moi = "@", modes = { n: true, t: true } } = {}) {
	let client = new FauxClient();
	let state = State.create();
	let [sid, u] = State.createServer(state);
	state = { ...state, ...u };
	state = { ...state, ...State.updateServer(state, sid, { cm, chanModes: CHANMODES, membershipModes: RANGS_SALON }) };
	let [bid, b] = State.createBuffer(state, salon, sid, client);
	state = { ...state, ...b };
	state = { ...state, ...State.updateBuffer(state, bid, { members: new irc.CaseMapMap([["Jeff", moi], ["Kahen", ""]], cm), modes }) };
	state.activeBuffer = bid;
	state.reglages = null;
	let app = Object.create(App.prototype);
	app.state = state;
	app.clients = new Map([[sid, client]]);
	app.labelsReglages = new Set();
	app.bannieres = [];
	app.showError = (t) => app.bannieres.push(t);
	app.setState = (maj) => {
		let partiel = typeof maj === "function" ? maj(app.state) : maj;
		if (partiel) {
			app.state = { ...app.state, ...partiel };
		}
	};
	app.routeMessage = () => [];
	app.handleChatMessage = () => {};
	app.salonMutisme = () => null;
	// Le serveur repond : l'etat passe par State.handleMessage et l'App
	let recoit = (msg) => {
		msg.tags = msg.tags || {};
		App.prototype.handleMessage.call(app, sid, msg);
		app.state = { ...app.state, ...State.handleMessage(app.state, msg, sid, client) };
	};
	let ouvrir = () => {
		app.toggleReglages();
		app.componentDidUpdate();
	};
	return { app, client, sid, bid, recoit, ouvrir };
}

test("ouverture : b pour % et @, e pour @ seulement, I une fois le 324 lu avec +i", async () => {
	let hop = monter({ moi: "%" });
	hop.ouvrir();
	await attendre();
	assert.deepEqual(hop.client.lues, ["b"]);
	let op = monter();
	op.client.listes.b = [{ params: ["Jeff", "#jeux", "~account:Kahen", "Jeff", String(POSE)] }];
	op.ouvrir();
	assert.equal(op.app.state.reglages.listes.b, null, "en lecture");
	await attendre();
	assert.deepEqual(op.client.lues, ["b", "e"]);
	assert.deepEqual(op.app.state.reglages.listes.b, [{ masque: "~account:Kahen", auteur: "Jeff", date: POSE }]);
	op.app.componentDidUpdate();
	assert.deepEqual(op.client.lues, ["b", "e"], "lues une seule fois");
	let cercle = monter({ salon: "#cercle", moi: "%", modes: {} });
	cercle.ouvrir();
	cercle.recoit({ command: "324", params: ["Jeff", "#cercle", "+int"] });
	cercle.app.componentDidUpdate();
	await attendre();
	assert.deepEqual(cercle.client.lues, ["b", "I"]);
	let rate = monter();
	rate.client.listes.b = Promise.reject(new Error("x"));
	rate.ouvrir();
	await attendre();
	assert.equal(rate.app.state.reglages.listes.b, "erreur");
});

test("en direct : les MODE +b, -b, +e reçus pendant que le menu est ouvert", async () => {
	let { app, ouvrir, recoit } = monter();
	ouvrir();
	await attendre();
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+bb", "~time:60:~account:Kahen", "~quiet:Lea!*@*"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+e", "~account:Robot"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#autre", "+b", "~account:Ailleurs"] });
	assert.deepEqual(app.state.reglages.listes.b.map((e) => e.masque), ["~time:60:~account:Kahen", "~quiet:Lea!*@*"]);
	assert.equal(app.state.reglages.listes.b[0].auteur, "Jeff");
	assert.deepEqual(app.state.reglages.listes.e.map((e) => e.masque), ["~account:Robot"]);
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "-b", "~quiet:Lea!*@*"] });
	assert.deepEqual(app.state.reglages.listes.b.map((e) => e.masque), ["~time:60:~account:Kahen"]);
});

test("retirer : le masque exact, suivi ; la ligne reste jusqu'à l'écho ; refus sous la ligne", async () => {
	let { app, client, ouvrir, recoit } = monter({ moi: "%" });
	client.listes.b = [{ params: ["Jeff", "#jeux", "~time:60:~account:kahen", "Jeff", String(POSE)] }];
	ouvrir();
	await attendre();
	let echo = null;
	client.reponse = () => new Promise((r) => {
		echo = r;
	});
	app.retirerEntree("b", "~time:60:~account:kahen");
	assert.deepEqual(client.suivis, [{ command: "MODE", params: ["#jeux", "-b", "~time:60:~account:kahen"] }]);
	assert.equal(app.state.reglages.envois["liste:b:~time:60:~account:kahen"], true);
	app.retirerEntree("b", "~time:60:~account:kahen");
	assert.equal(client.suivis.length, 1, "un seul envoi à la fois");
	assert.equal(app.state.reglages.listes.b.length, 1, "toujours là avant l'écho");
	let m = { command: "MODE", prefix: JEFF, params: ["#jeux", "-b", "~time:60:~account:Kahen"], tags: { label: "L1" } };
	recoit(m);
	echo({ type: "reponse", reponses: [m] });
	await attendre();
	assert.equal(app.state.reglages.listes.b.length, 0, "l'écho la retire (le serveur compare sans la casse)");

	// Un masque absent de la liste ne part pas ; un refus s'affiche sous la ligne
	app.retirerEntree("b", "~account:Inconnu");
	assert.equal(client.suivis.length, 1);
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "~account:Lea"] });
	client.reponse = { type: "reponse", reponses: [{ command: "482", params: ["Jeff", "#jeux", "You're not a channel operator"] }] };
	app.retirerEntree("b", "~account:Lea");
	await attendre();
	assert.equal(app.state.reglages.refus["liste:b:~account:Lea"], "Tu n'as pas les droits nécessaires sur ce salon.");
	assert.equal(app.state.reglages.listes.b.length, 1);
});

test("rendre la parole : -b du masque exact, puis la NOTICE à la personne après l'écho seulement", async () => {
	let { app, client, ouvrir } = monter({ moi: "%" });
	client.listes.b = [{ params: ["Jeff", "#jeux", "~quiet:~account:Sami", "Jeff", String(POSE)] }];
	ouvrir();
	await attendre();
	client.reponse = { type: "ack", reponses: [] };
	app.retirerEntree("b", "~quiet:~account:Sami");
	await attendre();
	assert.deepEqual(client.envoyes.filter((m) => m.command === "NOTICE"), [], "rien retiré : personne n'est prévenu");
	client.reponse = { type: "reponse", reponses: [{ command: "MODE", params: ["#jeux", "-b", "~quiet:~account:Sami"] }] };
	app.retirerEntree("b", "~quiet:~account:Sami");
	await attendre();
	assert.deepEqual(client.suivis.map((m) => m.params), [["#jeux", "-b", "~quiet:~account:Sami"], ["#jeux", "-b", "~quiet:~account:Sami"]]);
	let notices = client.envoyes.filter((m) => m.command === "NOTICE");
	assert.equal(notices.length, 1);
	assert.deepEqual(notices[0].params, ["Sami", "Tu peux de nouveau écrire dans #jeux."]);
});

test("exemptions : au @ seulement ; invitations : seulement sur un salon +i", async () => {
	let hop = monter({ moi: "%" });
	hop.ouvrir();
	// Meme si une liste e etait la (menu ouvert en @, rang perdu depuis)
	hop.app.state.reglages = { ...hop.app.state.reglages, listes: { b: [], e: [{ masque: "~account:Robot", auteur: "Jeff", date: POSE }] } };
	hop.app.retirerEntree("e", "~account:Robot");
	hop.app.ajouterEntree("e", "Robot");
	hop.app.ajouterEntree("I", "Lea");
	assert.deepEqual(hop.client.suivis, []);

	let op = monter();
	op.ouvrir();
	await attendre();
	op.app.ajouterEntree("e", "Robot");
	op.app.ajouterEntree("I", "Lea");
	op.app.ajouterEntree("e", "pas valide");
	assert.deepEqual(op.client.suivis, [{ command: "MODE", params: ["#jeux", "+e", "~account:Robot"] }]);
	op.client.listes.e = [];
	op.recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+e", "~account:Robot"] });
	op.app.retirerEntree("e", "~account:Robot");
	assert.deepEqual(op.client.suivis[1], { command: "MODE", params: ["#jeux", "-e", "~account:Robot"] });

	let cercle = monter({ salon: "#cercle", modes: { i: true } });
	cercle.ouvrir();
	cercle.app.ajouterEntree("I", "Lea");
	assert.deepEqual(cercle.client.suivis, [{ command: "MODE", params: ["#cercle", "+I", "~account:Lea"] }]);
});

/* ── Rendu des rubriques ───────────────────────────────────────────── */

function rendre(props) {
	return deplier(new SalonListes({
		modes: {}, maxList: { b: 60, e: 60, I: 60 }, envois: {}, refus: {}, maintenant: MAINTENANT,
		onRetirer() {}, onAjouter() {}, ...props,
	}).render());
}

test("rendu @ : trois rubriques, exemptions repliées, compteur, renvoi vers la fiche", () => {
	let v = rendre({ listes: { b: LISTE_B, e: [{ masque: "~account:Robot", auteur: "Jeff", date: POSE }] }, rang: "@" });
	let t = texte(v);
	for (let titre of [TITRES.bans, TITRES.muets, TITRES.exemptions]) {
		assert.ok(t.includes(titre), titre);
	}
	assert.ok(t.indexOf(TITRES.bans) < t.indexOf(POUR_BANNIR) && t.indexOf(POUR_BANNIR) < t.indexOf(TITRES.muets), "le renvoi sous Bannissements");
	assert.ok(t.includes("4 / 60"));
	assert.ok(t.includes("Compte Kahen"));
	assert.ok(t.includes("par Jeff · aujourd'hui à 14:02 · jusqu'à 15:02"), t);
	assert.ok(t.includes("anti-flood"));
	assert.ok(!t.includes("Compte Robot"), "exemptions repliées par défaut");
	let replier = tous(v, classe("liste-replier"))[0];
	assert.equal(replier.props["aria-expanded"], "false");
	let boutons = tous(v, classe("liste-retirer")).map((b) => texte(b));
	assert.deepEqual(boutons, ["Retirer", "Retirer", "Rendre la parole", "Rendre la parole"]);
	assert.doesNotMatch(t, /\bIRC\b|membre|~account|~quiet|~time/i, "jamais un extban brut ni « membre »");
	assert.ok(t.includes("*!*@" + CLOAK), "un masque d'adresse cloaké, tel quel");

	let comp = new SalonListes({ listes: { b: [], e: [{ masque: "~account:Robot", auteur: "Jeff", date: POSE }] }, rang: "@", modes: {}, maxList: {}, maintenant: MAINTENANT, onRetirer() {}, onAjouter() {} });
	comp.state = { exemptionsOuvertes: true };
	t = texte(deplier(comp.render()));
	assert.ok(t.includes("Compte Robot"));
	assert.ok(t.includes("Exempter un compte…"));
	assert.ok(t.includes(VIDES.bans) && t.includes(VIDES.muets));
});

test("rendu % : ni exemptions, ni masque d'IP ; lecture et liste illisible", () => {
	let liste = [...LISTE_B, { masque: "*!*@203.0.113.7", auteur: "Jeff", date: POSE }];
	let t = texte(rendre({ listes: { b: liste, e: [] }, rang: "%" }));
	assert.ok(!t.includes(TITRES.exemptions));
	assert.ok(t.includes("Une adresse"));
	assert.ok(!t.includes("203.0.113.7"));
	assert.ok(texte(rendre({ listes: { b: null }, rang: "%" })).includes(LECTURE_LISTE));
	assert.ok(texte(rendre({ listes: {}, rang: "%" })).includes(LECTURE_LISTE), "pas encore demandée : rien d'inventé");
	assert.ok(texte(rendre({ listes: { b: "erreur" }, rang: "%" })).includes("La liste n'a pas pu être lue."));
	assert.ok(texte(rendre({ listes: { b: [], I: [] }, rang: "%", modes: { i: true } })).includes(VIDES.invitations));
});

test("rendu : bouton en cours et refus ambre sous la ligne", () => {
	let cle = "liste:b:" + LISTE_B[0].masque;
	let v = rendre({ listes: { b: LISTE_B }, rang: "%", envois: { [cle]: true }, refus: { [cle]: "Refusé." } });
	let ligne = tous(v, classe("liste-entree"))[0];
	assert.ok(texte(ligne).includes("Refusé."));
	assert.equal(tous(ligne, classe("reglages-refus"))[0].props.role, "alert");
	assert.equal(tous(ligne, classe("liste-retirer"))[0].props.disabled, true);
});

/* ── Fiche : durée du ban ──────────────────────────────────────────── */

test("fiche : « Bannir » propose 1 heure, 24 heures, 7 jours, sans fin ; 1 heure d'office", () => {
	let recu = null;
	let f = new MotifForm({ action: "ban", nick: "Kahen", onSubmit: (m, d) => {
		recu = [m, d];
	} });
	let v = deplier(f.render());
	let radios = tous(v, (x) => x.type === "input" && x.props.type === "radio");
	assert.deepEqual(radios.map((r) => r.props.value), ["1h", "24h", "7j", "sans-fin"]);
	assert.deepEqual(radios.map((r) => r.props.checked), [true, false, false, false]);
	assert.ok(texte(v).includes("Sans fin"));
	f.state = { motif: " insultes ", duree: "7j" };
	f.handleSubmit({ preventDefault() {} });
	assert.deepEqual(recu, ["insultes", "7j"]);
	let k = new MotifForm({ action: "kick", nick: "Kahen", onSubmit: (m, d) => {
		recu = [m, d];
	} });
	assert.equal(tous(deplier(k.render()), (x) => x.type === "fieldset").length, 0, "expulser : pas de durée");
	k.state = { motif: "spam", duree: "7j" };
	k.handleSubmit({ preventDefault() {} });
	assert.deepEqual(recu, ["spam", undefined]);
});

test("fiche : le ban vise le compte connu de la personne, le KICK d'abord avec le motif", () => {
	let { app, client, sid } = monter();
	app.state = { ...app.state, ...State.updateServer(app.state, sid, (s) => ({ users: new irc.CaseMapMap([["Kahen", { account: "KahenL" }]], cm) })) };
	app.state.dialogData = { action: "ban", nick: "Kahen", channel: "#jeux", server: sid };
	app.dismissDialog = () => {};
	app.handleMotifSubmit("insultes", "24h");
	assert.deepEqual(client.envoyes, [
		{ command: "KICK", params: ["#jeux", "Kahen", "insultes"] },
		{ command: "MODE", params: ["#jeux", "+b", "~time:1440:~account:KahenL"] },
	]);
	client.envoyes = [];
	app.state = { ...app.state, ...State.updateServer(app.state, sid, () => ({ users: new irc.CaseMapMap(null, cm) })) };
	app.handleMotifSubmit("insultes", "sans-fin");
	assert.deepEqual(client.envoyes[1], { command: "MODE", params: ["#jeux", "+b", "~account:Kahen"] }, "compte inconnu : le pseudo, qui est celui du compte (D-033)");
});

/* ── Fil ───────────────────────────────────────────────────────────── */

function fil(messages) {
	let { app, sid, bid } = monter();
	let t = 0;
	for (let msg of messages) {
		msg.tags = { time: new Date(Date.UTC(2026, 10, 7, 10, 0, t++)).toISOString() };
		app.state = { ...app.state, ...State.addMessage(app.state, msg, bid) };
	}
	let server = { ...app.state.servers.get(sid), users: new Map() };
	let b = new Buffer({
		buffer: State.getBuffer(app.state, bid), server, settings: { bufferEvents: "expand" },
		onNickClick() {}, onChannelClick() {}, onVerifyClick() {},
	});
	return texte(deplier(b.render()));
}

test("fil : « Jeff a banni Kahen pendant 1 heure : insultes », durée et motif du KICK", () => {
	let t = fil([
		{ command: "KICK", prefix: JEFF, params: ["#jeux", "Kahen", "insultes"] },
		{ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "~time:60:~account:Kahen"] },
		{ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "~time:1440:~account:Lea"] },
		{ command: "KICK", prefix: JEFF, params: ["#jeux", "Sami", "spam"] },
		{ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "~account:Sami"] },
		{ command: "MODE", prefix: JEFF, params: ["#jeux", "-b", "~time:60:~account:Kahen"] },
		{ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "~quiet:~account:Nora"] },
	]);
	for (let attendu of [
		"Jeff a banni Kahen pendant 1 heure : insultes",
		"Jeff a banni Lea pendant 24 heures",
		"Jeff a banni Sami : spam",
		"Jeff a levé le ban de Kahen",
		"Jeff a rendu Nora muet(te)",
	]) {
		assert.ok(t.includes(attendu), attendu + "\n" + t);
	}
	assert.ok(!t.includes("Jeff a banni Lea pendant 24 heures :"), "pas de motif sans KICK");
	assert.ok(!t.includes("levé le ban de Kahen pendant"), "une levée n'a pas de durée");
	assert.doesNotMatch(t, /~account|~time|~quiet/);
});

/* ── #abus et #addictions ──────────────────────────────────────────── */

test("#abus : les listes ne sortent pas du menu, pas même dans la console", async () => {
	let traces = [];
	let origines = {};
	for (let n of ["log", "info", "warn", "error", "debug"]) {
		origines[n] = console[n];
		console[n] = (...a) => traces.push(a.join(" "));
	}
	try {
		let { app, client, ouvrir, recoit } = monter({ salon: "#abus" });
		client.listes.b = [{ params: ["Jeff", "#abus", "~account:Kahen", "Jeff", String(POSE)] }];
		ouvrir();
		await attendre();
		recoit({ command: "MODE", prefix: JEFF, params: ["#abus", "+b", "~quiet:~account:Lea"] });
		client.reponse = { type: "reponse", reponses: [{ command: "MODE", params: ["#abus", "-b", "~account:Kahen"] }] };
		app.retirerEntree("b", "~account:Kahen");
		await attendre();
		texte(rendre({ listes: app.state.reglages.listes, rang: "@" }));
	} finally {
		Object.assign(console, origines);
	}
	assert.deepEqual(traces, []);
	mock.restoreAll();
});
