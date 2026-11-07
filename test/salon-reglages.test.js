/*
 * Etape 5, lot B (D-068, points 2 a 4) : le menu « Réglages » d'un salon.
 * Bouton selon le rang, verrous catalogue ∪ 742, aucun envoi d'un reglage
 * verrouille, bascule a l'echo seulement, compteur d'octets du sujet, refus
 * dans le menu, rebonds de SalonSync (sujet, SECUREOPS), phrases +o et +h.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
	BASCULES, CONNEXION_PERDUE, EQUIPE, LECTURE, PLUS_DE_RANG, POUR_BANNIR, REBOND_STATUT, REBOND_SUJET,
	RESERVE_OP, SANS_REPONSE, dateCreation, envoiMode, etatSujet, guetter, horsCatalogue, issueEnvoi,
	lignesReglages, lireRefus, octets, rangSalon, rebondStatut, rebondSujet, sujetAEnvoyer, verrousSalon,
} from "../lib/salon-reglages.js";
import { phraseRang } from "../lib/reglages.js";
import { lireCatalogue } from "../lib/selection.js";
import * as irc from "../lib/irc.js";

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State, BufferType } = await import("../state.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer } = await import("../components/buffer.js");
const { default: BufferHeader } = await import("../components/buffer-header.js");
const { default: SalonReglages } = await import("../components/salon-reglages.js");
const { setCatalogue } = await import("../components/aurasync-channels.js");

const OFFICIEL = "PntfHiklsDQ";
const MODES_OFFICIELS = { P: true, n: true, t: true, f: "[10t#d,5r#d]:10", H: "50:7d", r: true };
const cm = (s) => s.toLowerCase();
const CHANMODES = ["beI", "fkL", "lFH", "cdimnprstzCDGKMNOPQRSTVZ"];
const RANGS_SALON = [{ prefix: "@", mode: "o" }, { prefix: "%", mode: "h" }, { prefix: "+", mode: "v" }];
const JEFF = { name: "Jeff", user: "jeff", host: "admin.aurasync.fr" };
const SALONSYNC = { name: "SalonSync", user: "services", host: "services.aurasync.fr" };

setCatalogue(lireCatalogue({
	categories: [
		{
			id: "thematiques",
			label: "Thématiques",
			channels: [
				{ name: "#jeux", label: "Jeux", locked: OFFICIEL },
				{ name: "#musique", label: "Musique", locked: OFFICIEL },
			],
		},
	],
	selection: [],
}));

/* Rendu en texte d'un arbre htm (composants deplies), et recherche. */
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
	return ["li", "p", "h2", "h3", "div"].includes(v.type) ? "\n" + t + "\n" : t;
}
function tous(v, test, sortie = []) {
	if (Array.isArray(v)) {
		v.forEach((x) => tous(x, test, sortie));
	} else if (v && typeof v === "object") {
		if (test(v)) {
			sortie.push(v);
		}
		tous(v.props && v.props.children, test, sortie);
	}
	return sortie;
}
const classe = (nom) => (v) => typeof v.props.class === "string" && v.props.class.split(/\s+/).includes(nom);

/* Un client du t'Chat, sans reseau : send et sendLabeled notes. */
class FauxClient extends EventTarget {
	constructor() {
		super();
		this.nick = "Jeff";
		this.cm = cm;
		this.envoyes = [];
		this.suivis = [];
		this.reponse = { type: "ack", reponses: [] };
		this.isupport = new irc.Isupport();
		this.isupport.parse(["CHANMODES=" + CHANMODES.join(","), "PREFIX=(ohv)@%+", "TOPICLEN=360"]);
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
		let label = String(this.suivis.length + 1);
		if (labels) {
			labels.add(label);
		}
		this.suivis.push(msg);
		let r = typeof this.reponse === "function" ? this.reponse(msg, label) : this.reponse;
		return Promise.resolve(r);
	}
	recoit(msg) {
		this.dispatchEvent(new CustomEvent("message", { detail: { message: msg } }));
	}
}

/*
 * Une App reduite : le vrai code des methodes du menu (App.prototype), un
 * etat cree par State, setState synchrone, bannieres notees.
 */
