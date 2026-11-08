/*
 * Colonne et en-tete du salon (D-066, note du 8 novembre au soir ; lot 4g) :
 * la croix « Quitter #salon » a la place de « Partir », le nombre de
 * personnes et « Réglages » en tete de la colonne, les titres de groupe
 * centres, « Liste des salons », et le tiroir mobile.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis.window || {};
globalThis.fetch = () => new Promise(() => {});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { lireCatalogue } = await import("../lib/selection.js");
const { BufferType, ServerStatus } = await import("../state.js");
const channels = await import("../components/aurasync-channels.js");
const { default: BufferHeader } = await import("../components/buffer-header.js");
const { default: BufferList } = await import("../components/buffer-list.js");
const { default: TeteColonne } = await import("../components/tete-colonne.js");

const THEME = readFileSync(new URL("../aurasync-theme.css", import.meta.url), "utf8");
const APP = readFileSync(new URL("../components/app.js", import.meta.url), "utf8");

function catalogue() {
	return lireCatalogue({
		categories: [
			{ id: "principaux", label: "Salons principaux", channels: [
				{ name: "#AuraSync", display: "#AuraSync", label: "AuraSync", fixed: true, discreet: false },
				{ name: "#aide", display: "#Aide", label: "Aide", discreet: false },
				{ name: "#abus", display: "#Abus", label: "Abus", discreet: true, sensible: true },
			] },
			{ id: "thematiques", label: "Thématiques", channels: [
				{ name: "#addictions", display: "#Addictions", label: "Addictions", discreet: true, remember: false, sensible: true },
			] },
		],
		selection: [],
	});
}
beforeEach(() => channels.setCatalogue(catalogue()));

/* Rendu des composants, et recherche dans l'arbre htm. */
function deplier(v) {
	if (v === null || v === undefined || typeof v !== "object") {
		return v;
	}
	if (Array.isArray(v)) {
		return v.map(deplier);
	}
	if (typeof v.type === "function") {
		let C = v.type;
		return deplier(C.prototype && C.prototype.render ? new C(v.props).render() : C(v.props));
	}
	return { ...v, props: { ...v.props, children: deplier(v.props && v.props.children) } };
}
function tous(v, f, sortie = []) {
	if (Array.isArray(v)) {
		v.forEach((x) => tous(x, f, sortie));
	} else if (v && typeof v === "object") {
		if (f(v)) {
			sortie.push(v);
		}
		tous(v.props && v.props.children, f, sortie);
	}
	return sortie;
}
function texte(v) {
	if (v === null || v === undefined || typeof v === "boolean") {
		return "";
	}
	if (typeof v !== "object") {
		return String(v);
	}
	if (Array.isArray(v)) {
		return v.map(texte).join("");
	}
	return texte(v.props && v.props.children);
}
const classe = (nom) => (v) => typeof v.props?.class === "string" && v.props.class.split(/\s+/).includes(nom);

function entete(name, extra = {}) {
	return deplier(BufferHeader({
		buffer: { id: 2, type: BufferType.CHANNEL, name, topic: "Sujet", joined: true },
		server: { status: ServerStatus.REGISTERED, name: "aurasync" },
		memberCount: 2, canPart: true, pourToi: 0,
		onClose() {}, onJoin() {}, onToggleBufferList() {}, onToggleMemberList() {}, onToggleReglages() {},
		...extra,
	}));
}

