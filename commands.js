/*
 * Commandes du t'Chat AuraSync.
 *
 * Volontairement reduites : le t'Chat est une surface de conversation, la
 * gestion (salons, comptes, moderation) passe par le site ou par les menus
 * de l'interface. Les commandes de moderation, de connexion, de gestion de
 * reseau et l'envoi de commandes IRC brutes ont ete retirees.
 *
 * ATTENTION : retirer une commande ici ne la bloque pas cote serveur. Un
 * client tiers peut toujours l'emettre. Les restrictions reelles se
 * declarent dans unrealircd.conf.
 */

import * as irc from "./lib/irc.js";
import { SERVER_BUFFER, BufferType, Unread } from "./state.js";

function getActiveClient(app) {
	let buf = app.state.buffers.get(app.state.activeBuffer);
	if (!buf) {
		throw new Error("Tu n'es pas connecté(e) au t'Chat");
	}
	return app.clients.get(buf.server);
}

function getActiveTarget(app) {
	let activeBuffer = app.state.buffers.get(app.state.activeBuffer);
	if (!activeBuffer) {
		throw new Error("Aucun salon ouvert");
	}
	return activeBuffer.name;
}

function markServerBufferUnread(app) {
	let activeBuffer = app.state.buffers.get(app.state.activeBuffer);
	if (!activeBuffer || activeBuffer.type === BufferType.SERVER) {
		return;
	}
	app.setBufferState({ server: activeBuffer.server }, (buf) => {
		return { unread: Unread.union(buf.unread, Unread.MESSAGE) };
	});
}

const commands = [
	{
		name: "aide",
		description: "Afficher la liste des commandes disponibles",
		execute: (app, args) => {
			app.openHelp();
		},
	},
	{
		name: "join",
		usage: "<salon>",
		description: "Rejoindre un salon",
		execute: (app, args) => {
			let channel = args[0];
			if (!channel) {
				throw new Error("Indique le nom du salon");
			}
			if (args.length > 1) {
				app.open(channel, null, args[1]);
			} else {
				app.open(channel);
			}
		},
	},
	{
		name: "me",
		usage: "<action>",
		description: "Envoyer une action dans le salon courant",
		execute: (app, args) => {
			let action = args.join(" ");
			let target = getActiveTarget(app);
			let text = `\x01ACTION ${action}\x01`;
			app.privmsg(target, text);
		},
	},
	{
		name: "msg",
		usage: "<destinataire> <message>",
		description: "Envoyer un message à une personne ou à un salon",
		execute: (app, args) => {
			let target = args[0];
			let text = args.slice(1).join(" ");
			if (!target || !text) {
				throw new Error("Indique le destinataire puis le message");
			}
			getActiveClient(app).send({ command: "PRIVMSG", params: [target, text] });
		},
	},
	{
		name: "whois",
		usage: "<pseudo>",
		description: "Afficher les informations d'un membre",
		execute: (app, args) => {
			let nick = args[0];
			if (!nick) {
				throw new Error("Indique le pseudo");
			}
			getActiveClient(app).send({ command: "WHOIS", params: [nick] });
			markServerBufferUnread(app);
		},
	},
];

export default new Map(commands.map((cmd) => [cmd.name, cmd]));
