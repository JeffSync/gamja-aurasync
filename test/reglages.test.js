/*
 * Etape 5, lot A (D-068, point 7) : chaque ligne MODE du fil en francais,
 * plusieurs lettres comprises ; jamais un masque d'adresse reelle ; les
 * refus 460, 472, 742 et celui de restrict-channelmodes traduits ;
 * buf.modes suivi par 324 et MODE.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	REGLAGES, reglage, lireFlood, lireHistorique, fragmentReglage, assembler,
	appliquerMode, unirVerrous, ANTIFLOOD_ACTIF, HISTORIQUE_ACTIF, REGLAGE_INCONNU,
} from "../lib/reglages.js";
import { libelleMasque } from "../lib/ban.js";
import { translateError, refusReglageReserve, REGLAGE_EQUIPE, isRefusal } from "../lib/irc-errors.js";
import * as irc from "../lib/irc.js";

// app.js lit config.json et le navigateur au chargement.
globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { State } = await import("../state.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer } = await import("../components/buffer.js");

/*
 * Lettres des modules charges par defaut (modules.default.conf:159-191 de
 * UnrealIRCd 6.2.7), moins q et a (D-057), plus F (floodprot) et d
 * (delayjoin), que ces modules declarent aussi.
 */
const CHARGEES = "beIohvklispmntfcCSrZPLGDKVOTRNQMzHFd";

/* Rang minimal de chaque lettre, releve dans les sources (lib/reglages.js). */
const RANGS = {
	b: "%", e: "%", I: "%", v: "%", t: "%", n: "%", m: "%", i: "%", k: "%", l: "%", s: "%", p: "%",
	C: "%", N: "%", K: "%", R: "%", M: "%",
	o: "@", h: "@", c: "@", S: "@", f: "@", F: "@", T: "@", z: "@", G: "@", D: "@", Q: "@", V: "@", L: "@",
	H: "oper", O: "oper", P: "oper",
	Z: "serveur", d: "serveur", r: "services",
};

test("table : une entrée par lettre chargée, rang des sources, source citée", () => {
	assert.deepEqual(Object.keys(REGLAGES).sort(), [...CHARGEES].sort());
	for (let [lettre, r] of Object.entries(REGLAGES)) {
		assert.equal(r.rang, RANGS[lettre], "rang de " + lettre);
		assert.ok(r.source && r.libelle, "source et libellé de " + lettre);
		assert.ok(["oui", "lecture", "liste", "fiche", "non"].includes(r.menu), lettre);
	}
	assert.equal(reglage("q"), null);
	assert.equal(reglage("toString"), null);
});

test("table : le menu propose exactement les réglages du §1.2", () => {
	let proposes = Object.keys(REGLAGES).filter((l) => REGLAGES[l].menu === "oui").sort();
	assert.deepEqual(proposes, ["S", "c", "i", "k", "l", "m", "n", "s", "t"]);
	let lecture = Object.keys(REGLAGES).filter((l) => REGLAGES[l].menu === "lecture").sort();
	assert.deepEqual(lecture, ["H", "f"]);
	for (let l of Object.keys(REGLAGES).filter((x) => REGLAGES[x].menu === "oui")) {
		assert.ok(REGLAGES[l].phrase, "phrase du menu pour " + l);
	}
});

test("table : aucun texte visible ne dit « IRC », « membre » ni « mode + »", () => {
	for (let [lettre, r] of Object.entries(REGLAGES)) {
		for (let champ of ["libelle", "phrase", "pose", "retire"]) {
			let t = r[champ] || "";
			assert.doesNotMatch(t, /\bIRC\b|membre|mode \+|applique/i, lettre + "." + champ);
		}
		if (r.menu !== "liste" && r.menu !== "fiche") {
			assert.ok(r.pose && r.retire, "phrases du fil pour " + lettre);
			assert.notEqual(r.pose, r.retire, lettre);
		}
	}
});

