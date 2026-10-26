/*
 * Reglages de Gamja. Inatteignables dans le t'Chat : aucun composant
 * n'appelle onOpenSettings. Traduits au cas ou ; le choix du protocole
 * par defaut du navigateur est retire (il nommait la technologie, D-001).
 */

import { html, Component } from "../lib/index.js";

export default class SettingsForm extends Component {
	state = {};

	constructor(props) {
		super(props);

		this.state.secondsInTimestamps = props.settings.secondsInTimestamps;
		this.state.bufferEvents = props.settings.bufferEvents;

		this.handleInput = this.handleInput.bind(this);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleInput(event) {
		let target = event.target;
		let value = target.type === "checkbox" ? target.checked : target.value;
		this.setState({ [target.name]: value }, () => {
			this.props.onChange(this.state);
		});
	}

	handleSubmit(event) {
		event.preventDefault();
		this.props.onClose();
	}

	render() {
		return html`
			<form onInput=${this.handleInput} onSubmit=${this.handleSubmit}>
				<label>
					<input
						type="checkbox"
						name="secondsInTimestamps"
						checked=${this.state.secondsInTimestamps}
					/>
					Afficher les secondes dans l'heure des messages
				</label>
				<br/><br/>

				<label>
					<input
						type="radio"
						name="bufferEvents"
						value="fold"
						checked=${this.state.bufferEvents === "fold"}
					/>
					Afficher les arrivées et départs, regroupés
				</label>
				<br/>
				<label>
					<input
						type="radio"
						name="bufferEvents"
						value="expand"
						checked=${this.state.bufferEvents === "expand"}
					/>
					Afficher les arrivées et départs, en détail
				</label>
				<br/>
				<label>
					<input
						type="radio"
						name="bufferEvents"
						value="hide"
						checked=${this.state.bufferEvents === "hide"}
					/>
					Masquer les arrivées et départs
				</label>
				<br/><br/>

				<button type="button" class="danger" onClick=${() => this.props.onDisconnect()}>
					Se déconnecter
				</button>
				<button>
					Fermer
				</button>
			</form>
		`;
	}
}
