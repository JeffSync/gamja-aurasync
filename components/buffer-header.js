import { html } from "../lib/index.js";
import linkify from "../lib/linkify.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { BufferType, ServerStatus, getServerName } from "../state.js";
import * as irc from "../lib/irc.js";

const UserStatus = {
	HERE: "here",
	GONE: "gone",
	OFFLINE: "offline",
};

function NickStatus(props) {
	let textMap = {
		[UserStatus.HERE]: "Utilisateur en ligne",
		[UserStatus.GONE]: "Utilisateur absent(e)",
		[UserStatus.OFFLINE]: "Utilisateur hors ligne",
	};
	let text = textMap[props.status];
	return html`<span class="status status-${props.status}" title=${text}>●</span>`;
}

export default function BufferHeader(props) {
	let fullyConnected = props.server.status === ServerStatus.REGISTERED;
	if (props.bouncerNetwork) {
		fullyConnected = fullyConnected && props.bouncerNetwork.state === "connected";
	}

	let description = null, actions = [];
	switch (props.buffer.type) {
	case BufferType.SERVER:
		switch (props.server.status) {
		case ServerStatus.DISCONNECTED:
			description = "Déconnecté(e)";
			break;
		case ServerStatus.CONNECTING:
			description = "Connexion...";
			break;
		case ServerStatus.REGISTERING:
			description = "Authentification...";
			break;
		case ServerStatus.REGISTERED:
			if (props.bouncerNetwork) {
				switch (props.bouncerNetwork.state) {
				case "disconnected":
					description = "Passerelle déconnectée";
					if (props.bouncerNetwork.error) {
						description += ": " + props.bouncerNetwork.error;
					}
					break;
				case "connecting":
					description = "Connexion de la passerelle...";
					break;
				case "connected":
					// host can be undefined e.g. when using UNIX domain sockets
					description = `Connecté(e) au t'Chat`;
					break;
				}
			} else if (props.buffer.serverInfo) {
				let serverInfo = props.buffer.serverInfo;
				description = `Connecté(e) au t'Chat`;
			} else {
				description = "Connecté(e)";
			}
			break;
		}

		break;
	case BufferType.CHANNEL:
		if (props.buffer.topic) {
			description = linkify(stripANSI(props.buffer.topic), props.onChannelClick);
		}
				if (props.buffer.joined) {
			if (props.canPart) {
				actions.push(html`
					<button
						key="part"
						class="danger"
						onClick=${props.onClose}
					>Partir</button>
				`);
			}
		} else {
			if (fullyConnected) {
				actions.push(html`
					<button
						key="join"
						onClick=${props.onJoin}
					>Rejoindre</button>
				`);
			}
			actions.push(html`
				<button
					key="part"
					class="danger"
					onClick=${props.onClose}
				>Fermer</button>
			`);
		}
		break;
	case BufferType.NICK:
		if (props.user) {
			let status = UserStatus.HERE;
			if (props.user.offline) {
				status = UserStatus.OFFLINE;
			} else if (props.user.away) {
				status = UserStatus.GONE;
			}

			let realname = props.buffer.name;
			if (irc.isMeaningfulRealname(props.user.realname, props.buffer.name)) {
				realname = stripANSI(props.user.realname || "");
			}

			let details = [];
			if (props.user.username && props.user.hostname) {
				details.push(`${props.user.username}@${props.user.hostname}`);
			}
			if (props.user.account) {
				let desc = `Ce compte est vérifié et authentifié auprès du serveur sous le nom ${props.user.account}.`;
				let item;
				if (props.user.account === props.buffer.name) {
					item = "authentifié(e)";
				} else {
					item = `authentifié(e) en tant que ${props.user.account}`;
				}
				details.push(html`<abbr title=${desc}>${item}</abbr>`);
			} else if (props.server.reliableUserAccounts) {
				// If the server supports MONITOR and WHOX, we can faithfully
				// keep user.account up-to-date for user queries
				let desc = "Ce compte n'est pas authentifié.";
				details.push(html`<abbr title=${desc}>non authentifié(e)</abbr>`);
			}
			if (props.user.operator) {
				let desc = "Membre de l'équipe AuraSync, avec les droits d'administration.";
				details.push(html`<abbr title=${desc}>opérateur du réseau</abbr>`);
			}
			if (props.user.bot) {
				let desc = "Ce compte est un robot automatisé.";
				details.push(html`<abbr title=${desc}>robot</abbr>`);
			}
			details = details.map((item, i) => {
				if (i === 0) {
					return item;
				}
				return [", ", item];
			});
			if (details.length > 0) {
				details = ["(", details, ")"];
			}

			description = html`<${NickStatus} status=${status}/> ${realname} ${details}`;
		}

		actions = html`
			<button
				key="close"
				class="danger"
				onClick=${props.onClose}
			>Fermer</button>
		`;
		break;
	}

	let name = props.buffer.name;
	if (props.buffer.type === BufferType.SERVER) {
		name = getServerName(props.server, props.bouncerNetwork);
	}

	return html`
		<div class="title">${name}</div>
		${description ? html`<div class="description">${description}</div>` : null}
		<div class="actions">${actions}</div>
	`;
}
