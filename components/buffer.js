import { html, Component } from "../lib/index.js";
import linkify from "../lib/linkify.js";
import * as irc from "../lib/irc.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { BufferType, ServerStatus, BufferEventsDisplayMode, getMessageURL, isMessageBeforeReceipt, SettingsContext } from "../state.js";
import * as store from "../store.js";
import Membership from "./membership.js";
import { pseudoMuet } from "../lib/mutisme.js";
import { analyseKick } from "../lib/irc-errors.js";
import { estServeur, nomServeur } from "../lib/serveur.js";
import { morceauxListe, motifDepart, resumerGroupe, retirerReconnexions, texteAutres } from "../lib/evenements.js";

function djb2(s) {
	let hash = 5381;
	for (let i = 0; i < s.length; i++) {
		hash = (hash << 5) + hash + s.charCodeAt(i);
		hash = hash >>> 0; // convert to uint32
	}
	return hash;
}

function Nick(props) {
	function handleClick(event) {
		event.preventDefault();
		props.onClick(event);
	}

	let title;
	if (props.user && irc.isMeaningfulRealname(props.user.realname, props.nick)) {
		title = stripANSI(props.user.realname);
	}

	let colorIndex = djb2(props.nick) % 16 + 1;
	return html`
		<a
			href=${irc.formatURL({ entity: props.nick })}
			title=${title}
			class="nick nick-${colorIndex}"
			onClick=${handleClick}
		>${props.nick}</a>
	`;
}

function _Timestamp({ date, url, showSeconds }) {
	if (!date) {
		let timestamp = "--:--";
		if (showSeconds) {
			timestamp += ":--";
		}
		timestamp = "[" + timestamp + "]";
		return html`<span class="timestamp" aria-hidden="true">${timestamp}</span>`;
	}

	let hh = date.getHours().toString().padStart(2, "0");
	let mm = date.getMinutes().toString().padStart(2, "0");
	let timestamp = `${hh}:${mm}`;
	if (showSeconds) {
		let ss = date.getSeconds().toString().padStart(2, "0");
		timestamp += ":" + ss;
	}
	timestamp = "[" + timestamp + "]";
	return html`
		<a
			href=${url}
			class="timestamp"
			title=${date.toLocaleString()}
			onClick=${(event) => event.preventDefault()}
		>
			${timestamp}
		</a>
	`;
}

function Timestamp(props) {
	return html`
		<${SettingsContext.Consumer}>
			${(settings) => html`
				<${_Timestamp} ...${props} showSeconds=${settings.secondsInTimestamps}/>
			`}
		</>
	`;
}

/**
 * Check whether a message can be folded.
 *
 * Unimportant and noisy messages that may clutter the discussion should be
 * folded.
 */
function canFoldMessage(msg) {
	// D-062 : sa propre arrivee reste seule, l'accueil vient juste dessous.
	if (msg.arriveeSoi) {
		return false;
	}
	switch (msg.command) {
	case "JOIN":
	case "PART":
	case "QUIT":
	case "NICK":
		return true;
	}
	return false;
}

/* « (connexion perdue) » apres un depart, ou rien (lib/evenements.js). */
function motif(msg) {
	let m = motifDepart(msg.command, msg.params[msg.command === "PART" ? 1 : 0], msg.prefix.name);
	return m ? " (" + m + ")" : "";
}

export class LogLine extends Component {
	shouldComponentUpdate(nextProps) {
		return this.props.message !== nextProps.message || this.props.redacted !== nextProps.redacted;
	}

