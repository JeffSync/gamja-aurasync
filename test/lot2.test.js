/*
 * D-066, lot 2, de bout en bout : un message recu par handleChatMessage
 * compte, notifie (ou non) et propose les notifications comme prevu ; la
 * barre, l'en-tete et le fil le montrent.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 6, 20) });

globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
let stockage = new Map();
globalThis.window.localStorage = {
	getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
	setItem: (k, v) => stockage.set(k, String(v)),
	removeItem: (k) => stockage.delete(k),
};
globalThis.localStorage = globalThis.window.localStorage;

const { State, BufferType, Unread, ServerStatus } = await import("../state.js");
const { lireCatalogue } = await import("../lib/selection.js");
const channels = await import("../components/aurasync-channels.js");
const { CLE_REFUS } = await import("../lib/notifications.js");
const { default: App } = await import("../components/app.js");
const { default: Buffer } = await import("../components/buffer.js");
const { default: BufferList } = await import("../components/buffer-list.js");
const { default: BufferHeader } = await import("../components/buffer-header.js");

const cm = (s) => s.toLowerCase();

const CATALOGUE = lireCatalogue({
	categories: [
		{ id: "principaux", label: "Salons principaux", channels: [{ name: "#AuraSync", fixed: true }, { name: "#aide" }, { name: "#abus", sensible: true }] },
		{ id: "thematiques", label: "Thématiques", channels: [{ name: "#jeux" }, { name: "#addictions", remember: false, sensible: true }] },
	],
	selection: [],
});

/* Un t'Chat minimal : les methodes reelles d'App sur un etat en memoire. */
function tchat({ permission = "granted", focus = false, cache = true, catalogue = CATALOGUE } = {}) {
	channels.setCatalogue(catalogue);
	globalThis.document = { hasFocus: () => focus, hidden: cache };
	let client = {
		nick: "Jeff", cm, params: {}, isMyNick: (n) => cm(n) === "jeff", isChannel: (n) => n.startsWith("#"),
		isupport: { statusMsg: () => null, membershipModes: () => [] },
		serverPrefix: { name: "irc.aurasync.fr" },
		caps: { enabled: new Set() },
	};
	let state = State.create();
	let [sid, u] = State.createServer(state);
	state = { ...state, ...u };
	let notifications = [];
	let app = {
		state, clients: new Map([[sid, client]]),
		bufferStore: { get: () => null, put: () => false },
		setState(f, cb) {
			this.state = { ...this.state, ...(typeof f === "function" ? f(this.state) : f) };
			if (cb) {
				cb();
			}
		},
		updateDocumentTitle() {},
		sendReadReceipt() {},
		notifier: {
			montrer: (title, options) => notifications.push({ title, ...options }),
			permission: () => permission,
			fermer() {},
			fermerSiLu() {},
		},
		propositionNotifFaite: false,
		createBuffer(serverID, name) {
			if (!State.getBuffer(this.state, { server: serverID, name })) {
				let [, upd] = State.createBuffer(this.state, name, serverID, client);
				this.state = { ...this.state, ...upd };
			}
		},
		switchBuffer(id) {
			let buf = State.getBuffer(this.state, id);
			this.state = { ...this.state, activeBuffer: buf.id };
		},
	};
	for (let nom of [
		"prepareChatMessage", "handleChatMessage", "setBufferState", "notifierConversation",
		"proposerNotifications", "markBufferAsRead", "retirerPropositionNotif", "handleNotifRefuser",
		"ouvrirConversation", "accueilDe",
	]) {
		app[nom] = App.prototype[nom];
	}
	for (let nom of ["#jeux", "#aide", "#abus", "#addictions"]) {
		app.createBuffer(sid, nom);
	}
	let t = 0;
	function recoit(bufName, auteur, cible, texte, extra = {}) {
		app.handleChatMessage(sid, bufName, {
			command: "PRIVMSG", prefix: { name: auteur }, params: [cible, texte],
			tags: { time: new Date(Date.UTC(2026, 10, 6, 19, 0, t++)).toISOString() }, ...extra,
		});
	}
	const buf = (name) => State.getBuffer(app.state, { server: sid, name });
	function activer(name) {
		app.switchBuffer(buf(name).id);
	}
	return { app, sid, recoit, buf, activer, notifications };
}

