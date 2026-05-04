export interface TunnelSession {
  id: string;
  subdomain: string;
  url: string;
  port: number;
  ttl: number; // seconds
  expiresAt: Date;
  createdAt: Date;
}

export interface InboundConnection {
  connectionId: string;
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  timestamp: Date;
}

export interface TunnelOptions {
  port: number;
  ttl: TtlChoice;
  invite?: string;
  password?: string;
  allowIp?: string[];
  open?: boolean;
}

export type TtlChoice = 900 | 3600 | 86400; // 15min | 1hr | 24hr

// WebSocket message types between CLI and server
export type WsMessage =
  | { type: "tunnel:open"; port: number; ttl: number; password?: string; allowIp?: string[]; invite?: string; clientPublicKey?: string }
  | { type: "tunnel:reclaim"; tunnelId: string }
  | { type: "tunnel:close" }
  | { type: "tunnel:registered"; tunnelId: string; url: string; expiresAt: string; serverPublicKey?: string }
  | { type: "tunnel:expired" }
  | { type: "conn:request"; connectionId: string; ip: string; device: string; method: string; path: string; userAgent?: string; headers: Record<string, string>; body?: string; bodyNonce?: string; autoApproved?: boolean }
  | { type: "conn:approve"; connectionId: string }
  | { type: "conn:deny"; connectionId: string }
  | { type: "conn:response"; connectionId: string; status: number; headers: Record<string, string>; body: string; bodyNonce?: string }
  | { type: "conn:blocked"; reason: "ip" | "password"; ip: string; device: string }
  | { type: "conn:authed"; ip: string; device: string }
  | { type: "error"; message: string };
