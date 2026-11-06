/*
 * D-066, point 7 : affichage des notifications (lib/notifier.js) et service
 * worker minimal (sw.js), avec de faux objets du navigateur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const { creerNotifier, MESSAGE_OUVRIR, CHEMIN_SW } = await import("../lib/notifier.js");

const racine = new URL("../", import.meta.url);
const lire = (f) => readFileSync(new URL(f, racine), "utf8");

function fausseNotification(permission, { leve = false } = {}) {
	class N {
		static permission = permission;
		static creees = [];
		static demandes = 0;
		static requestPermission(rappel) {
			N.demandes++;
			N.permission = "granted";
			if (rappel) {
				rappel("granted");
			}
			return Promise.resolve("granted");
		}
		constructor(title, options) {
			if (leve) {
				throw new TypeError("Illegal constructor");
			}
			this.title = title;
			this.options = options;
			this.ferme = false;
			N.creees.push(this);
		}
		close() {
			this.ferme = true;
		}
	}
	return N;
}

function fauxSW() {
	let ecouteurs = [];
	return {
		addEventListener(type, f) {
			assert.equal(type, "message");
			ecouteurs.push(f);
		},
		envoyer(data) {
			ecouteurs.forEach((f) => f({ data }));
		},
	};
}

function fausseRegistration({ leve = false } = {}) {
	let montrees = [];
	return {
		montrees,
		async showNotification(title, options) {
			if (leve) {
				throw new TypeError("No active registration");
			}
			montrees.push({
				title, options, ferme: false, close() {
					this.ferme = true;
				}, 
			});
		},
		async getNotifications({ tag }) {
			return montrees.filter((n) => n.options.tag === tag);
		},
	};
}

const OPTIONS = { body: "Nouveau message privé", tag: "tchat:kahen", renotify: false, requireInteraction: false, data: { conversation: "Kahen", serveur: 1 } };

test("rien ne part sans la permission « granted »", async () => {
	for (let permission of ["default", "denied"]) {
		let N = fausseNotification(permission);
		let r = fausseRegistration();
		let n = creerNotifier({ Notification: N, onOuvrir() {} });
		n.registration = r;
		assert.equal(await n.montrer("t'Chat", OPTIONS, {}), false);
		assert.equal(N.creees.length + r.montrees.length, 0, permission);
	}
	let n = creerNotifier({ Notification: undefined, onOuvrir() {} });
	assert.equal(n.permission(), "indisponible");
	assert.equal(await n.montrer("t'Chat", OPTIONS, {}), false);
});

test("par le service worker quand il est là, sinon new Notification", async () => {
	let N = fausseNotification("granted");
	let r = fausseRegistration();
	let n = creerNotifier({ Notification: N, onOuvrir() {} });
	n.registration = r;
	assert.equal(await n.montrer("t'Chat", OPTIONS, {}), true);
	assert.equal(r.montrees.length, 1);
	assert.equal(N.creees.length, 0);
	assert.deepEqual(r.montrees[0].options, OPTIONS);

	let sans = creerNotifier({ Notification: N, onOuvrir() {} });
	assert.equal(await sans.montrer("t'Chat", OPTIONS, {}), true);
	assert.equal(N.creees.length, 1);
});

test("une exception ne remonte jamais : service worker en échec, puis Chrome Android", async () => {
	let N = fausseNotification("granted", { leve: true });
	let n = creerNotifier({ Notification: N, onOuvrir() {} });
	n.registration = fausseRegistration({ leve: true });
	let avertissements = [];
	let warn = console.warn;
	console.warn = (...a) => avertissements.push(a);
	try {
		assert.equal(await n.montrer("t'Chat", OPTIONS, {}), false);
	} finally {
		console.warn = warn;
	}
	assert.equal(avertissements.length, 2);
});

test("clic : la conversation s'ouvre, par l'objet Notification ou par le service worker", async () => {
	let ouvertes = [];
	let N = fausseNotification("granted");
	let sw = fauxSW();
	let n = creerNotifier({ Notification: N, serviceWorker: sw, onOuvrir: (nom, serveur) => ouvertes.push([nom, serveur]) });
	await n.montrer("t'Chat", OPTIONS, {});
	N.creees[0].onclick();
	assert.equal(N.creees[0].ferme, true);
	sw.envoyer({ type: MESSAGE_OUVRIR, conversation: "#jeux", serveur: 2 });
	sw.envoyer({ type: "autre", conversation: "#x" });
	sw.envoyer(null);
	sw.envoyer({ type: MESSAGE_OUVRIR, conversation: 42 });
	assert.deepEqual(ouvertes, [["Kahen", 1], ["#jeux", 2]]);
});

test("fermeture à la lecture : par tag, et seulement si le dernier message notifié est lu", async () => {
	let N = fausseNotification("granted");
	let r = fausseRegistration();
	let n = creerNotifier({ Notification: N, onOuvrir() {} });
	n.registration = r;
	let m1 = { t: 1 }, m2 = { t: 2 };
	await n.montrer("t'Chat", OPTIONS, m1);
	await n.montrer("t'Chat", OPTIONS, m2);
	n.fermerSiLu("tchat:kahen", (m) => m.t <= 1);
	await new Promise((r2) => setTimeout(r2, 0));
	assert.ok(r.montrees.every((x) => !x.ferme), "le second message n'est pas lu");
	n.fermerSiLu("tchat:kahen", (m) => m.t <= 2);
	await new Promise((r2) => setTimeout(r2, 0));
	assert.ok(r.montrees.every((x) => x.ferme));

	let directe = creerNotifier({ Notification: N, onOuvrir() {} });
	await directe.montrer("t'Chat", OPTIONS, m1);
	directe.fermer("tchat:autre");
	assert.equal(N.creees[0].ferme, false);
	directe.fermer("tchat:kahen");
	assert.equal(N.creees[0].ferme, true);
});

test("permission : demandée seulement si elle vaut « default », formes promesse et rappel", async () => {
	let N = fausseNotification("default");
	let n = creerNotifier({ Notification: N, onOuvrir() {} });
	assert.equal(await n.demanderPermission(), "granted");
	assert.equal(N.demandes, 1);
	assert.equal(await n.demanderPermission(), "granted");
	assert.equal(N.demandes, 1, "pas de seconde demande");

	let refusee = fausseNotification("denied");
	assert.equal(await creerNotifier({ Notification: refusee, onOuvrir() {} }).demanderPermission(), "denied");
	assert.equal(refusee.demandes, 0);

	// Vieux Safari : rappel seulement, pas de promesse
	let ancien = fausseNotification("default");
	ancien.requestPermission = (rappel) => {
		ancien.permission = "denied";
		rappel("denied");
	};
	assert.equal(await creerNotifier({ Notification: ancien, onOuvrir() {} }).demanderPermission(), "denied");
});

/* ── sw.js ────────────────────────────────────────────────────────────── */