	render() {
		let msg = this.props.message;
		let buf = this.props.buffer;
		let server = this.props.server;

		let onNickClick = this.props.onNickClick;
		let onChannelClick = this.props.onChannelClick;
		let onVerifyClick = this.props.onVerifyClick;

		function createNick(nick, debut = true) {
			// D-001 : le serveur ne se nomme pas, il signe « le t'Chat ».
			if (estServeur(nick)) {
				return html`<span class="nick nick-serveur">${nomServeur(debut)}</span>`;
			}
			return html`
				<${Nick}
					nick=${nick}
					user=${server.users.get(nick)}
					onClick=${(event) => onNickClick(nick, event)}
				/>
			`;
		}
		function createChannel(channel) {
			return html`
				<a href=${irc.formatURL({ entity: channel })} onClick=${onChannelClick}>
					${channel}
				</a>
			`;
		}

		let lineClass = "";
		let content;
		let invitee, target, account;
		switch (msg.command) {
		case "NOTICE":
		case "PRIVMSG":
			// D-062 : accueil du salon, sans « [#salon] » ni expediteur.
			if (msg.accueil) {
				lineClass = "accueil";
				content = html`${linkify(stripANSI(msg.accueil.texte), onChannelClick)}`;
				break;
			}
			target = msg.params[0];
			let text = msg.params[1];

			let ctcp = irc.parseCTCP(msg);
			if (ctcp) {
				if (ctcp.command === "ACTION") {
					lineClass = "me-tell";
					content = html`* ${createNick(msg.prefix.name)} ${linkify(stripANSI(ctcp.param), onChannelClick)}`;
				} else {
					content = html`
						${createNick(msg.prefix.name)} a envoyé une commande CTCP : ${ctcp.command} ${ctcp.param}
					`;
				}
			} else {
				let prefix = "« ", suffix = " »";
				if (msg.command === "NOTICE") {
					lineClass += " notice";
					prefix = suffix = "-";
				}
				if (this.props.redacted) {
					content = html`<i>Ce message a été supprimé.</i>`;
				} else {
					content = html`${linkify(stripANSI(text), onChannelClick)}`;
					lineClass += " talk";
				}
				content = html`
					<span class="nick-caret" aria-hidden="true">${prefix}</span>
					${(() => {
						let u = buf.members ? buf.members.get(msg.prefix.name) : null;
						return u ? html`<${Membership} value=${u}/>` : null;
					})()}
					${createNick(msg.prefix.name)}
					<span class="nick-caret" aria-hidden="true">${suffix}</span>
					${" "}
					${content}
				`;
			}

			let allowedPrefixes = server.statusMsg;
			if (target !== buf.name && allowedPrefixes) {
				let parts = irc.parseTargetPrefix(target, allowedPrefixes);
				if (parts.name === buf.name) {
					content = [html`(<${Membership} value=${parts.prefix}/>)`, " ", content];
				}
			}

			if (msg.tags["+draft/channel-context"]) {
				content = html`<em>(visible par toi seul(e))</em> ${content}`;
			}

			// D-059 : message jete par un shun, jamais parti.
			if (msg.nonTransmis) {
				lineClass += " non-transmis";
				content = html`${content} <span class="non-transmis-note">non transmis</span>`;
			}

			if (msg.isHighlight) {
				lineClass += " highlight";
			}
			break;
		case "JOIN":
			if (msg.arriveeSoi) {
				lineClass = "arrivee-soi";
				content = html`Tu as rejoint ${msg.params[0]}`;
				break;
			}
			content = html`
				${createNick(msg.prefix.name)} a rejoint le salon
			`;
			break;
		case "PART":
		case "QUIT":
			content = html`
				${createNick(msg.prefix.name)} ${msg.command === "PART" ? "a quitté le salon" : "s'est déconnecté(e)"}${motif(msg)}
			`;
			break;
		case "NICK":
			let newNick = msg.params[0];
			content = html`
				${createNick(msg.prefix.name)} est désormais connu(e) sous le nom de ${createNick(newNick)}
			`;
			break;
		case "KICK":
			// Raison traduite a l'affichage (D-056), « motif non précisé » a
			// defaut (D-058). Un KICK signe par Anope (« Requested (Jeff) »)
			// nomme Jeff.
			let kick = analyseKick(msg.params[2], msg.prefix.name);
			content = html`
				${createNick(msg.params[1])} a été expulsé(e) par ${createNick(kick.auteur, false)} (${kick.raison})
			`;
			break;
		case "MODE":
			target = msg.params[0];
			let modeStr = msg.params[1];

			let user = html`${createNick(msg.prefix.name)}`;

			// TODO: use irc.forEachChannelModeUpdate()
			if (buf.type === BufferType.CHANNEL && modeStr.length === 2 && server.cm(buf.name) === server.cm(target)) {
				let plusMinus = modeStr[0];
				let mode = modeStr[1];
				let arg = msg.params[2];

				let verb;
								switch (mode) {
				case "b":
					// D-059 : un ~quiet n'est pas un ban, c'est un mutisme.
					if (pseudoMuet(arg)) {
						content = plusMinus === "+"
							? html`${user} a rendu ${createNick(pseudoMuet(arg))} muet(te)`
							: html`${user} a rendu la parole à ${createNick(pseudoMuet(arg))}`;
						break;
					}
					verb = plusMinus === "+" ? "a banni" : "a débanni";
					content = html`${user} ${verb} ${arg}`;
					break;
				case "e":
					verb = plusMinus === "+" ? "a ajouté" : "a retiré";
					content = html`${user} ${verb} une exemption de ban pour ${arg}`;
					break;
				case "l":
					if (plusMinus === "+") {
						content = html`${user} a limité le salon à ${arg} utilisateurs`;
					} else {
						content = html`${user} a retiré la limite d'utilisateurs du salon`;
					}
					break;
				case "i":
					verb = plusMinus === "+" ? "a activé" : "a retiré";
					content = html`${user} ${verb} le mode invitation du salon`;
					break;
				case "m":
					verb = plusMinus === "+" ? "a activé" : "a retiré";
					content = html`${user} ${verb} le mode modération du salon`;
					break;
				case "s":
					verb = plusMinus === "+" ? "a rendu secret" : "a rendu public";
					content = html`${user} ${verb} le salon`;
					break;
				case "t":
					verb = plusMinus === "+" ? "a verrouillé" : "a déverrouillé";
					content = html`${user} ${verb} le topic du salon`;
					break;
				case "n":
					verb = plusMinus === "+" ? "a interdit" : "a autorisé";
					content = html`${user} ${verb} les messages externes au salon`;
					break;
				}
				if (content) {
					break;
				}

				// Channel membership modes
				let membershipName;
				for (let membership of server.membershipModes) {
					if (membership.mode === mode) {
						membershipName = irc.STD_MEMBERSHIP_NAMES[membership.prefix];
						break;
					}
				}

				if (membershipName && arg) {
					let verb = plusMinus === "+" ? "a donné" : "a retiré";
					content = html`
						${user} ${verb} les privilèges de ${membershipName} à ${createNick(arg)}
					`;
					break;
				}
			}

			content = html`
				${user} applique le mode ${msg.params.slice(1).join(" ")}
			`;
			if (server.cm(buf.name) !== server.cm(target)) {
				content = html`${content} sur ${target}`;
			}
			break;
		case "TOPIC":
			let topic = msg.params[1];
			if (topic) {
				content = html`
					${createNick(msg.prefix.name)} a changé le topic en : ${linkify(stripANSI(topic), onChannelClick)}
				`;
			} else {
				content = html`
					${createNick(msg.prefix.name)} a effacé le topic
				`;
			}
			break;
		case "INVITE":
			invitee = msg.params[0];
			let channel = msg.params[1];
			// TODO: instead of checking buffer type, check if invitee is our nick
			if (buf.type === BufferType.SERVER) {
				lineClass = "talk";
				content = html`
					${createNick(msg.prefix.name)} t'invite dans ${createChannel(channel)}
				`;
			} else {
				content = html`
					${createNick(msg.prefix.name)} a invité ${createNick(invitee)} dans le salon
				`;
			}
			break;
		case irc.RPL_WELCOME:
			let nick = msg.params[0];
			content = html`Connecté(e) au t'Chat, ton pseudo est ${nick}`;
			break;
		case irc.RPL_INVITING:
			invitee = msg.params[1];
			content = html`${createNick(invitee)} a été invité(e) dans le salon`;
			break;
		case irc.RPL_MOTD:
			lineClass = "motd";
			content = linkify(stripANSI(msg.params[1]), onChannelClick);
			break;
		case irc.RPL_LOGGEDIN:
			account = msg.params[2];
			content = html`Tu es maintenant authentifié(e) en tant que ${account}`;
			break;
		case irc.RPL_LOGGEDOUT:
			content = html`Tu n'es plus authentifié(e)`;
			break;
		case "REGISTER":
			account = msg.params[1];
			let reason = msg.params[2];

			function handleVerifyClick(event) {
				event.preventDefault();
				onVerifyClick(account, reason);
			}

			switch (msg.params[0]) {
			case "SUCCESS":
				content = html`A new account has been created, you are now authenticated as ${account}`;
				break;
			case "VERIFICATION_REQUIRED":
				content = html`A new account has been created, but you need to <a href="#" onClick=${handleVerifyClick}>verify it</a>: ${linkify(reason, onChannelClick)}`;
				break;
			}
			break;
		case "VERIFY":
			account = msg.params[1];
			content = html`Le nouveau compte a été vérifié, tu es authentifié(e) en tant que ${account}`;
			break;
		case irc.RPL_UMODEIS:
			let mode = msg.params[1];
			if (mode) {
				content = html`Ton mode utilisateur est ${mode}`;
			} else {
				content = html`Tu n'as aucun mode utilisateur`;
			}
			break;
		case irc.RPL_CHANNELMODEIS:
			content = html`Le mode du salon est ${msg.params.slice(2).join(" ")}`;
			break;
		case irc.RPL_CREATIONTIME:
			let date = new Date(parseInt(msg.params[2], 10) * 1000);
			content = html`Le salon a été créé le ${date.toLocaleString()}`;
			break;
		// MONITOR messages are only displayed in user buffers
		case irc.RPL_MONONLINE:
			content = html`${createNick(buf.name)} est en ligne`;
			break;
		case irc.RPL_MONOFFLINE:
			content = html`${createNick(buf.name)} est hors ligne`;
			break;
		default:
			if (irc.isError(msg.command) && msg.command !== irc.ERR_NOMOTD) {
				lineClass = "error";
			}
			content = html`${msg.command} ${linkify(msg.params.join(" "), onChannelClick)}`;
		}

		if (!content) {
			return null;
		}

		return html`
			<div class="logline ${lineClass}" data-key=${msg.key} role="listitem">
				<${Timestamp} date=${new Date(msg.tags.time)} url=${getMessageURL(buf, msg)}/>
				${" "}
				${content}
			</div>
		`;
	}
}

