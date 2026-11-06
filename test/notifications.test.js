/*
 * D-066, point 7 : ce que disent les notifications et quand elles partent.
 *
 * Regle de vie privee, sans exception ni option : jamais le texte d'un
 * message ; ni pseudo pour un message prive ; ni salon ni pseudo pour un
 * salon d'ecoute.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const {
	TEXTES, CLE_REFUS, contenuNotification, doitNotifier, tagConversation,
	optionsNotification, etatPermission, entreeMenu, peutProposer,
} = await import("../lib/notifications.js");

test("message privé : « t'Chat », « Nouveau message privé », sans pseudo", () => {
	let attendu = { title: "t'Chat", body: "Nouveau message privé" };
	assert.deepEqual(contenuNotification({ nature: "prive", salon: false, sensible: false, auteur: "Kahen", nom: "Kahen" }), attendu);
	// Une mention dans une conversation privee reste un message prive
	assert.deepEqual(contenuNotification({ nature: "mention", salon: false, sensible: false, auteur: "Kahen", nom: "Kahen" }), attendu);
	// Meme si on le croyait sensible ou si la nature est mal posee
	assert.deepEqual(contenuNotification({ nature: "prive", salon: true, sensible: true, auteur: "Kahen", nom: "#jeux" }), attendu);
});

test("salon d'écoute : ni nom de salon ni pseudo", () => {
	assert.deepEqual(
		contenuNotification({ nature: "mention", salon: true, sensible: true, auteur: "Kahen", nom: "#addictions" }),
		{ title: "t'Chat", body: "Nouvelle mention dans un salon d'écoute" },
	);
	assert.deepEqual(
		contenuNotification({ nature: "invitation", salon: true, sensible: true, auteur: "Kahen", nom: "#abus" }),
		{ title: "t'Chat", body: "Nouvelle invitation dans un salon d'écoute" },
	);
});

test("autre salon : « Kahen t'a mentionné(e) », « dans #jeux »", () => {
	assert.deepEqual(
		contenuNotification({ nature: "mention", salon: true, sensible: false, auteur: "Kahen", nom: "#jeux" }),
		{ title: "Kahen t'a mentionné(e)", body: "dans #jeux" },
	);
	assert.deepEqual(
		contenuNotification({ nature: "invitation", salon: true, sensible: false, auteur: "Kahen", nom: "#jeux" }),
		{ title: "Kahen t'invite", body: "dans #jeux" },
	);
});

test("jamais le texte d'un message, quelle que soit la combinaison", () => {
	// Les entrees ne portent pas le texte : on verifie qu'aucune sortie ne
	// contient autre chose que la table, un pseudo et un nom de salon.
	let textes = new Set([TEXTES.titre, TEXTES.prive, TEXTES.ecouteMention, TEXTES.ecouteInvitation]);
	for (let nature of ["mention", "prive", "invitation"]) {
		for (let salon of [true, false]) {
			for (let sensible of [true, false]) {
				let c = contenuNotification({ nature, salon, sensible, auteur: "Kahen", nom: salon ? "#jeux" : "Kahen", texte: "SECRET" });
				assert.deepEqual(Object.keys(c).sort(), ["body", "title"]);
				let tout = c.title + " " + c.body;
				assert.doesNotMatch(tout, /SECRET/);
				let vertical = !salon || nature === "prive" || sensible;
				if (vertical) {
					assert.ok(textes.has(c.title) && textes.has(c.body), `${nature}/${salon}/${sensible} : ${tout}`);
					assert.doesNotMatch(tout, /Kahen|#jeux/);
				} else {
					assert.equal(c.title, TEXTES[nature](("Kahen")));
					assert.equal(c.body, "dans #jeux");
				}
			}
		}
	}
});

test("options : un tag par conversation, remplacée sans bruit, ne reste pas à l'écran, jamais de texte", () => {
	let c = { title: "t'Chat", body: "Nouveau message privé" };
	let o = optionsNotification(c, { conversation: "Kahen", serveur: 1, icone: "https://x/i.png" });
	assert.deepEqual(o, {
		body: "Nouveau message privé",
		tag: "tchat:kahen",
		renotify: false,
		requireInteraction: false,
		icon: "https://x/i.png",
		data: { conversation: "Kahen", serveur: 1 },
	});
	assert.equal(tagConversation("#Jeux"), tagConversation("#jeux"));
	assert.notEqual(tagConversation("#jeux"), tagConversation("#aide"));
	assert.equal("silent" in o, false, "le son du système reste celui du système");
	assert.equal("actions" in o, false);
});

test("notifier seulement si la conversation n'est pas sous les yeux", () => {
	// Table complete : cache, focus, affichee
	for (let cache of [false, true]) {
		for (let focus of [false, true]) {
			for (let affichee of [false, true]) {
				let lit = !cache && focus && affichee;
				assert.equal(doitNotifier({ cache, focus, affichee }), !lit, JSON.stringify({ cache, focus, affichee }));
			}
		}
	}
});

test("permission et entrée « Notifications »", () => {
	assert.equal(etatPermission(undefined), "indisponible");
	assert.equal(etatPermission({}), "indisponible");
	for (let p of ["default", "granted", "denied"]) {
		assert.equal(etatPermission({ permission: p }), p);
	}
	assert.deepEqual(entreeMenu("default"), { texte: "Activer", action: true });
	assert.deepEqual(entreeMenu("granted"), { texte: "Activées", action: false });
	assert.deepEqual(entreeMenu("denied"), { texte: "Bloquées par le navigateur : à réactiver dans ses réglages", action: false });
	assert.deepEqual(entreeMenu("indisponible"), { texte: "Ce navigateur ne permet pas les notifications", action: false });
	assert.equal(TEXTES.menu, "Notifications");
});

test("proposition : une fois, tant que la permission vaut « default », jamais après un refus", () => {
	assert.equal(peutProposer({ permission: "default", refus: false, dejaProposee: false }), true);
	assert.equal(peutProposer({ permission: "default", refus: true, dejaProposee: false }), false);
	assert.equal(peutProposer({ permission: "default", refus: false, dejaProposee: true }), false);
	for (let permission of ["granted", "denied", "indisponible"]) {
		assert.equal(peutProposer({ permission, refus: false, dejaProposee: false }), false, permission);
	}
	assert.equal(TEXTES.proposition, "Tu veux être prévenu(e) quand on te mentionne ?");
	assert.equal(TEXTES.activer, "Activer");
	assert.equal(TEXTES.nonMerci, "Non merci");
	assert.equal(CLE_REFUS, "aurasync_tchat_notif_refus");
});

test("textes : français, tutoiement, jamais « IRC » ni « membre » ni vouvoiement", () => {
	let tous = Object.values(TEXTES).map((t) => (typeof t === "function" ? t("X") : t));
	for (let t of tous) {
		assert.doesNotMatch(t, /\bIRC\b|membre|\bvous\b|\bvotre\b|Activez|New |message from/i, t);
	}
});