test("comptage : chaque mention et chaque message privé non lus, remis à zéro à la lecture", () => {
	let { app, recoit, buf } = tchat();
	recoit("#jeux", "Kahen", "#jeux", "salut tout le monde");
	assert.equal(buf("#jeux").unread, Unread.MESSAGE);
	assert.equal(buf("#jeux").pourToi, 0);
	recoit("#jeux", "Kahen", "#jeux", "tu en penses quoi Jeff ?");
	recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	assert.equal(buf("#jeux").unread, Unread.HIGHLIGHT);
	assert.equal(buf("#jeux").pourToi, 2);
	recoit("Kahen", "Kahen", "Jeff", "coucou");
	recoit("Kahen", "Kahen", "Jeff", "tu es là ?");
	assert.equal(buf("Kahen").pourToi, 2);
	// Ses propres messages ne comptent pas
	recoit("#jeux", "Jeff", "#jeux", "Jeff arrive");
	assert.equal(buf("#jeux").pourToi, 2);
	app.markBufferAsRead(buf("#jeux").id);
	assert.equal(buf("#jeux").pourToi, 0);
	assert.equal(buf("#jeux").unread, Unread.NONE);
	assert.equal(buf("Kahen").pourToi, 2, "l'autre conversation garde son compte");
});

test("comptage : rien pour la conversation qu'on lit, fenêtre au premier plan", () => {
	let { recoit, buf, activer } = tchat({ focus: true, cache: false });
	activer("#jeux");
	recoit("#jeux", "Kahen", "#jeux", "Jeff, regarde");
	assert.equal(buf("#jeux").pourToi, 0);
	assert.equal(buf("#jeux").unread, Unread.NONE);
	recoit("#aide", "Kahen", "#aide", "Jeff ?");
	assert.equal(buf("#aide").pourToi, 1);
});

test("règle de vie privée, de bout en bout : jamais le texte, ni pseudo en privé, rien d'un salon d'écoute", () => {
	let { recoit, notifications } = tchat();
	recoit("Kahen", "Kahen", "Jeff", "mon numéro est le 06 12 34 56 78");
	recoit("#addictions", "Kahen", "#addictions", "Jeff je rechute");
	recoit("#abus", "Kahen", "#abus", "Jeff, il m'insulte");
	recoit("#jeux", "Kahen", "#jeux", "Jeff, partie à 22 h ?");
	// Une mention dans une conversation privee reste un message prive
	recoit("Léa", "Léa", "Jeff", "Jeff, tu es là ?");
	assert.deepEqual(notifications.map((n) => [n.title, n.body]), [
		["t'Chat", "Nouveau message privé"],
		["t'Chat", "Nouvelle mention dans un salon d'écoute"],
		["t'Chat", "Nouvelle mention dans un salon d'écoute"],
		["Kahen t'a mentionné(e)", "dans #jeux"],
		["t'Chat", "Nouveau message privé"],
	]);
	let texte = JSON.stringify(notifications.map(({ title, body }) => ({ title, body })));
	assert.doesNotMatch(texte, /numéro|rechute|insulte|partie|tu es là|Léa/);
	for (let n of notifications) {
		assert.equal(n.requireInteraction, false);
		assert.equal(n.renotify, false);
	}
	assert.deepEqual(notifications.map((n) => n.tag), ["tchat:kahen", "tchat:#addictions", "tchat:#abus", "tchat:#jeux", "tchat:léa"]);
});

test("catalogue pas encore lu : tout salon est traité comme un salon d'écoute", () => {
	let { recoit, notifications } = tchat({ catalogue: null });
	recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	assert.deepEqual([notifications[0].title, notifications[0].body], ["t'Chat", "Nouvelle mention dans un salon d'écoute"]);
});

