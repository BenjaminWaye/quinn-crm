import { useEffect, useMemo, useState } from "react";
import { listOpenClawTeam, type OpenClawAgent } from "../lib/data";
import { formatDateTime } from "../lib/time";

type AgentNode = OpenClawAgent & { children: AgentNode[] };

function buildTree(items: OpenClawAgent[]): AgentNode[] {
  const map = new Map<string, AgentNode>();
  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  const roots: AgentNode[] = [];
  for (const node of map.values()) {
    const parentId = node.parentId ?? null;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: AgentNode[]) => {
    nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function AgentCard({ agent }: { agent: AgentNode }) {
  return (
    <div className="rounded-lg border border-[#2a3345] bg-[#121722] px-4 py-3 min-w-[240px]">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-[#1a2130] flex items-center justify-center text-lg">
          {agent.avatar || "🤖"}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{agent.name}</p>
          <p className="text-sm text-neutral-300">{agent.role}</p>
          <p className="text-xs text-neutral-500 mt-1">{agent.machine || "unknown machine"}</p>
        </div>
      </div>
      <p className="text-sm text-neutral-400 mt-3">{agent.description}</p>
      <div className="flex gap-1.5 flex-wrap mt-3">
        {(agent.tags ?? []).map((tag) => (
          <span key={tag} className="text-xs px-2 py-1 rounded border border-[#31405c] text-[#94a3ff] bg-[#1a2140]">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function TreeLevel({ nodes, level = 0 }: { nodes: AgentNode[]; level?: number }) {
  if (nodes.length === 0) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 justify-center">
        {nodes.map((node) => (
          <AgentCard key={node.id} agent={node} />
        ))}
      </div>
      {nodes.some((node) => node.children.length > 0) && (
        <div className="space-y-4">
          <div className="flex justify-center text-[#334155] text-xs">│</div>
          <div className="space-y-6">
            {nodes.map((node) => (
              <div key={`${node.id}:children`} className="space-y-2">
                {node.children.length > 0 && (
                  <>
                    <div className="text-center text-xs text-neutral-500 uppercase tracking-wide">{node.name} team</div>
                    <TreeLevel nodes={node.children} level={level + 1} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamPage() {
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        setAgents(await listOpenClawTeam());
      } catch (nextError) {
        setError((nextError as Error)?.message || "Failed to load team");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((agent) => {
      const haystack = [agent.name, agent.role, agent.description, ...(agent.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [agents, query]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const lastUpdated = agents
    .map((agent) => agent.updatedAt)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0];

  return (
    <div className="p-4 lg:p-6 max-w-[1700px] mx-auto space-y-4">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">Meet the Team</h1>
        <p className="text-neutral-400">
          {agents.length} AI agents mirrored from OpenClaw local runtime.
        </p>
        <p className="text-xs text-neutral-500">Last update: {formatDateTime(lastUpdated)}</p>
      </div>

      <div className="bg-[#0f141f] border border-[#232b3a] rounded-lg p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents by name, role or tags..."
          className="w-full border border-[#2a3345] bg-[#0d1118] rounded-md px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-neutral-500">Loading team...</p>
      ) : tree.length === 0 ? (
        <p className="text-neutral-500">No agents found.</p>
      ) : (
        <section className="bg-[#0f141f] border border-[#232b3a] rounded-lg p-6">
          <TreeLevel nodes={tree} />
        </section>
      )}
    </div>
  );
}
