import * as irc from "../lib/irc.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { html } from "../lib/index.js";
import { BufferType, Unread, ServerStatus, getBufferURL } from "../state.js";
import { categories, channelDisplay, channelMeta, channelIcon } from "./aurasync-channels.js";
import { marqueBarre, totalCategorie } from "../lib/pour-toi.js";
import { entreeMenu, TEXTES } from "../lib/notifications.js";
import { avatarDe, trierPrives } from "../lib/fiche.js";
import { AvatarFiche } from "./nick-menu.js";

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
		label = html`<span class="chan-hash">#</span>${channelDisplay(name).replace(/^[#&]+/, "")}`;
		icon = channelIcon(meta ? meta.icon : "hash");
		break;
	}
	case BufferType.NICK:
		let user = props.server.users.get(name);
		if (user && irc.isMeaningfulRealname(user.realname, name)) {
			title = stripANSI(user.realname);
		}
		// L'avatar de la personne, en 20 px (D-066, point 5), lu dans sa fiche
		icon = html`<${AvatarFiche} avatar=${avatarDe(props.fiche ? props.fiche.card : null, name)} taille=${20}/>`;
		break;
	}

	// D-066 : un point pour le non-lu, un badge rose pour ce qui est pour toi
	let marque = marqueBarre(props.buffer);
	let badge = null;
	if (marque) {
		badge = html`
			<span class="marque marque-${marque.genre}" role="img" aria-label=${marque.label}>${marque.texte}</span>
		`;
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
			>${icon}<span class="chan-name">${label}</span>${badge}</a>
		</li>
	`;
}

/*
 * D-066, point 7 : l'entree « Notifications », en pied de barre. La
 * permission ne se demande que sur ce geste (ou la proposition du fil).
 */
function EntreeNotifications(props) {
	if (!props.permission) {
		return null;
	}
	let entree = entreeMenu(props.permission);
	let etat;
	if (entree.action) {
		etat = html`<button type="button" class="notif-activer" onClick=${props.onActiver}>${entree.texte}</button>`;
	} else {
		etat = html`<span class="notif-etat">${entree.texte}</span>`;
	}
	return html`
		<div class="notif-entree notif-${props.permission}">
			<svg class="notif-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor"
				stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.6 1.8H4.4z"/><path d="M10 20.8a2.2 2.2 0 004 0"/>
			</svg>
			<span class="notif-titre">${TEXTES.menu}</span>
			${etat}
		</div>
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

	// Messages prives : le dernier message recu en haut (D-066, variante A)
	let prives = groups.get("prives");
	if (prives && prives.length > 1) {
		let server = props.servers.get(prives[0].server);
		groups.set("prives", trierPrives(prives, server ? server.cm : null));
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
				fiche=${buf.type === BufferType.NICK && props.fiches ? props.fiches.get(buf.name.toLowerCase()) : null}
				onClick=${() => props.onBufferClick(buf)}
				onClose=${() => props.onBufferClose(buf)}
				active=${props.activeBuffer === buf.id}
				rang=${rangDansLaBarre(index++, total)}
			/>
		`;
	}

	let sections = visibles.map((cat) => {
		// Repliee, la categorie montre ce qu'elle cache (CSS : details fermes)
		let cache = totalCategorie(groups.get(cat.id));
		let total = null;
		if (cache) {
			total = html`
				<span
					class="chan-group-total ${cache.rose ? "pour-toi" : ""}"
					role="img"
					aria-label=${cache.label}
				>${cache.texte}</span>
			`;
		}

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
					<span class="chan-group-label"
						><span class="aura" aria-hidden="true">${cat.label}</span
						><span class="texte">${cat.label}</span
						><span class="trait" aria-hidden="true"></span
					></span>
					<span class="chan-group-meta">
						<span class="chan-group-count ${cache ? "a-lire" : ""}">${groups.get(cat.id).length}</span>
						${total}
						<span class="chan-group-fleche" aria-hidden="true"></span>
					</span>
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
		>Liste des salons</button>
		<div class="chan-groups">
			${sections}
		</div>
		<${EntreeNotifications} permission=${props.permissionNotif} onActiver=${props.onNotifActiver}/>
	`;
}
