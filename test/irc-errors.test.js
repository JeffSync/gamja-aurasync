/*
 * Tests de lib/irc-errors.js (D-056), sans dependance : node --test.
 *
 * Chaque motif est couvert par un texte reel d'UnrealIRCd 6.2.7 ou
 * d'Anope 2.0.20 ; le repli, par des textes inconnus ; et aucune sortie
 * ne doit contenir « IRC ».
 */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
	translateError, translateClosing, translateKickReason, analyseKick, translateClientError,
	isRefusal, REPLI_ERREUR, REPLI_FIN, MOTIF_NON_PRECISE as MOTIF, CONNEXION_PERDUE, MESSAGES, MOTIFS as TABLE,
} from "../lib/irc-errors.js";

let journal;
beforeEach(() => {
	journal = mock.method(console, "error", () => {});
});
afterEach(() => {
	mock.restoreAll();
});

const NOTRE_RAISON = "Les services du t'Chat sont réservés à l'équipe.";

/* [code, texte d'origine, traduction attendue] — un par motif. */
const MOTIFS = [
	["531", "Message blocked: " + NOTRE_RAISON, NOTRE_RAISON],
	["531", "DCC blocked: fichier.exe", "Ce fichier ne peut pas être envoyé."],
	["531", "User does not accept private messages containing swearing", "Ce membre refuse les messages privés contenant des grossièretés."],
	["531", "User does not accept private messages", "Ce membre n'accepte pas les messages privés."],
	["531", "User does not accept CTCPs", "Ce membre n'accepte pas ce type de message."],
	["531", "You must identify to a registered nick to private message this user", "Ce membre n'accepte que les messages des comptes identifiés."],
	["531", "You must be connected via TLS to message this user", "Ce membre n'accepte que les connexions sécurisées."],
	["531", "Recipient is not connected via TLS and you are +Z", "Ce membre n'a pas de connexion sécurisée : ton message ne lui a pas été envoyé."],
	["404", "Message blocked due to a text ban (#aide)", "Ce message contient un texte interdit dans ce salon."],
	["404", "Message blocked: " + NOTRE_RAISON, NOTRE_RAISON],
	/* ~quiet (D-059) : « :serveur 404 Kahen #aide :You are banned (#aide) » */
	["404", "You are banned (#aide)", "Tu ne peux plus écrire dans ce salon."],
	["404", "You need voice (+v) (#aide)", "Ce salon est modéré : seuls les membres autorisés peuvent y écrire."],
	["404", "You must have a registered nick (+r) to talk on this channel (#aide)", "Seuls les comptes identifiés peuvent écrire dans ce salon."],
	["404", "No external channel messages (#aide)", "Rejoins le salon pour y écrire."],
	["404", "Color is not permitted in this channel (#aide)", "Les couleurs ne sont pas autorisées dans ce salon."],
	["404", "Control codes (color/bold/underline/italic/reverse) are not permitted in this channel (#aide)", "La mise en forme (gras, couleurs…) n'est pas autorisée dans ce salon."],
	["404", "CTCPs are not permitted in this channel (#aide)", "Ce type de message n'est pas autorisé dans ce salon."],
	["404", "NOTICEs are not permitted in this channel (#aide)", "Ce type de message n'est pas autorisé dans ce salon."],
	["404", "Swearing is not permitted in this channel (#aide)", "Les grossièretés ne sont pas autorisées dans ce salon."],
	["404", "Flooding (Your last message is too similar to previous ones) (#aide)", "Message non envoyé : il ressemble trop aux précédents."],
	["404", "Flooding (Limit is 7 lines per 15 seconds) (#aide)", "Message non envoyé : tu écris trop vite. Patiente un instant."],
	["404", "Channel is being flooded. Message not delivered. (#aide)", "Le salon est saturé, ton message n'a pas été transmis. Réessaie dans un instant."],
	["972", "Kahen is a channel operator", "Tu ne peux pas expulser un opérateur du salon."],
	["972", "Kahen is a channel owner", "Tu ne peux pas expulser un opérateur du salon."],
	["972", "Kahen is a halfop", "Tu ne peux pas expulser un modérateur du salon."],
	["972", "ChanServ is a Service Bot", "Tu ne peux pas expulser un service du t'Chat."],
	["972", "You cannot change the topic on #aide while being banned", "Tu ne peux pas changer le sujet d'un salon dont tu es banni(e)."],
	["972", "Voice (+v) or higher is required in order to change the topic on #aide (channel is +m)", "Ce salon est modéré : tu ne peux pas en changer le sujet."],
	["972", "Command blocked: " + NOTRE_RAISON, NOTRE_RAISON],
	["972", "Message rejected, your IRC client MUST use UTF-8 encoding on this network", "Message refusé : il contient des caractères non pris en charge."],
	["974", "You are not an IRC operator", "Ce réglage est réservé à l'équipe du t'Chat."],
	["974", "+i must be set", "Ce réglage demande que le salon soit sur invitation."],
	["696", "Channel key contains forbidden characters or is too long", "La clé du salon contient des caractères interdits, ou elle est trop longue."],
	["696", "Channel limit (+l) needs to be a positive number", "La limite du salon doit être un nombre positif."],
];