test("lireFlood : notre valeur, les accords, les actions, le repli", () => {
	assert.equal(lireFlood("[10t#d,5r#d]:10"), "plus de 10 lignes ou 5 répétitions en 10 secondes : les messages en trop sont refusés");
	assert.equal(lireFlood("[1t]:1"), "plus de 1 ligne en 1 seconde");
	assert.equal(lireFlood("[10t#b,5r#d]:10"), "plus de 10 lignes ou 5 répétitions en 10 secondes");
	assert.equal(lireFlood("[30j#i10,40m#m]:15"), "plus de 30 arrivées ou 40 messages en 15 secondes");
	assert.equal(lireFlood("[2c,3k,4n,5p]:6"), "plus de 2 commandes CTCP ou 3 demandes d'invitation ou 4 changements de pseudo ou 5 collages en 6 secondes");
	for (let v of ["", null, "7:5", "[10x#d]:10", "[10t#d]:0", "[]:10", "[10t#d]", "[t#d]:10"]) {
		assert.equal(lireFlood(v), null, String(v));
	}
	assert.equal(fragmentReglage("f", true, "nimporte"), "réglé l'anti-flood");
	assert.ok(ANTIFLOOD_ACTIF && HISTORIQUE_ACTIF);
});

test("lireHistorique : notre valeur, les unités, le repli", () => {
	assert.equal(lireHistorique("50:7d"), "les 50 derniers messages, 7 jours au plus");
	assert.equal(lireHistorique("1:1h"), "le dernier message, 1 heure au plus");
	assert.equal(lireHistorique("20:30m"), "les 20 derniers messages, 30 minutes au plus");
	assert.equal(lireHistorique("5:2w"), "les 5 derniers messages, 2 semaines au plus");
	assert.equal(lireHistorique("5:45s"), "les 5 derniers messages, 45 secondes au plus");
	for (let v of ["", null, "50", "50:7", "0:7d", "50:0d", "50:7y", "a:7d"]) {
		assert.equal(lireHistorique(v), null, String(v));
	}
});

test("fragmentReglage : valeur, retrait, clé jamais montrée, inconnue", () => {
	assert.equal(fragmentReglage("m", true), "activé le salon modéré");
	assert.equal(fragmentReglage("m", false), "désactivé le salon modéré");
	assert.equal(fragmentReglage("l", true, "30"), "limité le salon à 30 personnes");
	assert.equal(fragmentReglage("l", true, null), "limité le salon");
	assert.equal(fragmentReglage("l", false), "retiré la limite de personnes");
	assert.equal(fragmentReglage("k", true, "secret123"), "posé une clé d'accès");
	assert.equal(fragmentReglage("L", true, "#debord"), "renvoyé le salon plein vers #debord");
	assert.equal(fragmentReglage("F", true, "strict"), "choisi le profil anti-flood « strict »");
	assert.equal(fragmentReglage("F", true, null), "choisi le profil anti-flood");
	assert.equal(fragmentReglage("f", true, "[10t#d,5r#d]:10"), "réglé l'anti-flood (plus de 10 lignes ou 5 répétitions en 10 secondes : les messages en trop sont refusés)");
	assert.equal(fragmentReglage("H", true, "50:7d"), "activé les messages précédents (les 50 derniers messages, 7 jours au plus)");
	assert.equal(fragmentReglage("H", true, "x"), "activé les messages précédents");
	assert.equal(fragmentReglage("H", false), "désactivé les messages précédents");
	assert.equal(fragmentReglage("b", true, "*!*@*"), null);
	assert.equal(fragmentReglage("o", true, "Kahen"), null);
	assert.equal(fragmentReglage("Y", true), null);
});

test("assembler : « a », « a et b », « a, b et c »", () => {
	assert.deepEqual(assembler([]), []);
	assert.deepEqual(assembler(["a"]), ["a"]);
	assert.equal(assembler(["a", "b"]).join(""), "a et b");
	assert.equal(assembler(["a", "b", "c"]).join(""), "a, b et c");
	assert.equal(assembler(["a", "b", "c", "d"]).join(""), "a, b, c et d");
});