function monter({ salon = "#jeux", moi = "@", modes = MODES_OFFICIELS } = {}) {
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
	let buf = () => State.getBuffer(app.state, bid);
	let maj = (attrs) => {
		app.state = { ...app.state, ...State.updateBuffer(app.state, bid, attrs) };
	};
	// Le serveur repond : l'etat passe par State.handleMessage, comme en vrai
	let recoit = (msg) => {
		msg.tags = msg.tags || {};
		app.state = { ...app.state, ...State.handleMessage(app.state, msg, sid, client) };
		client.recoit(msg);
	};
	return { app, client, sid, bid, buf, maj, recoit };
}
/* Laisse passer les promesses en cours (sans minuterie : elles sont simulees). */
async function attendre() {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

/* ── Rang et bouton ─────────────────────────────────────────────────── */

test("rang : @ et % seulement, ni +, ni rien (un oper sans rang)", () => {
	assert.equal(rangSalon("@"), "@");
	assert.equal(rangSalon("@+"), "@");
	assert.equal(rangSalon("%"), "%");
	assert.equal(rangSalon("%+"), "%");
	assert.equal(rangSalon("+"), null);
	assert.equal(rangSalon(""), null);
	assert.equal(rangSalon(undefined), null);
});

function entete(rang) {
	let buffer = { type: BufferType.CHANNEL, name: "#jeux", topic: null, joined: true };
	return deplier(BufferHeader({
		buffer, server: { status: "registered", name: "aurasync" }, rang, memberCount: 3,
		reglagesOuverts: false, onToggleReglages() {}, onToggleMemberList() {}, onToggleBufferList() {},
	}));
}

test("bouton « Réglages » : rendu pour @ et %, absent sans rang ; avant le bouton des personnes", () => {
	for (let rang of ["@", "%"]) {
		let v = entete(rang);
		let boutons = tous(v, (x) => x.type === "button");
		let i = boutons.findIndex(classe("hdr-reglages"));
		let j = boutons.findIndex(classe("hdr-toggle-right"));
		assert.ok(i >= 0, "bouton pour " + rang);
		assert.ok(i < j, "avant le bouton des personnes");
		assert.equal(boutons[i].props["aria-label"], "Réglages du salon");
	}
	for (let rang of [null, undefined]) {
		assert.equal(tous(entete(rang), classe("hdr-reglages")).length, 0);
	}
});

test("ouverture : refusée au +, à l'oper sans rang ; pour % et @, MODE #salon et « Lecture… »", () => {
	for (let moi of ["+", ""]) {
		let { app, client } = monter({ moi });
		app.toggleReglages();
		assert.equal(app.state.reglages, null, "pas de menu pour « " + moi + " »");
		assert.equal(client.envoyes.length, 0);
	}
	for (let moi of ["%", "@"]) {
		let { app, client } = monter({ moi });
		app.toggleReglages();
		assert.equal(app.state.reglages.lu, false);
		assert.deepEqual(client.envoyes, [{ command: "MODE", params: ["#jeux"] }]);
		app.toggleReglages();
		assert.equal(app.state.reglages, null, "le bouton referme");
	}
});

test("lecture : rien d'inventé avant le 324 ; le 324 du salon ouvre les réglages", () => {
	let { app, client, sid } = monter();
	app.toggleReglages();
	let props = rendreProps(app);
	let v = deplier(new SalonReglages(props).render());
	assert.ok(texte(v).includes(LECTURE));
	assert.equal(tous(v, classe("interrupteur")).length, 0, "aucun interrupteur avant le 324");
	// Un 324 d'un autre salon ne compte pas
	App.prototype.handleMessage.call(app, sid, { command: "324", params: ["Jeff", "#musique", "+nt"], tags: {} });
	assert.equal(app.state.reglages.lu, false);
	App.prototype.handleMessage.call(app, sid, { command: "324", params: ["Jeff", "#JEUX", "+Pntr"], tags: {} });
	assert.equal(app.state.reglages.lu, true);
	assert.ok(client);
});

test("perte du rang : le menu se ferme et le dit ; changer de salon le ferme sans rien dire", () => {
	let { app, maj } = monter();
	app.toggleReglages();
	app.componentDidUpdate();
	assert.ok(app.state.reglages, "toujours ouvert avec le rang");
	maj({ members: new irc.CaseMapMap([["Jeff", "+"]], cm) });
	app.componentDidUpdate();
	assert.equal(app.state.reglages, null);
	assert.deepEqual(app.bannieres, [PLUS_DE_RANG]);

	let autre = monter();
	autre.app.toggleReglages();
	autre.app.state = { ...autre.app.state, activeBuffer: -1 };
	autre.app.componentDidUpdate();
	assert.equal(autre.app.state.reglages, null);
	assert.deepEqual(autre.app.bannieres, []);
});

/* ── Verrous ────────────────────────────────────────────────────────── */

test("verrous : catalogue ∪ 742 de la session ; hors catalogue, le 742 seul", () => {
	assert.equal(verrousSalon(OFFICIEL, ""), OFFICIEL);
	assert.equal(verrousSalon(OFFICIEL, "nm"), OFFICIEL + "m");
	assert.equal(verrousSalon(null, "c"), "c");
	assert.equal(verrousSalon(null, ""), "");

	let { app, maj } = monter();
	app.toggleReglages();
	maj({ verrous: "cS" });
	assert.equal(app.contexteReglages().verrous, OFFICIEL + "cS");

	let hors = monter({ salon: "#cercle" });
	hors.app.toggleReglages();
	hors.maj({ verrous: "m" });
	assert.equal(hors.app.contexteReglages().verrous, "m");
});

test("742 d'une lettre absente du catalogue : console.error ; rien hors catalogue", () => {
	assert.equal(horsCatalogue(OFFICIEL, "ntc"), "c");
	assert.equal(horsCatalogue(OFFICIEL, "ntf"), "");
	assert.equal(horsCatalogue(null, "c"), "", "hors catalogue : rien à comparer");
	let erreurs = [];
	let origine = console.error;
	console.error = (...a) => erreurs.push(a.join(" "));
	try {
		let { app, sid } = monter();
		let r742 = (lettres, salon = "#jeux") => App.prototype.handleMessage.call(app, sid,
			{ command: "742", params: ["Jeff", salon, lettres[0], lettres, "MODE cannot be set"], tags: {} });
		r742("ntfH");
		assert.deepEqual(erreurs, []);
		r742("ntfHc");
		assert.equal(erreurs.length, 1);
		assert.match(erreurs[0], /#jeux.*c$/);
		r742("c", "#cercle");
		assert.equal(erreurs.length, 1);
	} finally {
		console.error = origine;
	}
});

/* ── Lignes du menu ─────────────────────────────────────────────────── */

test("lignes : t m c S, n masqué s'il est verrouillé, verrou et réservé à @", () => {
	let op = lignesReglages(MODES_OFFICIELS, OFFICIEL, "@");
	assert.deepEqual(op.bascules.map((b) => b.lettre), ["t", "m", "c", "S"]);
	assert.deepEqual(op.bascules.map((b) => b.etat), ["verrou", "libre", "libre", "libre"]);
	assert.equal(op.bascules[0].actif, true);
	let hop = lignesReglages(MODES_OFFICIELS, OFFICIEL, "%");
	assert.deepEqual(hop.bascules.map((b) => b.etat), ["verrou", "libre", "reserve", "reserve"]);
	let libre = lignesReglages({}, "", "%");
	assert.deepEqual(libre.bascules.map((b) => b.lettre), BASCULES, "n proposé quand il n'est pas verrouillé");
	assert.equal(libre.bascules.find((b) => b.lettre === "n").etat, "libre");
});

test("lignes : f et H avec la phrase de la valeur réelle ; i k l s sur une ligne ; autres actifs", () => {
	let l = lignesReglages(MODES_OFFICIELS, OFFICIEL, "@");
	assert.deepEqual(l.lectures.map((x) => x.texte), [
		"Plus de 10 lignes ou 5 répétitions en 10 secondes : les messages en trop sont refusés",
		"Les 50 derniers messages, 7 jours au plus",
	]);
	let abus = lignesReglages({ n: true, t: true, f: "[10t#d,5r#d]:10", s: true }, OFFICIEL, "@");
	assert.equal(abus.lectures[1].texte, "Désactivé", "#abus : -H");
	assert.equal(lignesReglages({ f: "bizarre" }, "", "@").lectures[0].texte, "Anti-flood actif");
	assert.equal(l.fermes.libelle, "Sur invitation, clé, limite, secret");
	assert.equal(l.fermes.phrase, "Un salon officiel reste ouvert à toutes les personnes.");
	// n verrouillé et masqué des interrupteurs : il reste dit en lecture
	assert.deepEqual(l.autres.map((a) => a.texte), ["Messages externes interdits", "Salon enregistré", "Salon permanent"]);
	assert.deepEqual(abus.autres.map((a) => a.texte), ["Messages externes interdits", "Salon secret"]);
	let cle = lignesReglages({ k: "secret123", l: "40" }, "", "@");
	assert.deepEqual(cle.autres.map((a) => a.texte), ["Clé d'accès", "Limite : 40 personnes"], "jamais la clé");
});

/* ── Envoi ──────────────────────────────────────────────────────────── */

test("envoiMode : un geste = un MODE ; rien pour un verrou, un réservé, une lettre hors menu", () => {
	assert.deepEqual(envoiMode("#jeux", "m", MODES_OFFICIELS, OFFICIEL, "%"), { command: "MODE", params: ["#jeux", "+m"] });
	assert.deepEqual(envoiMode("#jeux", "m", { ...MODES_OFFICIELS, m: true }, OFFICIEL, "@"), { command: "MODE", params: ["#jeux", "-m"] });
	assert.deepEqual(envoiMode("#jeux", "c", MODES_OFFICIELS, OFFICIEL, "@"), { command: "MODE", params: ["#jeux", "+c"] });
	assert.equal(envoiMode("#jeux", "c", MODES_OFFICIELS, OFFICIEL, "%"), null, "c réservé à @");
	assert.equal(envoiMode("#jeux", "S", MODES_OFFICIELS, OFFICIEL, "%"), null, "S réservé à @");
	for (let l of ["t", "n", "f", "H", "i", "k", "l", "s", "D", "Q", "P"]) {
		assert.equal(envoiMode("#jeux", l, MODES_OFFICIELS, OFFICIEL, "@"), null, l + " verrouillé ou hors menu");
	}
	assert.equal(envoiMode("#jeux", "m", MODES_OFFICIELS, OFFICIEL + "m", "@"), null, "m verrouillé par un 742");
	assert.equal(envoiMode("#jeux", "m", MODES_OFFICIELS, "", null), null, "sans rang");
});

test("clic forcé sur une ligne verrouillée : rien ne part, ni du composant ni de l'App", async () => {
	let { app, client, maj } = monter({ moi: "%" });
	app.toggleReglages();
	app.state = { ...app.state, reglages: { ...app.state.reglages, lu: true } };
	let appels = [];
	let props = { ...rendreProps(app), onBasculer: (l) => appels.push(l) };
	let v = deplier(new SalonReglages(props).render());
	let inters = tous(v, classe("interrupteur"));
	assert.deepEqual(inters.map((i) => i.props["aria-disabled"]), ["true", "false", "true", "true"], "t verrou, m libre, c et S réservés");
	for (let i of inters) {
		i.props.onClick();
	}
	assert.deepEqual(appels, ["m"], "seule la ligne libre appelle onBasculer");
	// L'App verifie encore : un appel direct ne part pas
	for (let l of ["t", "c", "S", "n", "i", "k", "l", "s", "f", "H"]) {
		app.basculerReglage(l);
	}
	assert.deepEqual(client.suivis, []);
	maj({ verrous: "m" });
	app.basculerReglage("m");
	assert.deepEqual(client.suivis, [], "m verrouillé par un 742 en cours de session");
	await attendre();
});

test("bascule à l'écho seulement : l'envoi ne touche pas buf.modes", async () => {
	let { app, client, buf, recoit } = monter();
	app.toggleReglages();
	app.state = { ...app.state, reglages: { ...app.state.reglages, lu: true } };
	let echo = null;
	client.reponse = () => new Promise((r) => {
		echo = r;
	});
	app.basculerReglage("m");
	assert.deepEqual(client.suivis, [{ command: "MODE", params: ["#jeux", "+m"] }]);
	assert.equal("m" in buf().modes, false, "pas encore d'écho : toujours désactivé");
	assert.equal(app.state.reglages.envois.m, true);
	let v = deplier(new SalonReglages(rendreProps(app)).render());
	let m = tous(v, classe("interrupteur"))[1];
	assert.equal(m.props["aria-checked"], "false");
	assert.equal(m.props["aria-busy"], "true");
	app.basculerReglage("m");
	assert.equal(client.suivis.length, 1, "un seul envoi tant que le premier est en cours");
	let msg = { command: "MODE", prefix: JEFF, params: ["#jeux", "+m"], tags: { label: "1" } };
	recoit(msg);
	echo({ type: "reponse", reponses: [msg] });
	await attendre();
	assert.equal(buf().modes.m, true, "l'écho bascule");
	assert.equal(app.state.reglages.envois.m, false);
	assert.equal(app.state.reglages.refus.m, null);
	v = deplier(new SalonReglages(rendreProps(app)).render());
	assert.equal(tous(v, classe("interrupteur"))[1].props["aria-checked"], "true");
});

/* ── Refus ──────────────────────────────────────────────────────────── */

const R742 = { command: "742", params: ["Jeff", "#jeux", "m", "ntfHm", "MODE cannot be set due to channel having an active MLOCK restriction policy"], tags: { label: "1" } };
const R460 = { command: "460", params: ["Jeff", "#jeux", "Halfops cannot set mode c"], tags: { label: "1" } };
const R482 = { command: "482", params: ["Jeff", "#jeux", "You're not a channel operator"], tags: { label: "1" } };
const RNOTICE = { command: "NOTICE", prefix: { name: "irc.aurasync.fr" }, params: ["Jeff", "Setting/removing of channelmode(s) 'H' has been disabled."], tags: { label: "1" } };

test("le vrai client note le label de l'envoi, celui que porte la commande", async () => {
	const { default: Client } = await import("../lib/client.js");
	let envoyes = [];
	let faux = Object.assign(new EventTarget(), {
		caps: { enabled: new Set(["labeled-response"]) },
		status: Client.Status.REGISTERED,
		send: (msg) => envoyes.push(msg),
	});
	mock.timers.enable({ apis: ["setTimeout"] });
	try {
		let labels = new Set();
		let p = Client.prototype.sendLabeled.call(faux, { command: "MODE", params: ["#jeux", "+m"] }, labels);
		assert.equal(labels.size, 1);
		let [label] = labels;
		assert.equal(envoyes[0].tags.label, label);
		faux.dispatchEvent(new CustomEvent("message", { detail: { message: { command: "ACK", params: [], tags: { label } } } }));
		assert.equal((await p).type, "ack");
		// Sans second argument, rien a noter : comme avant le lot B
		Client.prototype.sendLabeled.call(faux, { command: "MODE", params: ["#jeux", "-m"] });
		mock.timers.tick(20000);
	} finally {
		mock.timers.reset();
	}
});

test("un nouvel envoi efface l'ancien refus dès le départ", async () => {
	let { app, client } = monter();
	app.toggleReglages();
	client.reponse = { type: "reponse", reponses: [R460] };
	app.basculerReglage("m");
	await attendre();
	assert.ok(app.state.reglages.refus.m);
	client.reponse = () => new Promise(() => {});
	app.basculerReglage("m");
	assert.equal(app.state.reglages.refus.m, null, "pendant l'envoi, plus de refus affiché");
	assert.equal(app.state.reglages.envois.m, true);
});

test("issueEnvoi : 460, 482, 742, NOTICE, délai, fermeture, ACK", () => {
	assert.deepEqual(issueEnvoi({ type: "reponse", reponses: [R742] }), { refus: "Ce réglage est fixé par l'équipe du réseau.", verrou: true });
	assert.deepEqual(issueEnvoi({ type: "reponse", reponses: [R460] }), { refus: "Ce réglage est réservé aux opérateurs du salon.", verrou: false });
	assert.equal(issueEnvoi({ type: "reponse", reponses: [R482] }).refus, "Tu n'as pas les droits nécessaires sur ce salon.");
	assert.equal(issueEnvoi({ type: "reponse", reponses: [RNOTICE] }).refus, "Ce réglage est réservé à l'équipe du réseau.");
	assert.deepEqual(issueEnvoi({ type: "delai" }), { refus: SANS_REPONSE });
	assert.deepEqual(issueEnvoi({ type: "fermeture" }), { refus: CONNEXION_PERDUE });
	assert.deepEqual(issueEnvoi({ type: "ack", reponses: [] }), {});
	assert.deepEqual(issueEnvoi({ type: "sans-label" }), {});
	assert.deepEqual(issueEnvoi({ type: "reponse", reponses: [{ command: "MODE", params: ["#jeux", "+m"] }] }), { echo: true });
	assert.equal(lireRefus({ command: "NOTICE", params: ["Jeff", "Bonjour"] }), null);
	for (let r of [R742, R460, R482, RNOTICE]) {
		assert.doesNotMatch(lireRefus(r), /MLOCK|Halfops|operator|disabled/);
	}
});

test("refus dans le menu, sous le réglage ; jamais en bannière ; un 742 grise la ligne", async () => {
	let { app, client, sid, buf } = monter();
	app.toggleReglages();
	app.state = { ...app.state, reglages: { ...app.state.reglages, lu: true } };
	client.reponse = (msg, label) => {
		let r = { ...R742, tags: { label } };
		App.prototype.handleMessage.call(app, sid, r);
		return { type: "reponse", reponses: [r] };
	};
	app.basculerReglage("m");
	await attendre();
	assert.equal(app.state.reglages.refus.m, "Ce réglage est fixé par l'équipe du réseau.");
	assert.match(buf().verrous, /m/, "state.js garde la lettre");
	assert.deepEqual(app.bannieres, [], "pas de bannière");
	let v = deplier(new SalonReglages(rendreProps(app)).render());
	let refus = tous(v, classe("reglages-refus"));
	assert.equal(refus.length, 1);
	assert.equal(refus[0].props.role, "alert");
	let ligneM = tous(v, classe("reglages-ligne")).find((l) => texte(l).includes("Salon modéré"));
	assert.ok(texte(ligneM).includes("Ce réglage est fixé par l'équipe du réseau."), "sous le réglage");
	assert.ok(classe("bloque")(ligneM), "grisée");
	assert.ok(texte(ligneM).includes(EQUIPE));

	// 460 et NOTICE : dans le menu aussi
	for (let r of [R460, RNOTICE]) {
		let x = monter();
		x.app.toggleReglages();
		x.client.reponse = (msg, label) => {
			let m = { ...r, tags: { label } };
			App.prototype.handleMessage.call(x.app, x.sid, m);
			return { type: "reponse", reponses: [m] };
		};
		x.app.basculerReglage("c");
		await attendre();
		assert.ok(x.app.state.reglages.refus.c, r.command);
		assert.deepEqual(x.app.bannieres, [], r.command + " : pas de bannière");
	}
	// Le meme refus, hors du menu (sans label du menu) : la banniere, comme avant
	let y = monter();
	App.prototype.handleMessage.call(y.app, y.sid, { ...R460, tags: {} });
	App.prototype.handleMessage.call(y.app, y.sid, { ...RNOTICE, tags: {} });
	assert.equal(y.app.bannieres.length, 2);
});

/* ── Sujet ──────────────────────────────────────────────────────────── */

test("sujet : compteur en octets UTF-8 sur TOPICLEN, boutons", () => {
	let c = new FauxClient();
	assert.equal(c.isupport.topicLen(), 360);
	let vide = new irc.Isupport();
	assert.equal(vide.topicLen(), 360, "défaut d'UnrealIRCd 6");
	let autre = new irc.Isupport();
	autre.parse(["TOPICLEN=307"]);
	assert.equal(autre.topicLen(), 307);

	assert.equal(octets("abc"), 3);
	assert.equal(octets("é"), 2);
	assert.equal(octets("🎮"), 4);
	assert.equal(etatSujet("é".repeat(180), "", 360).trop, false, "360 octets : passe");
	let trop = etatSujet("é".repeat(181), "", 360);
	assert.equal(trop.octets, 362);
	assert.equal(trop.trop, true);
	assert.equal(trop.peutChanger, false);
	assert.equal(etatSujet("Salut", "Salut", 360).peutChanger, false, "identique");
	assert.equal(etatSujet("", "Salut", 360).peutChanger, false, "vide : c'est « Retirer »");
	assert.equal(etatSujet("", "Salut", 360).peutRetirer, true);
	assert.equal(etatSujet("", "", 360).peutRetirer, false);
	assert.equal(sujetAEnvoyer("Ligne une\n  ligne deux \r\n"), "Ligne une ligne deux");
	assert.equal(etatSujet("Salut\n", "Salut", 360).identique, true);
});

test("sujet : rendu du compteur et des boutons", () => {
	let { app } = monter();
	app.toggleReglages();
	let comp = new SalonReglages({ ...rendreProps(app), sujet: "Bienvenue" });
	comp.state = { saisie: "é".repeat(181), modifie: true };
	let v = deplier(comp.render());
	assert.ok(texte(v).includes("362 / 360 octets — 2 de trop"), texte(v));
	let changer = tous(v, (x) => x.type === "button" && texte(x) === "Changer le sujet")[0];
	assert.equal(changer.props.disabled, true);
	assert.equal(tous(v, (x) => x.type === "button" && texte(x) === "Retirer le sujet").length, 1);
	comp.state = { saisie: "Nouveau sujet", modifie: true };
	v = deplier(comp.render());
	assert.equal(tous(v, (x) => x.type === "button" && texte(x) === "Changer le sujet")[0].props.disabled, false);
});

test("sujet : TOPIC suivi ; trop long, rien ne part ; « Retirer » envoie un sujet vide", async () => {
	let { app, client } = monter();
	app.toggleReglages();
	app.envoyerSujet("é".repeat(181));
	assert.deepEqual(client.suivis, []);
	app.envoyerSujet("Ligne\nsuivante");
	await attendre();
	app.envoyerSujet("");
	await attendre();
	assert.deepEqual(client.suivis, [
		{ command: "TOPIC", params: ["#jeux", "Ligne suivante"] },
		{ command: "TOPIC", params: ["#jeux", ""] },
	]);
	assert.equal(irc.formatMessage(client.suivis[1]), "TOPIC #jeux :");
});

test("sujet : SalonSync le remet dans les 2 s, le menu le dit ; une personne, non", async () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	try {
		let { app, client } = monter();
		app.toggleReglages();
		let echo = { command: "TOPIC", prefix: JEFF, params: ["#jeux", "Nouveau"], tags: { label: "1" } };
		client.reponse = { type: "reponse", reponses: [echo] };
		app.envoyerSujet("Nouveau");
		await attendre();
		client.recoit({ command: "TOPIC", prefix: { name: "Kahen" }, params: ["#jeux", "Autre"], tags: {} });
		client.recoit({ command: "TOPIC", prefix: SALONSYNC, params: ["#musique", "Ancien"], tags: {} });
		await attendre();
		assert.equal(app.state.reglages.noteSujet, null);
		client.recoit({ command: "TOPIC", prefix: SALONSYNC, params: ["#JEUX", "Ancien"], tags: {} });
		await attendre();
		assert.equal(app.state.reglages.noteSujet, REBOND_SUJET);

		// Apres 2 s, plus rien
		let x = monter();
		x.app.toggleReglages();
		x.client.reponse = { type: "reponse", reponses: [echo] };
		x.app.envoyerSujet("Nouveau");
		await attendre();
		mock.timers.tick(2001);
		await attendre();
		x.client.recoit({ command: "TOPIC", prefix: SALONSYNC, params: ["#jeux", "Ancien"], tags: {} });
		await attendre();
		assert.equal(x.app.state.reglages.noteSujet, null);
	} finally {
		mock.timers.reset();
	}
	assert.equal(rebondSujet({ command: "TOPIC", prefix: { name: "ChanServ" }, params: ["#jeux", "x"] }, "#jeux", cm), true);
});

/* ── Fiche : SECUREOPS ──────────────────────────────────────────────── */

test("SECUREOPS : SalonSync retire le statut dans les 2 s, la bannière le dit", async () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	try {
		let { app, client } = monter();
		app.handleNickMenuAction("op", "Kahen");
		assert.deepEqual(client.envoyes, [{ command: "MODE", params: ["#jeux", "+o", "Kahen"] }]);
		client.recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+o", "Kahen"], tags: {} });
		client.recoit({ command: "MODE", prefix: { name: "Kahen" }, params: ["#jeux", "-o", "Kahen"], tags: {} });
		await attendre();
		assert.deepEqual(app.bannieres, []);
		client.recoit({ command: "MODE", prefix: SALONSYNC, params: ["#jeux", "-o", "kahen"], tags: {} });
		await attendre();
		assert.deepEqual(app.bannieres, [REBOND_STATUT]);

		let x = monter();
		x.app.handleNickMenuAction("op", "Kahen");
		mock.timers.tick(2001);
		await attendre();
		x.client.recoit({ command: "MODE", prefix: SALONSYNC, params: ["#jeux", "-o", "Kahen"], tags: {} });
		await attendre();
		assert.deepEqual(x.app.bannieres, [], "après 2 s, ce n'est plus un rebond");
	} finally {
		mock.timers.reset();
	}
	let ch = [{ mode: "h", add: false, arg: "Kahen" }];
	assert.equal(rebondStatut({ command: "MODE", prefix: SALONSYNC, params: ["#jeux"] }, ch, "#jeux", "Kahen", "oh", cm), true);
	assert.equal(rebondStatut({ command: "MODE", prefix: SALONSYNC, params: ["#jeux"] }, [{ mode: "v", add: false, arg: "Kahen" }], "#jeux", "Kahen", "oh", cm), false);
	assert.equal(rebondStatut({ command: "MODE", prefix: SALONSYNC, params: ["#jeux"] }, ch, "#jeux", "Lea", "oh", cm), false);
});

