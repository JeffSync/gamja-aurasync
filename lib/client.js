import * as irc from "./irc.js";
import { finServeur, finPseudoPris, finIdentification, apresFermeture, reessaiPseudo } from "./connexion.js";
import { suivreLabel, decisionEnvoi, decisionSonde, sonde, DELAI_REPONSE } from "./shun.js";

// Static list of capabilities that are always requested when supported by the
// server
const permanentCaps = [
	"account-notify",
	"away-notify",
	"batch",
	"chghost",
	"echo-message",
	"extended-join",
	"extended-monitor",
	"invite-notify",
	"labeled-response",
	"message-tags",
	"multi-prefix",
	"sasl",
	"server-time",
	"setname",

	"draft/account-registration",
	"draft/chathistory",
	"draft/extended-monitor",
	"draft/message-redaction",
	"draft/read-marker",

	"soju.im/bouncer-networks",
];

const RECONNECT_MIN_DELAY_MSEC = 10 * 1000; // 10s
const RECONNECT_MAX_DELAY_MSEC = 10 * 60 * 1000; // 10min

// WebSocket status codes
// https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
const WEBSOCKET_CLOSE_CODES = {
	NORMAL_CLOSURE: 1000,
	GOING_AWAY: 1001,
	PROTOCOL_ERROR: 1002,
	UNSUPPORTED_DATA: 1003,
	NO_STATUS_CODE: 1005,
	ABNORMAL_CLOSURE: 1006,
	INVALID_FRAME_PAYLOAD_DATA: 1007,
	POLICY_VIOLATION: 1008,
	MESSAGE_TOO_BIG: 1009,
	MISSING_MANDATORY_EXT: 1010,
	INTERNAL_SERVER_ERROR: 1011,
	TLS_HANDSHAKE_FAILED: 1015,
};
// See https://github.com/quakenet/snircd/blob/master/doc/readme.who
// Sorted by order of appearance in RPL_WHOSPCRPL
const WHOX_FIELDS = {
	"channel": "c",
	"username": "u",
	"hostname": "h",
	"server": "s",
	"nick": "n",
	"flags": "f",
	"account": "a",
	"realname": "r",
};

const FALLBACK_SERVER_PREFIX = { name: "*" };

let lastPing = 0;
let lastLabel = 0;
let lastWhoxToken = 0;

export class IRCError extends Error {
	constructor(msg) {
		let text;
		if (msg.params.length > 0) {
			// IRC errors have a human-readable message as last param
			text = msg.params[msg.params.length - 1];
		} else {
			text = `erreur inconnue (${msg.command})`;
		}
		super(text);

		this.msg = msg;
	}
}

/**
 * Implements a simple exponential backoff.
 */
class Backoff {
	n = 0;

	constructor(base, max) {
		this.base = base;
		this.max = max;
	}

	reset() {
		this.n = 0;
	}

	next() {
		if (this.n === 0) {
			this.n = 1;
			return 0;
		}

		let dur = this.n * this.base;
		if (dur > this.max) {
			dur = this.max;
		} else {
			this.n *= 2;
		}

		return dur;
	}
}

export default class Client extends EventTarget {
	static Status = {
		DISCONNECTED: "disconnected",
		CONNECTING: "connecting",
		REGISTERING: "registering",
		REGISTERED: "registered",
	};

	status = Client.Status.DISCONNECTED;
	serverPrefix = FALLBACK_SERVER_PREFIX;
	nick = null;
	supportsCap = false;
	caps = new irc.CapRegistry();
	isupport = new irc.Isupport();

	ws = null;
	params = {
		url: null,
		username: null,
		realname: null,
		nick: null,
		pass: null,
		saslPlain: null,
		saslExternal: false,
		saslOauthBearer: null,
		bouncerNetwork: null,
		ping: 0,
		eventPlayback: true,
	};
	debug = false;
	batches = new Map();
	autoReconnect = true;
	reconnectTimeoutID = null;
	/* Notre propre QUIT (page quittee) : l'ERROR qui suit se tait. */
	quitting = false;
	essaisPseudo = 0;
	pseudoTimeoutID = null;
	/* Shun detecte (lib/shun.js) : annonce par l'evenement « restriction ». */
	restreint = false;
	reconnectBackoff = new Backoff(RECONNECT_MIN_DELAY_MSEC, RECONNECT_MAX_DELAY_MSEC);
	lastReconnectDate = new Date(0);
	pingIntervalID = null;
	pendingCmds = {
		WHO: Promise.resolve(null),
		CHATHISTORY: Promise.resolve(null),
	};
	cm = irc.CaseMapping.RFC1459;
	monitored = new irc.CaseMapMap(null, irc.CaseMapping.RFC1459);
	pendingLists = new irc.CaseMapMap(null, irc.CaseMapping.RFC1459);
	whoxQueries = new Map();