test("appliquerMode et unirVerrous", () => {
	let m = appliquerMode({}, "n", true, null, "D");
	m = appliquerMode(m, "l", true, "30", "C");
	m = appliquerMode(m, "b", true, "*!*@*", "A");
	assert.deepEqual(m, { n: true, l: "30" });
	let avant = m;
	m = appliquerMode(m, "l", false, null, "C");
	assert.deepEqual(m, { n: true });
	assert.deepEqual(avant, { n: true, l: "30" }, "l'état précédent n'est pas modifié");
	assert.deepEqual(appliquerMode({}, "Y", true, undefined, null), { Y: true });
	assert.equal(unirVerrous("", "ntfH"), "ntfH");
	assert.equal(unirVerrous("nt", "ntfH"), "ntfH");
	assert.equal(unirVerrous(undefined, "f+H-"), "fH");
	assert.equal(unirVerrous("s", ""), "s");
	assert.equal(unirVerrous(null, null), "");
});

/* ── Masques (D-068, point 6) ─────────────────────────────────────── */

const CLOAK = "1169710B.3A7DD2AE.E66AA06A.IP";

test("libelleMasque : compte, pseudo, masque d'adresse, vhost, tout le monde", () => {
	assert.deepEqual(libelleMasque("~account:Troll42"), { texte: "le compte Troll42", genre: "compte", nom: "Troll42" });
	assert.equal(libelleMasque("~a:Troll42").texte, "le compte Troll42");
	assert.equal(libelleMasque("~time:60:~account:Troll42").texte, "le compte Troll42");
	assert.equal(libelleMasque("~quiet:~account:Bavard").texte, "le compte Bavard");
	assert.deepEqual(libelleMasque("Kahen!*@*"), { texte: "le pseudo Kahen", genre: "pseudo", nom: "Kahen" });
	assert.equal(libelleMasque("Kahen").texte, "le pseudo Kahen");
	assert.equal(libelleMasque("*!*@" + CLOAK).texte, "*!*@" + CLOAK);
	assert.equal(libelleMasque("*!*@*.3A7DD2AE.E66AA06A.IP").texte, "*!*@*.3A7DD2AE.E66AA06A.IP");
	assert.equal(libelleMasque("~time:60:*!*@" + CLOAK).texte, "*!*@" + CLOAK);
	assert.equal(libelleMasque("*!*@admin.aurasync.fr").texte, "*!*@admin.aurasync.fr");
	assert.equal(libelleMasque("*!*@*").texte, "tout le monde");
	assert.equal(libelleMasque("~text:block:*spam*").texte, "une règle particulière");
	assert.equal(libelleMasque("~country:RU").genre, "regle");
});

test("libelleMasque : une IP littérale ou un hôte non masqué n'est jamais écrit", () => {
	let interdits = [
		"*!*@203.0.113.7", "*!*@203.0.113.*", "*!*@2001:db8::1", "*!*@[2001:db8::1]",
		"*!*@box.example.net", "*!*@*.example.net", "Kahen!*@203.0.113.7", "*!kahen@*",
		"~time:60:*!*@203.0.113.7", "~quiet:*!*@198.51.100.2", "*!*@aurasync.fr.example.net",
		"Ka*!*@*", "", null,
	];
	for (let m of interdits) {
		let l = libelleMasque(m);
		assert.equal(l.texte, "une adresse", String(m));
		assert.doesNotMatch(l.texte, /\d+\.\d+|::|example|kahen/i, String(m));
	}
});

/* ── Refus (D-056, D-068) ─────────────────────────────────────────── */

test("refus : 460, 472, 742 et la NOTICE de restrict-channelmodes", () => {
	assert.equal(translateError("460", "Halfops cannot set mode c"), "Ce réglage est réservé aux opérateurs du salon.");
	assert.equal(translateError("472", "is unknown mode char to me"), "Ce réglage n'existe pas sur le t'Chat.");
	assert.equal(translateError("742", "MODE cannot be set due to channel having an active MLOCK restriction policy"), "Ce réglage est fixé par l'équipe du réseau.");
	assert.equal(irc.isError("460"), true, "460 part en bannière par isError");
	assert.equal(irc.isError("472"), true);
	assert.equal(isRefusal("742"), false, "742 n'est pas une bannière : il est dit dans le salon");
	assert.equal(refusReglageReserve("Setting/removing of channelmode(s) 'H' has been disabled."), REGLAGE_EQUIPE);
	assert.equal(refusReglageReserve("Setting/removing of channelmode(s) 'HO' has been disabled"), REGLAGE_EQUIPE);
	assert.equal(REGLAGE_EQUIPE, "Ce réglage est réservé à l'équipe du réseau.");
	assert.equal(refusReglageReserve("Setting of channelmode(s) 'H' has been disabled."), null);
	assert.equal(refusReglageReserve("*** Channel msgflood detected"), null);
	assert.equal(refusReglageReserve(undefined), null);
});

