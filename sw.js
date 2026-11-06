/*
 * Service worker du t'Chat (D-066, point 7), portee /tchat-app/.
 *
 * Il ne sert QU'AUX notifications : afficher (registration.showNotification,
 * appele par la page) et le clic, qui ramene au t'Chat et ouvre la
 * conversation. Aucun gestionnaire fetch, donc aucun cache : il ne peut
 * jamais servir une vieille version du t'Chat.
 *
 * Un t'Chat ferme ne notifie rien : il faudrait un push serveur (V2).
 */

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	let data = event.notification.data || {};
	event.waitUntil((async () => {
		let portee = self.registration.scope;
		let fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
		let fenetre = fenetres.find((c) => c.url.startsWith(portee));
		if (!fenetre) {
			await self.clients.openWindow(portee);
			return;
		}
		await fenetre.focus();
		fenetre.postMessage({ type: "tchat-ouvrir", conversation: data.conversation, serveur: data.serveur });
	})());
});
