/*
 * Expulsion du membre lui-meme (KICK qui vise notre pseudo) : le salon se
 * ferme comme un « Partir », le client bascule ailleurs, affiche une
 * banniere et oublie le salon pour qu'un rechargement ne le rejoigne pas.
 *
 * Logique pure, sans DOM : teste par test/kick.test.js. `cm` est la
 * fonction de casse du client (client.cm).
 */

import { analyseKick } from "./irc-errors.js";

/* Salon fixe du t'Chat, prefere apres une expulsion. */
export const SALON_PRINCIPAL = "#AuraSync";

export function isSelfKick(expulse, monPseudo, cm) {
	if (!expulse || !monPseudo) {
		return false;
	}
	return cm(expulse) === cm(monPseudo);
}

/*
 * Onglet a ouvrir quand le salon `fermeId` se ferme. `salons` : les onglets
 * de salon ({ id, name }), dans l'ordre de la liste. #AuraSync s'il y est,
 * sinon le premier salon ; null s'il n'en reste aucun.
 */
export function nextBuffer(salons, fermeId, cm) {
	let premier = null;
	for (let b of salons) {
		if (b.id === fermeId) {
			continue;
		}
		if (cm(b.name) === cm(SALON_PRINCIPAL)) {
			return b.id;
		}
		if (premier === null) {
			premier = b.id;
		}
	}
	return premier;
}

/*
 * Texte de la banniere. La raison passe par la meme analyse que la ligne
 * KICK (D-056), qui rend aussi le vrai auteur d'un KICK signe par Anope
 * (« Requested (Jeff) » : par Jeff). Une expulsion par le serveur lui-meme
 * (nom avec un point) ne dit pas « par <nom du serveur> ».
 */
export function kickBanner(salon, auteur, raison) {
	let kick = analyseKick(raison, auteur);
	let par = kick.auteur && !kick.auteur.includes(".") ? " par " + kick.auteur : "";
	return "Tu as été expulsé(e) de " + salon + par + (kick.raison ? " (" + kick.raison + ")" : "") + ".";
}

/*
 * Retire `salon` du parametre channels d'une query string (« ?channels=… »,
 * pose par /tchat). Renvoie la nouvelle query string, ou null si rien ne
 * change. Les autres parametres sont gardes tels quels.
 */
export function withoutChannel(search, salon, cm) {
	let paires = search.replace(/^\?/, "").split("&").filter((s) => s);
	let change = false;
	let gardees = [];
	for (let paire of paires) {
		let [cle, valeur = ""] = paire.split("=");
		if (decodeURIComponent(cle) !== "channels") {
			gardees.push(paire);
			continue;
		}
		let salons = decodeURIComponent(valeur).split(",");
		let reste = salons.filter((c) => cm(c) !== cm(salon));
		if (reste.length === salons.length) {
			gardees.push(paire);
			continue;
		}
		change = true;
		if (reste.length > 0) {
			gardees.push("channels=" + encodeURIComponent(reste.join(",")));
		}
	}
	if (!change) {
		return null;
	}
	return gardees.length > 0 ? "?" + gardees.join("&") : "";
}
