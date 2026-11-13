/*
 * Le symbole du genre apres le titre de la fiche (lot 8.2), dessine comme
 * sur la carte de profil du site (lib/fiche.js : GENRES, SILHOUETTE_AURA) :
 * SVG en ligne pour « Aura », aucune ressource externe. Nom accessible et
 * infobulle : « Homme », « Femme », « Aura ».
 */

import { html } from "../lib/index.js";
import { SILHOUETTE_AURA } from "../lib/fiche.js";

/* Une seule fiche ouverte a la fois : des identifiants fixes suffisent */
const ID = "asGenre";

export default function SymboleGenre(props) {
	let { genre } = props;
	if (!genre) {
		return null;
	}
	if (genre.genre !== "aura") {
		return html`<span
			class=${"symbole-genre glyphe " + genre.genre}
			role="img"
			aria-label=${genre.libelle}
			title=${genre.libelle}
		>${genre.caractere}</span>`;
	}
	let [large, fin] = SILHOUETTE_AURA.traits;
	let n = SILHOUETTE_AURA.degrade.length - 1;
	return html`
		<svg class="symbole-genre aura" viewBox="0 0 24 24" role="img" aria-label=${genre.libelle}>
			<title>${genre.libelle}</title>
			<defs>
				<linearGradient id=${ID + "-g"} x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
					${SILHOUETTE_AURA.degrade.map((c, i) => html`<stop offset=${String(i / n)} stop-color=${c}/>`)}
				</linearGradient>
				<filter id=${ID + "-f"} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation=${large.flou}/></filter>
				<filter id=${ID + "-l"} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation=${fin.flou}/></filter>
			</defs>
			<g class="respire" fill="none" stroke=${"url(#" + ID + "-g)"} stroke-linecap="round" stroke-linejoin="round">
				<path d=${SILHOUETTE_AURA.trace} stroke-width=${large.largeur} opacity=${large.opacite} filter=${"url(#" + ID + "-f)"}/>
				<path d=${SILHOUETTE_AURA.trace} stroke-width=${fin.largeur} opacity=${fin.opacite} filter=${"url(#" + ID + "-l)"}/>
			</g>
		</svg>
	`;
}
