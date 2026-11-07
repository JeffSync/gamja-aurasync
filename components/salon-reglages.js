/*
 * Menu « Réglages » d'un salon (etape 5, lot B, D-068 point 4). Panneau
 * ancre a droite sous l'en-tete sur ordinateur, feuille du bas sur mobile
 * (memes regles que la fiche). Ordre : en-tete, Sujet, Réglages, Autres
 * réglages actifs, pied « Salon créé le … ».
 *
 * Le composant n'envoie rien lui-meme : onBasculer et onSujet passent par
 * components/app.js, qui verifie a nouveau (lib/salon-reglages.js,
 * envoiMode) qu'un reglage verrouille ne part jamais. L'etat affiche est
 * celui du serveur (buf.modes) : un interrupteur ne bascule qu'a l'echo.
 */

import { html, Component } from "../lib/index.js";
import {
	EQUIPE, LECTURE, POUR_BANNIR, RESERVE_OP, dateCreation, etatSujet, lignesReglages,
} from "../lib/salon-reglages.js";

function Refus(props) {
	if (!props.texte) {
		return null;
	}
	return html`<p class="reglages-refus" role="alert">${props.texte}</p>`;
}

function Interrupteur(props) {
	let { ligne, envoi, refus, onBasculer } = props;
	let bloque = ligne.etat !== "libre";
	let note = ligne.etat === "verrou" ? EQUIPE : ligne.etat === "reserve" ? RESERVE_OP : null;
	let id = "reglage-" + ligne.lettre;
	let clic = () => {
		// Un clic force sur une ligne grisee ne part pas (et app.js
		// verifie encore)
		if (!bloque && !envoi) {
			onBasculer(ligne.lettre);
		}
	};
	return html`
		<li class="reglages-ligne ${bloque ? "bloque" : ""}">
			<div class="reglages-texte">
				<span class="reglages-libelle" id=${id}>${ligne.libelle}</span>
				<span class="reglages-phrase">${ligne.phrase}</span>
				${note ? html`<span class="reglages-note">${note}</span>` : null}
				<${Refus} texte=${refus}/>
			</div>
			<button
				type="button"
				class="interrupteur ${ligne.actif ? "actif" : ""} ${envoi ? "en-cours" : ""}"
				role="switch"
				aria-checked=${ligne.actif ? "true" : "false"}
				aria-labelledby=${id}
				aria-disabled=${bloque ? "true" : "false"}
				aria-busy=${envoi ? "true" : "false"}
				onClick=${clic}
			><span class="interrupteur-bouton"></span></button>
		</li>
	`;
}

export default class SalonReglages extends Component {
	constructor(props) {
		super(props);
		this.state = { saisie: props.sujet || "", modifie: false };
		this.handleOutside = this.handleOutside.bind(this);
		this.handleKey = this.handleKey.bind(this);
	}

	componentDidMount() {
		document.addEventListener("mousedown", this.handleOutside);
		document.addEventListener("keydown", this.handleKey);
		if (this.base && this.base.focus) {
			this.base.focus();
		}
	}

	componentWillUnmount() {
		document.removeEventListener("mousedown", this.handleOutside);
		document.removeEventListener("keydown", this.handleKey);
	}

	componentDidUpdate(prev) {
		// Le sujet change ailleurs : on suit, sauf saisie en cours
		if (prev.sujet !== this.props.sujet && !this.state.modifie) {
			this.setState({ saisie: this.props.sujet || "" });
		}
	}

	handleOutside(event) {
		// Le bouton de l'en-tete ouvre et ferme lui-meme
		if (event.target.closest && event.target.closest(".hdr-reglages")) {
			return;
		}
		if (this.base && !this.base.contains(event.target)) {
			this.props.onClose();
		}
	}

	handleKey(event) {
		if (event.key === "Escape") {
			this.props.onClose();
		}
	}

	envoyerSujet(texte) {
		this.setState({ modifie: false });
		this.props.onSujet(texte);
	}

