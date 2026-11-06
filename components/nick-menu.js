/*
 * La fiche d'un pseudo (D-066, point 8, variante A).
 *
 * Une seule fiche remplace le menu d'un pseudo et « Qui est-ce ? » : avatar
 * de 64 px, nom affiche, @pseudo, badge de role du site, rang dans le salon,
 * puis les actions, puis la moderation (D-060) pour % et @. Le contenu, cas
 * par cas, est decide par lib/fiche.js. En mobile, feuille du bas (CSS).
 *
 * Le WHOIS technique n'est montre qu'a l'equipe, dans le repli « Details
 * techniques », ferme par defaut : il n'est demande au serveur qu'a
 * l'ouverture du repli.
 */

import { html, Component } from "../lib/index.js";
import { peutRendreMuet } from "../lib/mutisme.js";
import { contenuFiche, rangSalon, TEXTES } from "../lib/fiche.js";
import { DetailsTechniques } from "./whois-panel.js";

const FICHE_W = 320;

/* Rang des prefixes de statut, du plus fort au plus faible. */
function rank(membership) {
	if (!membership) return 0;
	if (/[~&@]/.test(membership)) return 3;
	if (membership.includes("%")) return 2;
	if (membership.includes("+")) return 1;
	return 0;
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
	voiceOn: ["M12 3.6a2.8 2.8 0 012.8 2.8v5a2.8 2.8 0 01-5.6 0v-5A2.8 2.8 0 0112 3.6z", "M6.4 11.2a5.6 5.6 0 0011.2 0", "M12 16.8v3.6"],
	voiceOff: ["M9.2 5.6A2.8 2.8 0 0114.8 6.4v3.2", "M14.8 13.4a2.8 2.8 0 01-5.6-1.2V9.6", "M6.4 11.2a5.6 5.6 0 008.4 4.8", "M12 16.8v3.6", "M4 4l16 16"],
	opOn: ["M12 3.4l7 2.8v5c0 4.2-2.9 7.6-7 8.6-4.1-1-7-4.4-7-8.6v-5z", "M9.4 11.8l1.8 1.8 3.4-3.6"],
	opOff: ["M12 3.4l7 2.8v5c0 4.2-2.9 7.6-7 8.6-4.1-1-7-4.4-7-8.6v-5z", "M9.4 12h5.2"],
	mute: ["M11 5.4L6.8 9H3.6v6h3.2L11 18.6z", "M15.6 9.6l4.8 4.8", "M20.4 9.6l-4.8 4.8"],
	kick: ["M14 4.4H6.4v15.2H14", "M11.2 12h9", "M17.2 8.8l3.2 3.2-3.2 3.2"],
	ban: ["M12 20.4a8.4 8.4 0 100-16.8 8.4 8.4 0 000 16.8z", "M6 6l12 12"],
	terminal: ["M3.5 5.5h17v13h-17z", "M7 9.5l2.8 2.5-2.8 2.5", "M12.5 15h4.5"],
};

/* Avatar de la fiche (64 px) ou de la barre (20 px) : voir avatarDe. */
export function AvatarFiche(props) {
	let { avatar, taille } = props;
	let classe = `fiche-avatar fiche-avatar-${taille} fiche-avatar-${avatar.genre}`;
	if (avatar.genre === "image") {
		return html`<img class=${classe} src=${avatar.src} alt="" width=${taille} height=${taille} loading="lazy" decoding="async"/>`;
	}
	if (avatar.genre === "service") {
		return html`
			<span class=${classe} aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
					stroke-linecap="round" stroke-linejoin="round">
					${I.terminal.map((d) => html`<path d=${d}/>`)}
				</svg>
			</span>
		`;
	}
	return html`<span class=${classe} aria-hidden="true">${avatar.lettre}</span>`;
}

export default class NickMenu extends Component {
	constructor(props) {
		super(props);
		this.handleOutside = this.handleOutside.bind(this);
		this.handleKey = this.handleKey.bind(this);
		this.handleDetails = this.handleDetails.bind(this);
	}

