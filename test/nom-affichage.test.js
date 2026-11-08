/*
 * Nom d'affichage des salons (D-071, note du 8 novembre apres-midi, voie A).
 *
 * Le t'Chat ecrit #Aide pour #aide dans la barre laterale, l'en-tete du
 * salon et le titre de l'onglet. Un salon hors catalogue garde son nom
 * brut, un message prive garde le pseudo. Le nom reel ne change nulle part
 * ailleurs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

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
globalThis.document = globalThis.document || { title: "" };

const { lireCatalogue } = await import("../lib/selection.js");
const channels = await import("../components/aurasync-channels.js");
const { default: BufferHeader } = await import("../components/buffer-header.js");
const { default: BufferList } = await import("../components/buffer-list.js");
const { default: App } = await import("../components/app.js");
const { BufferType, ServerStatus } = await import("../state.js");

function catalogue() {
	return lireCatalogue({
		categories: [
			{
				id: "principaux", label: "Salons principaux", channels: [
					{ name: "#AuraSync", display: "#AuraSync", label: "AuraSync", fixed: true },
					{ name: "#aide", display: "#Aide", label: "Aide" },
				],
			},
			{
				id: "thematiques", label: "Thématiques", channels: [
					// API plus ancienne : pas de nom d'affichage
					{ name: "#jeux", label: "Jeux" },
					// nom d'affichage qui ne serait pas le meme salon : refuse
					{ name: "#musique", display: "#Musiques", label: "Musique" },
				],
			},
			{
				id: "regions", label: "Régions", channels: [
					{ name: "#île-de-france", display: "#Île-de-France", label: "Île-de-France" },
					{ name: "#pays-de-la-loire", display: "#Pays-de-la-Loire", label: "Pays de la Loire" },
				],
			},
		],
		selection: [],
	});
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

function* noeuds(v) {
	if (Array.isArray(v)) {
		for (let x of v) {
			yield* noeuds(x);
		}
	} else if (v && typeof v === "object") {
		yield v;
		yield* noeuds(v.props && v.props.children);
	}
}

const serveur = { id: 1, status: ServerStatus.REGISTERED, users: new Map(), name: "AuraSync" };

function titreEnTete(buffer) {
	let rendu = BufferHeader({ buffer, server: serveur, user: null, pourToi: 0 });
	let titre = [...noeuds(rendu)].find((n) => n.props && n.props.class === "title");
	return texte(titre);
}

function titreOnglet(buffer) {
	let ctx = {
		baseTitle: "AuraSync",
		state: {
			activeBuffer: buffer.id,
			buffers: new Map([[buffer.id, { ...buffer, unread: "none" }]]),
			servers: new Map([[1, serveur]]),
			bouncerNetworks: new Map(),
		},
	};
	App.prototype.updateDocumentTitle.call(ctx);
	return document.title;
}

beforeEach(() => channels.setCatalogue(catalogue()));

test("channelDisplay : catalogue, équipe, hors catalogue", () => {
	assert.equal(channels.channelDisplay("#aide"), "#Aide");
	assert.equal(channels.channelDisplay("#AIDE"), "#Aide", "casse ASCII ramenée au catalogue");
	assert.equal(channels.channelDisplay("#île-de-france"), "#Île-de-France");
	assert.equal(channels.channelDisplay("#pays-de-la-loire"), "#Pays-de-la-Loire");
	assert.equal(channels.channelDisplay("#AuraSync"), "#AuraSync");
	assert.equal(channels.channelDisplay("#équipe"), "#Équipe");
	assert.equal(channels.channelDisplay("#administration"), "#Administration");
	assert.equal(channels.channelDisplay("#services"), "#Services");
	assert.equal(channels.channelDisplay("#cercle-de-lea"), "#cercle-de-lea", "hors catalogue : nom brut");
	assert.equal(channels.channelDisplay("#jeux"), "#jeux", "API sans nom d'affichage : le nom");
	assert.equal(channels.channelDisplay("#musique"), "#musique", "un autre salon que le nom : refusé");
});

test("avant la lecture du catalogue : le nom brut", () => {
	channels.setCatalogue(null);
	assert.equal(channels.channelDisplay("#aide"), "#aide");
	assert.equal(channels.channelDisplay("#équipe"), "#Équipe", "l'équipe ne dépend pas de l'API");
});

test("en-tête du salon : nom d'affichage ; message privé : le pseudo", () => {
	assert.equal(titreEnTete({ id: 2, server: 1, type: BufferType.CHANNEL, name: "#aide", topic: null }), "#Aide");
	assert.equal(titreEnTete({ id: 3, server: 1, type: BufferType.CHANNEL, name: "#équipe", topic: null }), "#Équipe");
	assert.equal(titreEnTete({ id: 4, server: 1, type: BufferType.CHANNEL, name: "#cercle-de-lea", topic: null }), "#cercle-de-lea");
	assert.equal(titreEnTete({ id: 5, server: 1, type: BufferType.NICK, name: "aide" }), "aide");
});

test("titre de l'onglet : nom d'affichage ; message privé : le pseudo", () => {
	assert.equal(titreOnglet({ id: 2, server: 1, type: BufferType.CHANNEL, name: "#île-de-france" }), "#Île-de-France · AuraSync");
	assert.equal(titreOnglet({ id: 3, server: 1, type: BufferType.CHANNEL, name: "#services" }), "#Services · AuraSync");
	assert.equal(titreOnglet({ id: 4, server: 1, type: BufferType.CHANNEL, name: "#inconnu" }), "#inconnu · AuraSync");
	assert.equal(titreOnglet({ id: 5, server: 1, type: BufferType.NICK, name: "Lea" }), "Lea · AuraSync");
});

test("barre latérale : #Pays-de-la-Loire, plus le libellé à espaces", () => {
	let salon = (id, name) => [id, { id, server: 1, type: BufferType.CHANNEL, name, unread: "none", joined: true }];
	let rendu = BufferList({
		buffers: new Map([salon(2, "#pays-de-la-loire"), salon(3, "#équipe"), salon(4, "#cercle-de-lea")]),
		servers: new Map([[1, serveur]]),
		bouncerNetworks: new Map(),
		activeBuffer: 2,
		onBufferClick() {},
		onBufferClose() {},
		onOpenChannelList() {},
	});
	let t = texte(rendu);
	assert.match(t, /#Pays-de-la-Loire/);
	assert.doesNotMatch(t, /Pays de la Loire/);
	assert.match(t, /#Équipe/);
	assert.match(t, /#cercle-de-lea/);
});