/*
 * Arrivees, departs et deconnexions consecutifs, replies en une ligne
 * (D-062) : « Kahen, Léa, Bob et 2 autres ont rejoint le salon ». Au-dela
 * de trois pseudos, « et N autres ». Le detail, une ligne par evenement
 * avec son motif, s'ouvre au clic.
 */
export class FoldGroup extends Component {
	constructor(props) {
		super(props);
		this.state = { ouvert: false };
		this.basculer = this.basculer.bind(this);
	}

	shouldComponentUpdate(nextProps, nextState) {
		return this.props.messages[0] !== nextProps.messages[0] ||
			this.props.messages[this.props.messages.length - 1] !== nextProps.messages[nextProps.messages.length - 1] ||
			this.state.ouvert !== nextState.ouvert;
	}

	basculer(event) {
		event.preventDefault();
		this.setState((state) => ({ ouvert: !state.ouvert }));
	}

	render() {
		let msgs = this.props.messages;
		let buf = this.props.buffer;
		let server = this.props.server;
		let ouvert = this.state.ouvert;

		let onNickClick = this.props.onNickClick;
		function createNick(nick) {
			return html`
				<${Nick}
					nick=${nick}
					user=${server.users.get(nick)}
					onClick=${(event) => onNickClick(nick, event)}
				/>
			`;
		}

		let basculer = this.basculer;
		let content = [];
		for (let { liste, verbe } of resumerGroupe(msgs)) {
			if (content.length > 0) {
				content.push(", ");
			}
			for (let morceau of morceauxListe(liste)) {
				if (typeof morceau === "string") {
					content.push(morceau);
				} else if (morceau.pseudo !== undefined) {
					content.push(createNick(morceau.pseudo));
				} else {
					content.push(html`
						<button type="button" class="fold-autres" aria-expanded=${ouvert} onClick=${basculer}>${texteAutres(morceau.autres)}</button>
					`);
				}
			}
			content.push(" " + verbe);
		}

		msgs.filter((msg) => msg.command === "NICK").forEach((msg) => {
			if (content.length > 0) {
				content.push(", ");
			}
			content.push(html`
				${createNick(msg.prefix.name)} est désormais connu(e) sous le nom de ${createNick(msg.params[0])}
			`);
		});

		let lastMsg = msgs[msgs.length - 1];
		let firstDate = new Date(msgs[0].tags.time);
		let lastDate = new Date(lastMsg.tags.time);
		let timestamp = html`
			<${Timestamp} date=${firstDate} url=${getMessageURL(buf, msgs[0])}/>
		`;
		if (lastDate - firstDate > 60 * 100) {
			timestamp = [
				timestamp,
				" — ",
				html`
					<${Timestamp} date=${lastDate} url=${getMessageURL(buf, lastMsg)}/>
				`,
			];
		}

		let detail = null;
		if (ouvert) {
			detail = html`
				<div class="fold-detail" role="list">
					${msgs.map((msg) => this.props.renderLigne(msg))}
				</div>
			`;
		}

		return html`
			<div class="logline fold" data-key=${msgs[0].key} role="listitem">
				${timestamp}
				${" "}
				${content}
				${" "}
				<button type="button" class="fold-bascule" aria-expanded=${ouvert} onClick=${basculer}>
					${ouvert ? "masquer" : "détail"}
				</button>
				${detail}
			</div>
		`;
	}
}

