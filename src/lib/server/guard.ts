/**
 * Server-only guard. Importing this module from a client component throws at load
 * time, so a server secret can never silently reach the browser bundle.
 */
if (typeof window !== "undefined") {
  throw new Error("Server-only module imported into client code");
}

export const SERVER_ONLY = true;
