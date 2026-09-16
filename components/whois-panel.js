/*
 * Panneau « Qui est-ce ? » — reponse WHOIS mise en forme.
 *
 * S'ouvre depuis le menu au clic sur un pseudo, ou via la commande /whois.
 * Affiche uniquement ce que le serveur renvoie : un membre ordinaire ne
 * recoit pas les informations reservees aux operateurs, donc les lignes
 * correspondantes n'apparaissent simplement pas chez lui.
 *
 * Les donnees de moderation (score de reputation, groupes de securite) sont
 * volontairement ignorees.
 */

import { html, Component } from "../lib/index.js";
import * as irc from "../lib/irc.js";

const PANEL_W = 360;

function duration(seconds) {
	let s = parseInt(seconds, 10);
	if (isNaN(s)) return null;
	if (s < 60) return s + " s";
	let m = Math.floor(s / 60);
	if (m < 60) return m + " min";
	let h = Math.floor(m / 60);
	if (h < 24) return h + " h " + (m % 60) + " min";
	let d = Math.floor(h / 24);
	return d + " j " + (h % 24) + " h";
}

function Row(props) {
	if (!props.value) return null;
	return html`
		<div class="whois-row">
			<div class="whois-key">${props.label}</div>
			<div class="whois-val">${props.value}</div>
		</div>
	`;
}

export default class WhoisPanel extends Component {
	constructor(props) {
		super(props);
		this.handleOutside = this.handleOutside.bind(this);
		this.handleKey = this.handleKey.bind(this);
	}

	componentDidMount() {
		document.addEventListener("mousedown", this.handleOutside);
		document.addEventListener("keydown", this.handleKey);
	}

	componentWillUnmount() {
		document.removeEventListener("mousedown", this.handleOutside);
		document.removeEventListener("keydown", this.handleKey);
	}

	handleOutside(event) {
		if (this.base && !this.base.contains(event.target)) {
			this.props.onClose();
		}
	}

	handleKey(event) {
		if (event.key === "Escape") {
			this.props.onClose();
		}
	}

	render() {
		let { nick, x, y, whois, error, loading } = this.props;

		let left, top;
		if (this.props.centered) {
			left = Math.round((window.innerWidth - PANEL_W) / 2);
			top = Math.round(window.innerHeight * 0.18);
		} else {
			left = Math.min(x - PANEL_W + 40, window.innerWidth - PANEL_W - 12);
			top = Math.min(y, window.innerHeight - 320);
		}
		left = Math.max(8, left);
		top = Math.max(8, top);

		let body;
		if (loading) {
			body = html`<div class="whois-wait">Recherche…</div>`;
		} else if (error) {
			body = html`<div class="whois-wait">Ce pseudo n'est pas connecté</div>`;
		} else if (!whois) {
			body = html`<div class="whois-wait">Aucune information</div>`;
		} else {
			let user = whois["311"];
			let host = user ? user.params[2] + "@" + user.params[3] : null;
			let realname = user ? user.params[5] : null;

			let team = null;
			if (whois["313"]) {
				team = html`<span class="whois-oper">t'Chat Opérateur</span>`;
			}

			let account = whois["330"] ? whois["330"].params[2] : null;

			let secure = whois["671"] ? "Connexion sécurisée" : null;

			let channels = null;
			if (whois["319"]) {
				let list = (whois["319"].params[2] || "").trim();
				if (list) {
					channels = html`<div class="whois-chans">${list.split(/\s+/).map((c) => html`<span>${c}</span>`)}</div>`;
				}
			}

			let idle = null, signon = null;
			if (whois["317"]) {
				idle = duration(whois["317"].params[2]);
				let ts = parseInt(whois["317"].params[3], 10);
				if (!isNaN(ts)) {
					signon = new Date(ts * 1000).toLocaleString("fr-FR", {
						day: "2-digit", month: "2-digit", year: "numeric",
						hour: "2-digit", minute: "2-digit",
					});
				}
			}

			body = html`
				<${Row} label="Adresse" value=${host}/>
				<${Row} label="Nom" value=${realname}/>
				<${Row} label="Équipe" value=${team}/>
				<${Row} label="Compte" value=${account}/>
				<${Row} label="Sécurité" value=${secure}/>
				<${Row} label="Salons communs" value=${channels}/>
				<${Row} label="Inactif depuis" value=${idle}/>
				<${Row} label="Connecté depuis" value=${signon}/>
			`;
		}

		return html`
			<div class="whois-panel" style=${`left:${left}px; top:${top}px;`} role="dialog">
				<div class="whois-head">
					<span class="whois-nick">${nick}</span>
					<button
						class="whois-close"
						type="button"
						onClick=${this.props.onClose}
						title="Fermer"
					>×</button>
				</div>
				${body}
			</div>
		`;
	}
}