	constructor(params) {
		super();

		this.handleOnline = this.handleOnline.bind(this);
		this.handleOffline = this.handleOffline.bind(this);

		this.params = { ...this.params, ...params };

		this.reconnect();
	}

	reconnect() {
		let autoReconnect = this.autoReconnect;
		this.disconnect();
		this.autoReconnect = autoReconnect;

		this.quitting = false;

		console.log("Connecting to " + this.params.url);
		this.setStatus(Client.Status.CONNECTING);
		this.lastReconnectDate = new Date();

		try {
			this.ws = new WebSocket(this.params.url);
		} catch (err) {
			console.error("Failed to create connection:", err);
			setTimeout(() => {
				// La cause (texte du navigateur, en anglais) reste dans la console.
				this.dispatchError(new Error("Connexion au t'Chat impossible"));
				this.setStatus(Client.Status.DISCONNECTED);
			}, 0);
			return;
		}
		this.ws.addEventListener("open", this.handleOpen.bind(this));

		this.ws.addEventListener("message", (event) => {
			try {
				this.handleMessage(event);
			} catch (err) {
				this.dispatchError(err);
				this.disconnect();
			}
		});

		this.ws.addEventListener("close", (event) => {
			console.log("Connection closed (code: " + event.code + ")");
			window.removeEventListener("offline", this.handleOffline);
			clearTimeout(this.pseudoTimeoutID);

			// Sans ERROR, une fermeture est une coupure : banniere
			// « Connexion perdue, reconnexion… », effacee une fois reconnecte.
			// Apres un ERROR definitif (disconnect() deja appele), rien : son
			// message reste affiche.
			let banniere = apresFermeture({ reconnexion: this.autoReconnect });
			if (banniere) {
				this.dispatchError(new Error(banniere));
			}

			this.ws = null;
			this.setStatus(Client.Status.DISCONNECTED);
			this.nick = null;
			this.serverPrefix = FALLBACK_SERVER_PREFIX;
			this.caps = new irc.CapRegistry();
			this.batches = new Map();
			Object.keys(this.pendingCmds).forEach((k) => {
				this.pendingCmds[k] = Promise.resolve(null);
			});
			this.isupport = new irc.Isupport();
			this.monitored = new irc.CaseMapMap(null, irc.CaseMapping.RFC1459);

			if (this.autoReconnect) {
				window.addEventListener("online", this.handleOnline);

				if (!navigator.onLine) {
					console.info("Waiting for network to go back online");
				} else {
					let delay = this.reconnectBackoff.next();
					let sinceLastReconnect = new Date().getTime() - this.lastReconnectDate.getTime();
					if (sinceLastReconnect < RECONNECT_MIN_DELAY_MSEC) {
						delay = Math.max(delay, RECONNECT_MIN_DELAY_MSEC);
					}
					console.info("Reconnecting to server in " + (delay / 1000) + " seconds");
					clearTimeout(this.reconnectTimeoutID);
					this.reconnectTimeoutID = setTimeout(() => {
						this.reconnect();
					}, delay);
				}
			}
		});
	}

	disconnect() {
		this.autoReconnect = false;

		clearTimeout(this.reconnectTimeoutID);
		this.reconnectTimeoutID = null;

		window.removeEventListener("online", this.handleOnline);
		window.removeEventListener("offline", this.handleOffline);
		clearTimeout(this.pseudoTimeoutID);

		this.setPingInterval(0);

		if (this.ws) {
			this.ws.close(WEBSOCKET_CLOSE_CODES.NORMAL_CLOSURE);
		}
	}

	setStatus(status) {
		if (this.status === status) {
			return;
		}
		this.status = status;
		this.dispatchEvent(new CustomEvent("status"));
	}

	dispatchError(err) {
		this.dispatchEvent(new CustomEvent("error", { detail: err }));
	}