const FINS = [
	["Closing Link: Kahen[1.2.3.4] (Killed by Jeff (spam répété))", "Tu as été déconnecté(e) par l'équipe : spam répété"],
	["Closing Link: Kahen[1.2.3.4] (Killed by NickServ (Services nickname-enforcer kill))", "Tu as été déconnecté(e) : ce pseudo appartient à un autre compte."],
	["Closing Link: Kahen[1.2.3.4] (Killed by OperServ (Q-Lined: pseudo réservé))", "Tu as été déconnecté(e) : ce pseudo est réservé."],
	["Closing Link: Kahen[1.2.3.4] (Killed by OperServ (Session limit exceeded))", "Trop de connexions simultanées depuis ton adresse."],
	["Closing Link: Kahen[1.2.3.4] (Killed by OperServ (Defcon session limit exceeded))", "Trop de connexions simultanées depuis ton adresse."],
	["Closing Link: Kahen[1.2.3.4] (Killed by irc.aurasync.fr (Too many invalid passwords))", "Trop de tentatives d'identification."],
	["Closing Link: Kahen[1.2.3.4] (Killed (raison masquée))", "Tu as été déconnecté(e) par l'équipe : motif non précisé"],
	["Closing Link: Kahen[1.2.3.4] (Killed by OperServ (Some unknown service reason))", "Tu as été déconnecté(e) par l'équipe : motif non précisé"],
	["Closing Link: Kahen[1.2.3.4] (You are not welcome on this network. G-Lined: spam. Email abuse@example.org for more information. [ID: 1])", "Ton accès au t'Chat est refusé."],
	["Closing Link: Kahen[1.2.3.4] (G-Lined)", "Ton accès au t'Chat est refusé."],
	["Closing Link: Kahen[1.2.3.4] (Ping timeout: 180 seconds)", CONNEXION_PERDUE],
	["Closing Link: Kahen[1.2.3.4] (Excess Flood)", "Tu as été déconnecté(e) : trop de messages envoyés d'un coup."],
	["Closing Link: Kahen[1.2.3.4] (Max SendQ exceeded)", "Tu as été déconnecté(e) : trop de messages envoyés d'un coup."],
	["Closing Link: [1.2.3.4] (Throttled: Reconnecting too fast - Email abuse@example.org for more information.)", "Trop de connexions depuis ton adresse. Patiente une minute avant de revenir."],
	["Closing Link: [1.2.3.4] (Too many connections from your IP [maxperip])", "Trop de connexions depuis ton adresse. Patiente une minute avant de revenir."],
	["Closing Link: [1.2.3.4] (Too many unknown connections from your IP)", "Trop de connexions depuis ton adresse. Patiente une minute avant de revenir."],
	["Closing Link: [1.2.3.4] (Registration Timeout)", "La connexion au t'Chat n'a pas abouti. Recharge la page."],
];

/* Textes qui portent « IRC » : aucun ne doit le laisser passer. */
const AVEC_IRC = [
	["481", "Permission Denied- You do not have the correct IRC operator privileges"],
	["520", "Cannot join channel #equipe (IRCops only)"],
	["974", "You are not an IRC operator"],
	["972", "Message rejected, your IRC client MUST use UTF-8 encoding on this network"],
	["531", "Message blocked: Utilise un vrai client IRC"],
	["404", "Message blocked: IRC interdit"],
	["972", "Command blocked: ircop seulement"],
	["999", "Unknown IRC thing"],
	["FAIL", "IRC something failed"],
];

test("chaque motif traduit son texte", () => {
	for (let [code, texte, attendu] of MOTIFS) {
		assert.equal(translateError(code, texte), attendu, `${code} « ${texte} »`);
	}
});

test("chaque motif de la table est couvert par un texte d'exemple", () => {
	for (let [code, motifs] of Object.entries(TABLE)) {
		for (let [motif] of motifs) {
			let couvert = MOTIFS.some(([c, texte]) => c === code && motif.test(texte));
			assert.ok(couvert, `${code} ${motif} sans exemple`);
		}
	}
});

