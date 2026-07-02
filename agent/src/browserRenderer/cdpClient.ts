import { createHash, randomBytes } from "node:crypto";
import { Socket } from "node:net";

export interface ChromiumTarget {
  id: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export interface CdpClientOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

interface PendingCommand {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: NodeJS.Timeout;
}

type EventHandler = (params: unknown) => void;

export async function listChromiumTargets(options: CdpClientOptions): Promise<ChromiumTarget[]> {
  const response = await fetch(`http://${options.host}:${options.port}/json/list`, {
    signal: AbortSignal.timeout(options.timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Chromium target list failed with HTTP ${response.status}`);
  }

  const targets = (await response.json()) as ChromiumTarget[];
  return targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
}

export function selectKioskTarget(targets: ChromiumTarget[], playerUrl: string): ChromiumTarget | null {
  if (targets.length === 0) {
    return null;
  }

  const playerTarget = targets.find((target) => target.url === playerUrl);
  if (playerTarget) {
    return playerTarget;
  }

  const localPlayerTarget = targets.find((target) => target.url?.includes("/player"));
  if (localPlayerTarget) {
    return localPlayerTarget;
  }

  return targets[0] ?? null;
}

export class CdpConnection {
  private readonly pending = new Map<number, PendingCommand>();
  private readonly eventHandlers = new Map<string, EventHandler[]>();
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private socket: Socket | null = null;

  constructor(private readonly options: CdpClientOptions) {}

  async connect(webSocketUrl: string): Promise<void> {
    const parsedUrl = new URL(webSocketUrl);
    const socket = new Socket();
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const key = randomBytes(16).toString("base64");
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("Timed out connecting to Chromium DevTools target"));
      }, this.options.timeoutMs);
      let handshakeBuffer = Buffer.alloc(0);

      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      socket.connect(Number(parsedUrl.port || this.options.port), parsedUrl.hostname, () => {
        const request = [
          `GET ${parsedUrl.pathname}${parsedUrl.search} HTTP/1.1`,
          `Host: ${parsedUrl.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          ""
        ].join("\r\n");

        socket.write(request);
      });

      const onHandshakeData = (chunk: Buffer) => {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          return;
        }

        socket.off("data", onHandshakeData);
        const headers = handshakeBuffer.subarray(0, headerEnd).toString("utf8");
        if (!headers.startsWith("HTTP/1.1 101")) {
          clearTimeout(timeout);
          reject(new Error(`Chromium rejected WebSocket handshake: ${headers.split("\r\n")[0]}`));
          return;
        }

        const accept = headers.match(/^Sec-WebSocket-Accept:\s*(.+)$/im)?.[1]?.trim();
        const expectedAccept = createHash("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");

        if (accept !== expectedAccept) {
          clearTimeout(timeout);
          reject(new Error("Chromium WebSocket handshake returned an invalid accept key"));
          return;
        }

        clearTimeout(timeout);
        const remaining = handshakeBuffer.subarray(headerEnd + 4);
        if (remaining.length > 0) {
          this.buffer = Buffer.concat([this.buffer, remaining]);
          this.drainFrames();
        }

        socket.on("data", (data) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          this.drainFrames();
        });

        socket.on("close", () => {
          this.rejectAll(new Error("Chromium DevTools connection closed"));
        });

        socket.on("error", (error) => {
          this.rejectAll(error);
        });

        resolve();
      };

      socket.on("data", onHandshakeData);
    });
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.socket) {
      throw new Error("Chromium DevTools connection is not open");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chromium DevTools command timed out: ${method}`));
      }, this.options.timeoutMs);

      this.pending.set(id, { reject, resolve, timer });
    });

    this.socket.write(encodeClientTextFrame(payload));
    return result;
  }

  on(eventName: string, handler: EventHandler): () => void {
    const handlers = this.eventHandlers.get(eventName) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);

    return () => {
      const nextHandlers = (this.eventHandlers.get(eventName) ?? []).filter((candidate) => candidate !== handler);
      this.eventHandlers.set(eventName, nextHandlers);
    };
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
    this.rejectAll(new Error("Chromium DevTools connection closed"));
  }

  private drainFrames(): void {
    while (true) {
      const frame = decodeServerTextFrame(this.buffer);

      if (!frame) {
        return;
      }

      this.buffer = this.buffer.subarray(frame.bytesRead);

      if (frame.opcode === 8) {
        this.close();
        return;
      }

      if (frame.opcode !== 1 || !frame.payload) {
        continue;
      }

      this.handleMessage(frame.payload);
    }
  }

  private handleMessage(payload: string): void {
    const message = JSON.parse(payload) as {
      error?: { message?: string };
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
    };

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Chromium DevTools command failed"));
      } else {
        pending.resolve(message.result);
      }

      return;
    }

    if (message.method) {
      for (const handler of this.eventHandlers.get(message.method) ?? []) {
        handler(message.params);
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function encodeClientTextFrame(payload: string): Buffer {
  const payloadBuffer = Buffer.from(payload, "utf8");
  const mask = randomBytes(4);
  const headerLength = payloadBuffer.length < 126 ? 2 : payloadBuffer.length <= 0xffff ? 4 : 10;
  const frame = Buffer.alloc(headerLength + 4 + payloadBuffer.length);

  frame[0] = 0x81;

  if (payloadBuffer.length < 126) {
    frame[1] = 0x80 | payloadBuffer.length;
  } else if (payloadBuffer.length <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payloadBuffer.length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(payloadBuffer.length), 2);
  }

  mask.copy(frame, headerLength);

  for (let index = 0; index < payloadBuffer.length; index += 1) {
    frame[headerLength + 4 + index] = payloadBuffer[index] ^ mask[index % 4];
  }

  return frame;
}

function decodeServerTextFrame(buffer: Buffer): { bytesRead: number; opcode: number; payload: string | null } | null {
  if (buffer.length < 2) {
    return null;
  }

  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }

    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }

    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Chromium DevTools frame is too large");
    }

    payloadLength = Number(length);
    offset += 8;
  }

  const maskLength = masked ? 4 : 0;
  const totalLength = offset + maskLength + payloadLength;
  if (buffer.length < totalLength) {
    return null;
  }

  if (masked) {
    offset += 4;
  }

  const payload = opcode === 1 ? buffer.subarray(offset, offset + payloadLength).toString("utf8") : null;
  return { bytesRead: totalLength, opcode, payload };
}