test("croix : « Quitter #Aide », a la place de « Partir », 32 px au moins", () => {
	let fermer = 0;
	let v = entete("#aide", { onClose: () => fermer++ });
	let [croix] = tous(v, classe("hdr-quitter"));
	assert.ok(croix, "la croix est dans l'en-tete");
	assert.equal(croix.type, "button");
	assert.equal(croix.props["aria-label"], "Quitter #Aide");
	assert.equal(croix.props.title, "Quitter #Aide");
	assert.ok(classe("danger")(croix), "a la place du bouton « Partir », meme classe");
	assert.equal(tous(croix, (n) => n.type === "svg").length, 1);
	assert.doesNotMatch(texte(v), /Partir/);
	croix.props.onClick();
	assert.equal(fermer, 1, "meme geste qu'avant (la selection suit, D-065)");
	// Le dernier salon ne se quitte pas
	assert.equal(tous(entete("#aide", { canPart: false }), classe("hdr-quitter")).length, 0);
	let css = THEME.match(/#buffer-header \.actions button\.hdr-quitter \{([^}]*)\}/)[1];
	assert.match(css, /min-width: 32px;/);
	assert.match(css, /min-height: 32px;/);
});

test("compteur : le nombre, la phrase entiere pour les lecteurs d'ecran ; #Abus et #Addictions sous 3", () => {
	let c = channels.comptePersonnes;
	assert.deepEqual(c("#aide", 1), { texte: "1", label: "1 personne" });
	assert.deepEqual(c("#aide", 2), { texte: "2", label: "2 personnes" });
	for (let n of [0, 1, 2]) {
		assert.deepEqual(c("#abus", n), { texte: "< 3", label: "moins de 3 personnes" }, "#abus, " + n);
		assert.deepEqual(c("#addictions", n), { texte: "< 3", label: "moins de 3 personnes" });
	}
	assert.deepEqual(c("#abus", 3), { texte: "3", label: "3 personnes" });
	assert.deepEqual(c("#ABUS", 1).texte, "< 3", "casse ASCII");
	// Catalogue pas encore lu : #abus et #addictions restent discrets
	channels.setCatalogue(null);
	assert.equal(c("#abus", 1).texte, "< 3");
	assert.equal(c("#addictions", 2).label, "moins de 3 personnes");
	assert.equal(c("#jeux", 1).texte, "1");
});

test("tete de colonne : icone de profil et nombre ; sur #Abus, « moins de 3 personnes »", () => {
	let v = deplier(TeteColonne({ name: "#aide", nombre: 2, rang: null }));
	let [compte] = tous(v, classe("tete-compte"));
	assert.equal(compte.props.role, "img");
	assert.equal(compte.props["aria-label"], "2 personnes");
	assert.equal(texte(compte).trim(), "2");
	assert.equal(tous(compte, (n) => n.type === "svg").length, 1, "l'icone de profil");
	let abus = tous(deplier(TeteColonne({ name: "#abus", nombre: 1, rang: null })), classe("tete-compte"))[0];
	assert.equal(abus.props["aria-label"], "moins de 3 personnes");
	assert.equal(texte(abus).trim(), "< 3");
	assert.doesNotMatch(texte(abus), /\b1\b/, "jamais le chiffre");
	// L'en-tete mobile suit la meme regle
	let bouton = tous(entete("#abus", { memberCount: 1 }), classe("hdr-toggle-right"))[0];
	assert.equal(bouton.props["aria-label"], "Personnes du salon : moins de 3 personnes");
	assert.match(texte(bouton), /< 3/);
	// app.js : la tete de colonne remplace « N personnes »
	assert.match(APP, /<section id="member-list-header">\s*<\$\{TeteColonne\}/);
});

test("« Réglages » colle au nombre, pour % et @ seulement", () => {
	for (let rang of ["@", "%"]) {
		let ouvrir = 0;
		let v = deplier(TeteColonne({ name: "#jeux", nombre: 4, rang, reglagesOuverts: false, onToggleReglages: () => ouvrir++ }));
		let [b] = tous(v, classe("tete-reglages"));
		assert.ok(b, "bouton pour " + rang);
		assert.equal(b.props["aria-label"], "Réglages du salon");
		assert.equal(b.props["aria-expanded"], "false");
		assert.match(texte(b), /Réglages/);
		b.props.onClick();
		assert.equal(ouvrir, 1);
		// Juste apres le nombre, dans la meme tete
		let [tete] = tous(v, classe("tete-colonne"));
		let enfants = tete.props.children.flat(Infinity).filter((x) => x && typeof x === "object");
		assert.ok(classe("tete-compte")(enfants[0]) && classe("tete-reglages")(enfants[1]));
	}
	for (let rang of [null, undefined]) {
		assert.equal(tous(deplier(TeteColonne({ name: "#jeux", nombre: 4, rang })), classe("tete-reglages")).length, 0);
	}
	assert.match(APP, /<\$\{TeteColonne\}[\s\S]*?rang=\$\{rang\}[\s\S]*?onToggleReglages=\$\{this\.toggleReglages\}/);
	// Un clic sur l'un ou l'autre bouton n'est pas un clic « a cote » du menu
	assert.match(readFileSync(new URL("../components/salon-reglages.js", import.meta.url), "utf8"), /closest\("\.hdr-reglages, \.tete-reglages"\)/);
});

test("barre : titres de groupe centres (degrade, aura, trait), salons a gauche ; « Liste des salons »", () => {
	let v = deplier(BufferList({
		buffers: new Map([[2, { id: 2, server: 1, type: BufferType.CHANNEL, name: "#aide", unread: "none", joined: true }]]),
		servers: new Map([[1, { id: 1, status: ServerStatus.REGISTERED, users: new Map(), name: "AuraSync" }]]),
		bouncerNetworks: new Map(), activeBuffer: 2,
		onBufferClick() {}, onBufferClose() {}, onOpenChannelList() {},
	}));
	let [titre] = tous(v, classe("chan-group-title"));
	let [label] = tous(titre, classe("chan-group-label"));
	assert.equal(texte(tous(label, classe("texte"))[0]), "Salons principaux");
	assert.equal(tous(label, classe("aura"))[0].props["aria-hidden"], "true", "l'aura n'est pas lue");
	assert.equal(tous(label, classe("trait")).length, 1);
	let [meta] = tous(titre, classe("chan-group-meta"));
	assert.ok(tous(meta, classe("chan-group-count")).length === 1 && tous(meta, classe("chan-group-fleche")).length === 1, "compteur et fleche a droite");
	let bouton = tous(v, (n) => n.props && n.props.id === "chan-browse")[0];
	assert.equal(texte(bouton), "Liste des salons");
	// CSS : trois colonnes, le titre dans celle du milieu
	let regle = (sel) => THEME.match(new RegExp("\\n" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}"))[1];
	assert.match(regle(".chan-group-title"), /grid-template-columns: 1fr auto 1fr;/);
	assert.match(regle(".chan-group-label"), /grid-column: 2;[\s\S]*text-align: center;/);
	assert.match(regle(".chan-group-label .texte"), /background-clip: text;/);
	assert.match(regle(".chan-group-meta"), /grid-column: 3;[\s\S]*justify-self: end;/);
	assert.doesNotMatch(THEME, /#buffer-list li a[^{]*\{[^}]*text-align: center/, "les salons restent a gauche");
	// « Liste des salons » : le meme encadrement que le logo
	let degrade = "linear-gradient(120deg, var(--aura-cyan), var(--aura-violet)) border-box";
	assert.ok(regle("#aurasync-logo").includes(degrade) && regle("#chan-browse").includes(degrade));
});

test("tiroir mobile : « Réglages » joignable sans l'ouvrir ; sur ordinateur, hors de l'en-tete", () => {
	// Ordinateur : le bouton de l'en-tete est masque, la tete de colonne le remplace
	assert.match(THEME, /@media \(min-width: 768px\) \{\n\t\.hdr-reglages \{\n\t\tdisplay: none;\n\t\}\n\}/);
	// Mobile : l'en-tete garde ☰, le titre, la croix, « Réglages » et le bouton du tiroir
	let mobile = [...THEME.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
	assert.match(mobile, /\.hdr-reglages \{[^}]*grid-column: 4;/);
	assert.match(mobile, /\.hdr-toggle \{[^}]*display: flex;/);
	assert.doesNotMatch(mobile, /\.hdr-reglages \{[^}]*display: none/);
	for (let rang of ["@", "%"]) {
		let v = entete("#jeux", { rang });
		assert.equal(tous(v, classe("hdr-reglages")).length, 1, "dans l'en-tete pour " + rang);
	}
	assert.equal(tous(entete("#jeux", { rang: null }), classe("hdr-reglages")).length, 0);
	// Le tiroir s'ouvre sur la meme tete de colonne
	assert.match(APP, /id="member-list"[\s\S]*?id="member-list-header"[\s\S]*?TeteColonne/);
});

test("retouche de 23 h : la croix posee dans le bandeau du sujet, sans fond au repos", () => {
	let bloc = (sel) => THEME.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}"))[1];
	let repos = bloc("#buffer-header .actions button.hdr-quitter");
	assert.match(repos, /background: transparent;/);
	assert.match(repos, /border: 1px solid transparent;/);
	let survol = bloc("#buffer-header .actions button.hdr-quitter:hover,\n#buffer-header .actions button.hdr-quitter:focus-visible");
	assert.match(survol, /background: rgba/);
	assert.match(survol, /border-color: rgba/);
	// Ordinateur : le sujet couvre toute la largeur et garde la place de la
	// croix, posee dans la meme case
	let desc = bloc("#buffer-header:has(.hdr-quitter) .description");
	assert.match(desc, /grid-column: 1 \/ -1;/);
	assert.match(desc, /padding-right: 56px;/);
	let actions = bloc("#buffer-header:has(.hdr-quitter) .actions");
	assert.match(actions, /grid-column: 1 \/ -1;[\s\S]*justify-self: end;[\s\S]*align-self: center;/);
});
