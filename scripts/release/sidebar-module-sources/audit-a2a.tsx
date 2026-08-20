import React, { useEffect, useState } from "react";
import { getHost } from "@eversync/plugin-host";

type TaskState = "submitted" | "working" | "completed" | "failed" | "cancelled";

type A2aTask = {
  id: string;
  skill: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  events?: unknown[];
  artifacts?: unknown[];
};

type TaskResponse = {
  tasks?: A2aTask[];
  total?: number;
};

const PAGE_SIZE = 25;
const STATES: TaskState[] = ["submitted", "working", "completed", "failed", "cancelled"];

function duration(task: A2aTask): string {
  const milliseconds = new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not available";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

export default function AuditA2aModule() {
  const [tasks, setTasks] = useState<A2aTask[]>([]);
  const [total, setTotal] = useState(0);
  const [skill, setSkill] = useState("");
  const [state, setState] = useState("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (skill) params.set("skill", skill);
    if (state !== "all") params.set("state", state);
    getHost()
      .fetch(`/api/a2a/tasks?${params}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as TaskResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load A2A tasks.");
        setTasks(Array.isArray(body.tasks) ? body.tasks : []);
        setTotal(Number(body.total ?? 0));
      })
      .catch((cause: unknown) => {
        setTasks([]);
        setTotal(0);
        setError(cause instanceof Error ? cause.message : "Unable to load A2A tasks.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [offset, state]);

  const applySkillFilter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    load();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main">A2A audit</h1>
          <p className="mt-1 text-sm text-text-muted">
            Recent agent-to-agent tasks and their execution state.
          </p>
        </div>
        <button
          className="rounded border border-border px-3 py-2 text-sm text-text-main"
          type="button"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      <form
        className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-3"
        onSubmit={applySkillFilter}
      >
        <label className="text-sm text-text-main">
          Skill
          <input
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={skill}
            onChange={(event) => setSkill(event.target.value)}
            placeholder="Filter by skill"
          />
        </label>
        <label className="text-sm text-text-main">
          State
          <select
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm"
            value={state}
            onChange={(event) => {
              setOffset(0);
              setState(event.target.value);
            }}
          >
            <option value="all">All states</option>
            {STATES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            type="submit"
          >
            Apply
          </button>
          <button
            className="rounded border border-border px-3 py-2 text-sm text-text-main"
            type="button"
            onClick={() => {
              setSkill("");
              setState("all");
              setOffset(0);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded border border-border bg-surface">
        {error ? <p className="p-6 text-sm text-red-600">{error}</p> : null}
        {!error && loading ? (
          <p className="p-6 text-sm text-text-muted">Loading A2A tasks...</p>
        ) : null}
        {!error && !loading && tasks.length === 0 ? (
          <p className="p-6 text-sm text-text-muted">No A2A tasks match the current filters.</p>
        ) : null}
        {!error && !loading && tasks.length > 0 ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Skill</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Events</th>
                <th className="px-3 py-2">Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-muted">
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    {task.id.slice(0, 8)}...
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-main">{task.skill}</td>
                  <td className="px-3 py-2 text-text-main">{task.state}</td>
                  <td className="px-3 py-2 text-text-muted">{duration(task)}</td>
                  <td className="px-3 py-2 text-text-muted">{task.events?.length ?? 0}</td>
                  <td className="px-3 py-2 text-text-muted">{task.artifacts?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <div className="flex items-center justify-end gap-2 text-sm text-text-muted">
        <span>
          {total === 0
            ? "No tasks"
            : `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
        </span>
        <button
          className="rounded border border-border px-3 py-2 text-text-main disabled:opacity-40"
          type="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
        >
          Previous
        </button>
        <button
          className="rounded border border-border px-3 py-2 text-text-main disabled:opacity-40"
          type="button"
          disabled={loading || offset + PAGE_SIZE >= total}
          onClick={() => setOffset((current) => current + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