// Workaround for https://bugs.chromium.org/p/chromium/issues/detail?id=481856
let notificationsSupported = false;
if (window.Notification) {
	notificationsSupported = true;
	if (Notification.permission === "default") {
		try {
			new Notification("");
		} catch (err) {
			if (err.name === "TypeError") {
				notificationsSupported = false;
			}
		}
	}
}

class NotificationNagger extends Component {
	state = { nag: false };

	constructor(props) {
		super(props);

		this.handleClick = this.handleClick.bind(this);

		this.state.nag = this.shouldNag();
	}

	shouldNag() {
		return notificationsSupported && Notification.permission === "default";
	}

	handleClick(event) {
		event.preventDefault();

		Notification.requestPermission((permission) => {
			this.setState({ nag: this.shouldNag() });
		});
	}

	render() {
		if (!this.state.nag) {
			return null;
		}

		return html`
			<div class="logline nag" role="listitem">
				<${Timestamp}/>
				${" "}
											<a href="#" onClick=${this.handleClick}>Activez les notifications</a> pour être prévenu(e) des nouveaux messages
			</div>
		`;
	}
}

class ProtocolHandlerNagger extends Component {
	state = { nag: true };

	constructor(props) {
		super(props);

		this.handleClick = this.handleClick.bind(this);

		this.state.nag = !store.naggedProtocolHandler.load();
	}