/* ── De bout en bout : routage, état, rendu de #jeux ──────────────── */

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
/* CHANMODES d'UnrealIRCd 6.2.7 avec nos modules (classes A, B, C, D). */
const CHANMODES = ["beI", "fkL", "lFH", "cdimnprstzCDGKMNOPQRSTVZ"];
const RANGS_SALON = [{ prefix: "@", mode: "o" }, { prefix: "%", mode: "h" }, { prefix: "+", mode: "v" }];
const JEFF = { name: "Jeff", user: "jeff", host: "admin.aurasync.fr" };
const SERVEUR = { name: "irc.aurasync.fr" };

function jeux() {
	let client = {
		nick: "Jeff", cm, isMyNick: (n) => cm(n) === "jeff", isChannel: (n) => n.startsWith("#"),
		isupport: { statusMsg: () => null, membershipModes: () => RANGS_SALON, chanModes: () => CHANMODES },
		serverPrefix: { name: "irc.aurasync.fr" },
	};
	let state = State.create();
	let [sid, u] = State.createServer(state);
	state = { ...state, ...u };
	state = { ...state, ...State.updateServer(state, sid, { cm, chanModes: CHANMODES, membershipModes: RANGS_SALON }) };
	let app = { state, clients: new Map([[sid, client]]) };
	app.accueilDe = App.prototype.accueilDe;
	app.salonMutisme = App.prototype.salonMutisme;
	let t = 0;
	function recoit(msg) {
		msg.tags = { time: new Date(Date.UTC(2026, 10, 7, 10, 0, t++)).toISOString() };
		let dest = App.prototype.routeMessage.call(app, sid, msg);
		app.state = { ...app.state, ...State.handleMessage(app.state, msg, sid, client) };
		for (let name of dest) {
			app.state = { ...app.state, ...State.addMessage(app.state, msg, { server: sid, name }) };
		}
		return dest;
	}
	function salon() {
		return State.getBuffer(app.state, { server: sid, name: "#jeux" });
	}
	function lignes() {
		let server = app.state.servers.get(sid);
		let b = new Buffer({
			buffer: salon(), server, settings: { bufferEvents: "expand" },
			onNickClick() {}, onChannelClick() {}, onVerifyClick() {},
		});
		return texte(b.render()).split("\n").map((l) => l.replace(/\s+/g, " ").trim())
			.filter((l) => l && l !== "Nouveaux messages");
	}
	recoit({ command: "JOIN", prefix: JEFF, params: ["#jeux"] });
	recoit({ command: "JOIN", prefix: { name: "Kahen", user: "kahen", host: CLOAK }, params: ["#jeux"] });
	return { recoit, lignes, salon };
}

function avecConsole(fn) {
	let erreurs = [];
	let avant = console.error;
	console.error = (...a) => erreurs.push(a.join(" "));
	try {
		fn();
	} finally {
		console.error = avant;
	}
	return erreurs;
}

