// Type declarations for global WebSocket broadcast (set by server.js)
declare global {
  // eslint-disable-next-line no-var
  var __wsBroadcast: ((showId: string, message: unknown, exclude?: unknown) => void) | undefined;
  // eslint-disable-next-line no-var
  var __wsShowClients: Map<string, Set<unknown>> | undefined;
}

export {};
