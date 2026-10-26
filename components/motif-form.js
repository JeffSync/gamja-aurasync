/*
 * Motif d'une sanction (D-058, D-059) : expulser, bannir ou rendre muet
 * depuis le menu pseudo.
 * Rien ne part sans motif : le bouton reste desactive tant que le champ est
 * vide. Le motif part dans le KICK, ou dans une NOTICE pour le mutisme : le
 * membre le voit.
 */

import { html, Component } from "../lib/index.js";
import { motifValide } from "../lib/connexion.js";

const LIBELLES = {
	kick: "Expulser",
	ban: "Bannir",
	mute: "Rendre muet",
};

/* Titre du dialogue : « Expulser Kahen », « Rendre muet Kahen »… */
export function titreMotif(action, nick) {
	return (LIBELLES[action] || "Sanctionner") + " " + nick;
}

export default class MotifForm extends Component {
	state = {
		motif: "",
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
		this.props.onSubmit(this.state.motif.trim());
	}

	render() {
		let libelle = LIBELLES[this.props.action] || "Valider";
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
				<br/><br/>
				<button disabled=${!motifValide(this.state.motif)}>${libelle}</button>
			</form>
		`;
	}
}
