---
title: "EverSync Port Architecture & Service Mapping"
version: 1.0.0
lastUpdated: 2026-08-05
---

# EverSync Port Architecture & Service Mapping

This document provides the official sequential port allocation for **EverSync**.
All default ports are configured starting sequentially from **23026**.

## Sequential Port Allocations

| Port      | Service / Component           | Primary Environment Variable | Default Bind Host       | Description                                                                      |
| :-------- | :---------------------------- | :--------------------------- | :---------------------- | :------------------------------------------------------------------------------- |
| **23026** | **Main Web & API Gateway**    | `PORT` / `OMNIROUTE_PORT`    | `0.0.0.0` / `127.0.0.1` | Combined Next.js Dashboard UI and unified AI provider API proxy.                 |
| **23027** | **Live Dashboard WebSocket**  | `LIVE_WS_PORT`               | `127.0.0.1`             | High-frequency telemetry and event streaming (requests, combos, account health). |
| **23028** | **Embedded Service WS Proxy** | `EMBED_WS_PROXY_PORT`        | `127.0.0.1`             | Reverse proxy tunnel for embedded services' WebSockets.                          |
| **23029** | **MITM Traffic Interceptor**  | `MITM_PORT`                  | `127.0.0.1`             | HTTP/HTTPS MITM proxy for CLI and local app traffic inspection.                  |
| **23030** | **SOCKS5 Proxy Service**      | `SOCKS5_PORT`                | `127.0.0.1`             | Internal SOCKS5 proxy module for routed outbound connections.                    |
| **23031** | **Docker Container API Port** | `PROD_API_PORT`              | `0.0.0.0`               | Dedicated published port for production Docker container API deployments.        |

---

## Overriding Default Ports

All services support environment variable overrides. You can set custom ports in your `.env` file or shell environment:

```bash
# Example .env override
PORT=23026
LIVE_WS_PORT=23027
EMBED_WS_PROXY_PORT=23028
```

## Internal Service Discovery

- Front-end and CLI utilities derive public endpoints using `useDisplayBaseUrl` or `resolveOmniRouteBaseUrl` pointing to `http://localhost:23026`.
- Live monitoring metrics connect to `ws://localhost:23027/live`.
