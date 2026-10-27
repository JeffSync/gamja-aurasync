/*
 * Detection du /shun cote client (D-059, mise a jour du 26 octobre), sans
 * DOM : teste par test/shun.test.js. lib/client.js l'applique.
 *
 * UnrealIRCd 6.2.7 jette en silence toute commande d'un membre shunne, sauf
 * PING, PONG et ADMIN (parse.c, api-command.c). Mais labeled-response
 * repond quand meme : sans reponse partie, il envoie « :serveur ACK »
 * (labeled-response.c, lr_post_command). D'ou :
 * - PRIVMSG labellise : echo (echo-message) ou numerique = transmis ou
 *   refuse ; ACK seul = suspect ;
 * - JOIN labellise : JOIN, numeriques ou erreur = normal ; ACK seul =
 *   suspect.
 * « Suspect » ne suffit pas : un PRIVMSG vers un membre qui nous a mis en
 * SILENCE est jete sans reponse (message.c, is_silenced), un JOIN d'un
 * salon deja rejoint aussi. On sonde alors par « MODE <soi> », qui repond
 * toujours 221 (mode.c) sauf a un membre shunne. ACK seul a la sonde = shun.
 * Pas de reponse (delai, coupure) : on ne conclut rien.
 */

export const RESTREINT = "Ton activité sur le t'Chat est restreinte : motif non précisé.";

/*
 * Shun a la connexion. Sur ~account:, il s'applique des l'identification :
 * le SVSLOGIN d'Anope appelle user_account_login, donc find_shun, avant meme
 * le 903 (svslogin.c, user.c). Le CAP END qui suit est alors cherche avec
 * CMD_SHUN, que CAP n'a pas : commande introuvable, et a un client non
 * enregistre parse.c repond 451 « You have not registered ». register_user
 * refuserait de toute facon un membre shunne (nick.c). L'enregistrement ne
 * finit jamais, et au bout de handshake-timeout (40 s) le serveur ferme
 * sur « Registration Timeout », sans « Client exiting » au journal (quit.c :
 * seulement pour un client enregistre).
 * Signe exact : un 451 apres le 903 et avant le 001. Un client normal n'en
 * recoit pas (CAP, NICK, USER, PONG sont permis avant l'enregistrement, et
 * lib/client.js n'envoie pas de PING avant le 001). Pas de delai a deviner :
 * une simple lenteur ne produit pas de 451.
 */
export function shunInscription(command, { saslReussi, enregistre }) {
	return command === "451" && saslReussi && !enregistre;
}

/* Au-dela, pas de reponse : on ne conclut rien. */
export const DELAI_REPONSE = 20000;

/* Sonde : toujours une reponse (221), sauf shun. */
export function sonde(pseudo) {
	return { command: "MODE", params: [pseudo] };
}

/*
 * Suit la reponse au label `label`. recevoir(msg) renvoie null tant que la
 * reponse n'est pas complete, puis { type: "ack" | "reponse", reponses }.
 * Formes (labeled-response) : un message porteur du label ; un BATCH
 * labeled-response porteur du label, ses messages, puis sa fin ; ou ACK.
 */
export function suivreLabel(label) {
	let batch = null;
	let reponses = [];
	return {
		recevoir(msg) {
			let tags = msg.tags || {};
			if (batch !== null) {
				if (msg.command === "BATCH" && msg.params[0] === "-" + batch) {
					return { type: "reponse", reponses };
				}
				if (tags.batch === batch) {
					reponses.push(msg);
				}
				return null;
			}
			if (tags.label !== label) {
				return null;
			}
			if (msg.command === "ACK") {
				return { type: "ack", reponses: [] };
			}
			if (msg.command === "BATCH" && msg.params[0].startsWith("+") && msg.params[1] === "labeled-response") {
				batch = msg.params[0].slice(1);
				return null;
			}
			return { type: "reponse", reponses: [msg] };
		},
	};
}

/*
 * Apres un PRIVMSG ou un JOIN suivi. `resultat` : celui de suivreLabel, ou
 * { type: "delai" | "fermeture" }. « libre » : le serveur a traite la
 * commande (echo, JOIN, ou refus traduit comme d'habitude, D-056).
 * « sonder » : ACK seul, a confirmer.
 */
export function decisionEnvoi(resultat) {
	switch (resultat.type) {
	case "ack":
		return "sonder";
	case "reponse":
		return "libre";
	}
	return "inconnu";
}

/* Apres la sonde : « shun » seulement sur un ACK seul. */
export function decisionSonde(resultat) {
	switch (resultat.type) {
	case "ack":
		return "shun";
	case "reponse":
		return "libre";
	}
	return "inconnu";
}