test("fil : plusieurs lettres en une phrase, avec valeurs", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+mS"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+nt-m+l", "30"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+fH", "[10t#d,5r#d]:10", "50:7d"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+k-c", "cle-secrete"] });
	let l = lignes();
	let voir = l.join("\n");
	assert.ok(l.some((x) => x.endsWith("Jeff a activé le salon modéré et retiré les couleurs des messages")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a interdit les messages externes, réservé le sujet aux modérateurs et aux opérateurs, désactivé le salon modéré et limité le salon à 30 personnes")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a réglé l'anti-flood (plus de 10 lignes ou 5 répétitions en 10 secondes : les messages en trop sont refusés) et activé les messages précédents (les 50 derniers messages, 7 jours au plus)")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a posé une clé d'accès et autorisé les couleurs")), voir);
	assert.ok(!l.some((x) => /applique le mode|cle-secrete|\+[a-zA-Z]/.test(x)), voir);
});

test("fil : rangs, bans et mutismes gardent leurs phrases, même mêlés", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+o-v", "Kahen", "Kahen"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "~quiet:Kahen!*@*"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "-b+m", "~quiet:Kahen!*@*"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+b", "*!*@" + CLOAK] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "-b", "*!*@ZZZ.YYY.XXX.IP"] });
	let l = lignes();
	let voir = l.join("\n");
	assert.ok(l.some((x) => x.endsWith("Jeff a donné les privilèges de opérateur à Kahen et retiré les privilèges de voix à Kahen")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a rendu Kahen muet(te)")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a rendu la parole à Kahen et activé le salon modéré")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a banni Kahen")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a levé le ban d'une adresse")), voir);
	assert.ok(!l.some((x) => x.includes(CLOAK) || x.includes("ZZZ")), "jamais le masque d'un ban");
});

test("fil : +e et +I sans adresse réelle, avec la règle unique des masques", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+e", "~account:AuraBot"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "-e", "*!*@203.0.113.7"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+e", "*!*@" + CLOAK] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+I-I", "Lea!*@*", "*!*@box.example.net"] });
	let l = lignes();
	let voir = l.join("\n");
	assert.ok(l.some((x) => x.endsWith("Jeff a ajouté une exemption de ban pour le compte AuraBot")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a retiré l'exemption de ban pour une adresse")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a ajouté une exemption de ban pour *!*@" + CLOAK)), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a ajouté une invitation permanente pour le pseudo Lea et retiré l'invitation permanente pour une adresse")), voir);
	assert.ok(!l.some((x) => /203\.0|example/.test(x)), voir);
});

test("fil : une lettre inconnue est dite sans sa lettre, et part dans la console", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+Y"] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+mYW"] });
	let l;
	let erreurs = avecConsole(() => {
		l = lignes();
	});
	let voir = l.join("\n");
	assert.ok(l.some((x) => x.endsWith("Jeff a " + REGLAGE_INCONNU)), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a activé le salon modéré et changé un réglage du salon")), voir);
	assert.ok(!l.some((x) => /\bY\b|\bW\b|applique/.test(x)), voir);
	assert.ok(erreurs.some((e) => e.includes("+Y")) && erreurs.some((e) => e.includes("+W")), erreurs.join("\n"));
});

test("fil : le serveur signe « Le t'Chat » ; son +m d'anti-flood garde sa phrase", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "MODE", prefix: SERVEUR, params: ["#jeux", "+m"] });
	recoit({ command: "MODE", prefix: SERVEUR, params: ["#jeux", "+CN"] });
	let l = lignes();
	let voir = l.join("\n");
	assert.ok(l.some((x) => /Le t'Chat a ralenti le salon/.test(x)), voir);
	assert.ok(l.some((x) => x.endsWith("Le t'Chat a bloqué les commandes CTCP et bloqué les changements de pseudo")), voir);
	assert.ok(!l.some((x) => x.includes("aurasync.fr")), voir);
});

test("fil : « sujet », jamais « topic »", () => {
	let { recoit, lignes } = jeux();
	recoit({ command: "TOPIC", prefix: JEFF, params: ["#jeux", "Jeux de société"] });
	recoit({ command: "TOPIC", prefix: JEFF, params: ["#jeux", ""] });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "-t"] });
	let l = lignes();
	let voir = l.join("\n");
	assert.ok(l.some((x) => x.endsWith("Jeff a changé le sujet : Jeux de société")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a effacé le sujet")), voir);
	assert.ok(l.some((x) => x.endsWith("Jeff a ouvert le sujet à tout le monde")), voir);
	assert.ok(!l.some((x) => /topic/i.test(x)), voir);
});

