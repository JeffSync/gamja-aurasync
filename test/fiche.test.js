/*
 * D-066, lot 3 : la fiche d'un pseudo (point 8) et les messages prives
 * (point 5). Les dix cas du §6.3 de l'analyse font foi
 * (docs/journal/2026-11-06-tchat-apparence-analyse.md, depot aurasync).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis.window || {};
globalThis.window.innerWidth = 1280;
globalThis.window.innerHeight = 800;
globalThis.fetch = () => new Promise(() => {});
let stockage = new Map();
globalThis.window.localStorage = {
	getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
	setItem: (k, v) => stockage.set(k, String(v)),
	removeItem: (k) => stockage.delete(k),
};
globalThis.localStorage = globalThis.window.localStorage;

const fiche = await import("../lib/fiche.js");
const { contenuFiche, avatarDe, rangSalon, creerCacheFiches, dernierRecu, trierPrives, TEXTES, DUREE_CACHE } = fiche;
const { BufferType, Unread, ServerStatus } = await import("../state.js");
const { default: NickMenu } = await import("../components/nick-menu.js");
const { default: BufferList } = await import("../components/buffer-list.js");
const { default: App } = await import("../components/app.js");
const channels = await import("../components/aurasync-channels.js");

/* ── Les cas du §6.3 ─────────────────────────────────────────────────── */

const PROFIL = {
	kind: "profil", pseudo: "Kahen", displayName: "Kahen L.", avatarUrl: "/uploads/avatars/k.webp",
	role: "moderator", prive: false, statut: "en vacances", moi: false,
};

function cas(card) {
	return contenuFiche("Kahen", { fiche: card });
}

test("cas 1, moi : « Mon profil », mon statut, et rien d'autre", () => {
	let c = cas({ ...PROFIL, moi: true, prive: true });
	assert.equal(c.titre, "Kahen L.");
	assert.equal(c.pseudo, "@Kahen");
	assert.deepEqual(c.lien, { texte: "Mon profil", href: "/u/Kahen" });
	assert.deepEqual(c.actions, []);
	assert.equal(c.moderation, false);
	assert.equal(c.sousNote, "en vacances");
	assert.equal(c.note, TEXTES.prive);
});

test("cas 2, profil public : avatar, nom, rôle, statut, « Voir le profil », message, mention, modération", () => {
	let c = cas(PROFIL);
	assert.equal(c.titre, "Kahen L.");
	assert.deepEqual(c.role, { label: "Modérateur(rice)", classe: "role-moderator" });
	assert.equal(c.note, null);
	assert.equal(c.sousNote, "en vacances");
	assert.deepEqual(c.lien, { texte: "Voir le profil", href: "/u/Kahen" });
	assert.deepEqual(c.actions, ["query", "mention"]);
	assert.equal(c.moderation, true);
	assert.deepEqual(c.avatar, { genre: "image", src: "/uploads/avatars/k.webp", lettre: "K" });
	// Sans nom affiche : le pseudo
	assert.equal(cas({ ...PROFIL, displayName: null }).titre, "Kahen");
});

test("cas 3, profil privé : « Profil privé », sans statut, mêmes actions", () => {
	let c = cas({ ...PROFIL, prive: true, statut: "ne doit pas sortir" });
	assert.equal(c.note, "Profil privé");
	assert.equal(c.sousNote, null);
	assert.deepEqual(c.lien, { texte: "Voir le profil", href: "/u/Kahen" });
	assert.deepEqual(c.actions, ["query", "mention"]);
});

test("cas 4, je l'ai bloqué(e) : initiale neutre, « Tu as bloqué cette personne », pas de message privé", () => {
	let c = cas({ kind: "bloque_par_moi", pseudo: "Kahen" });
	assert.equal(c.titre, "Kahen");
	assert.equal(c.note, "Tu as bloqué cette personne");
	assert.deepEqual(c.lien, { texte: "Voir le profil", href: "/u/Kahen" });
	assert.deepEqual(c.actions, ["mention"]);
	assert.equal(c.moderation, true);
	assert.deepEqual(c.avatar, { genre: "neutre", lettre: "K" });
});

