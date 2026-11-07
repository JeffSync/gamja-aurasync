import { html, Component } from "../lib/index.js";
import linkify from "../lib/linkify.js";
import * as irc from "../lib/irc.js";
import { strip as stripANSI } from "../lib/ansi.js";
import { BufferType, ServerStatus, getMessageURL, isMessageBeforeReceipt, SettingsContext } from "../state.js";
import * as store from "../store.js";
import Membership from "./membership.js";
import { pseudoMuet } from "../lib/mutisme.js";
import { analyseKick, MOTIF_NON_PRECISE, translateError, translateServerNotice, translateServerMode } from "../lib/irc-errors.js";
import { estServeur, nomServeur } from "../lib/serveur.js";
import { motifDepart } from "../lib/evenements.js";
import { cibleBan, expulsesAvant, kickDuBan, libelleMasque, verbeBan } from "../lib/ban.js";
import { libelleDuree, minutesBan } from "../lib/listes.js";
import { assembler, fragmentReglage, phraseRang, REGLAGE_INCONNU } from "../lib/reglages.js";
import { avantHistorique, SEPARATEUR_HISTORIQUE } from "../lib/historique.js";
import { segmentsMarques } from "../lib/pour-toi.js";
import { TEXTES } from "../lib/notifications.js";

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

/*
 * Le texte d'un message, liens compris, et ton propre pseudo marque d'un
 * <mark> quand il te mentionne (D-066, point 6). `marques` vient de
 * prepareChatMessage (irc.highlightRanges) ; un pseudo n'est jamais dans un
 * lien, isHighlight ecartant les adresses.
 */
