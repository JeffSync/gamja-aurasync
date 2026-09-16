/*
 * Menu contextuel au clic sur un pseudo.
 *
 * Remplace l'ouverture directe d'un message prive : le clic ouvre un menu
 * d'actions. Les entrees de moderation n'apparaissent que si l'utilisateur
 * est operateur du salon courant, et s'adaptent au statut de la cible.
 *
 * Le menu s'ouvre au point du clic, recadre s'il depasse la fenetre.
 */

import { html, Component } from "../lib/index.js";

const MENU_W = 235;

/* Rang des prefixes de statut, du plus fort au plus faible. */
function rank(membership) {
	if (!membership) return 0;
	if (membership.includes("~")) return 5;
	if (membership.includes("&")) return 4;
	if (membership.includes("@")) return 3;
	if (membership.includes("%")) return 2;
	if (membership.includes("+")) return 1;
	return 0;
}

function statusLabel(membership) {
	switch (rank(membership)) {
	case 5: return "Propriétaire du salon";
	case 4: return "Administrateur du salon";
	case 3: return "Opérateur du salon";
	case 2: return "Half-opérateur du salon";
	case 1: return "Voix";
	default: return null;
	}
}

function Item(props) {
	return html`
		<button
			class="nick-menu-item ${props.danger ? "danger" : ""}"
			onClick=${props.onClick}
			type="button"
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
				stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
				aria-hidden="true">
				${props.icon.map((d) => html`<path d=${d}/>`)}
			</svg>
			<span>${props.label}</span>
		</button>
	`;
}

const I = {
	profile: ["M12 20.4a8.4 8.4 0 100-16.8 8.4 8.4 0 000 16.8z", "M12 12.4a2.9 2.9 0 100-5.8 2.9 2.9 0 000 5.8z", "M6.4 18.4c.9-2.3 3-3.4 5.6-3.4s4.7 1.1 5.6 3.4"],
	message: ["M4 5.4h16v10.2H9.4L5.2 19v-3.4H4z"],
	at: ["M15.4 12a3.4 3.4 0 10-6.8 0 3.4 3.4 0 006.8 0z", "M15.4 8.6v4.5a2.6 2.6 0 005.2 0V12a8.6 8.6 0 10-3.4 6.9"],
	info: ["M12 20.4a8.4 8.4 0 100-16.8 8.4 8.4 0 000 16.8z", "M12 11.2v5.2", "M12 7.6h.02"],
	voiceOn: ["M12 3.6a2.8 2.8 0 012.8 2.8v5a2.8 2.8 0 01-5.6 0v-5A2.8 2.8 0 0112 3.6z", "M6.4 11.2a5.6 5.6 0 0011.2 0", "M12 16.8v3.6"],
	voiceOff: ["M9.2 5.6A2.8 2.8 0 0114.8 6.4v3.2", "M14.8 13.4a2.8 2.8 0 01-5.6-1.2V9.6", "M6.4 11.2a5.6 5.6 0 008.4 4.8", "M12 16.8v3.6", "M4 4l16 16"],
	opOn: ["M12 3.4l7 2.8v5c0 4.2-2.9 7.6-7 8.6-4.1-1-7-4.4-7-8.6v-5z", "M9.4 11.8l1.8 1.8 3.4-3.6"],
	opOff: ["M12 3.4l7 2.8v5c0 4.2-2.9 7.6-7 8.6-4.1-1-7-4.4-7-8.6v-5z", "M9.4 12h5.2"],
	mute: ["M11 5.4L6.8 9H3.6v6h3.2L11 18.6z", "M15.6 9.6l4.8 4.8", "M20.4 9.6l-4.8 4.8"],
	kick: ["M14 4.4H6.4v15.2H14", "M11.2 12h9", "M17.2 8.8l3.2 3.2-3.2 3.2"],
	ban: ["M12 20.4a8.4 8.4 0 100-16.8 8.4 8.4 0 000 16.8z", "M6 6l12 12"],
};

export default class NickMenu extends Component {
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

	run(action) {
		this.props.onAction(action, this.props.nick);
		this.props.onClose();
	}

	render() {
		let { nick, x, y, selfMembership, targetMembership } = this.props;

		/* Recadrage : le menu ne doit pas sortir de la fenetre. */
		let left = Math.min(x - MENU_W + 40, window.innerWidth - MENU_W - 12);
		let top = Math.min(y, window.innerHeight - 320);
		left = Math.max(8, left);
		top = Math.max(8, top);

		let canModerate = rank(selfMembership) >= 3;
		let targetRank = rank(targetMembership);
		let label = statusLabel(targetMembership);
		let prefix = targetMembership ? targetMembership[0] : "";

		let moderation = null;
		if (canModerate) {
			moderation = html`
				<div class="nick-menu-sep"></div>
				<div class="nick-menu-title">MODÉRATION</div>
				${targetRank >= 1
					? html`<${Item} icon=${I.voiceOff} label="Retirer la voix" onClick=${() => this.run("devoice")}/>`
					: html`<${Item} icon=${I.voiceOn} label="Donner la voix" onClick=${() => this.run("voice")}/>`}
				${targetRank >= 3
					? html`<${Item} icon=${I.opOff} label="Retirer l'opérateur" onClick=${() => this.run("deop")}/>`
					: html`<${Item} icon=${I.opOn} label="Donner l'opérateur" onClick=${() => this.run("op")}/>`}
				<${Item} icon=${I.mute} label="Rendre muet" onClick=${() => this.run("mute")}/>
				<${Item} icon=${I.kick} label="Expulser" danger onClick=${() => this.run("kick")}/>
				<${Item} icon=${I.ban} label="Bannir" danger onClick=${() => this.run("ban")}/>
			`;
		}

		return html`
			<div class="nick-menu" style=${`left:${left}px; top:${top}px;`} role="menu">
				<div class="nick-menu-head">
					<div class="nick-menu-nick">
						${prefix ? html`<span class="nick-menu-prefix">${prefix}</span>` : null}
						<span>${nick}</span>
					</div>
					${label ? html`<div class="nick-menu-status">${label}</div>` : null}
				</div>
				<${Item} icon=${I.profile} label="Voir le profil" onClick=${() => this.run("profile")}/>
				<${Item} icon=${I.message} label="Message privé" onClick=${() => this.run("query")}/>
				<${Item} icon=${I.at} label="Mentionner" onClick=${() => this.run("mention")}/>
				<${Item} icon=${I.info} label="Qui est-ce ?" onClick=${() => this.run("whois")}/>
				${moderation}
			</div>
		`;
	}
}