test("notre spamfilter s'affiche sans le prefixe « Message blocked: »", () => {
	let sortie = translateError("531", "Message blocked: " + NOTRE_RAISON);
	assert.equal(sortie, NOTRE_RAISON);
	assert.doesNotMatch(sortie, /blocked/i);
});

test("474 a la forme neutre, 520 reste « sur invitation »", () => {
	assert.equal(translateError("474", "Cannot join channel (+b)"), "Tu ne peux pas rejoindre ce salon car tu es banni(e).");
	assert.equal(translateError("520", "Cannot join channel #equipe (IRCops only)"), "Ce salon est sur invitation.");
});

test("un code connu sans motif garde sa traduction, sans journal", () => {
	assert.equal(translateError("471", "Cannot join channel (+l)"), "Ce salon est complet.");
	assert.equal(journal.mock.callCount(), 0);
});

test("repli : un code inconnu donne la phrase generique, et le detail part en console", () => {
	let sortie = translateError("999", "Something went wrong");
	assert.equal(sortie, REPLI_ERREUR);
	assert.equal(journal.mock.callCount(), 1);
	let args = journal.mock.calls[0].arguments;
	assert.ok(args.includes("999"), "le code est journalise");
	assert.ok(args.includes("Something went wrong"), "le texte d'origine est journalise");
});

test("repli : FAIL et texte vide", () => {
	assert.equal(translateError("FAIL", "CHATHISTORY INVALID_PARAMS :Bad params"), REPLI_ERREUR);
	assert.equal(translateError("999"), REPLI_ERREUR);
	assert.equal(translateError("999", ""), REPLI_ERREUR);
});

test("repli : une raison inconnue d'un code a motifs donne la traduction du code", () => {
	assert.equal(translateError("404", "Some new reason (#aide)"), MESSAGES["404"]);
	assert.equal(translateError("531", "Some new reason"), MESSAGES["531"]);
	assert.equal(translateError("972", "Something else"), MESSAGES["972"]);
	assert.equal(journal.mock.callCount(), 3);
});

test("fins de connexion", () => {
	for (let [texte, attendu] of FINS) {
		assert.equal(translateClosing(texte), attendu, texte);
	}
});

test("repli des fins de connexion", () => {
	assert.equal(translateClosing("Closing Link: Kahen[1.2.3.4] (Something new)"), REPLI_FIN);
	assert.equal(translateClosing("Server going down"), REPLI_FIN);
	assert.equal(translateClosing(""), REPLI_FIN);
	assert.equal(translateClosing(undefined), REPLI_FIN);
	assert.equal(journal.mock.callCount(), 4);
});

test("raisons de KICK", () => {
	assert.equal(translateKickReason("", "Jeff"), MOTIF);
	assert.equal(translateKickReason(undefined, "Jeff"), MOTIF);
	assert.equal(translateKickReason("Jeff", "Jeff"), MOTIF, "sans raison, le serveur met le pseudo de l'auteur");
	assert.equal(translateKickReason("Flooding (Limit is 7 lines per 15 seconds)", "irc.aurasync.fr"), "trop de messages en peu de temps");
	assert.equal(translateKickReason("Flooding (Your last message is too similar to previous ones)", "irc.aurasync.fr"), "messages répétés");
	assert.equal(translateKickReason("You are not permitted to be on this channel.", "ChanServ"), "salon réservé");
	assert.equal(translateKickReason("User has been banned from the channel", "ChanServ"), "banni(e) du salon");
	assert.equal(translateKickReason("Requested", "ChanServ"), MOTIF);
	assert.equal(translateKickReason("Some new Anope reason", "ChanServ"), MOTIF);
	assert.equal(translateKickReason("Some new server reason", "irc.aurasync.fr"), MOTIF);
	assert.equal(translateKickReason("calme-toi", "Jeff"), "calme-toi", "une raison ecrite par l'equipe reste");
});

/* Raisons par defaut d'Anope 2.0.20, relevees dans les sources. */
const KICKS_ANOPE = [
	["ChanServ", "This channel has been suspended.", "salon suspendu"],
	["ChanServ", "This channel may not be used.", "salon suspendu"],
	["OperServ", "This channel has been forbidden: spam", "salon interdit"],
	["AuraBot", "Don't use bolds on this channel!", "pas de gras dans ce salon"],
	["AuraBot", "Don't use colors on this channel!", "pas de couleurs dans ce salon"],
	["AuraBot", "Don't use reverses on this channel!", "pas de texte inversé dans ce salon"],
	["AuraBot", "Don't use italics on this channel!", "pas d'italique dans ce salon"],
	["AuraBot", "Don't use underlines on this channel!", "pas de soulignement dans ce salon"],
	["AuraBot", "Turn caps lock OFF!", "trop de majuscules"],
	["AuraBot", "Watch your language!", "langage inapproprié"],
	["AuraBot", "Don't use the word \"bite\" on this channel!", "mot interdit dans ce salon"],
	["AuraBot", "Stop flooding!", "trop de messages en peu de temps"],
	["AuraBot", "Stop repeating yourself!", "messages répétés"],
	["AuraBot", "Don't use AMSGs!", "même message envoyé dans plusieurs salons"],
];

