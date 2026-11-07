/*
 * Salons choisis sur le compte, mis a jour par les gestes du t'Chat (D-065,
 * point 9).
 *
 * - « Partir » ou /part d'un salon du catalogue : retire ;
 * - /join, panneau « Salons », fenetre « Rejoindre » ou invitation acceptee,
 *   une fois le JOIN accepte par le serveur : ajoute.
 *
 * Rien d'autre ne passe par ici : une expulsion, un ban, un refus 474, une
 * deconnexion ne sont pas des choix, et ne touchent jamais la selection.
 *
 * Le catalogue et la selection viennent de l'API (GET /api/irc/channels),
 * jamais de la memoire du t'Chat. A l'ecriture, on relit la selection du
 * serveur, on y rejoue les gestes en attente dans l'ordre, puis on envoie
 * la selection complete (PUT /api/irc/channels/selection) : un geste fait
 * dans un autre onglet ou sur un autre appareil n'est pas efface, et le
 * dernier geste sur un salon l'emporte. Le serveur filtre comme toujours.
 *
 * Les gestes sont regroupes (DELAI_ECRITURE_MS) : une rafale de /join ne
 * fait qu'une ecriture. API indisponible : le /join et le /part ont eu
 * lieu, la selection n'est simplement pas mise a jour ; rien a l'ecran,
 * une ligne dans la console.
 *
 * Module pur : fetch et minuteries sont injectes (test/selection.test.js).
 */

export const API_SALONS = "/api/irc/channels";
export const API_SELECTION = "/api/irc/channels/selection";
export const DELAI_ECRITURE_MS = 1000;

/* Casse ASCII seule, comme UnrealIRCd et l'API pour les noms de salon. */
export function cleSalon(nom) {
	return nom.normalize("NFC").replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/*
 * Reponse de GET /api/irc/channels -> { categories, salons, selection,
 * sensibleServi }, ou null si elle n'a pas la forme attendue. `salons` :
 * cle -> salon. `sensibleServi` : l'API sert l'indicateur `sensible`
 * (D-066) ; une API plus ancienne ne le sert pas.
 */
export function lireCatalogue(data) {
	if (!data || !Array.isArray(data.categories) || !Array.isArray(data.selection)) {
		return null;
	}
	let categories = [];
	let salons = new Map();
	let sensibleServi = false;
	for (let cat of data.categories) {
		if (!cat || typeof cat.id !== "string" || typeof cat.label !== "string" || !Array.isArray(cat.channels)) {
			return null;
		}
		categories.push({ id: cat.id, label: cat.label });
		cat.channels.forEach((c, rang) => {
			if (c && typeof c.sensible === "boolean") {
				sensibleServi = true;
			}
			if (c && typeof c.name === "string") {
				salons.set(cleSalon(c.name), {
					name: c.name,
					label: typeof c.label === "string" ? c.label : c.name,
					category: cat.id,
					rang,
					fixed: c.fixed === true,
					remember: c.remember !== false,
					// D-066 : salon d'ecoute, jamais nomme dans une notification
					sensible: c.sensible === true,
					// D-068 : lettres verrouillees par SalonSync ; null si
					// l'API ne les sert pas (deployee avant le lot B)
					locked: typeof c.locked === "string" && /^[A-Za-z]*$/.test(c.locked) ? c.locked : null,
				});
			}
		});
	}
	let selection = data.selection.filter((s) => typeof s === "string");
	return { categories, salons, selection, sensibleServi };
}

/* Un salon que les gestes peuvent changer : au catalogue, ni fixe, ni jamais retenu. */
export function salonModifiable(salons, nom) {
	if (typeof nom !== "string") {
		return null;
	}
	let salon = salons.get(cleSalon(nom));
	if (!salon || salon.fixed || !salon.remember) {
		return null;
	}
	return salon.name;
}

/* Rejoue les gestes, dans l'ordre, sur une selection. */
export function appliquerGestes(selection, gestes, salons) {
	let resultat = selection.slice();
	for (let { ajout, nom } of gestes) {
		let canonique = salonModifiable(salons, nom);
		if (!canonique) {
			continue;
		}
		resultat = resultat.filter((s) => cleSalon(s) !== cleSalon(canonique));
		if (ajout) {
			resultat.push(canonique);
		}
	}
	return resultat;
}

function memes(a, b) {
	if (a.length !== b.length) {
		return false;
	}
	let cles = new Set(a.map(cleSalon));
	return b.every((s) => cles.has(cleSalon(s)));
}

/*
 * opts :
 * - fetch : comme window.fetch ;
 * - timers : { setTimeout, clearTimeout } ;
 * - onCatalogue(catalogue) : appele a chaque lecture reussie ;
 * - delai : regroupement des gestes, DELAI_ECRITURE_MS par defaut.
 */
export function createSelection(opts) {
	let timers = opts.timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id) };
	let delai = opts.delai ?? DELAI_ECRITURE_MS;
	let gestes = [];
	let minuterie = null;
	let enCours = Promise.resolve();
	let catalogue = null;

	async function lire() {
		try {
			let res = await opts.fetch(API_SALONS, { credentials: "same-origin" });
			if (!res.ok) {
				console.warn("t'Chat : salons du compte non lus", res.status);
				return null;
			}
			let lu = lireCatalogue(await res.json());
			if (!lu) {
				console.warn("t'Chat : salons du compte illisibles");
				return null;
			}
			catalogue = lu;
			if (opts.onCatalogue) {
				opts.onCatalogue(lu);
			}
			return lu;
		} catch (err) {
			console.warn("t'Chat : salons du compte non lus", err);
			return null;
		}
	}

	async function ecrire() {
		let lot = gestes;
		gestes = [];
		if (lot.length === 0) {
			return;
		}
		// La selection du serveur, pas celle qu'on croyait : un autre
		// onglet a pu la changer entre-temps
		let lu = await lire();
		if (!lu) {
			return;
		}
		let voulue = appliquerGestes(lu.selection, lot, lu.salons);
		if (memes(voulue, lu.selection)) {
			return;
		}
		try {
			let res = await opts.fetch(API_SELECTION, {
				method: "PUT",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ channels: voulue }),
			});
			if (!res.ok) {
				console.warn("t'Chat : salons du compte non enregistres", res.status);
				return;
			}
			let data = await res.json();
			if (data && Array.isArray(data.selection)) {
				catalogue = { ...lu, selection: data.selection };
			}
		} catch (err) {
			console.warn("t'Chat : salons du compte non enregistres", err);
		}
	}

	function noter(ajout, nom) {
		if (typeof nom !== "string" || !nom) {
			return;
		}
		gestes.push({ ajout, nom });
		if (minuterie !== null) {
			timers.clearTimeout(minuterie);
		}
		minuterie = timers.setTimeout(() => {
			minuterie = null;
			// Une ecriture a la fois, dans l'ordre des gestes
			enCours = enCours.then(ecrire);
		}, delai);
	}

	return {
		charger: lire,
		ajouter: (nom) => noter(true, nom),
		retirer: (nom) => noter(false, nom),
		/* Pour les tests : attend la fin des ecritures lancees. */
		attendre: () => enCours,
		get catalogue() {
			return catalogue;
		},
	};
}