	/*
	 * Page quittee ou rechargee : on previent le serveur, pour que le pseudo
	 * soit libre a la connexion suivante (D-033 : il ne peut pas changer).
	 * Au mieux : le QUIT part avant la fermeture, sans bloquer la page.
	 */
	quit() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.quitting = true;
			this.send({ command: "QUIT", params: [] });
		}
		this.disconnect();
	}

	/* Le navigateur se sait hors ligne : on ferme, la reconnexion attend « online ». */
	handleOffline() {
		if (this.ws) {
			this.ws.close();
		}
	}

	handleOnline() {
		window.removeEventListener("online", this.handleOnline);
		if (this.autoReconnect && this.status === Client.Status.DISCONNECTED) {
			this.reconnect();
		}
	}

	handleOpen() {
		console.log("Connection opened");
		this.setStatus(Client.Status.REGISTERING);

		this.reconnectBackoff.reset();
		this.setPingInterval(this.params.ping);
		this.essaisPseudo = 0;
		window.addEventListener("offline", this.handleOffline);

		this.nick = this.params.nick;

		this.send({ command: "CAP", params: ["LS", "302"] });
		if (this.params.pass) {
			this.send({ command: "PASS", params: [this.params.pass] });
		}
		this.send({ command: "NICK", params: [this.nick] });
		this.send({
			command: "USER",
			params: [this.params.username, "0", "*", this.params.realname],
		});
	}

	pushPendingList(k, msg) {
		let l = this.pendingLists.get(k);
		if (!l) {
			l = [];
			this.pendingLists.set(k, l);
		}
		l.push(msg);
	}

	endPendingList(k, msg) {
		msg.list = this.pendingLists.get(k) || [];
		this.pendingLists.delete(k);
	}

	handleMessage(event) {
		if (typeof event.data !== "string") {
			console.error("Received unsupported data type:", event.data);
			this.ws.close(WEBSOCKET_CLOSE_CODES.UNSUPPORTED_DATA);
			return;
		}

		let raw = event.data;
		if (this.debug) {
			console.debug("Received:", raw);
		}

		let msg = irc.parseMessage(raw);

		// If the prefix is missing, assume it's coming from the server on the
		// other end of the connection
		if (!msg.prefix) {
			msg.prefix = this.serverPrefix;
		}
		if (!msg.tags) {
			msg.tags = {};
		}

		let msgBatch = null;
		if (msg.tags["batch"]) {
			msgBatch = this.batches.get(msg.tags["batch"]);
			if (msgBatch) {
				msg.batch = msgBatch;
			}
		}

		let deleteBatch = null;
		switch (msg.command) {
		case irc.RPL_WELCOME:
			if (this.params.saslPlain && !this.supportsCap) {
				this.dispatchError(new Error("Le serveur ne prend pas en charge l'authentification SASL PLAIN"));
				this.disconnect();
				return;
			}

			if (msg.prefix) {
				this.serverPrefix = msg.prefix;
			}
			this.nick = msg.params[0];

			console.log("Registration complete");
			this.setStatus(Client.Status.REGISTERED);
			break;
		case irc.RPL_ISUPPORT:
			let prevMaxMonitorTargets = this.isupport.monitor();

			let tokens = msg.params.slice(1, -1);
			this.isupport.parse(tokens);
			this.updateCaseMapping();

			let maxMonitorTargets = this.isupport.monitor();
			if (prevMaxMonitorTargets === 0 && this.monitored.size > 0 && maxMonitorTargets > 0) {
				let targets = Array.from(this.monitored.keys()).slice(0, maxMonitorTargets);
				this.send({ command: "MONITOR", params: ["+", targets.join(",")] });
			}
			break;
		case irc.RPL_ENDOFMOTD:
		case irc.ERR_NOMOTD:
			// These messages are used to indicate the end of the ISUPPORT list
			if (!this.isupport.raw.has("CASEMAPPING")) {
				// Server didn't send any CASEMAPPING token, assume RFC 1459
				this.updateCaseMapping();
			}
			break;
		case "CAP":
			this.handleCap(msg);
			break;
		case "AUTHENTICATE":
			// Both PLAIN and EXTERNAL expect an empty challenge
			let challengeStr = msg.params[0];
			if (challengeStr !== "+") {
				console.error("SASL: expected an empty challenge, got:", challengeStr);
				this.dispatchError(new Error("La connexion au t'Chat a échoué. Recharge la page."));
				this.send({ command: "AUTHENTICATE", params: ["*"] });
			} else if (this.pendingSaslResp !== null && this.pendingSaslResp !== undefined) {
				let resp = this.pendingSaslResp;
				this.pendingSaslResp = null;
				for (let m of irc.generateAuthenticateMessages(resp)) {
					this.send(m);
				}
			}
			break;
		case irc.RPL_LOGGEDIN:
			console.log("Logged in");
			break;
		case irc.RPL_LOGGEDOUT:
			console.log("Logged out");
			break;
		case irc.RPL_NAMREPLY:
			this.pushPendingList("NAMES " + msg.params[2], msg);
			break;
		case irc.RPL_ENDOFNAMES:
			this.endPendingList("NAMES " + msg.params[1], msg);
			break;
		case irc.RPL_WHOISUSER:
		case irc.RPL_WHOISSERVER:
		case irc.RPL_WHOISOPERATOR:
		case irc.RPL_WHOISIDLE:
		case irc.RPL_WHOISCHANNELS:
			this.pushPendingList("WHOIS " + msg.params[1], msg);
			break;
		case irc.RPL_ENDOFWHOIS:
			this.endPendingList("WHOIS " + msg.params[1], msg);
			break;
		case irc.RPL_BANLIST:
			this.pushPendingList("BANLIST " + this.cm(msg.params[1]), msg);
			break;
		case irc.RPL_ENDOFBANLIST:
			this.endPendingList("BANLIST " + this.cm(msg.params[1]), msg);
			break;
		case irc.RPL_WHOREPLY:
		case irc.RPL_WHOSPCRPL:
			this.pushPendingList("WHO", msg);
			break;
		case irc.RPL_ENDOFWHO:
			this.endPendingList("WHO", msg);
			break;
		case "PING":
			this.send({ command: "PONG", params: [msg.params[0]] });
			break;
		case "NICK":
			let newNick = msg.params[0];
			if (this.isMyNick(msg.prefix.name)) {
				this.nick = newNick;
			}
			break;
		case "BATCH":
			let enter = msg.params[0].startsWith("+");
			let name = msg.params[0].slice(1);
			if (enter) {
				let batch = {
					name,
					type: msg.params[1],
					params: msg.params.slice(2),
					tags: msg.tags,
					parent: msgBatch,
				};
				this.batches.set(name, batch);
			} else {
				deleteBatch = name;
			}
			break;
		case "ERROR": {
			if (this.quitting) {
				/* Reponse a notre propre QUIT. */
				this.disconnect();
				break;
			}
			let fin = finServeur(msg.params[msg.params.length - 1]);
			if (fin.reconnecter) {
				/* Simple coupure : la fermeture qui suit relance la connexion. */
				this.dispatchError(new Error(fin.message));
				break;
			}
			// Kill, ban reseau, flood, identification refusee : pas de
			// reconnexion, et l'ecran de fin garde ce message.
			this.dispatchEvent(new CustomEvent("fin", { detail: fin }));
			this.disconnect();
			break;
		}
		case irc.ERR_NICKNAMEINUSE:
			if (this.status === Client.Status.REGISTERED) {
				this.dispatchError(new IRCError(msg));
				break;
			}
			// Pseudo encore tenu par une connexion que le serveur n'a pas vue
			// partir (F5 rapide), ou par un autre onglet. Le pseudo est celui
			// du compte (D-033) : on redemande le meme, quelques fois.
			let delai = reessaiPseudo(this.essaisPseudo);
			if (delai !== null) {
				this.essaisPseudo++;
				clearTimeout(this.pseudoTimeoutID);
				this.pseudoTimeoutID = setTimeout(() => {
					if (this.ws && this.status !== Client.Status.REGISTERED) {
						this.send({ command: "NICK", params: [this.nick] });
					}
				}, delai);
				break;
			}
			this.dispatchEvent(new CustomEvent("fin", { detail: finPseudoPris() }));
			this.disconnect();
			break;
		case irc.ERR_PASSWDMISMATCH:
		case irc.ERR_ERRONEUSNICKNAME:
		case irc.ERR_NICKCOLLISION:
		case irc.ERR_UNAVAILRESOURCE:
		case irc.ERR_YOUREBANNEDCREEP:
			// UnrealIRCd (banned_client, quit.c) l'envoie juste avant l'ERROR
			// « Banned (G-Lined): motif », qui porte le motif et ouvre l'ecran
			// de fin. Couper ici le perdrait.
			break;
		case irc.ERR_NOPERMFORHOST:
			this.dispatchError(new IRCError(msg));
			if (this.status !== Client.Status.REGISTERED) {
				this.disconnect();
			}
			break;
		case "FAIL":
			if (this.status === Client.Status.REGISTERED) {
				break;
			}
			if (msg.params[0] === "BOUNCER" && msg.params[2] === "BIND") {
				this.dispatchError(new Error("Failed to bind to bouncer network", {
					cause: new IRCError(msg),
				}));
				this.disconnect();
			}
			if (msg.params[1] === "ACCOUNT_REQUIRED") {
				this.dispatchError(new IRCError(msg));
				this.disconnect();
			}
			break;
		}

		this.dispatchEvent(new CustomEvent("message", {
			detail: { message: msg, batch: msgBatch },
		}));

		// Delete after firing the message event so that handlers can access
		// the batch
		if (deleteBatch) {
			this.batches.delete(deleteBatch);
		}
	}

	authenticate(mechanism, params) {
		if (!this.supportsSASL(mechanism)) {
			throw new Error("Le t'Chat ne propose pas cette méthode d'identification. Recharge la page.");
		}
		console.log(`Starting SASL ${mechanism} authentication`);

		// Send the first SASL response immediately to avoid a roundtrip
		let initialResp;
		switch (mechanism) {
		case "PLAIN":
			initialResp = "\0" + params.username + "\0" + params.password;
			break;
		case "EXTERNAL":
			initialResp = "";
			break;
		case "OAUTHBEARER":
			initialResp = "n,,\x01auth=Bearer " + params.token + "\x01\x01";
			break;
		default:
			throw new Error(`Méthode d'identification inconnue : ${mechanism}`);
		}

		let startMsg = { command: "AUTHENTICATE", params: [mechanism] };
		let promise = this.roundtrip(startMsg, (msg) => {
			switch (msg.command) {
			case irc.RPL_SASLSUCCESS:
				return true;
			case irc.ERR_NICKLOCKED:
			case irc.ERR_SASLFAIL:
			case irc.ERR_SASLTOOLONG:
			case irc.ERR_SASLABORTED:
			case irc.ERR_SASLALREADY:
				throw new IRCError(msg);
			}
		});
		this.pendingSaslResp = initialResp;
		return promise;
	}

	who(mask, options) {
		let params = [mask];

		let fields = "", token = "";
		if (options && this.isupport.whox()) {
			let match = ""; // Matches exact channel or nick

			fields = "t"; // Always include token in reply
			if (options.fields) {
				options.fields.forEach((k) => {
					if (!WHOX_FIELDS[k]) {
						throw new Error(`Unknown WHOX field ${k}`);
					}
					fields += WHOX_FIELDS[k];
				});
			}

			token = String(lastWhoxToken % 1000);
			lastWhoxToken++;

			params.push(`${match}%${fields},${token}`);
			this.whoxQueries.set(token, fields);
		}

		let msg = { command: "WHO", params };
		let l = [];
		let promise = this.pendingCmds.WHO.then(() => {
			return this.roundtrip(msg, (msg) => {
				switch (msg.command) {
				case irc.RPL_WHOREPLY:
					msg.internal = true;
					l.push(this.parseWhoReply(msg));
					break;
				case irc.RPL_WHOSPCRPL:
					if (msg.params.length !== fields.length + 1 || msg.params[1] !== token) {
						break;
					}
					msg.internal = true;
					l.push(this.parseWhoReply(msg));
					break;
				case irc.RPL_ENDOFWHO:
					if (msg.params[1] === mask) {
						msg.internal = true;
						return l;
					}
					break;
				}
			}).finally(() => {
				this.whoxQueries.delete(token);
			});
		});
		this.pendingCmds.WHO = promise.catch(() => {});
		return promise;
	}

	parseWhoReply(msg) {
		switch (msg.command) {
		case irc.RPL_WHOREPLY:
			let last = msg.params[msg.params.length - 1];
			return {
				username: msg.params[2],
				hostname: msg.params[3],
				server: msg.params[4],
				nick: msg.params[5],
				flags: msg.params[6],
				realname: last.slice(last.indexOf(" ") + 1),
			};
		case irc.RPL_WHOSPCRPL:
			let token = msg.params[1];
			let fields = this.whoxQueries.get(token);
			if (!fields) {
				throw new Error("Unknown WHOX token: " + token);
			}
			let who = {};
			let i = 0;
			Object.keys(WHOX_FIELDS).forEach((k) => {
				if (fields.indexOf(WHOX_FIELDS[k]) < 0) {
					return;
				}

				who[k] = msg.params[2 + i];
				i++;
			});
			if (who.account === "0") {
				// WHOX uses "0" to mean "no account"
				who.account = null;
			}
			return who;
		default:
			throw new Error("Not a WHO reply: " + msg.command);
		}
	}

	whois(target) {
		let targetCM = this.cm(target);
		let msg = { command: "WHOIS", params: [target] };
		return this.roundtrip(msg, (msg) => {
			let nick;
			switch (msg.command) {
			case irc.RPL_ENDOFWHOIS:
				nick = msg.params[1];
				if (this.cm(nick) === targetCM) {
					let whois = {};
					msg.list.forEach((reply) => {
						whois[reply.command] = reply;
					});
					return whois;
				}
				break;
			case irc.ERR_NOSUCHNICK:
				nick = msg.params[1];
				if (this.cm(nick) === targetCM) {
					throw new IRCError(msg);
				}
				break;
			}
		});
	}

	/*
	 * Envoie `msg` avec un label et suit sa reponse (lib/shun.js). Sans
	 * labeled-response, envoi simple. Leve tout de suite, comme send(), si
	 * la connexion est fermee.
	 */
	sendLabeled(msg) {
		if (!this.caps.enabled.has("labeled-response")) {
			this.send(msg);
			return Promise.resolve({ type: "sans-label" });
		}
		lastLabel++;
		let label = String(lastLabel);
		this.send({ ...msg, tags: { ...msg.tags, label } });

		let suivi = suivreLabel(label);
		return new Promise((resolve) => {
			let timeoutID;
			let handleMessage = (event) => {
				let resultat = suivi.recevoir(event.detail.message);
				if (resultat) {
					fin(resultat);
				}
			};
			let handleStatus = () => {
				if (this.status === Client.Status.DISCONNECTED) {
					fin({ type: "fermeture" });
				}
			};
			let fin = (resultat) => {
				clearTimeout(timeoutID);
				this.removeEventListener("message", handleMessage);
				this.removeEventListener("status", handleStatus);
				resolve(resultat);
			};
			timeoutID = setTimeout(() => fin({ type: "delai" }), DELAI_REPONSE);
			this.addEventListener("message", handleMessage);
			this.addEventListener("status", handleStatus);
		});
	}

	/*
	 * PRIVMSG ou JOIN suivi (D-059) : resout « libre », « shun » ou
	 * « inconnu ». Un ACK seul est confirme par une sonde avant de conclure.
	 * Un shun detecte, ou sa fin, part dans l'evenement « restriction ».
	 */
	sendSuivi(msg) {
		return this.sendLabeled(msg).then((resultat) => {
			let decision = decisionEnvoi(resultat);
			if (decision !== "sonder") {
				return decision;
			}
			return this.sendLabeled(sonde(this.nick)).then(decisionSonde);
		}).then((decision) => {
			let restreint = decision === "shun" ? true : decision === "libre" ? false : this.restreint;
			if (restreint !== this.restreint) {
				this.restreint = restreint;
				this.dispatchEvent(new CustomEvent("restriction", { detail: { restreint } }));
			}
			return decision;
		});
	}

	/* Masques de la liste des bans d'un salon (367 … 368). */
	fetchBanList(channel) {
		let channelCM = this.cm(channel);
		let msg = { command: "MODE", params: [channel, "+b"] };
		return this.roundtrip(msg, (msg) => {
			if (msg.command === irc.RPL_ENDOFBANLIST && this.cm(msg.params[1]) === channelCM) {
				return { masques: msg.list.map((reply) => reply.params[2]) };
			}
		}).then((result) => result.masques);
	}

	supportsSASL(mech) {
		let saslCap = this.caps.available.get("sasl");
		if (saslCap === undefined) {
			return false;
		}
		return saslCap.split(",").includes(mech);
	}

	checkAccountRegistrationCap(k) {
		let v = this.caps.available.get("draft/account-registration");
		if (v === undefined) {
			return false;
		}
		return v.split(",").includes(k);
	}

	requestCaps() {
		let wantCaps = [].concat(permanentCaps);
		if (!this.params.bouncerNetwork) {
			wantCaps.push("soju.im/bouncer-networks-notify");
		}
		if (this.params.eventPlayback) {
			wantCaps.push("draft/event-playback");
		}

		let msg = this.caps.requestAvailable(wantCaps);
		if (msg) {
			this.send(msg);
		}
	}

	handleCap(msg) {
		this.caps.parse(msg);

		let subCmd = msg.params[1];
		let args = msg.params.slice(2);
		switch (subCmd) {
		case "LS":
			this.supportsCap = true;
			if (args[0] === "*") {
				break;
			}

			console.log("Available server caps:", this.caps.available);

			this.requestCaps();

			if (this.status !== Client.Status.REGISTERED) {
				let saslPending = false;
				if (this.caps.available.has("sasl")) {
					let promise;
					if (this.params.saslPlain) {
						promise = this.authenticate("PLAIN", this.params.saslPlain);
					} else if (this.params.saslExternal) {
						promise = this.authenticate("EXTERNAL");
					} else if (this.params.saslOauthBearer) {
						promise = this.authenticate("OAUTHBEARER", this.params.saslOauthBearer);
					}
					if (promise) {
						saslPending = true;
						promise.then(() => {
							this.send({ command: "CAP", params: ["END"] });
						}).catch((err) => {
							// Identification refusee : ecran de fin, pas de
							// reconnexion (elle serait refusee de meme).
							this.dispatchEvent(new CustomEvent("fin", { detail: finIdentification(err) }));
							this.disconnect();
						});
					}
				}
				if (this.caps.available.has("soju.im/bouncer-networks") && this.params.bouncerNetwork) {
					this.send({ command: "BOUNCER", params: ["BIND", this.params.bouncerNetwork] });
				}
				if (!saslPending) {
					this.send({ command: "CAP", params: ["END"] });
				}
			}
			break;
		case "NEW":
			console.log("Server added available caps:", args[0]);
			this.requestCaps();
			break;
		case "DEL":
			console.log("Server removed available caps:", args[0]);
			break;
		case "ACK":
			console.log("Server ack'ed caps:", args[0]);
			if (this.status !== Client.Status.REGISTERED && this.saslDeferred) {
				let fn = this.saslDeferred;
				this.saslDeferred = null;
				fn();
			}
			break;
		case "NAK":
			console.log("Server nak'ed caps:", args[0]);
			if (this.status !== Client.Status.REGISTERED) {
				this.send({ command: "CAP", params: ["END"] });
			}
			break;
		}
	}

	send(msg) {
		if (!this.ws) {
			throw new Error("Message non envoyé : la connexion au t'Chat est fermée");
		}
		let raw = irc.formatMessage(msg);
		this.ws.send(raw);
		if (this.debug) {
			console.debug("Sent:", raw);
		}
	}

	updateCaseMapping() {
		this.cm = this.isupport.caseMapping();
		this.pendingLists = new irc.CaseMapMap(this.pendingLists, this.cm);
		this.monitored = new irc.CaseMapMap(this.monitored, this.cm);
	}

	isServer(name) {
		return name === "*" || this.cm(name) === this.cm(this.serverPrefix.name);
	}

	isMyNick(nick) {
		return this.cm(nick) === this.cm(this.nick);
	}

	isChannel(name) {
		let chanTypes = this.isupport.chanTypes();
		return chanTypes.indexOf(name[0]) >= 0;
	}

	isNick(name) {
		// A dollar sign is used for server-wide broadcasts
		return !this.isServer(name) && !this.isChannel(name) && !name.startsWith("$");
	}

	setPingInterval(sec) {
		clearInterval(this.pingIntervalID);
		this.pingIntervalID = null;

		if (sec <= 0) {
			return;
		}

		this.pingIntervalID = setInterval(() => {
			if (this.ws) {
				this.send({ command: "PING", params: ["gamja"] });
			}
		}, sec * 1000);
	}

	/* Execute a command that expects a response. `done` is called with message
	 * events until it returns a truthy value. */
	roundtrip(msg, done) {
		let cmd = msg.command;

		let label;
		if (this.caps.enabled.has("labeled-response")) {
			lastLabel++;
			label = String(lastLabel);
			msg.tags = { ...msg.tags, label };
		}

		return new Promise((resolve, reject) => {
			let removeEventListeners;

			let handleMessage = (event) => {
				let msg = event.detail.message;

				let msgLabel = irc.getMessageLabel(msg);
				if (msgLabel && msgLabel !== label) {
					return;
				}

				let isError = false;
				switch (msg.command) {
				case "FAIL":
					isError = msg.params[0] === cmd;
					break;
				case irc.ERR_UNKNOWNERROR:
				case irc.ERR_UNKNOWNCOMMAND:
				case irc.ERR_NEEDMOREPARAMS:
				case irc.RPL_TRYAGAIN:
					isError = msg.params[1] === cmd;
					break;
				}
				if (isError) {
					removeEventListeners();
					reject(new IRCError(msg));
					return;
				}

				let result;
				try {
					result = done(msg);
				} catch (err) {
					removeEventListeners();
					reject(err);
				}
				if (result) {
					removeEventListeners();
					resolve(result);
				}

				// TODO: handle end of labeled response somehow
			};

			let handleStatus = () => {
				if (this.status === Client.Status.DISCONNECTED) {
					removeEventListeners();
					reject(new Error("Connexion fermée"));
				}
			};

			removeEventListeners = () => {
				this.removeEventListener("message", handleMessage);
				this.removeEventListener("status", handleStatus);
			};

			// Turn on capture to handle messages before external users and
			// have the opportunity to set the "internal" flag
			this.addEventListener("message", handleMessage, { capture: true });
			this.addEventListener("status", handleStatus);
			this.send(msg);
		});
	}

	join(channel, password) {
		let params = [channel];
		if (password) {
			params.push(password);
		}
		let msg = {
			command: "JOIN",
			params,
		};
		return this.roundtrip(msg, (msg) => {
			switch (msg.command) {
			case irc.ERR_NOSUCHCHANNEL:
			case irc.ERR_TOOMANYCHANNELS:
			case irc.ERR_BADCHANNELKEY:
			case irc.ERR_BANNEDFROMCHAN:
			case irc.ERR_CHANNELISFULL:
			case irc.ERR_INVITEONLYCHAN:
				if (this.cm(msg.params[1]) === this.cm(channel)) {
					throw new IRCError(msg);
				}
				break;
			case "JOIN":
				if (this.isMyNick(msg.prefix.name) && this.cm(msg.params[0]) === this.cm(channel)) {
					return true;
				}
				break;
			}
		});
	}

	fetchBatch(msg, batchType) {
		let batchName = null;
		let messages = [];
		return this.roundtrip(msg, (msg) => {
			if (batchName) {
				let batch = msg.batch;
				while (batch) {
					if (batch.name === batchName) {
						messages.push(msg);
						break;
					}
					batch = batch.parent;
				}
			}

			if (msg.command !== "BATCH") {
				return;
			}

			let enter = msg.params[0].startsWith("+");
			let name = msg.params[0].slice(1);
			if (enter && msg.params[1] === batchType) {
				batchName = name;
				return;
			}
			if (!enter && name === batchName) {
				return { ...this.batches.get(name), messages };
			}
		});
	}

	roundtripChatHistory(params) {
		// Don't send multiple CHATHISTORY commands in parallel, we can't
		// properly handle batches and errors.
		let promise = this.pendingCmds.CHATHISTORY.then(() => {
			let msg = {
				command: "CHATHISTORY",
				params,
			};
			return this.fetchBatch(msg, "chathistory").then((batch) => batch.messages);
		});
		this.pendingCmds.CHATHISTORY = promise.catch(() => {});
		return promise;
	}

	/* Fetch one page of history before the given date. */
	async fetchHistoryBefore(target, before, limit) {
		let max = Math.min(limit, this.isupport.chatHistory());
		let params = ["BEFORE", target, "timestamp=" + before, max];
		let messages = await this.roundtripChatHistory(params);
		return { messages, more: messages.length >= max };
	}

	/* Fetch history in ascending order. */
	async fetchHistoryBetween(target, after, before, limit) {
		let max = Math.min(limit, this.isupport.chatHistory());
		let params = ["AFTER", target, "timestamp=" + after.time, max];
		let messages = await this.roundtripChatHistory(params);
		limit -= messages.length;
		if (limit <= 0) {
			throw new Error("Historique trop volumineux pour être chargé en entier");
		}
		if (messages.length >= max) {
			// There are still more messages to fetch
			after = { ...after, time: messages[messages.length - 1].tags.time };
			return await this.fetchHistoryBetween(target, after, before, limit);
		}
		return { messages };
	}

	async fetchHistoryTargets(t1, t2) {
		let msg = {
			command: "CHATHISTORY",
			params: ["TARGETS", "timestamp=" + t1, "timestamp=" + t2, 1000],
		};
		let batch = await this.fetchBatch(msg, "draft/chathistory-targets");
		return batch.messages.map((msg) => {
			console.assert(msg.command === "CHATHISTORY" && msg.params[0] === "TARGETS");
			return {
				name: msg.params[1],
				latestMessage: msg.params[2],
			};
		});
	}

	async listBouncerNetworks() {
		let req = { command: "BOUNCER", params: ["LISTNETWORKS"] };
		let batch = await this.fetchBatch(req, "soju.im/bouncer-networks");
		let networks = new Map();
		for (let msg of batch.messages) {
			console.assert(msg.command === "BOUNCER" && msg.params[0] === "NETWORK");
			let id = msg.params[1];
			let params = irc.parseTags(msg.params[2]);
			networks.set(id, params);
		}
		return networks;
	}

	monitor(target) {
		if (this.monitored.has(target)) {
			return;
		}

		this.monitored.set(target, true);

		// TODO: add poll-based fallback when MONITOR is not supported
		if (this.monitored.size + 1 > this.isupport.monitor()) {
			return;
		}

		this.send({ command: "MONITOR", params: ["+", target] });
	}

	unmonitor(target) {
		if (!this.monitored.has(target)) {
			return;
		}

		this.monitored.delete(target);

		if (this.isupport.monitor() <= 0) {
			return;
		}

		this.send({ command: "MONITOR", params: ["-", target] });
	}

	createBouncerNetwork(attrs) {
		let msg = {
			command: "BOUNCER",
			params: ["ADDNETWORK", irc.formatTags(attrs)],
		};
		return this.roundtrip(msg, (msg) => {
			if (msg.command === "BOUNCER" && msg.params[0] === "ADDNETWORK") {
				return msg.params[1];
			}
		});
	}

	registerAccount(email, password) {
		let msg = {
			command: "REGISTER",
			params: ["*", email || "*", password],
		};
		return this.roundtrip(msg, (msg) => {
			if (msg.command !== "REGISTER") {
				return;
			}
			let result = msg.params[0];
			return {
				verificationRequired: result === "VERIFICATION_REQUIRED",
				account: msg.params[1],
				message: msg.params[2],
			};
		});
	}

	verifyAccount(account, code) {
		let msg = {
			command: "VERIFY",
			params: [account, code],
		};
		return this.roundtrip(msg, (msg) => {
			if (msg.command !== "VERIFY") {
				return;
			}
			return { message: msg.params[2] };
		});
	}

	supportsReadMarker() {
		return this.caps.enabled.has("draft/read-marker");
	}

	fetchReadMarker(target) {
		this.send({
			command: "MARKREAD",
			params: [target],
		});
	}

	setReadMarker(target, t) {
		this.send({
			command: "MARKREAD",
			params: [target, "timestamp="+t],
		});
	}

	ping() {
		lastPing++;
		let token = "gamja-" + String(lastPing);
		return this.roundtrip({ command: "PING", params: [token] }, (msg) => {
			return msg.command === "PONG" && msg.params[1] === token;
		});
	}
}
