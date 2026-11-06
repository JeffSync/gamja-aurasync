/*
 * Affichage des notifications du t'Chat (D-066, point 7). Ce qu'elles
 * disent et quand elles partent : lib/notifications.js.
 *
 * Par le service worker minimal (sw.js, portee /tchat-app/) quand il est
 * la : c'est le seul chemin dans la PWA installee et sur Chrome Android, ou
 * `new Notification()` leve une exception. Sinon `new Notification()`, sous
 * try/catch. Rien ne part sans la permission « granted ».
 *
 * Un clic sur la notification ramene au t'Chat et ouvre la conversation :
 * le service worker envoie { type: "tchat-ouvrir", conversation, serveur }
 * par postMessage, ou l'objet Notification appelle onOuvrir directement.
 *
 * `env` est injecte pour les tests (test/notifier.test.js) :
 * { Notification, serviceWorker, onOuvrir }.
 */

import { etatPermission } from "./notifications.js";

export const MESSAGE_OUVRIR = "tchat-ouvrir";
export const CHEMIN_SW = "./sw.js";

/*
 * Enregistre sw.js. C'est une entree du build (package.json, targets) :
 * Parcel le publie sous ce nom, sans empreinte, a cote d'index.html. Pas de
 * new URL(..., import.meta.url) : Parcel le resoudrait par une import map
 * en ligne, que la CSP du t'Chat (default-src 'self') bloque ; et Parcel
 * refuse un chemin litteral dans navigator.serviceWorker.register(), d'ou
 * la variable.
 */
export function enregistrerServiceWorker() {
	let conteneur = typeof navigator === "undefined" ? null : navigator.serviceWorker;
	if (!conteneur) {
		return Promise.resolve(null);
	}
	return conteneur.register(CHEMIN_SW, { scope: "./" })
		.catch((err) => {
			console.warn("t'Chat : service worker non enregistré", err);
			return null;
		});
}

export function creerNotifier(env) {
	let registration = null;
	/* Notifications sans service worker, par tag. */
	let directes = new Map();
	/* Dernier message notifie, par tag : pour fermer a la lecture. */
	let derniers = new Map();

	if (env.serviceWorker) {
		env.serviceWorker.addEventListener("message", (event) => {
			let data = event.data;
			if (data && data.type === MESSAGE_OUVRIR && typeof data.conversation === "string") {
				env.onOuvrir(data.conversation, data.serveur);
			}
		});
	}

	function permission() {
		return etatPermission(env.Notification);
	}

	async function montrer(title, options, message) {
		if (permission() !== "granted") {
			return false;
		}
		derniers.set(options.tag, message);
		if (registration) {
			try {
				await registration.showNotification(title, options);
				return true;
			} catch (err) {
				console.warn("t'Chat : notification non affichée", err);
				// On retente sans le service worker
			}
		}
		try {
			let notif = new env.Notification(title, options);
			notif.onclick = () => {
				notif.close();
				env.onOuvrir(options.data.conversation, options.data.serveur);
			};
			notif.onclose = () => {
				if (directes.get(options.tag) === notif) {
					directes.delete(options.tag);
				}
			};
			directes.set(options.tag, notif);
			return true;
		} catch (err) {
			// Chrome Android sans service worker : TypeError attendue
			console.warn("t'Chat : notification non affichée", err);
			return false;
		}
	}

	function fermer(tag) {
		derniers.delete(tag);
		let notif = directes.get(tag);
		if (notif) {
			notif.close();
			directes.delete(tag);
		}
		if (registration) {
			Promise.resolve(registration.getNotifications({ tag }))
				.then((list) => list.forEach((n) => n.close()))
				.catch(() => {});
		}
	}

	/* Ferme la notification d'une conversation si son message est lu. */
	function fermerSiLu(tag, estLu) {
		let msg = derniers.get(tag);
		if (msg && estLu(msg)) {
			fermer(tag);
		}
	}

	/* Sur un geste seulement : rend la nouvelle permission. */
	async function demanderPermission() {
		if (permission() !== "default") {
			return permission();
		}
		try {
			// Forme promesse ; les vieux Safari n'ont que le rappel
			await new Promise((resolve) => {
				let p = env.Notification.requestPermission(resolve);
				if (p && typeof p.then === "function") {
					p.then(resolve, resolve);
				}
			});
		} catch (err) {
			console.warn("t'Chat : permission non demandée", err);
		}
		return permission();
	}

	return {
		permission,
		montrer,
		fermer,
		fermerSiLu,
		demanderPermission,
		set registration(r) {
			registration = r;
		},
		get registration() {
			return registration;
		},
	};
}