test("cas 5 et 7, m'a bloqué(e), supprimé ou inconnu : « Aucun profil AuraSync à ce nom », sans lien", () => {
	let c = cas({ kind: "indisponible", pseudo: "Kahen" });
	assert.equal(c.note, "Aucun profil AuraSync à ce nom");
	assert.equal(c.lien, null);
	assert.deepEqual(c.actions, ["mention"]);
	assert.equal(c.moderation, true);
	assert.deepEqual(c.avatar, { genre: "neutre", lettre: "K" });
	// Une reponse inconnue ne montre pas plus
	assert.deepEqual(cas({ kind: "autre chose", pseudo: "Kahen" }), c);
});

test("cas 6 et 8 : l'API répond « profil », la fiche est celle des cas 2 et 3", () => {
	assert.deepEqual(cas({ ...PROFIL }), cas(PROFIL));
});

test("cas 9, service : « Service du t'Chat », sa phrase, ni lien, ni message, ni mention, ni modération", () => {
	let c = contenuFiche("PseudoSync", { fiche: { kind: "service", pseudo: "PseudoSync", libelle: "Gère les pseudos" } });
	assert.equal(c.note, "Service du t'Chat");
	assert.equal(c.sousNote, "Gère les pseudos");
	assert.equal(c.lien, null);
	assert.deepEqual(c.actions, []);
	assert.equal(c.moderation, false);
	assert.equal(c.avatar.genre, "service");
});

test("cas 10, pseudo temporaire : « Pseudo temporaire », initiale sur dégradé, sans lien", () => {
	let c = contenuFiche("Guest1234", { fiche: { kind: "temporaire", pseudo: "Guest1234" } });
	assert.equal(c.note, "Pseudo temporaire");
	assert.equal(c.lien, null);
	assert.deepEqual(c.actions, ["mention"]);
	assert.deepEqual(c.avatar, { genre: "degrade", lettre: "G" });
});

test("avant la réponse, ou si elle échoue : le pseudo seul, rien sur la personne", () => {
	let c = contenuFiche("Kahen", { fiche: null });
	assert.equal(c.note, "Chargement de la fiche…");
	assert.equal(c.lien, null);
	assert.equal(c.role, null);
	assert.equal(contenuFiche("Kahen", { fiche: null, erreur: true }).note, "Fiche indisponible pour le moment");
});

test("avatar : seule une image de /uploads/ est chargée ; sinon l'initiale sur dégradé", () => {
	for (let url of ["https://exemple.test/a.png", "//exemple.test/a.png", "/uploads/../api/x", "javascript:alert(1)", "/autre/a.png", null]) {
		assert.equal(avatarDe({ ...PROFIL, avatarUrl: url }, "Kahen").genre, "degrade", String(url));
	}
	assert.equal(avatarDe({ ...PROFIL, pseudo: "élise", avatarUrl: null }, "élise").lettre, "É");
});

test("rang dans le salon : libellés neutres, ~ et & n'existent plus", () => {
	assert.equal(rangSalon("@"), "gère le salon");
	assert.equal(rangSalon("%"), "modère le salon");
	assert.equal(rangSalon("+"), "a la parole");
	assert.equal(rangSalon("@+"), "gère le salon");
	assert.equal(rangSalon("~"), "gère le salon");
	assert.equal(rangSalon(""), null);
	assert.equal(rangSalon(undefined), null);
});