test("quand notifier : onglet caché, sans focus, ou autre conversation affichée ; jamais un simple non-lu", () => {
	// Sous les yeux : rien
	let a = tchat({ focus: true, cache: false });
	a.activer("#jeux");
	a.recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	assert.equal(a.notifications.length, 0);
	// Autre conversation affichee
	a.recoit("#aide", "Kahen", "#aide", "Jeff ?");
	assert.equal(a.notifications.length, 1);
	// Un message sans mention ne notifie jamais
	a.recoit("#aide", "Kahen", "#aide", "bonsoir");
	assert.equal(a.notifications.length, 1);
	// Onglet cache, meme conversation
	let b = tchat({ focus: true, cache: true });
	b.activer("#jeux");
	b.recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	assert.equal(b.notifications.length, 1);
	// Fenetre sans focus, meme conversation
	let c = tchat({ focus: false, cache: false });
	c.activer("#jeux");
	c.recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	assert.equal(c.notifications.length, 1);
});

test("invitation : même chemin, protégée, sans « Accepter »", () => {
	let { app, sid, notifications } = tchat();
	let invite = (salon) => app.handleChatMessage(sid, "*", {
		command: "INVITE", prefix: { name: "Kahen" }, params: ["Jeff", salon],
		tags: { time: new Date().toISOString() },
	});
	invite("#jeux");
	invite("#addictions");
	assert.deepEqual(notifications.map((n) => [n.title, n.body]), [
		["Kahen t'invite", "dans #jeux"],
		["t'Chat", "Nouvelle invitation dans un salon d'écoute"],
	]);
	assert.ok(notifications.every((n) => !("actions" in n)));
	// Sans permission : rien, et aucune exception
	let sans = tchat({ permission: "default" });
	sans.app.notifier.montrer = () => {
		throw new Error("ne doit pas être appelé sans permission");
	};
	sans.app.notifier.montrer = (title, options) => {
		assert.equal(sans.app.notifier.permission(), "default");
		return Promise.resolve(false);
	};
	assert.doesNotThrow(() => sans.app.handleChatMessage(sans.sid, "*", {
		command: "INVITE", prefix: { name: "Kahen" }, params: ["Jeff", "#jeux"], tags: { time: new Date().toISOString() },
	}));
});

test("proposition : une seule, sous la première mention, jamais après « Non merci »", () => {
	stockage.clear();
	let { app, recoit, buf } = tchat({ permission: "default" });
	recoit("#jeux", "Kahen", "#jeux", "salut");
	assert.equal(buf("#jeux").propositionNotif, undefined, "pas pour un simple message");
	recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	let premiere = buf("#jeux").messages.at(-1);
	assert.equal(buf("#jeux").propositionNotif, premiere.key);
	recoit("Kahen", "Kahen", "Jeff", "coucou");
	assert.equal(buf("Kahen").propositionNotif, undefined, "une seule par session");
	app.handleNotifRefuser();
	assert.equal(buf("#jeux").propositionNotif, null);
	assert.equal(stockage.get(CLE_REFUS), "1");
	// Session suivante : le refus est retenu
	let suivante = tchat({ permission: "default" });
	suivante.recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	assert.equal(suivante.buf("#jeux").propositionNotif, undefined);
	stockage.clear();
	// Permission deja accordee ou bloquee : jamais
	for (let permission of ["granted", "denied", "indisponible"]) {
		let x = tchat({ permission });
		x.recoit("Kahen", "Kahen", "Jeff", "coucou");
		assert.equal(x.buf("Kahen").propositionNotif, undefined, permission);
	}
});

test("clic sur une notification : la conversation s'ouvre", () => {
	let { app, sid, buf } = tchat();
	app.ouvrirConversation("#aide", sid);
	assert.equal(app.state.activeBuffer, buf("#aide").id);
	app.ouvrirConversation("#jeux", 999);
	assert.equal(app.state.activeBuffer, buf("#jeux").id, "serveur inconnu : le premier qui a la conversation");
	app.ouvrirConversation("#inconnu", sid);
	assert.equal(app.state.activeBuffer, buf("#jeux").id);
});

