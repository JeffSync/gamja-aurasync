/*
 * L'insigne du role, dessine comme sur le profil du site (lib/insigne.js) :
 * SVG en ligne, aucune ressource externe. La couleur vient de `color` sur
 * l'element (currentColor), comme emblemTint sur le site.
 */

import { html } from "../lib/index.js";
import { ANNEAU, CERCLES_ANNEAU, DEGRADE, traitDe, valeur } from "../lib/insigne.js";

function trace(t, trait) {
	let attrs = {};
	for (let [k, v] of Object.entries(t.attrs)) {
		attrs[k] = valeur(v, trait);
	}
	let enfants = (t.enfants || []).map((e) => trace(e, trait));
	return html`<${t.tag} ...${attrs}>${enfants}</${t.tag}>`;
}

export default function Insigne(props) {
	let { insigne, taille } = props;
	if (!insigne) {
		return null;
	}
	let trait = traitDe(insigne.role, taille);
	let traces = taille < 24 ? insigne.petits : insigne.traces;
	let anneau = { ...ANNEAU, enfants: [insigne.role === "founder" ? CERCLES_ANNEAU.fondateur : CERCLES_ANNEAU.equipe] };
	return html`
		<svg
			class="role-emblem with-ring"
			width=${taille}
			height=${taille}
			viewBox="0 0 56 56"
			fill="none"
			stroke="currentColor"
			stroke-width=${trait}
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id=${DEGRADE.id} ...${DEGRADE.attrs}>
					${DEGRADE.stops.map((s) => html`<stop ...${s}/>`)}
				</linearGradient>
			</defs>
			${trace(anneau, trait)}
			${traces.map((t) => trace(t, trait))}
		</svg>
	`;
}