test("vocabulaire : plus de libellés anglais ni de rangs disparus, jamais « membre » ni « IRC » affiché", () => {
	let sources = ["components/nick-menu.js", "components/whois-panel.js", "lib/fiche.js"].map((f) => readFileSync(new URL("../" + f, import.meta.url), "utf8"));
	for (let s of sources) {
		let affiche = (s.match(/"[^"\n]*"|`[^`]*`/g) || []).join("\n");
		assert.doesNotMatch(affiche, /Propriétaire du salon|Administrateur du salon|Half|Opérateur du salon|Voix\b|Qui est-ce|Connexion sécurisée|t'Chat Opérateur|\bmembre|\bIRC\b|Owner|Whois|Idle|Signon/);
	}
});

/* ── Cache ────────────────────────────────────────────────────────────── */

function faux(reponses) {
	let appels = [];
	let fetch = (url, opts) => {
		appels.push({ url, opts });
		let r = reponses.shift();
		return Promise.resolve({ ok: r.status === 200, status: r.status, json: () => Promise.resolve(r.corps) });
	};
	return { fetch, appels };
}

test("cache : cinq minutes par pseudo, sans casse ; une requête en cours partagée ; l'échec n'est pas gardé", async () => {
	let t = 0;
	let corps = { card: { kind: "indisponible", pseudo: "Kahen" }, equipe: false };
	let f = faux([{ status: 500 }, { status: 200, corps }, { status: 200, corps }]);
	let cache = creerCacheFiches({ fetch: f.fetch, now: () => t });

	await assert.rejects(cache.charger("Kahen"));
	assert.equal(cache.lire("Kahen"), null, "un échec n'est pas gardé");

	let [a, b] = await Promise.all([cache.charger("Kahen"), cache.charger("kahen")]);
	assert.deepEqual(a, corps);
	assert.equal(a, b);
	assert.equal(f.appels.length, 2, "la seconde demande attend la première");
	assert.equal(f.appels[1].url, "/api/irc/users/Kahen/card");
	assert.equal(f.appels[1].opts.credentials, "same-origin");

	t = DUREE_CACHE;
	assert.deepEqual(await cache.charger("KAHEN"), corps);
	assert.equal(f.appels.length, 2, "encore frais à cinq minutes pile");
	t = DUREE_CACHE + 1;
	assert.equal(cache.lire("Kahen"), null);
	await cache.charger("Kahen");
	assert.equal(f.appels.length, 3, "relu après cinq minutes");
});

test("cache : pseudo encodé dans l'adresse, réponse illisible refusée", async () => {
	let f = faux([{ status: 200, corps: { nope: true } }]);
	let cache = creerCacheFiches({ fetch: f.fetch });
	await assert.rejects(cache.charger("a[b]|c"));
	assert.equal(f.appels[0].url, "/api/irc/users/a%5Bb%5D%7Cc/card");
});

/* ── Tri des messages prives ─────────────────────────────────────────── */

function conv(name, messages) {
	return {
		name, type: BufferType.NICK,
		messages: messages.map(([auteur, h, command = "PRIVMSG"]) => ({
			command, prefix: { name: auteur }, params: ["x", "y"], tags: { time: `2026-11-06T${h}:00.000Z` },
		})),
	};
}

test("messages privés : le dernier message REÇU décide, le plus récent en haut", () => {
	let cm = (s) => s.toLowerCase();
	let kahen = conv("Kahen", [["Kahen", "20:00"], ["Jeff", "21:30"]]);
	let lea = conv("Lea", [["lea", "20:30"]]);
	let bot = conv("PseudoSync", [["PseudoSync", "20:10", "NOTICE"]]);
	let vide = conv("Nora", [["Jeff", "22:00"]]);
	assert.equal(dernierRecu(kahen, cm), Date.parse("2026-11-06T20:00:00.000Z"), "mon propre message ne compte pas");
	assert.equal(dernierRecu(vide, cm), 0);
	assert.deepEqual(trierPrives([kahen, vide, lea, bot], cm).map((b) => b.name), ["Lea", "PseudoSync", "Kahen", "Nora"]);
	// Egalite : l'ordre d'ouverture
	let a = conv("A", []), b = conv("B", []);
	assert.deepEqual(trierPrives([a, b], cm).map((x) => x.name), ["A", "B"]);
	assert.deepEqual(trierPrives([b, a], cm).map((x) => x.name), ["B", "A"]);
});

/* ── Rendu ────────────────────────────────────────────────────────────── */

function* noeuds(v) {
	if (Array.isArray(v)) {
		for (let x of v) {
			yield* noeuds(x);
		}
	} else if (v && typeof v === "object") {
		if (typeof v.type === "function") {
			let C = v.type;
			let rendu = C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props);
			yield v;
			yield* noeuds(rendu);
			return;
		}
		yield v;
		yield* noeuds(v.props && v.props.children);
	}
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
	if (typeof v.type === "function") {
		let C = v.type;
		return texte(C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props));
	}
	return texte(v.props && v.props.children);
}
const classe = (n) => String((n.props && (n.props.class || n.props.className)) || "");

function rendre(props) {
	let p = {
		nick: "Kahen", x: 300, y: 200, selfMembership: "", targetMembership: "", muet: null,
		etat: { fiche: PROFIL, equipe: false }, onAction() {}, onClose() {}, onDetails() {}, ...props,
	};
	return [...noeuds(new NickMenu(p).render())];
}

