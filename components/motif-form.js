/*
 * Motif d'une sanction (D-058, D-059) : expulser, bannir ou rendre muet
 * depuis le menu pseudo.
 * Rien ne part sans motif : le bouton reste desactive tant que le champ est
 * vide. Le motif part dans le KICK, ou dans une NOTICE pour le mutisme : le
 * membre le voit.
 *
 * Bannir demande aussi une duree (D-068, point 5) : 1 heure, 24 heures,
 * 7 jours ou sans fin. Le ban vise le compte (~time:N:~account:X).
 */

import { html, Component } from "../lib/index.js";
import { motifValide } from "../lib/connexion.js";
import { DUREES, DUREE_PAR_DEFAUT } from "../lib/ban.js";

const LIBELLES = {
	kick: "Expulser",
	ban: "Bannir",
	mute: "Rendre muet(te)",
};

/* Titre du dialogue : « Expulser Kahen », « Rendre muet(te) Kahen »… */
export function titreMotif(action, nick) {
	return (LIBELLES[action] || "Sanctionner") + " " + nick;
}

export default class MotifForm extends Component {
	state = {
		motif: "",
		duree: DUREE_PAR_DEFAUT,
	};

	constructor(props) {
		super(props);

		this.handleInput = this.handleInput.bind(this);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleInput(event) {
		this.setState({ motif: event.target.value });
	}

	handleSubmit(event) {
		event.preventDefault();
		if (!motifValide(this.state.motif)) {
			return;
		}
		this.props.onSubmit(this.state.motif.trim(), this.props.action === "ban" ? this.state.duree : undefined);
	}

	render() {
		let libelle = LIBELLES[this.props.action] || "Valider";
		let duree = null;
		if (this.props.action === "ban") {
			duree = html`
				<fieldset class="motif-duree">
					<legend>Durée du bannissement</legend>
					${DUREES.map((d) => html`
						<label class="motif-duree-choix" key=${d.id}>
							<input
								type="radio"
								name="duree"
								value=${d.id}
								checked=${this.state.duree === d.id}
								onChange=${() => this.setState({ duree: d.id })}
							/>
							${d.libelle}
						</label>
					`)}
				</fieldset>
			`;
		}
		return html`
			<form onSubmit=${this.handleSubmit}>
				<label>
					Motif, vu par ${this.props.nick} :<br/>
					<input
						type="text"
						name="motif"
						value=${this.state.motif}
						onInput=${this.handleInput}
						maxlength="200"
						autocomplete="off"
						autofocus
						required
					/>
				</label>
				${duree}
				<br/><br/>
				<button disabled=${!motifValide(this.state.motif)}>${libelle}</button>
			</form>
		`;
	}
}