/* ── Rendu ────────────────────────────────────────────────────────────── */

/* Arbre de vnodes deplie (composants fonctions et classes rendus). */
function* noeuds(v) {
	if (Array.isArray(v)) {
		for (let x of v) {
			yield* noeuds(x);
		}
	} else if (v && typeof v === "object") {
		if (v.props && typeof v.props.children === "function") {
			// Consumer d'un contexte (reglages)
			yield v;
			yield* noeuds(v.props.children({ secondsInTimestamps: false }));
			return;
		}
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
	if (v.props && typeof v.props.children === "function") {
		return texte(v.props.children({ secondsInTimestamps: false }));
	}
	if (typeof v.type === "function") {
		let C = v.type;
		return texte(C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props));
	}
	return texte(v.props && v.props.children);
}
const classe = (n) => String((n.props && (n.props.class || n.props.className)) || "");

test("barre : point, badge « @n » annoncé, nombre rose en privé ; total d'une catégorie ; entrée Notifications", () => {
	let { app, recoit, sid } = tchat();
	recoit("#aide", "Kahen", "#aide", "bonsoir");
	recoit("#jeux", "Kahen", "#jeux", "Jeff ?");
	recoit("#jeux", "Kahen", "#jeux", "Jeff !");
	recoit("Kahen", "Kahen", "Jeff", "coucou");
	let servers = new Map([[sid, { status: ServerStatus.REGISTERED, users: new Map() }]]);
	let activations = 0;
	let arbre = BufferList({
		buffers: app.state.buffers, servers, bouncerNetworks: new Map(), activeBuffer: null,
		onBufferClick() {}, onBufferClose() {}, onOpenChannelList() {},
		permissionNotif: "default", onNotifActiver: () => activations++,
	});
	let tout = [...noeuds(arbre)];
	let marques = tout.filter((n) => classe(n).startsWith("marque "));
	assert.deepEqual(marques.map((n) => [classe(n).trim(), n.props["aria-label"], n.props.role, texte(n)]), [
		["marque marque-point", "Nouveaux messages", "img", ""],
		["marque marque-mention", "2 mentions", "img", "@2"],
		["marque marque-prive", "1 message privé non lu", "img", "1"],
	]);
	let totaux = tout.filter((n) => classe(n).startsWith("chan-group-total"));
	assert.deepEqual(totaux.map((n) => [classe(n).trim(), n.props["aria-label"], texte(n)]), [
		["chan-group-total", "1 conversation à lire", "1"],
		["chan-group-total pour-toi", "1 conversation à lire, dont 2 messages pour toi", "1"],
		["chan-group-total pour-toi", "1 conversation à lire, dont 1 message pour toi", "1"],
	]);
	let entree = tout.find((n) => classe(n).startsWith("notif-entree"));
	assert.equal(classe(entree), "notif-entree notif-default");
	assert.match(texte(entree), /Notifications\s*Activer/);
	tout.find((n) => classe(n) === "notif-activer").props.onClick();
	assert.equal(activations, 1);
	for (let [permission, attendu] of [["granted", "Activées"], ["denied", "Bloquées par le navigateur : à réactiver dans ses réglages"]]) {
		let a = BufferList({
			buffers: new Map(), servers, bouncerNetworks: new Map(), activeBuffer: null,
			onBufferClick() {}, onBufferClose() {}, onOpenChannelList() {}, permissionNotif: permission,
		});
		let e = [...noeuds(a)].find((n) => classe(n).startsWith("notif-entree"));
		assert.match(texte(e), new RegExp(attendu));
		assert.equal([...noeuds(e)].some((n) => n.type === "button"), false, "rien à cliquer");
	}
});

