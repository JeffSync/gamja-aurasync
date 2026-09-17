/*
 * Traduction des erreurs renvoyees par le serveur.
 *
 * UnrealIRCd repond en anglais. On remplace les messages les plus courants
 * par une formulation francaise, dans le vocabulaire AuraSync (« salon »,
 * « t'Chat », jamais « channel » ni « IRC »).
 *
 * Tout code absent de la table conserve le message brut du serveur : mieux
 * vaut un message en anglais qu'une erreur avalee.
 */

const MESSAGES = {
	/* Salons */
	"403": "Ce salon n'existe pas. Retrouve la liste complète dans le panneau Salons.",
	"404": "Tu ne peux pas écrire dans ce salon.",
	"405": "Tu as atteint le nombre maximum de salons ouverts. Quitte un salon avant d'en rejoindre un autre.",
	"471": "Ce salon est complet.",
	"473": "Ce salon est sur invitation.",
	"474": "Tu ne peux pas rejoindre ce salon car tu es banni.",
	"475": "Ce salon demande une clé d'accès.",
	"476": "Ce nom de salon n'est pas valide.",
	"477": "Ce salon demande d'être identifié(e).",
	"482": "Tu n'as pas les droits nécessaires sur ce salon.",
	"520": "Ce salon est sur invitation.",

	/* Membres */
	"401": "Pseudo inconnu : ce membre n'existe pas.",
	"406": "Pseudo inconnu : ce membre n'existe pas.",
	"441": "Ce membre n'est pas dans le salon.",
	"442": "Tu n'es pas dans ce salon.",
	"443": "Ce membre est déjà dans le salon.",

	/* Pseudo */
	"431": "Aucun pseudo indiqué.",
	"432": "Ce pseudo n'est pas valide.",
	"433": "Ce pseudo est déjà utilisé.",
	"436": "Ce pseudo est en conflit avec une autre connexion.",

	/* Commandes et connexion */
	"421": "Cette commande n'existe pas sur le t'Chat.",
	"451": "Action impossible dans l'état actuel de la connexion.",
	"461": "Il manque un paramètre à cette commande.",
	"462": "Action impossible dans l'état actuel de la connexion.",
	"464": "Mot de passe incorrect.",
	"481": "Tu n'as pas les droits nécessaires.",
	"491": "Accès refusé.",
};

/*
 * Traduit une erreur si son code est connu, sinon renvoie le texte brut.
 * `command` est le code numerique (« 473 »), `fallback` le dernier
 * parametre du message serveur.
 */
export function translateError(command, fallback) {
	return MESSAGES[command] || fallback;
}

export { MESSAGES };