test("fiche rendue : avatar 64, nom, @pseudo, rôle, rang, lien relatif, actions ; pas de détails hors équipe", () => {
	let tout = rendre({ targetMembership: "%" });
	let txt = tout.map((n) => (typeof n.props?.children === "string" ? n.props.children : "")).join("|");
	assert.ok(tout.some((n) => n.type === "img" && n.props.src === "/uploads/avatars/k.webp" && n.props.width === 64));
	assert.equal(texte(tout.find((n) => classe(n) === "fiche-nom")), "Kahen L.");
	assert.equal(texte(tout.find((n) => classe(n) === "fiche-pseudo")), "@Kahen");
	assert.equal(texte(tout.find((n) => classe(n).startsWith("fiche-role"))), "Modérateur(rice)");
	assert.equal(texte(tout.find((n) => classe(n) === "fiche-rang")), "modère le salon");
	let lien = tout.find((n) => n.type === "a");
	assert.equal(lien.props.href, "/u/Kahen");
	assert.equal(lien.props.target, "_blank");
	assert.equal(lien.props.rel, "noopener");
	assert.match(texte(tout.find((n) => classe(n) === "fiche-actions")), /Voir le profil.*Message privé.*Mentionner/);
	assert.ok(!tout.some((n) => n.type === "details"), "pas de détails techniques hors équipe");
	assert.doesNotMatch(txt, /Détails techniques/);
});

test("équipe : « Détails techniques » fermé ; le WHOIS n'est demandé qu'à l'ouverture", () => {
	let demandes = [];
	let tout = rendre({ etat: { fiche: PROFIL, equipe: true }, onDetails: (n) => demandes.push(n) });
	let details = tout.find((n) => n.type === "details");
	assert.ok(details);
	assert.ok(!details.props.open, "fermé par défaut");
	assert.equal(texte(tout.find((n) => n.type === "summary")), "Détails techniques");
	assert.deepEqual(demandes, []);
	details.props.onToggle({ target: { open: true } });
	details.props.onToggle({ target: { open: false } });
	assert.equal(demandes.length, 1);
	// Jamais pour un service
	let service = rendre({ nick: "PseudoSync", etat: { fiche: { kind: "service", pseudo: "PseudoSync", libelle: "x" }, equipe: true } });
	assert.ok(!service.some((n) => n.type === "details"));
});

test("modération : la section suit le rang dans le salon et le cas de la fiche", () => {
	let titre = (tout) => tout.some((n) => classe(n) === "nick-menu-title");
	assert.ok(titre(rendre({ selfMembership: "@" })), "@ modère un profil");
	assert.ok(titre(rendre({ selfMembership: "%" })), "% rend muet");
	assert.ok(!titre(rendre({ selfMembership: "" })), "personne sans rang");
	assert.ok(titre(rendre({ selfMembership: "@", etat: { fiche: { kind: "indisponible", pseudo: "Kahen" } } })));
	assert.ok(!titre(rendre({ selfMembership: "@", etat: { fiche: { kind: "service", pseudo: "Kahen", libelle: "x" } } })));
	assert.ok(!titre(rendre({ selfMembership: "@", etat: { fiche: { ...PROFIL, moi: true } } })), "pas sur soi");
});

