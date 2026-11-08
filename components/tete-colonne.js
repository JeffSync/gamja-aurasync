import { html } from "../lib/index.js";
import { comptePersonnes } from "./aurasync-channels.js";

/*
 * Tete de la colonne des personnes (D-066, note du 8 novembre au soir) :
 * une icone de profil et le nombre (« 2 »), la phrase entiere pour les
 * lecteurs d'ecran (« 2 personnes » ; « moins de 3 personnes » sur un salon
 * discret, D-065) ; collé a cote, le bouton « Réglages » pour % et @ du
 * salon (D-068). Ils ont quitte l'en-tete du salon sur ordinateur. Sur
 * mobile, la colonne est un tiroir : sa tete est la meme, et l'en-tete
 * garde ses deux boutons compacts (personnes, reglages), pour que
 * « Réglages » reste joignable sans ouvrir le tiroir.
 */
export default function TeteColonne(props) {
	let compte = comptePersonnes(props.name, props.nombre);
	let reglages = null;
	if (props.rang) {
		reglages = html`
			<button
				class="tete-reglages ${props.reglagesOuverts ? "ouvert" : ""}"
				type="button"
				onClick=${props.onToggleReglages}
				aria-label="Réglages du salon"
				aria-expanded=${props.reglagesOuverts ? "true" : "false"}
				title="Réglages du salon"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
					stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M4 7h9"/><path d="M17 7h3"/><path d="M15 9.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z"/>
					<path d="M4 17h3"/><path d="M11 17h9"/><path d="M9 19.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z"/>
				</svg>
				<span>Réglages</span>
			</button>
		`;
	}
	return html`
		<div class="tete-colonne">
			<span class="tete-compte" role="img" aria-label=${compte.label} title=${compte.label}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
					stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 12a4 4 0 100-8 4 4 0 000 8z"/>
					<path d="M4.5 20.5c0-3.8 3.4-6.2 7.5-6.2s7.5 2.4 7.5 6.2"/>
				</svg>
				<span aria-hidden="true">${compte.texte}</span>
			</span>
			${reglages}
		</div>
	`;
}
