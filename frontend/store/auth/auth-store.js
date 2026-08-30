import { create } from "zustand";
import { persist } from "zustand/middleware";
import { devtools } from "zustand/middleware";
import { apiUrl } from "@/lib/api";

const ENCRYPTION_KEY_NAME = "stellar-hunts-ek";

const safeSessionStorage = () => {
	if (typeof window === "undefined") {
		return {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {},
		};
	}

	return window.sessionStorage;
};

async function getOrCreateEncryptionKey() {
	const storage = safeSessionStorage();
	const stored = storage.getItem(ENCRYPTION_KEY_NAME);
	if (stored) {
		const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
		return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, [
			"encrypt",
			"decrypt",
		]);
	}
	const key = await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		true,
		["encrypt", "decrypt"]
	);
	const exported = await crypto.subtle.exportKey("raw", key);
	storage.setItem(
		ENCRYPTION_KEY_NAME,
		btoa(String.fromCharCode(...new Uint8Array(exported)))
	);
	return key;
}

async function encryptToken(token) {
	if (!token) return null;
	const key = await getOrCreateEncryptionKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(token);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoded
	);
	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(ciphertext), iv.length);
	return btoa(String.fromCharCode(...combined));
}

async function decryptToken(encrypted) {
	if (!encrypted) return null;
	try {
		const key = await getOrCreateEncryptionKey();
		const raw = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
		const iv = raw.slice(0, 12);
		const ciphertext = raw.slice(12);
		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			ciphertext
		);
		return new TextDecoder().decode(decrypted);
	} catch {
		return null;
	}
}

const useAuthStore = create(
	devtools(
		persist(
			(set, get) => ({
				user: null,
				token: null,
				isAuthenticated: false,

				register: async (userData) => {
					try {
						const response = await fetch(apiUrl("/auth/register"), {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(userData),
						});

						if (!response.ok) throw new Error("Registration failed");

						const data = await response.json();
						const { user, token } = data;
						const encrypted = await encryptToken(token);
						set({ user, token: encrypted, isAuthenticated: true });
					} catch (error) {
						console.error("Registration error:", error);
					}
				},

				login: async (credentials) => {
					try {
						const response = await fetch(apiUrl("/auth/login"), {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(credentials),
						});

						if (!response.ok) throw new Error("Login failed");

						const data = await response.json();
						const { user, token } = data;
						const encrypted = await encryptToken(token);
						set({ user, token: encrypted, isAuthenticated: true });
					} catch (error) {
						console.error("Login error:", error);
					}
				},

				logout: () => {
					set({ user: null, token: null, isAuthenticated: false });
				},

				getDecryptedToken: async () => {
					const { token } = get();
					return decryptToken(token);
				},

				fetchUser: async () => {
					try {
						const decryptedToken = await get().getDecryptedToken();
						// GET /auth/profile is the backend route for the authenticated
						// user; it returns { message, user }. Older code called a
						// non-existent /auth/user path — see docs/api-conventions.md.
						const response = await fetch(apiUrl("/auth/profile"), {
							method: "GET",
							headers: {
								"Content-Type": "application/json",
								...(decryptedToken
									? { Authorization: `Bearer ${decryptedToken}` }
									: {}),
							},
						});

						if (!response.ok) throw new Error("Fetching user failed");

						const data = await response.json();
						set({ user: data.user ?? data, isAuthenticated: true });
					} catch (error) {
						console.error("Fetching user error:", error);
					}
				},
			}),
			{
				name: "auth-storage",
				getStorage: () => safeSessionStorage(),
			}
		),
		{ name: "AuthStore" }
	)
);

export default useAuthStore;
