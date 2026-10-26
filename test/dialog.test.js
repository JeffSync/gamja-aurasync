/*
 * Dialogue du motif (D-058) : Entree n'envoie qu'un motif non vide, et le
 * dialogue passe au-dessus de tout le theme (aurasync-theme.css, D-007).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import MotifForm from "../components/motif-form.js";
import Dialog from "../components/dialog.js";

function soumettre(motif) {
	let envoyes = [];
	let form = new MotifForm({ action: "kick", nick: "Kahen", onSubmit: (m) => envoyes.push(m) });
	form.state.motif = motif;
	let empeche = false;
	form.handleSubmit({ preventDefault: () => { empeche = true; } });
	assert.ok(empeche, "pas de rechargement de la page");
	return envoyes;
}

test("Entrée : rien ne part sans motif", () => {
	assert.deepEqual(soumettre(""), []);
	assert.deepEqual(soumettre("   "), []);
	assert.deepEqual(soumettre(" spam répété "), ["spam répété"]);
});

test("Échap ferme le dialogue, les autres touches non", () => {
	let fermetures = 0;
	let dialog = new Dialog({ onDismiss: () => fermetures++ });
	dialog.handleKeyDown({ key: "Enter" });
	assert.equal(fermetures, 0);
	dialog.handleKeyDown({ key: "Escape" });
	assert.equal(fermetures, 1);
});

/* z-index de chaque regle du theme, par selecteur. */
function zIndex(css) {
	let regles = [];
	for (let [, selecteur, corps] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		let z = /z-index:\s*(\d+)/.exec(corps);
		if (z) {
			regles.push({ selecteur: selecteur.trim(), z: Number(z[1]) });
		}
	}
	return regles;
}

test("le dialogue est au-dessus de l'en-tête, des tiroirs et des menus", () => {
	let regles = zIndex(readFileSync(new URL("../aurasync-theme.css", import.meta.url), "utf8"));
	let dialog = regles.find((r) => r.selecteur === ".dialog");
	assert.ok(dialog, ".dialog a un z-index dans le thème");
	for (let r of regles) {
		if (r !== dialog) {
			assert.ok(dialog.z > r.z, r.selecteur + " (" + r.z + ") passe sous le dialogue (" + dialog.z + ")");
		}
	}
});

test("la croix du dialogue n'est pas en anglais", () => {
	let source = readFileSync(new URL("../components/dialog.js", import.meta.url), "utf8");
	assert.doesNotMatch(source, /"Close"/);
	assert.match(source, /title="Fermer"/);
});