test("guetter : vrai si le message arrive, faux au délai, l'écoute est retirée", async () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	try {
		let c = new FauxClient();
		let p = guetter(c, (m) => m.command === "X", 2000);
		c.recoit({ command: "X" });
		assert.equal(await p, true);
		let q = guetter(c, (m) => m.command === "X", 2000);
		mock.timers.tick(2000);
		assert.equal(await q, false);
	} finally {
		mock.timers.reset();
	}
});

/* ── Rendu ──────────────────────────────────────────────────────────── */

function rendreProps(app) {
	let ctx = app.contexteReglages();
	let r = app.state.reglages;
	return {
		salon: ctx.buf.name, rang: ctx.rang, lu: r.lu, modes: ctx.buf.modes, verrous: ctx.verrous,
		sujet: ctx.buf.topic, creation: ctx.buf.creation, topicLen: ctx.client.isupport.topicLen(),
		envois: r.envois, refus: r.refus, noteSujet: r.noteSujet,
		onBasculer() {}, onSujet() {}, onClose() {},
	};
}

test("menu : en-tête selon le rang, ordre des rubriques, renvoi vers la fiche, pied 329", () => {
	let { app, maj, recoit } = monter();
	app.toggleReglages();
	app.state = { ...app.state, reglages: { ...app.state.reglages, lu: true } };
	recoit({ command: "329", params: ["Jeff", "#jeux", String(Date.UTC(2026, 2, 1, 12) / 1000)] });
	let t = texte(deplier(new SalonReglages(rendreProps(app)).render()));
	assert.ok(t.includes("Réglages de #jeux"));
	assert.ok(t.includes("Tu gères ce salon (@)"));
	let ordre = ["Sujet", "Réglages\n", "Autres réglages actifs", POUR_BANNIR, "Salon créé le 1er mars 2026"].map((x) => t.indexOf(x));
	assert.ok(ordre.every((i, k) => i >= 0 && (k === 0 || i > ordre[k - 1])), JSON.stringify(ordre) + "\n" + t);
	assert.ok(t.includes(EQUIPE));
	assert.doesNotMatch(t, /\bIRC\b|membre|Bannissements|Exemptions/i, "ni IRC, ni membre, ni listes (lot C)");

	maj({ members: new irc.CaseMapMap([["Jeff", "%"]], cm) });
	t = texte(deplier(new SalonReglages(rendreProps(app)).render()));
	assert.ok(t.includes("Tu modères ce salon (%)"));
	assert.ok(t.includes(RESERVE_OP), "c et S grisés pour un %");
});