	componentDidMount() {
		document.addEventListener("mousedown", this.handleOutside);
		document.addEventListener("keydown", this.handleKey);
		if (this.base && this.base.focus) {
			this.base.focus();
		}
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

	handleDetails(event) {
		if (event.target.open && this.props.onDetails) {
			this.props.onDetails(this.props.nick);
		}
	}

	run(action) {
		this.props.onAction(action, this.props.nick);
		this.props.onClose();
	}

	render() {
		let { nick, x, y, centered, selfMembership, targetMembership, muet, etat, whois } = this.props;
		let contenu = contenuFiche(nick, etat);

		/* Recadrage : la fiche ne doit pas sortir de la fenetre. */
		let left, top;
		if (centered) {
			left = Math.round((window.innerWidth - FICHE_W) / 2);
			top = Math.round(window.innerHeight * 0.15);
		} else {
			left = Math.min(x - FICHE_W + 40, window.innerWidth - FICHE_W - 12);
			top = Math.min(y, window.innerHeight - 420);
		}
		left = Math.max(8, left);
		top = Math.max(8, top);

		let rang = rangSalon(targetMembership);
		let canModerate = contenu.moderation && rank(selfMembership) >= 3;
		let targetRank = rank(targetMembership);

		let badges = null;
		if (contenu.role || rang) {
			badges = html`
				<div class="fiche-badges">
					${contenu.role ? html`<span class="fiche-role ${contenu.role.classe}">${contenu.role.label}</span>` : null}
					${rang ? html`<span class="fiche-rang">${rang}</span>` : null}
				</div>
			`;
		}

		let actions = [];
		if (contenu.lien) {
			actions.push(html`
				<a class="nick-menu-item" href=${contenu.lien.href} target="_blank" rel="noopener"
					onClick=${() => this.props.onClose()}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
						stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						${I.profile.map((d) => html`<path d=${d}/>`)}
					</svg>
					<span>${contenu.lien.texte}</span>
				</a>
			`);
		}
		if (contenu.actions.includes("query")) {
			actions.push(html`<${Item} icon=${I.message} label=${TEXTES.message} onClick=${() => this.run("query")}/>`);
		}
		if (contenu.actions.includes("mention")) {
			actions.push(html`<${Item} icon=${I.at} label=${TEXTES.mentionner} onClick=${() => this.run("mention")}/>`);
		}

		/* Mutisme : moderateur % et au-dessus (D-059). `muet` vient de la
		   liste des bans, null tant qu'elle n'est pas arrivee. Un ~quiet
		   n'a pas prise sur un moderateur (message.c, « vhoaq ») : pas
		   d'entree pour lui. */
		let mutisme = null;
		if (contenu.moderation && peutRendreMuet(selfMembership) && !peutRendreMuet(targetMembership)) {
			mutisme = muet
				? html`<${Item} icon=${I.mute} label="Rendre la parole" onClick=${() => this.run("unmute")}/>`
				: html`<${Item} icon=${I.mute} label="Rendre muet(te)" onClick=${() => this.run("mute")}/>`;
		}

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
				${mutisme}
				<${Item} icon=${I.kick} label="Expulser" danger onClick=${() => this.run("kick")}/>
				<${Item} icon=${I.ban} label="Bannir" danger onClick=${() => this.run("ban")}/>
			`;
		} else if (mutisme) {
			moderation = html`
				<div class="nick-menu-sep"></div>
				<div class="nick-menu-title">MODÉRATION</div>
				${mutisme}
			`;
		}

		// Le WHOIS technique : l'equipe seule, jamais pour un service
		let details = null;
		if (etat && etat.equipe && contenu.moderation !== false && etat.fiche && etat.fiche.kind !== "service") {
			details = html`
				<details class="fiche-details" onToggle=${this.handleDetails}>
					<summary>${TEXTES.details}</summary>
					<${DetailsTechniques} ...${whois || {}}/>
				</details>
			`;
		}

		return html`
			<div
				class="nick-menu fiche"
				style=${`left:${left}px; top:${top}px;`}
				role="dialog"
				aria-label=${"Fiche de " + nick}
				tabindex="-1"
			>
				<div class="fiche-tete">
					<${AvatarFiche} avatar=${contenu.avatar} taille=${64}/>
					<div class="fiche-ident">
						<div class="fiche-nom">${contenu.titre}</div>
						<div class="fiche-pseudo">${contenu.pseudo}</div>
						${badges}
					</div>
					<button class="fiche-fermer" type="button" onClick=${this.props.onClose}
						aria-label="Fermer la fiche">×</button>
				</div>
				${contenu.note ? html`<p class="fiche-note">${contenu.note}</p>` : null}
				${contenu.sousNote ? html`<p class="fiche-sous-note">${contenu.sousNote}</p>` : null}
				${actions.length ? html`<div class="fiche-actions">${actions}</div>` : null}
				${moderation}
				${details}
			</div>
		`;
	}
}