test("KICK : raisons par défaut d'Anope traduites, auteur inchangé", () => {
	for (let [auteur, texte, attendu] of KICKS_ANOPE) {
		assert.deepEqual(analyseKick(texte, auteur), { auteur, raison: attendu }, texte);
	}
	assert.equal(journal.mock.callCount(), 0);
});

test("KICK signé (SIGNKICK) : le vrai auteur est le pseudo de la signature", () => {
	/* !kb sans motif via AuraBot : signkickformat « %m (%n) ». */
	assert.deepEqual(analyseKick("Requested (Jeff)", "AuraBot"), { auteur: "Jeff", raison: MOTIF });
	assert.deepEqual(analyseKick("Requested (Jeff)", "ChanServ"), { auteur: "Jeff", raison: MOTIF });
	/* Motif ecrit par l'equipe, parentheses comprises. */
	assert.deepEqual(analyseKick("calme-toi (Jeff)", "AuraBot"), { auteur: "Jeff", raison: "calme-toi" });
	assert.deepEqual(analyseKick("spam (pub) (Jeff)", "AuraBot"), { auteur: "Jeff", raison: "spam (pub)" });
	/* Expulsion par masque, signee ou non : le masque disparait. */
	assert.deepEqual(analyseKick("Requested (Matches *!*@1.2.3.4) (Jeff)", "AuraBot"), { auteur: "Jeff", raison: MOTIF });
	assert.deepEqual(analyseKick("Requested (Matches *!*@1.2.3.4)", "AuraBot"), { auteur: "AuraBot", raison: MOTIF });
	assert.deepEqual(analyseKick("dehors (Matches *!*@1.2.3.4) (Jeff)", "AuraBot"), { auteur: "Jeff", raison: "dehors" });
	/* OperServ KICK : « Jeff (motif) ». */
	assert.deepEqual(analyseKick("Jeff (calme-toi)", "OperServ"), { auteur: "Jeff", raison: "calme-toi" });
	/* ChanServ ENFORCE. */
	assert.deepEqual(analyseKick("RESTRICTED enforced by Jeff", "ChanServ"), { auteur: "Jeff", raison: "salon réservé" });
	assert.deepEqual(analyseKick("REGONLY enforced by Jeff", "ChanServ"), { auteur: "Jeff", raison: "salon réservé aux comptes identifiés" });
	assert.deepEqual(analyseKick("SSLONLY enforced by Jeff", "ChanServ"), { auteur: "Jeff", raison: "salon réservé aux connexions sécurisées" });
	assert.deepEqual(analyseKick("BANS enforced by Jeff", "ChanServ"), { auteur: "Jeff", raison: "banni(e) du salon" });
	assert.deepEqual(analyseKick("LIMIT enforced by Jeff", "ChanServ"), { auteur: "Jeff", raison: "salon complet" });
	assert.equal(journal.mock.callCount(), 0);
});

test("KICK : AuraBot est un service, son anglais inconnu ne s'affiche pas", () => {
	assert.deepEqual(analyseKick("Some new BotServ reason!", "AuraBot"), { auteur: "AuraBot", raison: MOTIF });
	assert.equal(journal.mock.callCount(), 1);
});

test("KICK : un membre de l'équipe en direct n'est pas « désigné » par ses parenthèses", () => {
	assert.deepEqual(analyseKick("calme-toi (Kahen)", "Jeff"), { auteur: "Jeff", raison: "calme-toi (Kahen)" });
	assert.deepEqual(analyseKick("Jeff", "Jeff"), { auteur: "Jeff", raison: MOTIF });
});

test("erreurs du client : IRCError traduite, autres erreurs inchangees", () => {
	let msg = { command: "ERROR", params: ["Closing Link: Kahen[1.2.3.4] (Ping timeout: 180 seconds)"] };
	assert.equal(translateClientError({ msg }), CONNEXION_PERDUE);
	assert.equal(translateClientError({ msg: { command: "904", params: ["Kahen", "SASL authentication failed"] } }), MESSAGES["904"]);
	assert.equal(translateClientError({ msg: { command: "433", params: [] } }), MESSAGES["433"]);
	let autre = new Error("Erreur de connexion");
	assert.equal(translateClientError(autre), autre);
	assert.equal(translateClientError("texte"), "texte");
});