	render() {
		let { salon, rang, lu, modes, verrous, sujet, creation, topicLen, envois, refus, noteSujet } = this.props;
		envois = envois || {};
		refus = refus || {};
		let s = etatSujet(this.state.saisie, sujet, topicLen);
		let lignes = lignesReglages(modes, verrous, rang);

		let top = 64;
		let entete = typeof document !== "undefined" && document.getElementById("buffer-header");
		if (entete) {
			top = Math.round(entete.getBoundingClientRect().bottom) + 6;
		}
		// Sur ordinateur, sous l'en-tete ; sur mobile, la feuille du bas
		// l'ignore (aurasync-theme.css)
		let style = `--reglages-top:${top}px;`;

		let compteur = `${s.octets} / ${s.max} octets`;
		if (s.trop) {
			compteur += ` — ${s.octets - s.max} de trop`;
		}

		let reglages;
		if (!lu) {
			reglages = html`<p class="reglages-lecture" role="status">${LECTURE}</p>`;
		} else {
			reglages = html`
				<ul class="reglages-liste">
					${lignes.bascules.map((ligne) => html`
						<${Interrupteur}
							key=${ligne.lettre}
							ligne=${ligne}
							envoi=${envois[ligne.lettre]}
							refus=${refus[ligne.lettre]}
							onBasculer=${this.props.onBasculer}
						/>
					`)}
					${lignes.lectures.map((ligne) => html`
						<li class="reglages-ligne bloque lecture" key=${ligne.lettre}>
							<div class="reglages-texte">
								<span class="reglages-libelle">${ligne.libelle}</span>
								<span class="reglages-phrase">${ligne.texte}</span>
								<span class="reglages-note">${EQUIPE}</span>
							</div>
						</li>
					`)}
					<li class="reglages-ligne bloque" key="fermes">
						<div class="reglages-texte">
							<span class="reglages-libelle">${lignes.fermes.libelle}</span>
							<span class="reglages-phrase">${lignes.fermes.phrase}</span>
							<span class="reglages-note">${EQUIPE}</span>
						</div>
					</li>
				</ul>
			`;
		}

		let autres = null;
		if (lu && lignes.autres.length) {
			autres = html`
				<section class="reglages-section" aria-labelledby="reglages-autres">
					<h3 id="reglages-autres">Autres réglages actifs</h3>
					<ul class="reglages-autres">
						${lignes.autres.map((a) => html`<li key=${a.lettre}>${a.texte}</li>`)}
					</ul>
				</section>
			`;
		}

		let creationTexte = dateCreation(creation);

		return html`
			<div
				class="nick-menu fiche reglages-salon"
				style=${style}
				role="dialog"
				aria-label=${"Réglages de " + salon}
				tabindex="-1"
			>
				<div class="reglages-tete">
					<div class="reglages-ident">
						<h2 class="reglages-titre">Réglages de ${salon}</h2>
						<p class="reglages-rang">${rang === "@" ? "Tu gères ce salon (@)" : "Tu modères ce salon (%)"}</p>
					</div>
					<button class="fiche-fermer" type="button" onClick=${this.props.onClose}
						aria-label="Fermer les réglages">×</button>
				</div>

				<section class="reglages-section" aria-labelledby="reglages-sujet">
					<h3 id="reglages-sujet">Sujet</h3>
					<textarea
						class="reglages-champ"
						rows="3"
						aria-labelledby="reglages-sujet"
						aria-describedby="reglages-compteur"
						value=${this.state.saisie}
						onInput=${(e) => this.setState({ saisie: e.target.value, modifie: true })}
					></textarea>
					<p id="reglages-compteur" class="reglages-compteur ${s.trop ? "trop" : ""}" aria-live="polite">${compteur}</p>
					<div class="reglages-boutons">
						<button type="button" class="reglages-bouton"
							disabled=${!s.peutChanger || Boolean(envois.sujet)}
							onClick=${() => this.envoyerSujet(s.texte)}>Changer le sujet</button>
						${s.peutRetirer ? html`
							<button type="button" class="reglages-bouton secondaire"
								disabled=${Boolean(envois.sujet)}
								onClick=${() => this.envoyerSujet("")}>Retirer le sujet</button>
						` : null}
					</div>
					<${Refus} texte=${refus.sujet}/>
					${noteSujet ? html`<p class="reglages-info" role="status">${noteSujet}</p>` : null}
				</section>

				<section class="reglages-section" aria-labelledby="reglages-reglages">
					<h3 id="reglages-reglages">Réglages</h3>
					${reglages}
				</section>

				${autres}

				<p class="reglages-renvoi">${POUR_BANNIR}</p>
				${creationTexte ? html`<p class="reglages-pied">${creationTexte}</p>` : null}
			</div>
		`;
	}
}
