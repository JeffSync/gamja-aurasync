/*
 * « Détails techniques » de la fiche d'un pseudo (D-066, point 8) : le
 * WHOIS mis en forme, pour l'equipe seule. Le panneau « Qui est-ce ? »
 * n'existe plus : la fiche (nick-menu.js) le remplace, et ne monte ce repli
 * que si l'API dit que la personne connectee est de l'equipe.
 *
 * Seuls le masque, les salons, l'inactivite et l'heure de connexion sont
 * montres. Les donnees de moderation (score de reputation, groupes de
 * securite) sont volontairement ignorees.
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

function Row(props) {
	if (!props.value) return null;
	return html`
		<div class="whois-row">
			<div class="whois-key">${props.label}</div>
			<div class="whois-val">${props.value}</div>
		</div>
	`;
}

/* Les lignes affichees, tirees de la reponse WHOIS (numeriques 311, 319, 317). */
export function lignesTechniques(whois) {
	let user = whois["311"];
	let masque = user ? user.params[2] + "@" + user.params[3] : null;

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
	return { masque, salons, inactivite, connexion };
}

export function DetailsTechniques(props) {
	let { data, loading, error } = props;
	if (loading) {
		return html`<div class="whois-wait">Recherche…</div>`;
	}
	if (error) {
		return html`<div class="whois-wait">Ce pseudo n'est pas connecté</div>`;
	}
	if (!data) {
		return html`<div class="whois-wait">Aucune information</div>`;
	}
	let l = lignesTechniques(data);
	let salons = l.salons
		? html`<div class="whois-chans">${l.salons.map((c) => html`<span>${c}</span>`)}</div>`
		: null;
	return html`
		<${Row} label="Masque" value=${l.masque}/>
		<${Row} label="Salons" value=${salons}/>
		<${Row} label="Inactivité" value=${l.inactivite}/>
		<${Row} label="Connexion" value=${l.connexion}/>
	`;
}
