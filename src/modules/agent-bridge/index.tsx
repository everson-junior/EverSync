import AgentBridgePageClient, {
  type AgentBridgePageData,
} from "../../app/(dashboard)/dashboard/tools/agent-bridge/AgentBridgePageClient";

const initialData: AgentBridgePageData = {
  serverState: {
    running: false,
    port: 443,
    certTrusted: false,
    upstreamCa: null,
    lastStartedAt: null,
    activeConns: 0,
    interceptedCount: 0,
    dnsConfigured: false,
    orphanedStateDetected: false,
  },
  agentStates: [],
  bypassPatterns: [],
  mappings: {},
};

export default function AgentBridgeModule() {
  return <AgentBridgePageClient initialData={initialData} targets={[]} hasProviders />;
}