function chargerSW({ fenetres }) {
	let ecouteurs = {};
	let ouvertes = [];
	let self = {
		registration: { scope: "https://www.aurasync.fr/tchat-app/" },
		skipWaiting() {},
		clients: {
			claim: async () => {},
			matchAll: async (opts) => {
				assert.equal(JSON.stringify(opts), JSON.stringify({ type: "window", includeUncontrolled: true }));
				return fenetres;
			},
			openWindow: async (url) => {
				ouvertes.push(url);
			},
		},
		addEventListener(type, f) {
			(ecouteurs[type] ||= []).push(f);
		},
	};
	vm.runInNewContext(lire("sw.js"), { self, URL });
	return { ecouteurs, ouvertes };
}

async function cliquer(ecouteurs, data) {
	let attente;
	let notification = {
		data, ferme: false, close() {
			this.ferme = true;
		}, 
	};
	ecouteurs.notificationclick[0]({
		notification, waitUntil: (p) => {
			attente = p;
		}, 
	});
	await attente;
	return notification;
}

test("sw.js : aucun gestionnaire fetch, donc aucun cache", () => {
	let { ecouteurs } = chargerSW({ fenetres: [] });
	assert.deepEqual(Object.keys(ecouteurs).sort(), ["activate", "install", "notificationclick"]);
	assert.doesNotMatch(lire("sw.js").replace(/\/\*[\s\S]*?\*\//g, ""), /fetch|caches|importScripts/);
	assert.equal(CHEMIN_SW, "./sw.js");
	// Une entree du build, publiee sans empreinte a cote d'index.html
	let cible = JSON.parse(lire("package.json")).targets.default;
	assert.deepEqual(cible.source, ["index.html", "sw.js"]);
});

test("sw.js : un clic remet le focus sur le t'Chat et lui demande la conversation", async () => {
	let messages = [];
	let fenetre = {
		url: "https://www.aurasync.fr/tchat-app/#x",
		focused: false,
		async focus() {
			this.focused = true;
		},
		postMessage: (m) => messages.push({ ...m }),
	};
	let autre = {
		url: "https://www.aurasync.fr/fil", focus() {
			throw new Error("pas cette fenêtre");
		}, postMessage() {}, 
	};
	let { ecouteurs, ouvertes } = chargerSW({ fenetres: [autre, fenetre] });
	let n = await cliquer(ecouteurs, { conversation: "#jeux", serveur: 1 });
	assert.equal(n.ferme, true);
	assert.equal(fenetre.focused, true);
	assert.deepEqual(messages, [{ type: MESSAGE_OUVRIR, conversation: "#jeux", serveur: 1 }]);
	assert.deepEqual(ouvertes, []);
});

test("sw.js : t'Chat fermé, le clic l'ouvre", async () => {
	let { ecouteurs, ouvertes } = chargerSW({ fenetres: [] });
	await cliquer(ecouteurs, undefined);
	assert.deepEqual(ouvertes, ["https://www.aurasync.fr/tchat-app/"]);
});

test("aucun new URL(..., import.meta.url) dans le code du t'Chat : la CSP bloquerait l'import map de Parcel", () => {
	let fichiers = ["main.js", "state.js", "store.js", "commands.js", "keybindings.js"];
	for (let dossier of ["components", "lib"]) {
		for (let f of readdirSync(new URL(dossier + "/", racine))) {
			if (f.endsWith(".js")) {
				fichiers.push(dossier + "/" + f);
			}
		}
	}
	for (let f of fichiers) {
		assert.doesNotMatch(lire(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /import\.meta/, f);
	}
	assert.match(lire("index.html"), /default-src 'self'/);
});
