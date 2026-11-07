/*
 * Les listes du menu « Réglages » (etape 5, lot C, D-068 points 5 et 6) :
 * Bannissements, Personnes muettes, Exemptions (@, repliee par defaut),
 * Invitations permanentes (salon +i). Logique dans lib/listes.js.
 *
 * Rien n'est envoye d'ici : onRetirer et onAjouter passent par
 * components/app.js, qui verifie le rang. Une ligne retiree ne disparait
 * qu'a l'echo du serveur (MODE recu, lib/listes.js appliquerListe).
 */

import { html, Component } from "../lib/index.js";
import {
	LECTURE_LISTE, LISTE_ILLISIBLE, LETTRES, TITRES, VIDES, compteur, rubriques, vueEntree,
} from "../lib/listes.js";
import { POUR_BANNIR } from "../lib/salon-reglages.js";

function Refus(props) {
	if (!props.texte) {
		return null;
	}
	return html`<p class="reglages-refus" role="alert">${props.texte}</p>`;
}

function Entree(props) {
	let { vue, lettre, envoi, refus, onRetirer } = props;
	let meta = [];
	if (vue.auteur) {
		meta.push("par " + vue.auteur);
	}
	if (vue.date) {
		meta.push(vue.date);
	}
	if (vue.echeance) {
		meta.push(vue.echeance);
	}
	return html`
		<li class="liste-entree">
			<div class="liste-texte">
				<span class="liste-qui">${vue.qui}</span>
				${meta.length ? html`<span class="liste-meta">${meta.join(" · ")}</span>` : null}
				${vue.antiflood ? html`<span class="liste-antiflood">anti-flood</span>` : null}
				<${Refus} texte=${refus}/>
			</div>
			<button
				type="button"
				class="reglages-bouton secondaire liste-retirer"
				disabled=${Boolean(envoi)}
				aria-busy=${envoi ? "true" : "false"}
				onClick=${() => onRetirer(lettre, vue.masque)}
			>${vue.muet ? "Rendre la parole" : "Retirer"}</button>
		</li>
	`;
}

const AJOUTS = {
	e: { ouvrir: "Exempter un compte…", bouton: "Exempter", aide: "Pseudo du compte à exempter" },
	I: { ouvrir: "Inviter un compte…", bouton: "Inviter", aide: "Pseudo du compte à inviter" },
};

class Ajout extends Component {
	constructor(props) {
		super(props);
		this.state = { ouvert: false, pseudo: "" };
	}

	render() {
		let { lettre, envoi, refus, onAjouter } = this.props;
		let t = AJOUTS[lettre];
		if (!this.state.ouvert) {
			return html`
				<button type="button" class="reglages-bouton secondaire liste-ajout"
					onClick=${() => this.setState({ ouvert: true })}>${t.ouvrir}</button>
			`;
		}
		let id = "liste-ajout-" + lettre;
		let valide = /^[A-Za-z[\]\\`_^{|}][A-Za-z0-9[\]\\`_^{|}-]{0,31}$/.test(this.state.pseudo.trim());
		let envoyer = (event) => {
			event.preventDefault();
			if (valide && !envoi) {
				onAjouter(lettre, this.state.pseudo.trim());
			}
		};
		return html`
			<form class="liste-ajout-form" onSubmit=${envoyer}>
				<label for=${id} class="liste-aide">${t.aide}</label>
				<div class="liste-ajout-ligne">
					<input id=${id} class="reglages-champ liste-champ" type="text" autocomplete="off"
						maxlength="32" value=${this.state.pseudo}
						onInput=${(e) => this.setState({ pseudo: e.target.value })}/>
					<button type="submit" class="reglages-bouton" disabled=${!valide || Boolean(envoi)}>${t.bouton}</button>
				</div>
				<${Refus} texte=${refus}/>
			</form>
		`;
	}
}

export default class SalonListes extends Component {
	constructor(props) {
		super(props);
		// Exemptions : geste rare, repliees par defaut (analyse §4.2)
		this.state = { exemptionsOuvertes: false };
	}

	render() {
		let { listes, rang, modes, maxList, envois, refus, onRetirer, onAjouter } = this.props;
		envois = envois || {};
		refus = refus || {};
		maxList = maxList || {};
		let maintenant = this.props.maintenant || new Date();

		return rubriques(listes, rang, modes).map((r) => {
			let titreId = "liste-" + r.id;
			let lettre = LETTRES[r.id];
			let corps;
			if (r.entrees === undefined || r.entrees === null) {
				corps = html`<p class="reglages-lecture" role="status">${LECTURE_LISTE}</p>`;
			} else if (r.entrees === "erreur") {
				corps = html`<p class="reglages-lecture">${LISTE_ILLISIBLE}</p>`;
			} else if (!r.entrees.length) {
				corps = html`<p class="liste-vide">${VIDES[r.id]}</p>`;
			} else {
				corps = html`
					<ul class="liste-entrees">
						${r.entrees.map((e) => {
							let cle = "liste:" + lettre + ":" + e.masque;
							return html`
								<${Entree} key=${e.masque} vue=${vueEntree(e, maintenant)} lettre=${lettre}
									envoi=${envois[cle]} refus=${refus[cle]} onRetirer=${onRetirer}/>
							`;
						})}
					</ul>
				`;
			}

			// b est partage : le plafond compte bans et mutismes ensemble
			let total = r.id === "muets" ? null : compteur(listes, lettre, maxList[lettre]);
			let nombre = Array.isArray(r.entrees) ? r.entrees.length : null;
			let compte = null;
			if (r.id === "muets" && nombre !== null) {
				compte = html` <span class="liste-compteur">${nombre}</span>`;
			} else if (total) {
				let titre = r.id === "bans" ? "Bannissements et personnes muettes, sur le plafond du salon" : null;
				compte = html` <span class="liste-compteur" title=${titre}>${total}</span>`;
			}
			let tete = html`<h3 id=${titreId}>${TITRES[r.id]}${compte}</h3>`;

			let ajout = null;
			if (r.id === "exemptions" || r.id === "invitations") {
				ajout = html`<${Ajout} lettre=${lettre} envoi=${envois["ajout:" + lettre]} refus=${refus["ajout:" + lettre]} onAjouter=${onAjouter}/>`;
			}

			if (r.id === "exemptions") {
				let ouvert = this.state.exemptionsOuvertes;
				return html`
					<section class="reglages-section" key=${r.id} aria-labelledby=${titreId}>
						<h3 id=${titreId}>
							<button type="button" class="liste-replier" aria-expanded=${ouvert ? "true" : "false"}
								onClick=${() => this.setState({ exemptionsOuvertes: !ouvert })}>
								<span>${TITRES[r.id]}${compte}</span>
								<span class="liste-chevron" aria-hidden="true">${ouvert ? "▾" : "▸"}</span>
							</button>
						</h3>
						${ouvert ? html`${corps}${ajout}` : null}
					</section>
				`;
			}
			return html`
				<section class="reglages-section" key=${r.id} aria-labelledby=${titreId}>
					${tete}
					${corps}
					${r.id === "bans" ? html`<p class="liste-renvoi">${POUR_BANNIR}</p>` : null}
					${ajout}
				</section>
			`;
		});
	}
}