test("☰ : pastille rose « 3 messages pour toi » ; rien quand il n'y a rien", () => {
	let props = (pourToi) => ({
		buffer: { type: BufferType.CHANNEL, name: "#jeux", joined: true }, server: { status: ServerStatus.REGISTERED },
		memberCount: 2, pourToi, onToggleBufferList() {}, onToggleMemberList() {}, onClose() {}, onJoin() {},
	});
	let tout = [...noeuds(BufferHeader(props(3)))];
	let pastille = tout.find((n) => classe(n) === "pastille-pour-toi");
	assert.equal(pastille.props["aria-label"], "3 messages pour toi");
	assert.equal(pastille.props.role, "img");
	assert.equal(texte(pastille), "3");
	let bouton = tout.find((n) => classe(n).includes("hdr-toggle-left"));
	assert.ok([...noeuds(bouton)].includes(pastille), "la pastille est sur ☰");
	assert.equal(texte([...noeuds(BufferHeader(props(1)))].find((n) => classe(n) === "pastille-pour-toi")), "1");
	assert.equal([...noeuds(BufferHeader(props(1)))].find((n) => classe(n) === "pastille-pour-toi").props["aria-label"], "1 message pour toi");
	assert.equal([...noeuds(BufferHeader(props(0)))].some((n) => classe(n) === "pastille-pour-toi"), false);
	assert.equal(texte([...noeuds(BufferHeader(props(120)))].find((n) => classe(n) === "pastille-pour-toi")), "99+");
});

test("fil : ligne de mention, ton pseudo dans <mark>, l'auteur sans marque ; la proposition sous la mention", () => {
	stockage.clear();
	let { app, recoit, buf, sid } = tchat({ permission: "default" });
	recoit("#jeux", "Kahen", "#jeux", "tu en penses quoi Jeff ?");
	recoit("#jeux", "Kahen", "#jeux", "\x01ACTION salue jeff\x01");
	recoit("#jeux", "Kahen", "#jeux", "on fait une partie ?");
	let activer = 0, refuser = 0;
	let b = new Buffer({
		buffer: buf("#jeux"), server: { ...app.state.servers.get(sid), users: new Map(), cm },
		settings: { bufferEvents: "expand" },
		onNickClick() {}, onChannelClick() {}, onVerifyClick() {},
		onNotifActiver: () => activer++, onNotifRefuser: () => refuser++,
	});
	let tout = [...noeuds(b.render())];
	let lignes = tout.filter((n) => n.type === "div" && /(^|\s)logline(\s|$)/.test(classe(n)));
	assert.match(classe(lignes[0]), /\bhighlight\b/);
	let marks = tout.filter((n) => n.type === "mark");
	assert.deepEqual(marks.map((n) => [classe(n), texte(n)]), [["moi", "Jeff"], ["moi", "jeff"]]);
	assert.equal(texte(lignes[0]).replace(/\s+/g, " ").trim().endsWith("« Kahen » tu en penses quoi Jeff ?"), true);
	// La proposition suit la premiere mention, et seulement elle
	assert.match(classe(lignes[1]), /proposition-notif/);
	assert.match(texte(lignes[1]), /Tu veux être prévenu\(e\) quand on te mentionne \?\s*Activer\s*Non merci/);
	assert.equal(lignes.filter((n) => /proposition-notif/.test(classe(n))).length, 1);
	let boutons = [...noeuds(lignes[1])].filter((n) => n.type === "button");
	boutons[0].props.onClick();
	boutons[1].props.onClick();
	assert.deepEqual([activer, refuser], [1, 1]);
	assert.doesNotMatch(classe(lignes.at(-1)), /highlight/);
});

test("liste des présents : « 1 personne », « 2 personnes », plus « Utilisateurs »", () => {
	let source = readFileSync(new URL("../components/app.js", import.meta.url), "utf8");
	assert.match(source, /\$\{activeBuffer\.members\.size\} personne\$\{activeBuffer\.members\.size > 1 \? "s" : ""\}/);
	assert.doesNotMatch(source, /Utilisateur\$\{/);
});
