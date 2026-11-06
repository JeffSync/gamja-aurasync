import * as irc from "../lib/irc.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { html } from "../lib/index.js";
import { BufferType, Unread, ServerStatus, getBufferURL } from "../state.js";
import { categories, channelLabel, channelMeta, channelIcon } from "./aurasync-channels.js";

const COLLAPSE_KEY = "aurasync_tchat_categories_fermees";

/* Categories fermees, memorisees entre deux sessions. */
function readCollapsed() {
	try {
		let raw = window.localStorage.getItem(COLLAPSE_KEY);
		return new Set(raw ? JSON.parse(raw) : ["regions"]);
	} catch {
		return new Set(["regions"]);
	}
}

function writeCollapsed(set) {
	try {
		window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
	} catch {
		/* stockage indisponible : le repli reste valable pour la session */
	}
}

/* Position d'une entree dans toute la barre, de 0 (en haut) a 1 (en bas). */
export function rangDansLaBarre(index, total) {
	if (total < 2) {
		return 0;
	}
	return Math.round(index / (total - 1) * 1000) / 1000;
}

function BufferItem(props) {
	function handleClick(event) {
		event.preventDefault();
		props.onClick();
	}
	function handleMouseDown(event) {
		if (event.button === 1) { // clic molette
			event.preventDefault();
			props.onClose();
		}
	}

	let name = props.buffer.name;
	if (props.buffer.type === BufferType.SERVER) {
		name = "t'Chat";
	}

	let title;
	let classes = ["type-" + props.buffer.type];
	if (props.active) {
		classes.push("active");
	}
	if (props.buffer.unread !== Unread.NONE) {
		classes.push("unread-" + props.buffer.unread);
	}

	let label = name, icon = null;
	switch (props.buffer.type) {
	case BufferType.SERVER:
		let isError = props.server.status === ServerStatus.DISCONNECTED;
		if (props.bouncerNetwork && props.bouncerNetwork.error) {
			isError = true;
		}
		if (isError) {
			classes.push("error");
		}
		break;
	case BufferType.CHANNEL: {
		let meta = channelMeta(name);
		label = html`<span class="chan-hash">#</span>${channelLabel(name)}`;
		icon = channelIcon(meta ? meta.icon : "hash");
		break;
	}
	case BufferType.NICK:
		let user = props.server.users.get(name);
		if (user && irc.isMeaningfulRealname(user.realname, name)) {
			title = stripANSI(user.realname);
		}
		icon = channelIcon("chat");
		break;
	}

	// Position dans toute la barre, de 0 a 1 : le degrade des icones (D-066)
	return html`
		<li
			class="${classes.join(" ")}"
			role="tab"
			aria-selected="${props.active}"
			style=${{ "--rang": props.rang }}
		>
			<a
				href=${getBufferURL(props.buffer)}
				title=${title}
				onClick=${handleClick}
				onMouseDown=${handleMouseDown}
			>${icon}<span class="chan-name">${label}</span></a>
		</li>
	`;
}

export default function BufferList(props) {
	let collapsed = readCollapsed();

	// L'onglet serveur est masque : le t'Chat est une surface de conversation,
	// la gestion (salons, comptes) passe par le site AuraSync.
	let buffers = Array.from(props.buffers.values()).filter((buf) => {
		return buf.type !== BufferType.SERVER;
	});

	/* Rang explicite d'abord, ordre naturel ensuite. */
	buffers.sort((a, b) => {
		let ra = (channelMeta(a.name) || {}).rank || 99;
		let rb = (channelMeta(b.name) || {}).rank || 99;
		return ra - rb;
	});

	/* Repartition par categorie, dans l'ordre declare. */
	let ordre = categories();
	let groups = new Map(ordre.map((c) => [c.id, []]));

	for (let buf of buffers) {
		let catID;
		if (buf.type === BufferType.NICK) {
			catID = "prives";
		} else {
			let meta = channelMeta(buf.name);
			catID = meta ? meta.cat : "autres";
		}
		groups.get(catID).push(buf);
	}

	let visibles = ordre.filter((cat) => groups.get(cat.id).length > 0);
	let total = visibles.reduce((n, cat) => n + groups.get(cat.id).length, 0);
	let index = 0;

	function item(buf) {
		let server = props.servers.get(buf.server);

		let bouncerNetwork = null;
		if (server.bouncerNetID) {
			bouncerNetwork = props.bouncerNetworks.get(server.bouncerNetID);
		}

		return html`
			<${BufferItem}
				key=${buf.id}
				buffer=${buf}
				server=${server}
				bouncerNetwork=${bouncerNetwork}
				onClick=${() => props.onBufferClick(buf)}
				onClose=${() => props.onBufferClose(buf)}
				active=${props.activeBuffer === buf.id}
				rang=${rangDansLaBarre(index++, total)}
			/>
		`;
	}

	let sections = visibles.map((cat) => {
		function handleToggle(event) {
			let next = readCollapsed();
			if (event.target.open) {
				next.delete(cat.id);
			} else {
				next.add(cat.id);
			}
			writeCollapsed(next);
		}

		return html`
			<details
				class="chan-group cat-${cat.id}"
				key=${cat.id}
				open=${!collapsed.has(cat.id)}
				onToggle=${handleToggle}
			>
				<summary class="chan-group-title">
					<span>${cat.label}</span>
					<span class="chan-group-count">${groups.get(cat.id).length}</span>
				</summary>
				<ul role="tablist" aria-label=${cat.label}>
					${groups.get(cat.id).map(item)}
				</ul>
			</details>
		`;
	});

	return html`
		<a
			id="aurasync-logo"
			href="https://www.aurasync.fr"
			target="_blank"
			rel="noopener"
			title="Retour sur AuraSync"
		></a>
		<button
			id="chan-browse"
			type="button"
			onClick=${props.onOpenChannelList}
			title="Voir tous les salons"
		>Salons</button>
		<div class="chan-groups">
			${sections}
		</div>
	`;
}
