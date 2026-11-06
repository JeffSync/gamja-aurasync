/*
 * L'insigne du role, dessine comme sur le profil du site (lib/insigne.js) :
 * SVG en ligne, aucune ressource externe. La couleur vient de `color` sur
 * l'element (currentColor), comme emblemTint sur le site.
 */

import { html } from "../lib/index.js";
import { ANNEAU, DEGRADE, TRAIT, valeur } from "../lib/insigne.js";

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
	return html`
		<svg
			class="role-emblem with-ring"
			width=${taille}
			height=${taille}
			viewBox="0 0 56 56"
			fill="none"
			stroke="currentColor"
			stroke-width=${TRAIT}
			aria-hidden="true"
		>
			<defs>
				<linearGradient id=${DEGRADE.id} ...${DEGRADE.attrs}>
					${DEGRADE.stops.map((s) => html`<stop ...${s}/>`)}
				</linearGradient>
			</defs>
			${trace(ANNEAU, TRAIT)}
			${insigne.traces.map((t) => trace(t, TRAIT))}
		</svg>
	`;
}
