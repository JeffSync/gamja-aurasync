import { html } from "../lib/index.js";
import linkify from "../lib/linkify.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { BufferType, ServerStatus, getServerName } from "../state.js";
import * as irc from "../lib/irc.js";
import { libellePourToi } from "../lib/pour-toi.js";
import { channelDisplay, comptePersonnes } from "./aurasync-channels.js";

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
					description = "Connecté(e) au t'Chat";
					break;
				}
			} else if (props.buffer.serverInfo) {
				description = "Connecté(e) au t'Chat";
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
				// D-066, note du 8 novembre au soir : une croix, a la place
				// de « Partir » ; meme geste (la selection suit, D-065)
				let quitter = `Quitter ${channelDisplay(props.buffer.name)}`;
				actions.push(html`
					<button
						key="part"
						class="danger hdr-quitter"
						onClick=${props.onClose}
						aria-label=${quitter}
						title=${quitter}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
							stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
							<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>
						</svg>
					</button>
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
				let desc = "Fait partie de l'équipe AuraSync, avec les droits d'administration.";
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
	} else if (props.buffer.type === BufferType.CHANNEL) {
		// D-071 : le nom d'affichage (#Aide) ; un message prive garde le pseudo
		name = channelDisplay(name);
	}

	// D-066 : sur ☰, le total des mentions et des messages prives non lus,
	// seul signe, tiroir ferme, qu'on t'ecrit
	let pastille = null;
	if (props.pourToi > 0) {
		pastille = html`
			<span class="pastille-pour-toi" role="img" aria-label=${libellePourToi(props.pourToi)}>${props.pourToi > 99 ? "99+" : props.pourToi}</span>
		`;
	}

	/* Commandes mobiles : ouvrent les tiroirs. Masquees sur ordinateur. */
	let drawerToggles = html`
		<button
			class="hdr-toggle hdr-toggle-left"
			type="button"
			onClick=${props.onToggleBufferList}
			aria-label="Salons"
			title="Salons"
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
				stroke-width="2" stroke-linecap="round" aria-hidden="true">
				<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>
			</svg>
			${pastille}
		</button>
	`;

	// D-068 : le menu « Réglages », pour % et @ du salon seulement (le +
	// et un oper sans rang n'ont rien). app.js passe `rang` d'apres la place
	// de la personne dans buf.members. Depuis la note du 8 novembre au soir
	// (D-066), il est en tete de la colonne des personnes (tete-colonne.js) ;
	// celui-ci ne sert plus que sur mobile, ou la colonne est un tiroir
	// (masque sur ordinateur, aurasync-theme.css).
	let reglagesToggle = null;
	if (props.buffer.type === BufferType.CHANNEL && props.rang) {
		reglagesToggle = html`
			<button
				class="hdr-reglages ${props.reglagesOuverts ? "ouvert" : ""}"
				type="button"
				onClick=${props.onToggleReglages}
				aria-label="Réglages du salon"
				aria-expanded=${props.reglagesOuverts ? "true" : "false"}
				title="Réglages du salon"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
					stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M4 7h9"/><path d="M17 7h3"/><path d="M15 9.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z"/>
					<path d="M4 17h3"/><path d="M11 17h9"/><path d="M9 19.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z"/>
				</svg>
				<span class="hdr-reglages-texte">Réglages</span>
			</button>
		`;
	}

	// Mobile seulement (.hdr-toggle) : ouvre le tiroir des personnes. Le
	// nombre suit la regle des salons discrets (D-065).
	let memberToggle = null;
	if (props.buffer.type === BufferType.CHANNEL && props.memberCount !== undefined) {
		let compte = comptePersonnes(props.buffer.name, props.memberCount);
		memberToggle = html`
			<button
				class="hdr-toggle hdr-toggle-right"
				type="button"
				onClick=${props.onToggleMemberList}
				aria-label=${`Personnes du salon : ${compte.label}`}
				title="Personnes du salon"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
					stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M9 11.5a3 3 0 100-6 3 3 0 000 6z"/>
					<path d="M3.5 19c0-3 2.4-4.8 5.5-4.8s5.5 1.8 5.5 4.8"/>
					<path d="M16.5 10.8a2.6 2.6 0 100-5.2"/>
					<path d="M16.8 14.9c2.4.4 3.9 2 3.9 4.6"/>
				</svg>
				<span aria-hidden="true">${compte.texte}</span>
			</button>
		`;
	}

	return html`
		${drawerToggles}
		<div class="title">${name}</div>
		${description ? html`<div class="description">${description}</div>` : null}
		${reglagesToggle}
		${memberToggle}
		<div class="actions">${actions}</div>
	`;
}