test("barre : messages privés en tête, avatar de 20 px de la fiche, initiale sinon, icône pour un service", () => {
	channels.setCatalogue(null);
	let liste = [["#AuraSync", BufferType.CHANNEL, []], ["Kahen", BufferType.NICK, [["Kahen", "20:00"]]],
		["Lea", BufferType.NICK, [["Lea", "21:00"]]], ["PseudoSync", BufferType.NICK, []], ["Nora", BufferType.NICK, []]];
	let buffers = new Map(liste.map(([name, type, msgs], k) => [k, { ...conv(name, msgs), id: k, type, server: 1, unread: Unread.NONE }]));
	let servers = new Map([[1, { status: ServerStatus.REGISTERED, users: new Map(), cm: (s) => s.toLowerCase() }]]);
	let fiches = new Map([
		["kahen", { card: PROFIL, equipe: false }],
		["lea", { card: { kind: "bloque_par_moi", pseudo: "Lea" }, equipe: false }],
		["pseudosync", { card: { kind: "service", pseudo: "PseudoSync", libelle: "x" }, equipe: false }],
	]);
	let tout = [...noeuds(BufferList({
		buffers, servers, bouncerNetworks: new Map(), activeBuffer: 0, fiches,
		onBufferClick() {}, onBufferClose() {}, onOpenChannelList() {},
	}))];
	let groupes = tout.filter((n) => n.type === "details").map((n) => n.props.class);
	assert.equal(groupes[0], "chan-group cat-prives");
	let prives = tout.find((n) => n.type === "details" && n.props.class === "chan-group cat-prives");
	assert.ok(prives.props.open, "jamais repliée d'elle-même");
	let entrees = tout.filter((n) => n.props && n.props.buffer && n.props.buffer.type === BufferType.NICK);
	assert.deepEqual(entrees.map((n) => n.props.buffer.name), ["Lea", "Kahen", "PseudoSync", "Nora"]);
	let avatars = tout.filter((n) => classe(n).startsWith("fiche-avatar fiche-avatar-20"));
	assert.deepEqual(avatars.map((n) => classe(n).split(" ").pop()), [
		"fiche-avatar-neutre", "fiche-avatar-image", "fiche-avatar-service", "fiche-avatar-neutre",
	]);
	assert.equal(avatars[1].props.src, "/uploads/avatars/k.webp");
	assert.equal(avatars[1].props.width, 20);
	// Sans conversation, pas de categorie
	let sans = [...noeuds(BufferList({
		buffers: new Map([[0, buffers.get(0)]]), servers, bouncerNetworks: new Map(), activeBuffer: 0, fiches,
		onBufferClick() {}, onBufferClose() {}, onOpenChannelList() {},
	}))];
	assert.ok(!sans.some((n) => n.type === "details" && n.props.class === "chan-group cat-prives"));
});

/* ── App : chargement et details techniques ──────────────────────────── */

function appMinimal({ equipe }) {
	let whois = [];
	let client = { whois: (n) => (whois.push(n), Promise.resolve({ 311: { params: ["", "Kahen", "u", "h"] } })) };
	let app = {
		state: { fiches: new Map(), buffers: new Map([[1, { id: 1, server: 1 }]]), activeBuffer: 1, nickMenu: null },
		clients: new Map([[1, client]]),
		setState(f) {
			let maj = typeof f === "function" ? f(this.state) : f;
			if (maj) {
				this.state = { ...this.state, ...maj };
			}
		},
		fetchMuet() {},
		cacheFiches: creerCacheFiches({
			fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ card: PROFIL, equipe }) }),
		}),
	};
	for (let nom of ["ouvrirFiche", "chargerFiche", "openWhois", "openDetailsTechniques"]) {
		app[nom] = App.prototype[nom];
	}
	return { app, whois };
}

test("App : /whois ouvre la fiche centrée ; hors équipe, aucun WHOIS n'est jamais demandé", async () => {
	let { app, whois } = appMinimal({ equipe: false });
	app.openWhois("Kahen");
	assert.equal(app.state.nickMenu.centered, true);
	await app.cacheFiches.charger("Kahen");
	await new Promise((r) => setTimeout(r, 0));
	assert.deepEqual(app.state.fiches.get("kahen"), { card: PROFIL, equipe: false });
	app.openDetailsTechniques("Kahen");
	assert.deepEqual(whois, []);
	assert.equal(app.state.whois, null, "ouvrir la fiche efface les détails précédents, sans en demander");
});

test("App : pour l'équipe, les détails techniques demandent le WHOIS", async () => {
	let { app, whois } = appMinimal({ equipe: true });
	app.ouvrirFiche("Kahen", { x: 1, y: 2, centered: false });
	await new Promise((r) => setTimeout(r, 0));
	app.openDetailsTechniques("Kahen");
	assert.deepEqual(whois, ["Kahen"]);
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(app.state.whois.loading, false);
	assert.ok(app.state.whois.data);
});

test("App : une fiche qui échoue s'affiche « indisponible pour le moment »", async () => {
	let { app } = appMinimal({ equipe: false });
	app.cacheFiches = creerCacheFiches({ fetch: () => Promise.resolve({ ok: false, status: 500 }) });
	let erreurs = console.error;
	console.error = () => {};
	try {
		app.ouvrirFiche("Kahen", { x: 1, y: 2, centered: false });
		await new Promise((r) => setTimeout(r, 0));
	} finally {
		console.error = erreurs;
	}
	assert.equal(app.state.nickMenu.erreur, true);
	assert.equal(app.state.fiches.size, 0);
});
