# 🚀 EverSync (Basic / Minimal Build)

> **Versão**: V1.0.0 (baseada no OmniRoute V3.8.50)  
> **Perfil de Build**: `Basic` (`OMNIROUTE_BUILD_PROFILE=minimal`)

---

## 📌 Visão Geral

O **EverSync** é uma versão otimizada, independente e enxuta do roteador de IA unificado com suporte a 290 provedores de IA. Esta versão **V1.0.0** foca na experiência essencial (Build Profile `Basic`), reduzindo o tamanho do bundle e a carga cognitiva da interface do usuário ao manter ativos e acessíveis apenas os módulos do preset **Minimal**.

---

## ⚡ Recursos Habilitados (Perfil Basic / Minimal)

- **Painel Principal (`/dashboard`)**: Visão geral e métricas essenciais.
- **Provedores de IA (`/dashboard/providers`)**: Configuração, alteração de chaves e conexão de provedores suportados.
- **Gerenciador de API (`/dashboard/api-keys`)**: Emissão e controle de chaves de acesso locais para suas aplicações.
- **Configurações e Personalização (`/dashboard/settings/*`)**:
  - Preferências da aplicação.
  - Segurança, Tokens e Credenciais.
  - Personalização do Sidebar.

---

## 🔒 Bloqueios e Restrições da Build Basic

Recursos como servidores MCP avançados, A2A, módulos de gamificação, memória persistente e webhooks avançados foram **desativados e isolados** nesta versão para garantir performance e leveza.

---

## 🚀 Como Executar

### Desenvolvimento (Modo Basic)

```bash
npm run dev:basic
```

### Build de Produção

```bash
npm run build:basic
npm run start
```

### Verificação de Tipos

```bash
npm run typecheck:core
```

---

## 🛠️ Tecnologias Utilizadas

- **Framework**: Next.js 16 (App Router) + React 19
- **Linguagem**: TypeScript 6.0
- **Banco de Dados**: SQLite (`better-sqlite3`)
- **Estilização**: Tailwind CSS v4
- **Engine de Streaming**: `open-sse`
