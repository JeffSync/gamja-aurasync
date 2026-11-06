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
const { lignesWhois } = await import("../components/whois-panel.js");
const { default: Client } = await import("../lib/client.js");
const irc = await import("../lib/irc.js");

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
	assert.equal(c.role.role, "moderator");
	assert.equal(c.role.libelle, "Modérateur");
	assert.equal(c.role.teinte, "#6ee7b7");
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
	let sources = ["components/nick-menu.js", "components/whois-panel.js", "components/insigne.js", "lib/fiche.js", "lib/insigne.js"].map((f) => readFileSync(new URL("../" + f, import.meta.url), "utf8"));
	for (let s of sources) {
		let affiche = (s.match(/"[^"\n]*"|`[^`]*`/g) || []).join("\n");
		assert.doesNotMatch(affiche, /Propriétaire du salon|Administrateur du salon|Half|Opérateur du salon|Voix\b|Qui est-ce|Connexion sécurisée|t'Chat Opérateur|\bmembre|\bIRC\b|Owner|Whois|Idle|Signon|\(rice\)|Détails techniques|Donner l'opérateur|Retirer l'opérateur/);
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

test("fiche rendue : avatar 64, nom, @pseudo, insigne du rôle, rang, lien relatif, actions", () => {
	let tout = rendre({ targetMembership: "%" });
	let txt = tout.map((n) => (typeof n.props?.children === "string" ? n.props.children : "")).join("|");
	assert.ok(tout.some((n) => n.type === "img" && n.props.src === "/uploads/avatars/k.webp" && n.props.width === 64));
	assert.equal(texte(tout.find((n) => classe(n) === "fiche-nom")), "Kahen L.");
	assert.equal(texte(tout.find((n) => classe(n) === "fiche-pseudo")), "@Kahen");
	let role = tout.find((n) => classe(n) === "fiche-role");
	assert.equal(texte(role), "Modérateur");
	assert.equal(role.props.style, "color:#6ee7b7");
	assert.ok(!tout.some((n) => /role-(founder|administrator|operator|moderator)/.test(classe(n))), "plus de badge texte");
	let svg = tout.find((n) => n.type === "svg" && classe(n) === "role-emblem with-ring");
	assert.ok(svg, "l'insigne du profil, en SVG en ligne");
	assert.equal(svg.props.viewBox, "0 0 56 56");
	let traces = [...noeuds(svg.props.children)].filter((n) => n && n.type);
	assert.ok(traces.some((n) => n.type === "circle" && n.props.stroke === "url(#asRingGrad)"), "l'anneau");
	assert.equal(traces.filter((n) => n.type === "line" && n.props["stroke-width"] === "3.36").length, 4, "la mire du modérateur");
	assert.ok(!traces.some((n) => n.props.href || n.props["xlink:href"]), "aucune ressource externe");
	assert.equal(texte(tout.find((n) => classe(n) === "fiche-rang")), "modère le salon");
	let lien = tout.find((n) => n.type === "a");
	assert.equal(lien.props.href, "/u/Kahen");
	assert.equal(lien.props.target, "_blank");
	assert.equal(lien.props.rel, "noopener");
	assert.match(texte(tout.find((n) => classe(n) === "fiche-actions")), /Voir le profil.*Message privé.*Mentionner/);
	assert.ok(!tout.some((n) => n.type === "details"), "plus de repli");
	assert.doesNotMatch(txt, /Détails techniques/);
	assert.ok(!tout.some((n) => classe(n) === "fiche-whois"), "pas de section WHOIS sans réponse");
	// Fondateur : la fleur de vie, treize cercles
	let fondateur = rendre({ etat: { fiche: { ...PROFIL, role: "founder" } } });
	let fleur = fondateur.filter((n) => n.type === "circle" && n.props.r === "7");
	assert.equal(fleur.length, 13);
	assert.equal(texte(fondateur.find((n) => classe(n) === "fiche-role")), "Fondateur");
	// Sans rôle sur le site : ni insigne ni libellé
	let simple = rendre({ etat: { fiche: { ...PROFIL, role: null } } });
	assert.ok(!simple.some((n) => classe(n) === "fiche-role" || n.type === "svg" && classe(n).startsWith("role-emblem")));
});

const WHOIS = {
	311: { params: ["Moi", "Kahen", "kahen", "vhost.aurasync.fr", "*", "Kahen"] },
	// #abus et #addictions : si le serveur les rend (a un oper, a qui y est), on les montre
	319: { params: ["Moi", "Kahen", "%#jeux #AuraSync @#bretagne +#aide !#abus #addictions"] },
	317: { params: ["Moi", "Kahen", "380", String(Date.UTC(2026, 10, 6, 19, 12) / 1000)] },
};
const lignes = (tout) => tout.filter((n) => classe(n) === "whois-row").map((n) => texte(n));

test("WHOIS : visible de tous, sans repli, sous la modération ; masque, tous les salons avec leur rang, inactivité, connexion", () => {
	for (let equipe of [false, true]) {
		let tout = rendre({ selfMembership: "@", etat: { fiche: PROFIL, equipe }, whois: { loading: false, error: false, data: WHOIS } });
		let section = tout.find((n) => classe(n) === "fiche-whois");
		assert.ok(section, "visible hors équipe comme pour l'équipe");
		assert.ok(!tout.some((n) => n.type === "details"), "aucun repli");
		assert.equal(texte(tout.filter((n) => classe(n) === "nick-menu-title").pop()), "SUR LE T'CHAT");
		let l = lignes(tout);
		assert.equal(l[0], "Masquekahen@vhost.aurasync.fr");
		assert.ok(!l.some((x) => x.startsWith("Adresse réelle")), "pas d'adresse réelle si le serveur ne l'envoie pas");
		let salons = tout.find((n) => classe(n) === "whois-chans").props.children.map(texte);
		assert.deepEqual(salons, ["%#jeux", "#AuraSync", "@#bretagne", "+#aide", "!#abus", "#addictions"], "tous, tels quels, sans filtre");
		assert.ok(l.includes("Inactivité6 min"));
		assert.ok(l.some((x) => x.startsWith("Connexion06/11/2026")));
		// Ordre : actions, modération, puis WHOIS
		let i = (pred) => tout.findIndex(pred);
		assert.ok(i((n) => classe(n) === "fiche-actions") < i((n) => classe(n) === "nick-menu-title"));
		assert.ok(i((n) => texte(n) === "MODÉRATION") < i((n) => classe(n) === "fiche-whois"));
	}
});

test("WHOIS : l'adresse réelle seulement si le serveur envoie le 378, telle quelle", () => {
	let data = { ...WHOIS, 378: { params: ["Moi", "Kahen", "is connecting from *@box.example.net 203.0.113.7"] } };
	let l = lignes(rendre({ whois: { loading: false, error: false, data } }));
	assert.ok(l.includes("Adresse réelle*@box.example.net 203.0.113.7"));
	assert.equal(lignesWhois({ 378: { params: ["", "", "203.0.113.7"] } }).adresse, "203.0.113.7");
	assert.equal(lignesWhois({}).adresse, null);
	assert.equal(lignesWhois({ 311: { params: ["", "K", "u"] } }).masque, null, "pas de masque inventé");
});

test("WHOIS : pour chaque cas de la fiche, attente et pseudo absent", () => {
	for (let card of [PROFIL, { ...PROFIL, prive: true }, { kind: "bloque_par_moi", pseudo: "Kahen" },
		{ kind: "indisponible", pseudo: "Kahen" }, { kind: "service", pseudo: "Kahen", libelle: "x" },
		{ kind: "temporaire", pseudo: "Kahen" }, { ...PROFIL, moi: true }]) {
		let tout = rendre({ etat: { fiche: card }, whois: { loading: false, error: false, data: WHOIS } });
		assert.ok(tout.some((n) => classe(n) === "fiche-whois"), card.kind);
	}
	let attente = rendre({ whois: { loading: true, error: false, data: null } });
	assert.equal(texte(attente.find((n) => classe(n) === "whois-wait")), "Recherche…");
	let absent = rendre({ whois: { loading: false, error: true, data: null } });
	assert.equal(texte(absent.find((n) => classe(n) === "whois-wait")), "Ce pseudo n'est pas connecté");
});

test("WHOIS : plusieurs 319 du serveur sont tous gardés, et le 378 est recueilli", () => {
	let list = [
		{ command: "311", params: ["Moi", "Kahen", "kahen", "h", "*", "K"] },
		{ command: "319", params: ["Moi", "Kahen", "#a @#b "] },
		{ command: "319", params: ["Moi", "Kahen", "+#c"] },
		{ command: "378", params: ["Moi", "Kahen", "is connecting from *@x 1.2.3.4"] },
	];
	let fin = { command: irc.RPL_ENDOFWHOIS, params: ["Moi", "Kahen"], list };
	let faux = { cm: (s) => s.toLowerCase(), roundtrip: (msg, cb) => Promise.resolve(cb(fin)) };
	return Client.prototype.whois.call(faux, "kahen").then((w) => {
		assert.equal(w["319"].params[2], "#a @#b +#c");
		assert.deepEqual(lignesWhois(w).salons, ["#a", "@#b", "+#c"]);
		assert.equal(lignesWhois(w).adresse, "*@x 1.2.3.4");
	});
});

test("client : le 378 entre dans la réponse WHOIS au lieu d'aller ailleurs", () => {
	let source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(source, /case irc\.RPL_WHOISCHANNELS:\n\t\tcase irc\.RPL_WHOISHOST:\n\t\t\tthis\.pushPendingList\("WHOIS "/);
	assert.equal(irc.RPL_WHOISHOST, "378");
});

test("modération (D-060) : la voix, et le statut opérateur", () => {
	let items = (props) => rendre({ selfMembership: "@", ...props }).filter((n) => classe(n).startsWith("nick-menu-item")).map(texte);
	let sans = items({ targetMembership: "" });
	assert.ok(sans.includes("Donner la voix"));
	assert.ok(sans.includes("Donner le statut opérateur"));
	let op = items({ targetMembership: "@" });
	assert.ok(op.includes("Retirer la voix"));
	assert.ok(op.includes("Retirer le statut opérateur"));
	let voix = items({ targetMembership: "+" });
	assert.ok(voix.includes("Retirer la voix"));
	assert.ok(voix.includes("Donner le statut opérateur"));
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

/* ── App : chargement de la fiche et du WHOIS ────────────────────────── */

function appMinimal({ equipe, delais = {} }) {
	let whois = [];
	let reponse = (n) => ({ 311: { params: ["", n, "u", "h"] } });
	let client = {
		whois: (n) => {
			whois.push(n);
			return new Promise((ok) => setTimeout(() => ok(reponse(n)), delais[n] || 0));
		},
	};
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
	for (let nom of ["ouvrirFiche", "chargerFiche", "openWhois", "chargerWhois"]) {
		app[nom] = App.prototype[nom];
	}
	return { app, whois };
}

test("App : /whois ouvre la fiche centrée et demande le WHOIS, même hors équipe", async () => {
	let { app, whois } = appMinimal({ equipe: false });
	app.openWhois("Kahen");
	assert.equal(app.state.nickMenu.centered, true);
	assert.deepEqual(whois, ["Kahen"], "demandé à l'ouverture");
	assert.equal(app.state.whois.loading, true);
	await app.cacheFiches.charger("Kahen");
	await new Promise((r) => setTimeout(r, 0));
	assert.deepEqual(app.state.fiches.get("kahen"), { card: PROFIL, equipe: false });
	assert.equal(app.state.whois.loading, false);
	assert.ok(app.state.whois.data);
});

test("App : chaque ouverture de fiche demande le WHOIS, pour l'équipe comme pour les autres", async () => {
	for (let equipe of [true, false]) {
		// La réponse pour Kahen arrive après celle pour Lea
		let { app, whois } = appMinimal({ equipe, delais: { Kahen: 5 } });
		app.ouvrirFiche("Kahen", { x: 1, y: 2, centered: false });
		app.ouvrirFiche("Lea", { x: 1, y: 2, centered: false });
		assert.deepEqual(whois, ["Kahen", "Lea"]);
		await new Promise((r) => setTimeout(r, 15));
		assert.equal(app.state.whois.nick, "Lea");
		assert.equal(app.state.whois.data["311"].params[1], "Lea", "la réponse d'une fiche fermée n'écrase pas la suivante");
	}
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