	handleClick(event) {
		event.preventDefault();

		let url = window.location.origin + window.location.pathname + "?open=%s";
		try {
			navigator.registerProtocolHandler("irc", url);
			navigator.registerProtocolHandler("ircs", url);
		} catch (err) {
			console.error("Failed to register protocol handler: ", err);
		}

		store.naggedProtocolHandler.put(true);
		this.setState({ nag: false });
	}

	render() {
		if (!navigator.registerProtocolHandler || !this.state.nag) {
			return null;
		}
		return html`
			<div class="logline nag" role="listitem">
				<${Timestamp}/>
				${" "}
											<a href="#" onClick=${this.handleClick}>Ouvre les liens de salons</a> directement dans le t'Chat
			</div>
		`;
	}
}

function AccountNagger({ server, onAuthClick, onRegisterClick }) {
	let accDesc = "an account on this server";
	if (server.name) {
		accDesc = "a " + server.name + " account";
	}

	function handleAuthClick(event) {
		event.preventDefault();
		onAuthClick();
	}
	function handleRegisterClick(event) {
		event.preventDefault();
		onRegisterClick();
	}

	let msg = [html`
		You are unauthenticated on this server,
		${" "}
		<a href="#" onClick=${handleAuthClick}>login</a>
		${" "}
	`];

	if (server.supportsAccountRegistration) {
		msg.push(html`or <a href="#" onClick=${handleRegisterClick}>register</a> ${accDesc}`);
	} else {
		msg.push(html`if you have ${accDesc}`);
	}

	return html`
		<div class="logline nag" role="listitem">
			<${Timestamp}/> ${msg}
		</div>
	`;
}

class DateSeparator extends Component {
	constructor(props) {
		super(props);
	}

	shouldComponentUpdate(nextProps) {
		return this.props.date.getTime() !== nextProps.date.getTime();
	}

	render() {
		let date = this.props.date;
		let text = date.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
		return html`
			<div class="separator date-separator" role="separator">
				${text}
			</div>
		`;
	}
}

function UnreadSeparator(props) {
	return html`<div class="separator unread-separator" role="separator">Nouveaux messages</div>`;
}

