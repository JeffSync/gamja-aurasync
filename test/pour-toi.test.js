/*
 * D-066, points 5 et 6 : ce qui est « pour toi ». Classement d'un message,
 * comptage par conversation, marques de la barre, total d'une categorie
 * repliee, pastille de ☰, et ton pseudo marque dans le texte.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};

const {
	natureMessage, compterPourToi, nombrePourToi, marqueBarre, totalCategorie,
	totalPourToi, libellePourToi, segmentsMarques,
} = await import("../lib/pour-toi.js");
const { highlightRanges, CaseMapping } = await import("../lib/irc.js");
const { BufferType, Unread } = await import("../state.js");

const msg = (extra = {}) => ({ command: "PRIVMSG", prefix: { name: "Kahen" }, params: ["#jeux", "salut"], ...extra });

test("natureMessage : mention, message privé, non-lu, et ce qui ne compte jamais", () => {
	assert.deepEqual(natureMessage(msg({ isHighlight: true })), { unread: Unread.HIGHLIGHT, pourToi: "mention" });
	assert.deepEqual(natureMessage(msg(), { versMoi: true }), { unread: Unread.HIGHLIGHT, pourToi: "prive" });
	assert.deepEqual(natureMessage(msg({ command: "NOTICE" }), { versMoi: true }), { unread: Unread.HIGHLIGHT, pourToi: "prive" });
	assert.deepEqual(natureMessage(msg()), { unread: Unread.MESSAGE, pourToi: null });
	// Une mention dans un message prive reste une mention
	assert.equal(natureMessage(msg({ isHighlight: true }), { versMoi: true }).pourToi, "mention");
	const rien = { unread: Unread.NONE, pourToi: null };
	assert.deepEqual(natureMessage(msg({ isHighlight: true, historique: true })), rien, "historique");
	assert.deepEqual(natureMessage(msg({ historique: true }), { versMoi: true }), rien, "message privé rejoué");
	assert.deepEqual(natureMessage(msg({ isHighlight: true, accueil: { texte: "x" } })), rien, "accueil");
	assert.deepEqual(natureMessage(msg({ accueil: { texte: "x" } }), { versMoi: true }), rien, "accueil en privé");
	assert.deepEqual(natureMessage(msg({ isHighlight: true }), { deMoi: true }), rien, "ses propres messages");
	assert.deepEqual(natureMessage(msg({ isHighlight: true }), { dejaLu: true }), rien, "déjà lu");
	for (let command of ["JOIN", "PART", "INVITE", "TOPIC", "MODE"]) {
		assert.deepEqual(natureMessage(msg({ command, isHighlight: true }), { versMoi: true }), rien, command);
	}
});

test("compterPourToi : du plus récent au premier déjà lu, sans soi ni historique", () => {
	let lu = msg({ tags: { lu: true }, isHighlight: true });
	let liste = [
		lu,
		msg({ isHighlight: true }),
		{ command: "JOIN", prefix: { name: "Léa" }, params: ["#jeux"] },
		msg({ prefix: { name: "Jeff" }, isHighlight: true }),
		msg(),
		msg({ isHighlight: true, historique: true }),
		msg({ isHighlight: true }),
	];
	let opts = { prive: false, deMoi: (n) => n === "Jeff", dejaLu: (m) => Boolean(m.tags && m.tags.lu) };
	assert.equal(compterPourToi(liste, opts), 2);
	assert.equal(compterPourToi([], opts), 0);
	// Conversation privee : chaque message de l'autre compte, pas les siens
	assert.equal(compterPourToi(liste, { ...opts, prive: true }), 3, "ni soi ni l historique");
	// Tout est lu
	assert.equal(compterPourToi(liste, { ...opts, dejaLu: () => true }), 0);
});

const buf = (type, unread, pourToi) => ({ type, unread, pourToi, name: "x" });

test("marques de la barre : point, badge « @n » et nombre rose, annoncés", () => {
	assert.equal(marqueBarre(buf(BufferType.CHANNEL, Unread.NONE)), null);
	assert.deepEqual(marqueBarre(buf(BufferType.CHANNEL, Unread.MESSAGE)), { genre: "point", texte: "", label: "Nouveaux messages" });
	assert.deepEqual(marqueBarre(buf(BufferType.CHANNEL, Unread.HIGHLIGHT, 1)), { genre: "mention", texte: "@1", label: "1 mention" });
	assert.deepEqual(marqueBarre(buf(BufferType.CHANNEL, Unread.HIGHLIGHT, 2)), { genre: "mention", texte: "@2", label: "2 mentions" });
	assert.deepEqual(marqueBarre(buf(BufferType.NICK, Unread.HIGHLIGHT, 1)), { genre: "prive", texte: "1", label: "1 message privé non lu" });
	assert.deepEqual(marqueBarre(buf(BufferType.NICK, Unread.HIGHLIGHT, 3)), { genre: "prive", texte: "3", label: "3 messages privés non lus" });
	// Apres un rechargement : l'etat revient sans son compte, on montre 1
	assert.equal(marqueBarre(buf(BufferType.CHANNEL, Unread.HIGHLIGHT, undefined)).texte, "@1");
	assert.equal(nombrePourToi(buf(BufferType.CHANNEL, Unread.HIGHLIGHT, 0)), 1);
	assert.equal(nombrePourToi(buf(BufferType.CHANNEL, Unread.MESSAGE, 4)), 0, "un compte sans mention ne s'affiche pas");
	// Le tampon du serveur est cache : jamais de marque
	assert.equal(marqueBarre(buf(BufferType.SERVER, Unread.HIGHLIGHT, 2)), null);
});

test("catégorie repliée : conversations à lire, rose s'il y a du « pour toi »", () => {
	assert.equal(totalCategorie([]), null);
	assert.equal(totalCategorie([buf(BufferType.CHANNEL, Unread.NONE)]), null);
	assert.deepEqual(totalCategorie([buf(BufferType.CHANNEL, Unread.MESSAGE), buf(BufferType.CHANNEL, Unread.NONE)]), {
		texte: "1", rose: false, label: "1 conversation à lire",
	});
	assert.deepEqual(totalCategorie([
		buf(BufferType.CHANNEL, Unread.MESSAGE),
		buf(BufferType.CHANNEL, Unread.HIGHLIGHT, 2),
		buf(BufferType.CHANNEL, Unread.MESSAGE),
	]), { texte: "3", rose: true, label: "3 conversations à lire, dont 2 messages pour toi" });
	assert.deepEqual(totalCategorie([buf(BufferType.NICK, Unread.HIGHLIGHT, 1)]), {
		texte: "1", rose: true, label: "1 conversation à lire, dont 1 message pour toi",
	});
});

test("pastille de ☰ : mentions et messages privés non lus, tampon du serveur exclu", () => {
	let liste = [
		buf(BufferType.CHANNEL, Unread.HIGHLIGHT, 2),
		buf(BufferType.CHANNEL, Unread.MESSAGE, 0),
		buf(BufferType.NICK, Unread.HIGHLIGHT, 1),
		buf(BufferType.NICK, Unread.NONE, 0),
		buf(BufferType.SERVER, Unread.HIGHLIGHT, 5),
	];
	assert.equal(totalPourToi(liste), 3);
	assert.equal(totalPourToi([]), 0);
	assert.equal(totalPourToi(new Map([[1, liste[0]]]).values()), 2, "accepte un itérateur");
	assert.equal(libellePourToi(1), "1 message pour toi");
	assert.equal(libellePourToi(3), "3 messages pour toi");
});

test("ton pseudo dans le texte : aux limites de mot, sans casse, jamais dans une adresse", () => {
	let cm = CaseMapping.RFC1459;
	assert.deepEqual(highlightRanges("salut Jeff, ça va jeff ?", "Jeff", cm), [[6, 10], [18, 22]]);
	assert.deepEqual(highlightRanges("Jefferson et Jeff_", "Jeff", cm), [], "pas dans un autre mot ni un pseudo voisin");
	assert.deepEqual(highlightRanges("JEFF!", "Jeff", cm), [[0, 4]]);
	assert.deepEqual(highlightRanges("va sur https://jeff.fr/jeff", "Jeff", cm), []);
	assert.deepEqual(highlightRanges("", "Jeff", cm), []);
	assert.deepEqual(highlightRanges("Jeff", "", cm), []);
	// Case mapping RFC 1459 : [ et { sont la meme lettre
	assert.deepEqual(highlightRanges("coucou {kahen}", "[Kahen]", cm), [[7, 14]]);
});

test("segmentsMarques : découpe sans perte, morceaux vides omis, marques invalides ignorées", () => {
	assert.deepEqual(segmentsMarques("salut Jeff !", [[6, 10]]), [
		{ texte: "salut ", moi: false }, { texte: "Jeff", moi: true }, { texte: " !", moi: false },
	]);
	assert.deepEqual(segmentsMarques("Jeff", [[0, 4]]), [{ texte: "Jeff", moi: true }]);
	assert.deepEqual(segmentsMarques("rien", []), [{ texte: "rien", moi: false }]);
	assert.deepEqual(segmentsMarques("rien", undefined), [{ texte: "rien", moi: false }]);
	assert.deepEqual(segmentsMarques("ab", [[1, 9], [0, 0]]), [{ texte: "ab", moi: false }]);
	let t = "Jeff et Jeff";
	let s = segmentsMarques(t, highlightRanges(t, "jeff", CaseMapping.ASCII));
	assert.equal(s.map((x) => x.texte).join(""), t);
	assert.deepEqual(s.filter((x) => x.moi).map((x) => x.texte), ["Jeff", "Jeff"]);
});