test("buf.modes : 324 puis chaque MODE ; 324 et 329 ne s'affichent pas", () => {
	let { recoit, lignes, salon } = jeux();
	assert.deepEqual(salon().modes, {});
	let avant = lignes().length;
	assert.deepEqual(recoit({ command: irc.RPL_CHANNELMODEIS, prefix: SERVEUR, params: ["Jeff", "#jeux", "+ntfHl", "[10t#d,5r#d]:10", "50:7d", "40"] }), []);
	assert.deepEqual(recoit({ command: irc.RPL_CREATIONTIME, prefix: SERVEUR, params: ["Jeff", "#jeux", "1757664000"] }), []);
	assert.deepEqual(salon().modes, { n: true, t: true, f: "[10t#d,5r#d]:10", H: "50:7d", l: "40" });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "+mk-l+o", "cle", "Kahen"] });
	assert.deepEqual(salon().modes, { n: true, t: true, f: "[10t#d,5r#d]:10", H: "50:7d", m: true, k: "cle" });
	recoit({ command: "MODE", prefix: JEFF, params: ["#jeux", "-k+b+l", "cle", "*!*@*", "12"] });
	assert.deepEqual(salon().modes, { n: true, t: true, f: "[10t#d,5r#d]:10", H: "50:7d", m: true, l: "12" });
	assert.equal(salon().members.get("Kahen"), "@", "les rangs suivent toujours");
	// Un 324 plus tard remplace tout l'etat
	recoit({ command: irc.RPL_CHANNELMODEIS, prefix: SERVEUR, params: ["Jeff", "#jeux", "+nt"] });
	assert.deepEqual(salon().modes, { n: true, t: true });
	assert.equal(lignes().length, avant + 2, "seules les deux lignes MODE s'affichent");
});

test("742 : dit dans le salon, verrous gardés pour la session ; jamais en bannière", () => {
	let { recoit, lignes, salon } = jeux();
	let texte742 = "MODE cannot be set due to channel having an active MLOCK restriction policy";
	assert.deepEqual(recoit({ command: "742", prefix: SERVEUR, params: ["Jeff", "#jeux", "f", "ntfH", texte742] }), ["#jeux"]);
	assert.equal(salon().verrous, "ntfH");
	recoit({ command: "742", prefix: SERVEUR, params: ["Jeff", "#jeux", "s", "ntfHs", texte742] });
	assert.equal(salon().verrous, "ntfHs");
	let l = lignes();
	assert.equal(l.filter((x) => x.endsWith("Ce réglage est fixé par l'équipe du réseau.")).length, 2, l.join("\n"));
	assert.ok(!l.some((x) => /MLOCK|742/.test(x)), l.join("\n"));
	// Salon inconnu : l'onglet serveur, comme avant
	assert.deepEqual(recoit({ command: "742", prefix: SERVEUR, params: ["Jeff", "#ailleurs", "f", "f", texte742] }), ["*"]);
});

test("NOTICE de restrict-channelmodes et 742 : bannière ou salon, jamais l'anglais", () => {
	let banniere = [];
	let { recoit } = jeux();
	let client = { isMyNick: (n) => cm(n) === "jeff", cm, isChannel: (n) => n.startsWith("#"), serverPrefix: SERVEUR };
	let app = {
		state: State.create(),
		clients: new Map([["s", client]]),
		routeMessage: () => [],
		setState() {},
		salonMutisme: () => null,
		showError: (t) => banniere.push(t),
		handleChatMessage() {},
	};
	let notice = (prefixe, texte) => ({ command: "NOTICE", prefix: { name: prefixe }, params: ["Jeff", texte], tags: {} });
	App.prototype.handleMessage.call(app, "s", notice("irc.aurasync.fr", "Setting/removing of channelmode(s) 'H' has been disabled."));
	App.prototype.handleMessage.call(app, "s", notice("Kahen", "Setting/removing of channelmode(s) 'H' has been disabled."));
	App.prototype.handleMessage.call(app, "s", notice("irc.aurasync.fr", "Autre avis du serveur"));
	App.prototype.handleMessage.call(app, "s", { command: "742", prefix: SERVEUR, params: ["Jeff", "#jeux", "f", "f", "MODE cannot be set"], tags: {} });
	assert.deepEqual(banniere, ["Ce réglage est réservé à l'équipe du réseau."], "une seule bannière : ni la personne, ni l'autre avis, ni le 742");
	assert.ok(recoit);
});