function sameDate(d1, d2) {
	return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export default class Buffer extends Component {
	shouldComponentUpdate(nextProps) {
		return this.props.buffer !== nextProps.buffer ||
			this.props.settings !== nextProps.settings;
	}

	render() {
		let buf = this.props.buffer;
		if (!buf) {
			return null;
		}

		let server = this.props.server;
		let settings = this.props.settings;
		let serverName = server.name;

		let children = [];
		if (buf.type === BufferType.SERVER) {
			children.push(html`<${NotificationNagger}/>`);
		}
		if (buf.type === BufferType.SERVER && server.isBouncer && !server.bouncerNetID) {
			children.push(html`<${ProtocolHandlerNagger} bouncerName=${serverName}/>`);
		}
		if (buf.type === BufferType.SERVER && server.status === ServerStatus.REGISTERED && server.supportsSASLPlain && !server.account) {
			children.push(html`
				<${AccountNagger}
					server=${server}
					onAuthClick=${this.props.onAuthClick}
					onRegisterClick=${this.props.onRegisterClick}
				/>
			`);
		}

		let onChannelClick = this.props.onChannelClick;
		let onNickClick = this.props.onNickClick;
		let onVerifyClick = this.props.onVerifyClick;

		function createLogLine(msg) {
			return html`
				<${LogLine}
					key=${"msg-" + msg.key}
					message=${msg}
					buffer=${buf}
					server=${server}
					redacted=${buf.redacted.has(msg.tags.msgid)}
					onChannelClick=${onChannelClick}
					onNickClick=${onNickClick}
					onVerifyClick=${onVerifyClick}
				/>
			`;
		}
		function createFoldGroup(msgs) {
			// Merge NICK change chains
			let nickChanges = new Map();
			let mergedMsgs = [];
			for (let msg of msgs) {
				let keep = true;
				switch (msg.command) {
				case "PART":
				case "QUIT":
					nickChanges.delete(msg.prefix.name);
					break;
				case "NICK":
					let prev = nickChanges.get(msg.prefix.name);
					if (!prev) {
						// Future NICK messages may mutate this one
						msg = { ...msg };
						nickChanges.set(msg.params[0], msg);
						break;
					}

					prev.params = msg.params;
					nickChanges.delete(msg.prefix.name);
					nickChanges.set(msg.params[0], prev);
					keep = false;
					break;
				}
				if (keep) {
					mergedMsgs.push(msg);
				}
			}
			msgs = mergedMsgs;

			// D-062 : seules les reconnexions (deconnexion puis retour en moins
			// d'une minute) sont retirees, et les NICK sans effet. Gamja
			// retirait toute paire depart et retour : dans un salon calme, ou
			// tout est consecutif, la plupart des evenements disparaissaient.
			msgs = retirerReconnexions(msgs, server.cm);

			if (msgs.length === 0) {
				return null;
			} else if (msgs.length === 1) {
				return createLogLine(msgs[0]);
			}
			return html`
				<${FoldGroup}
					key=${"fold-" + msgs[0].key + "-" + msgs[msgs.length - 1].key}
					messages=${msgs}
					buffer=${buf}
					server=${server}
					onNickClick=${onNickClick}
					renderLigne=${createLogLine}
				/>
			`;
		}

		let hasUnreadSeparator = false;
		let prevDate = new Date();
		let foldMessages = [];
		let lastMonitor = null;
		buf.messages.forEach((msg) => {
			let sep = [];

			if (settings.bufferEvents === BufferEventsDisplayMode.HIDE && canFoldMessage(msg)) {
				return;
			}

			if (msg.command === irc.RPL_MONONLINE || msg.command === irc.RPL_MONOFFLINE) {
				let skip = !lastMonitor || msg.command === lastMonitor;
				lastMonitor = msg.command;
				if (skip) {
					return;
				}
			}

			if (!hasUnreadSeparator && buf.type !== BufferType.SERVER && !isMessageBeforeReceipt(msg, buf.prevReadReceipt)) {
				sep.push(html`<${UnreadSeparator} key="unread"/>`);
				hasUnreadSeparator = true;
			}

			let date = new Date(msg.tags.time);
			if (!sameDate(prevDate, date)) {
				sep.push(html`<${DateSeparator} key=${"date-" + date} date=${date}/>`);
			}
			prevDate = date;

			if (sep.length > 0) {
				children.push(createFoldGroup(foldMessages));
				children.push(...sep);
				foldMessages = [];
			}

			// TODO: consider checking the time difference too
			if (settings.bufferEvents === BufferEventsDisplayMode.FOLD && canFoldMessage(msg)) {
				foldMessages.push(msg);
				return;
			}

			if (foldMessages.length > 0) {
				children.push(createFoldGroup(foldMessages));
				foldMessages = [];
			}

			children.push(createLogLine(msg));
		});
		children.push(createFoldGroup(foldMessages));

		return html`
			<div class="logline-list" role="list">
				${children}
			</div>
		`;
	}
}
