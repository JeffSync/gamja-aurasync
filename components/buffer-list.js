import * as irc from "../lib/irc.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { html } from "../lib/index.js";
import { BufferType, Unread, ServerStatus, getBufferURL, getServerName } from "../state.js";
import { CATEGORIES, channelLabel, channelMeta, channelIcon } from "./aurasync-channels.js";

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

	return html`
		<li class="${classes.join(" ")}" role="tab" aria-selected="${props.active}">
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
	let groups = new Map(CATEGORIES.map((c) => [c.id, []]));

	for (let buf of buffers) {
		let server = props.servers.get(buf.server);

		let bouncerNetwork = null;
		if (server.bouncerNetID) {
			bouncerNetwork = props.bouncerNetworks.get(server.bouncerNetID);
		}

		let item = html`
			<${BufferItem}
				key=${buf.id}
				buffer=${buf}
				server=${server}
				bouncerNetwork=${bouncerNetwork}
				onClick=${() => props.onBufferClick(buf)}
				onClose=${() => props.onBufferClose(buf)}
				active=${props.activeBuffer === buf.id}
			/>
		`;

		let catID;
		if (buf.type === BufferType.NICK) {
			catID = "prives";
		} else {
			let meta = channelMeta(buf.name);
			catID = meta ? meta.cat : "autres";
		}
		groups.get(catID).push(item);
	}

	let sections = CATEGORIES.filter((cat) => groups.get(cat.id).length > 0).map((cat) => {
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
				class="chan-group"
				key=${cat.id}
				open=${!collapsed.has(cat.id)}
				onToggle=${handleToggle}
			>
				<summary class="chan-group-title">
					<span>${cat.label}</span>
					<span class="chan-group-count">${groups.get(cat.id).length}</span>
				</summary>
				<ul role="tablist" aria-label=${cat.label}>
					${groups.get(cat.id)}
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
		<a
			id="chan-browse"
			href="https://www.aurasync.fr/tchat"
			target="_blank"
			rel="noopener"
			title="Choisir ses salons sur AuraSync"
		>Salons</a>
		<div class="chan-groups">
			${sections}
		</div>
	`;
}
