/*
 * Panneau « Salons » — liste des salons du reseau.
 *
 * Alimente par la commande LIST, qui exclut d'elle-meme les salons en +s :
 * les salons de gestion n'y apparaissent donc jamais, sans filtrage a
 * ecrire. Les salons officiels sont reconnus par la table
 * aurasync-channels.js ; tout le reste est un salon prive (Cercle).
 */

import { html, Component } from "../lib/index.js";
import { channelLabel, channelMeta, channelIcon } from "./aurasync-channels.js";

/* Retire le bandeau 【 … 】 des topics officiels. */
function shortTopic(topic) {
	if (!topic) return "";
	let t = topic.replace(/^\[\+[^\]]*\]\s*/, "");
	let k = t.indexOf(String.fromCharCode(0x3011));
	if (k >= 0) t = t.slice(k + 1);
	return t.trim();
}

function Entry(props) {
	let { name, users, topic, joined, official, onJoin } = props;
	let meta = official ? channelMeta(name) : null;

	return html`
		<div class="chanlist-row">
			${channelIcon(meta ? meta.icon : "chat")}
			<div class="chanlist-main">
				<div class="chanlist-name">
					<span class="chan-hash">#</span>${official ? channelLabel(name) : name.replace(/^[#&]+/, "")}
				</div>
				${topic ? html`<div class="chanlist-topic">${topic}</div>` : null}
			</div>
			<span class="chanlist-users">${users}</span>
			${joined
				? html`<span class="chanlist-tag">Rejoint</span>`
				: html`<button class="chanlist-join" type="button" onClick=${onJoin}>Rejoindre</button>`}
		</div>
	`;
}

export default class ChannelList extends Component {
	constructor(props) {
		super(props);
		this.state = { filter: "" };
		this.handleKey = this.handleKey.bind(this);
		this.handleFilter = this.handleFilter.bind(this);
	}

	componentDidMount() {
		document.addEventListener("keydown", this.handleKey);
	}

	componentWillUnmount() {
		document.removeEventListener("keydown", this.handleKey);
	}

	handleKey(event) {
		if (event.key === "Escape") {
			this.props.onClose();
		}
	}

	handleFilter(event) {
		this.setState({ filter: event.target.value });
	}

	render() {
		let { channels, loading, joinedNames, onJoin, onClose } = this.props;
		let filter = this.state.filter.trim().toLowerCase();

		let officiels = [], cercles = [];
		for (let chan of channels || []) {
			let bare = chan.name.replace(/^[#&]+/, "").toLowerCase();
			if (filter && bare.indexOf(filter) < 0) {
				continue;
			}
			(channelMeta(chan.name) ? officiels : cercles).push(chan);
		}

		officiels.sort((a, b) => a.name.localeCompare(b.name, "fr"));
		cercles.sort((a, b) => a.name.localeCompare(b.name, "fr"));

		function section(title, list, official, empty) {
			if (list.length === 0 && !empty) {
				return null;
			}
			return html`
				<div class="chanlist-section">${title}</div>
				${list.length === 0
					? html`<div class="chanlist-empty">${empty}</div>`
					: list.map((chan) => html`
						<${Entry}
							key=${chan.name}
							name=${chan.name}
							users=${chan.users}
							topic=${shortTopic(chan.topic)}
							official=${official}
							joined=${joinedNames.has(chan.name.toLowerCase())}
							onJoin=${() => onJoin(chan.name)}
						/>
					`)}
			`;
		}

		let body;
		if (loading) {
			body = html`<div class="chanlist-empty">Chargement…</div>`;
		} else {
			body = html`
				${section("SALONS OFFICIELS", officiels, true, null)}
				${section("SALONS PRIVÉS / CERCLES", cercles, false, "Les Cercles se créent sur le site.")}
			`;
		}

		return html`
			<div class="chanlist-backdrop" onClick=${onClose}></div>
			<div class="chanlist-panel" role="dialog" aria-label="Liste des salons">
				<div class="chanlist-head">
					<span class="chanlist-title">Salons</span>
					<button class="chanlist-close" type="button" onClick=${onClose} title="Fermer">×</button>
				</div>
				<div class="chanlist-search">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
						stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
						<path d="M11 18.2a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z"/>
						<path d="M16.4 16.4l4 4"/>
					</svg>
					<input
						type="text"
						placeholder="Rechercher un salon…"
						value=${this.state.filter}
						onInput=${this.handleFilter}
					/>
				</div>
				<div class="chanlist-body">
					${body}
				</div>
			</div>
		`;
	}
}