test("salon hors catalogue : le même menu « officiel »", () => {
	let { app } = monter({ salon: "#cercle", modes: { n: true, t: true } });
	app.toggleReglages();
	app.state = { ...app.state, reglages: { ...app.state.reglages, lu: true } };
	let t = texte(deplier(new SalonReglages(rendreProps(app)).render()));
	assert.ok(t.includes("Sur invitation, clé, limite, secret"));
	assert.ok(t.includes("Messages externes interdits"), "n proposé : pas de verrou connu");
});

test("dateCreation : 1er, fuseau de Paris, entrée illisible", () => {
	assert.equal(dateCreation(Date.UTC(2026, 2, 1, 12) / 1000), "Salon créé le 1er mars 2026");
	assert.equal(dateCreation(Date.UTC(2026, 8, 27, 23, 30) / 1000), "Salon créé le 28 septembre 2026");
	assert.equal(dateCreation(null), null);
	assert.equal(dateCreation("x"), null);
});

/* ── Fil : rangs ────────────────────────────────────────────────────── */

test("fil : +o, -o, +h, -h, +v, -v ; plus jamais « de opérateur »", () => {
	assert.equal(phraseRang("@", true), "donné le statut opérateur à");
	assert.equal(phraseRang("@", false), "retiré le statut opérateur à");
	assert.equal(phraseRang("%", true), "donné le statut modérateur à");
	assert.equal(phraseRang("%", false), "retiré le statut modérateur à");
	assert.equal(phraseRang("+", true), "donné la voix à");
	assert.equal(phraseRang("+", false), "retiré la voix à");

	let { app, sid, bid } = monter();
	let server = app.state.servers.get(sid);
	let t = 0;
	for (let [modes, cible] of [["+o", "Kahen"], ["-o", "Kahen"], ["+h", "Kahen"], ["-h", "Kahen"], ["+v", "Kahen"], ["-v", "Kahen"]]) {
		let msg = { command: "MODE", prefix: JEFF, params: ["#jeux", modes, cible], tags: { time: new Date(Date.UTC(2026, 10, 7, 10, 0, t++)).toISOString() } };
		app.state = { ...app.state, ...State.addMessage(app.state, msg, bid) };
	}
	let b = new Buffer({
		buffer: State.getBuffer(app.state, bid), server, settings: { bufferEvents: "expand" },
		onNickClick() {}, onChannelClick() {}, onVerifyClick() {},
	});
	let lignes = texte(deplier(b.render()));
	for (let attendu of [
		"Jeff a donné le statut opérateur à Kahen", "Jeff a retiré le statut opérateur à Kahen",
		"Jeff a donné le statut modérateur à Kahen", "Jeff a retiré le statut modérateur à Kahen",
		"Jeff a donné la voix à Kahen", "Jeff a retiré la voix à Kahen",
	]) {
		assert.ok(lignes.includes(attendu), attendu + "\n" + lignes);
	}
	assert.doesNotMatch(lignes, /de opérateur|privilèges|half/);
});