function texteMarque(texte, marques, onChannelClick) {
	if (!marques || marques.length === 0) {
		return linkify(texte, onChannelClick);
	}
	return segmentsMarques(texte, marques).map((s) => {
		return s.moi ? html`<mark class="moi">${s.texte}</mark>` : linkify(s.texte, onChannelClick);
	});
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

/* Les classes de CHANMODES et les rangs, tels que le serveur les annonce. */
function isupportDe(server) {
	return {
		chanModes: () => server.chanModes || ["beI", "k", "l", "imnst"],
		membershipModes: () => server.membershipModes || [],
	};
}

/*
 * Une ligne MODE en une phrase francaise (D-056, D-068) : « Jeff a activé
 * le salon modéré et retiré les couleurs des messages ». Les bans, les
 * mutismes et les rangs gardent leurs phrases (D-058, D-059, D-062) ; un
 * masque n'est jamais montre brut (lib/ban.js) ; une lettre inconnue du fork
 * donne « a changé un réglage du salon », et son detail part dans la
 * console.
 */
function ligneMode(msg, buf, server, createNick) {
	let auteur = createNick(msg.prefix.name);
	let changements = [];
	try {
		irc.forEachChannelModeUpdate(msg, isupportDe(server), (mode, add, arg, type) => {
			changements.push({ mode, add, arg, type });
		});
	} catch (err) {
		console.error("Ligne MODE illisible :", msg.params.join(" "), err);
		return html`${auteur} a ${REGLAGE_INCONNU}`;
	}
	if (buf.type !== BufferType.CHANNEL) {
		return html`${auteur} a changé tes réglages de connexion`;
	}
	// Anti-flood : le serveur ralentit le salon, puis le rouvre
	if (changements.length === 1 && changements[0].mode === "m" && estServeur(msg.prefix.name)) {
		return translateServerMode(changements[0].add ? "+" : "-", "m");
	}

	let rangs = new Map((server.membershipModes || []).map((m) => [m.mode, m.prefix]));
	let morceaux = [];
	let inconnu = false;
	for (let { mode, add, arg } of changements) {
		if (rangs.has(mode) && arg) {
			morceaux.push(html`${phraseRang(rangs.get(mode), add)} ${createNick(arg)}`);
			continue;
		}
		if (mode === "b" && arg) {
			// D-059 : un ~quiet n'est pas un ban, c'est un mutisme.
			let muet = pseudoMuet(arg);
			if (muet) {
				morceaux.push(add ? html`rendu ${createNick(muet)} muet(te)` : html`rendu la parole à ${createNick(muet)}`);
				continue;
			}
			// D-062 : jamais le masque brut. La personne visee si le masque
			// la designe (expulsee juste avant, ou seule du salon a
			// correspondre), sinon « une adresse ».
			let index = buf.messages ? buf.messages.indexOf(msg) : -1;
			let cible = cibleBan(arg, {
				expulses: index >= 0 ? expulsesAvant(buf.messages, index) : [],
				presents: buf.members ? Array.from(buf.members.keys()) : [],
				personne: (pseudo) => server.users.get(pseudo),
			});
			let verbe = verbeBan(add ? "+" : "-", cible).replace(/^a /, "");
			// Lot C : la duree d'un ~time:N:, et le motif du KICK qui
			// precede (« a banni Kahen pendant 1 heure : insultes »)
			let suite = "";
			let minutes = minutesBan(arg);
			if (add && minutes !== null) {
				suite += " pendant " + libelleDuree(minutes);
			}
			let kick = add && cible && index >= 0 ? kickDuBan(buf.messages, index, msg.prefix.name, cible, server.cm) : null;
			if (kick) {
				let raison = analyseKick(kick.params[2], kick.prefix.name).raison;
				if (raison !== MOTIF_NON_PRECISE) {
					suite += " : " + raison;
				}
			}
			morceaux.push(cible ? html`${verbe} ${createNick(cible, false)}${suite}` : verbe + suite);
			continue;
		}
		if ((mode === "e" || mode === "I") && arg) {
			// D-068, point 6 : jamais une adresse reelle
			let qui = libelleMasque(arg).texte;
			if (mode === "e") {
				morceaux.push((add ? "ajouté une exemption de ban" : "retiré l'exemption de ban") + " pour " + qui);
			} else {
				morceaux.push((add ? "ajouté une invitation permanente" : "retiré l'invitation permanente") + " pour " + qui);
			}
			continue;
		}
		let fragment = fragmentReglage(mode, add, arg);
		if (fragment) {
			morceaux.push(fragment);
			continue;
		}
		console.error("Réglage de salon inconnu :", (add ? "+" : "-") + mode, arg || "");
		if (!inconnu) {
			inconnu = true;
			morceaux.push(REGLAGE_INCONNU);
		}
	}
	if (!morceaux.length) {
		return html`${auteur} a ${REGLAGE_INCONNU}`;
	}
	return html`${auteur} a ${assembler(morceaux)}`;
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
			// Le serveur parle dans un salon (avis de l'anti-flood aux % et
			// @) : jamais son texte brut (D-056)
			if (msg.command === "NOTICE" && estServeur(msg.prefix.name) && buf.type === BufferType.CHANNEL) {
				text = translateServerNotice(text, buf.name);
			}

			let ctcp = irc.parseCTCP(msg);
			if (ctcp) {
				if (ctcp.command === "ACTION") {
					lineClass = "me-tell";
					content = html`* ${createNick(msg.prefix.name)} ${texteMarque(stripANSI(ctcp.param), msg.marques, onChannelClick)}`;
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
					// Un avis du serveur traduit n'a plus les positions d'origine
					let marques = text === msg.params[1] ? msg.marques : null;
					content = html`${texteMarque(stripANSI(text), marques, onChannelClick)}`;
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
			content = ligneMode(msg, buf, server, createNick);
			if (content && server.cm(buf.name) !== server.cm(target)) {
				content = html`${content} sur ${target}`;
			}
			break;
		case "TOPIC":
			let topic = msg.params[1];
			if (topic) {
				content = html`
					${createNick(msg.prefix.name)} a changé le sujet : ${linkify(stripANSI(topic), onChannelClick)}
				`;
			} else {
				content = html`
					${createNick(msg.prefix.name)} a effacé le sujet
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
		case irc.RPL_CREATIONTIME:
			// D-068 : lus par state.js (buf.modes), jamais affiches
			break;
		case irc.ERR_MLOCKRESTRICTED:
			// D-068 : le verrou de SalonSync, dit dans le salon vise
			lineClass = "error";
			content = html`${translateError(msg.command, msg.params[msg.params.length - 1])}`;
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

// D-062 : au-dessus des messages ecrits avant son arrivee.
function HistorySeparator(props) {
	return html`<div class="separator history-separator" role="separator">${SEPARATEUR_HISTORIQUE}</div>`;
}

function UnreadSeparator(props) {
	return html`<div class="separator unread-separator" role="separator">Nouveaux messages</div>`;
}

/*
 * D-066, point 7 : la proposition d'activer les notifications, faite une
 * fois, sous la premiere mention ou le premier message prive recu.
 */
function PropositionNotifications(props) {
	return html`
		<div class="logline proposition-notif" role="listitem">
			<span>${TEXTES.proposition}</span>
			${" "}
			<button type="button" class="proposition-activer" onClick=${props.onActiver}>${TEXTES.activer}</button>
			${" "}
			<button type="button" class="proposition-refuser" onClick=${props.onRefuser}>${TEXTES.nonMerci}</button>
		</div>
	`;
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
		let serverName = server.name;

		let children = [];
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
		let props = this.props;

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
		let hasUnreadSeparator = false;
		let prevDate = new Date();
		let lastMonitor = null;
		let precedent;
		buf.messages.forEach((msg) => {
			let sep = [];

			if (msg.command === irc.RPL_MONONLINE || msg.command === irc.RPL_MONOFFLINE) {
				let skip = !lastMonitor || msg.command === lastMonitor;
				lastMonitor = msg.command;
				if (skip) {
					return;
				}
			}

			if (avantHistorique(precedent, msg)) {
				sep.push(html`<${HistorySeparator} key=${"historique-" + msg.key}/>`);
			}
			precedent = msg;

			if (!hasUnreadSeparator && buf.type !== BufferType.SERVER && !isMessageBeforeReceipt(msg, buf.prevReadReceipt)) {
				sep.push(html`<${UnreadSeparator} key="unread"/>`);
				hasUnreadSeparator = true;
			}

			let date = new Date(msg.tags.time);
			if (!sameDate(prevDate, date)) {
				sep.push(html`<${DateSeparator} key=${"date-" + date} date=${date}/>`);
			}
			prevDate = date;

			// D-062 : une ligne par evenement, arrivees et departs compris,
			// jamais repliee ni retiree.
			children.push(...sep);
			children.push(createLogLine(msg));
			if (buf.propositionNotif !== undefined && buf.propositionNotif === msg.key) {
				children.push(html`
					<${PropositionNotifications}
						key="proposition-notif"
						onActiver=${props.onNotifActiver}
						onRefuser=${props.onNotifRefuser}
					/>
				`);
			}
		});

		return html`
			<div class="logline-list" role="list">
				${children}
			</div>
		`;
	}
}
