/*
 * Une ligne venue du serveur lui-meme (MODE pose par l'anti-flood, KICK,
 * NOTICE aux moderateurs...) ne montre jamais son nom : « irc.aurasync.fr »
 * nommerait la technologie (D-001). Elle est signee « le t'Chat ».
 *
 * Un nom de serveur contient un point, un pseudo jamais (le serveur refuse
 * le point dans un pseudo) ; « * » est le prefixe de repli du client.
 */

export function estServeur(nom) {
	return typeof nom === "string" && (nom === "*" || nom.includes("."));
}

/* Nom a afficher a la place du serveur, en debut de phrase ou non. */
export function nomServeur(debut = true) {
	return debut ? "Le t'Chat" : "le t'Chat";
}
