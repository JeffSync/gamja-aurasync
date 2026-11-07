/*
 * Le WHOIS de la fiche d'un pseudo (D-066, point 8, revise le 7 novembre) :
 * visible de tous, comme sur un reseau classique. Le panneau « Qui est-ce ? »
 * n'existe plus : la fiche (nick-menu.js) le remplace, et monte cette
 * section sous ses actions. Le WHOIS est demande a l'ouverture de la fiche.
 *
 * On montre ce que le serveur envoie, rien de plus, rien de deduit :
 * - le masque (311), c'est-a-dire le vhost s'il y en a un, sinon le masque
 *   d'adresse ;
 * - l'adresse reelle (378), que UnrealIRCd n'envoie qu'aux opers et a
 *   soi-meme ;
 * - tous les salons du 319, avec leur prefixe de rang, sans aucun filtre :
 *   le serveur retire lui-meme les salons +s pour qui n'y est pas. Chaque
 *   salon est un bouton : un clic le rejoint, ou l'ouvre si on y est deja
 *   (seconde retouche du 7 novembre) ;
 * - l'inactivite et l'heure de connexion (317).
 * Les donnees de moderation (score de reputation, groupes de securite) sont
 * volontairement ignorees, comme le 313 : le « Role reseau » vient du role
 * sur le site (lib/fiche.js, troisieme retouche du 7 novembre).
 *
 * Deux blocs dans la fiche (troisieme retouche) : LignesHaut sous l'en-tete
 * (masque, role reseau, adresse reelle), LignesBas apres les actions et la
 * moderation (salons, inactivite, connexion).
 */

import { html } from "../lib/index.js";

export function duree(seconds) {
	let s = parseInt(seconds, 10);
	if (isNaN(s)) return null;
	if (s < 60) return s + " s";
	let m = Math.floor(s / 60);
	if (m < 60) return m + " min";
	let h = Math.floor(m / 60);
	if (h < 24) return h + " h " + (m % 60) + " min";
	let d = Math.floor(h / 24);
	return d + " j " + (h % 24) + " h";
}

/*
 * Le nom d'un salon du 319, sans ce qui le precede : le prefixe de rang
 * (@, %, +, ou plusieurs avec multi-prefix) et le « ? » ou « ! » qu'UnrealIRCd
 * ajoute pour un oper. `syntaxe` : { types, prefixes } du serveur (ISUPPORT
 * CHANTYPES et PREFIX). Un caractere de tete n'est retire que s'il reste
 * ensuite un nom de salon : « &local » reste « &local ». null si ce n'est
 * pas un salon.
 */
export function nomDuSalon(entree, syntaxe) {
	let types = (syntaxe && syntaxe.types) || "#";
	let prefixes = ((syntaxe && syntaxe.prefixes) || "~&@%+") + "?!";
	let i = 0;
	while (i < entree.length - 1 && prefixes.includes(entree[i]) && [...entree.slice(i + 1)].some((c) => types.includes(c))) {
		i++;
	}
	let nom = entree.slice(i);
	return nom && types.includes(nom[0]) ? nom : null;
}

function Row(props) {
	if (!props.value) return null;
	return html`
		<div class="whois-row">
			<div class="whois-key">${props.label}</div>
			<div class="whois-val">${props.value}</div>
		</div>
	`;
}

/* Les lignes affichees, tirees de la reponse WHOIS (311, 378, 319, 317). */
export function lignesWhois(whois) {
	let user = whois["311"];
	let masque = user && user.params[3] ? user.params[2] + "@" + user.params[3] : null;

	// « is connecting from *@hote ip » : on garde ce qui suit « from », tel quel
	let adresse = null;
	if (whois["378"]) {
		let texte = (whois["378"].params[2] || "").trim();
		let m = /\bfrom\s+(.+)$/.exec(texte);
		adresse = (m ? m[1] : texte) || null;
	}

	let salons = null;
	if (whois["319"]) {
		let list = (whois["319"].params[2] || "").trim();
		salons = list ? list.split(/\s+/) : null;
	}

	let inactivite = null, connexion = null;
	if (whois["317"]) {
		inactivite = duree(whois["317"].params[2]);
		let ts = parseInt(whois["317"].params[3], 10);
		if (!isNaN(ts)) {
			connexion = new Date(ts * 1000).toLocaleString("fr-FR", {
				day: "2-digit", month: "2-digit", year: "numeric",
				hour: "2-digit", minute: "2-digit",
			});
		}
	}
	return { masque, adresse, salons, inactivite, connexion };
}

/* Sous l'en-tete : masque, role reseau (du site, `roleReseau`), adresse reelle. */
export function LignesHaut(props) {
	let { data, loading, error, roleReseau } = props;
	let l = data ? lignesWhois(data) : {};
	let attente = null;
	if (loading) {
		attente = html`<div class="whois-wait">Recherche…</div>`;
	} else if (error) {
		attente = html`<div class="whois-wait">Ce pseudo n'est pas connecté</div>`;
	}
	return html`
		<${Row} label="Masque" value=${l.masque}/>
		<${Row} label="Rôle réseau" value=${roleReseau}/>
		<${Row} label="Adresse réelle" value=${l.adresse}/>
		${attente}
	`;
}

/* Apres les actions : salons (cliquables), inactivite, connexion. */
export function LignesBas(props) {
	let { data, syntaxe, onSalon } = props;
	if (!data) {
		return null;
	}
	let l = lignesWhois(data);
	let salons = l.salons
		? html`<div class="whois-chans">${l.salons.map((entree) => {
			let nom = nomDuSalon(entree, syntaxe);
			if (!nom || !onSalon) {
				return html`<span>${entree}</span>`;
			}
			return html`
				<button type="button" class="whois-salon" title=${"Aller sur " + nom}
					aria-label=${"Aller sur " + nom} onClick=${() => onSalon(nom)}>${entree}</button>
			`;
		})}</div>`
		: null;
	return html`
		<${Row} label="Salons" value=${salons}/>
		<${Row} label="Inactivité" value=${l.inactivite}/>
		<${Row} label="Connexion" value=${l.connexion}/>
	`;
}