test("la traduction ne touche jamais aux parametres recus (D-021)", () => {
	let msg = { command: "531", params: ["Kahen", "NickServ", "Message blocked: " + NOTRE_RAISON] };
	let copie = structuredClone(msg);
	translateClientError({ msg });
	assert.deepEqual(msg, copie);
});

test("696, 972 et 974 sont des refus a afficher", () => {
	assert.ok(isRefusal("696"));
	assert.ok(isRefusal("972"));
	assert.ok(isRefusal("974"));
	assert.ok(!isRefusal("404"));
	assert.ok(!isRefusal("001"));
});

test("aucune sortie ne contient « IRC »", () => {
	let sorties = [];
	for (let [code, texte] of [...MOTIFS, ...AVEC_IRC]) {
		sorties.push(translateError(code, texte));
	}
	for (let [texte] of FINS) {
		sorties.push(translateClosing(texte));
	}
	sorties.push(translateClosing("Closing Link: Kahen[1.2.3.4] (Killed by Jeff (va sur IRC))"));
	sorties.push(translateClosing("Closing Link: Kahen[1.2.3.4] (IRC down)"));
	sorties.push(translateKickReason("IRC n'est pas ton ami", "Jeff"));
	sorties.push(translateKickReason("IRC n'est pas ton ami (Jeff)", "AuraBot"));
	sorties.push(...Object.values(MESSAGES), REPLI_ERREUR, REPLI_FIN);
	for (let sortie of sorties) {
		assert.doesNotMatch(sortie, /IRC/i, sortie);
	}
});

/*
 * Noms AuraSync des services (D-061) : avant et apres la bascule d'Anope,
 * les deux jeux de noms sont des services. Leur anglais inconnu ne
 * s'affiche jamais.
 */
const ANCIENS = ["NickServ", "ChanServ", "MemoServ", "OperServ", "BotServ", "HostServ"];
const NOUVEAUX = ["PseudoSync", "SalonSync", "MemoSync", "OperSync", "BotSync", "HostSync"];

test("D-061 : KILL d'un service, ancien ou nouveau nom, à raison inconnue : motif non précisé", () => {
	for (let nom of [...ANCIENS, ...NOUVEAUX]) {
		assert.equal(
			translateClosing(`Closing Link: Kahen[1.2.3.4] (Killed by ${nom} (Some unknown service reason))`),
			"Tu as été déconnecté(e) par l'équipe : motif non précisé",
			nom,
		);
	}
	assert.equal(
		translateClosing("Closing Link: Kahen[1.2.3.4] (Killed by PseudoSync (Services nickname-enforcer kill))"),
		"Tu as été déconnecté(e) : ce pseudo appartient à un autre compte.",
	);
});

test("D-061 : KICK d'un service, ancien ou nouveau nom, à raison inconnue : motif non précisé", () => {
	for (let nom of [...ANCIENS, ...NOUVEAUX]) {
		assert.deepEqual(analyseKick("Some new English reason", nom), { auteur: nom, raison: MOTIF }, nom);
	}
	assert.deepEqual(
		analyseKick("You are not permitted to be on this channel.", "SalonSync"),
		{ auteur: "SalonSync", raison: "salon réservé" },
	);
	assert.deepEqual(analyseKick("Requested (Jeff)", "SalonSync"), { auteur: "Jeff", raison: MOTIF });
	assert.deepEqual(analyseKick("RESTRICTED enforced by Jeff", "SalonSync"), { auteur: "Jeff", raison: "salon réservé" });
});

test("D-061 : OperSync KICK signe « Jeff (motif) », comme OperServ", () => {
	for (let nom of ["OperServ", "OperSync"]) {
		assert.deepEqual(analyseKick("Jeff (calme-toi)", nom), { auteur: "Jeff", raison: "calme-toi" }, nom);
	}
});

test("D-061 : un membre au nom voisin n'est pas un service, son motif reste", () => {
	assert.deepEqual(analyseKick("calme-toi", "PseudoSyncFan"), { auteur: "PseudoSyncFan", raison: "calme-toi" });
	assert.equal(
		translateClosing("Closing Link: Kahen[1.2.3.4] (Killed by SyncFan (spam répété))"),
		"Tu as été déconnecté(e) par l'équipe : spam répété",
	);
});
