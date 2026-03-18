"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Rule {
  id: string;
  pattern: string;
  label: string;
  category: string;
  necessity: string;
  isTransfer?: boolean;
}

const CATEGORIES = [
  "Groceries", "Dining", "Coffee", "Gas", "Transit", "Subscriptions",
  "Shopping", "Healthcare", "Entertainment", "Travel", "Utilities",
  "Fees", "Donations", "Income", "E-Transfer In", "Refund", "Transfer", "Other",
];

const NECESSITIES = ["Must", "Essential", "Good to Have", "Optional", "Non-Essential"];

const NECESSITY_COLORS: Record<string, string> = {
  "Must": "bg-zinc-800 text-zinc-300",
  "Essential": "bg-blue-950/70 text-blue-300",
  "Good to Have": "bg-yellow-950/70 text-yellow-300",
  "Optional": "bg-orange-950/70 text-orange-300",
  "Non-Essential": "bg-red-950/70 text-red-300",
};

const BLANK: Omit<Rule, "id"> = {
  pattern: "",
  label: "",
  category: "Fees",
  necessity: "Must",
  isTransfer: false,
};

export default function SettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Omit<Rule, "id">>(BLANK);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/transaction-rules")
      .then(r => r.json())
      .then(data => { setRules(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function saveRule() {
    if (!form.pattern.trim() || !form.category || !form.necessity) return;
    setSaving(true);
    try {
      if (editingId) {
        await fetch("/api/transaction-rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
        setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...form } : r));
        setEditingId(null);
      } else {
        const res = await fetch("/api/transaction-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const newRule = await res.json();
        setRules(prev => [...prev, newRule]);
      }
      setForm(BLANK);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    await fetch("/api/transaction-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRules(prev => prev.filter(r => r.id !== id));
    if (editingId === id) { setEditingId(null); setForm(BLANK); }
  }

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setForm({ pattern: rule.pattern, label: rule.label, category: rule.category, necessity: rule.necessity, isTransfer: rule.isTransfer });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(BLANK);
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5">
        <h1 className="text-sm font-semibold text-zinc-100">Settings</h1>
      </div>

      <main className="px-8 py-6 flex flex-col gap-6">
        {/* Transaction Rules */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Transaction Rules</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Rules match against the raw transaction description (case-insensitive substring). Matched transactions are always forced to the specified category and necessity, overriding the AI.
            </p>
          </div>

          {/* Add / Edit form */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-zinc-300">
              {editingId ? "Edit rule" : "Add rule"}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Pattern <span className="text-zinc-600">(substring match)</span></label>
                <input
                  type="text"
                  value={form.pattern}
                  onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                  placeholder="e.g. Yousef Helwa"
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Label <span className="text-zinc-600">(display name)</span></label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Rent"
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Necessity</label>
                <select
                  value={form.necessity}
                  onChange={e => setForm(f => ({ ...f, necessity: e.target.value }))}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {NECESSITIES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.isTransfer}
                  onChange={e => setForm(f => ({ ...f, isTransfer: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                />
                Mark as inter-account transfer <span className="text-zinc-600">(excluded from spend totals)</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveRule}
                disabled={saving || !form.pattern.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Add rule"}
              </button>
              {editingId && (
                <button onClick={cancelEdit} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800">
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Rules list */}
          {loading ? (
            <div className="animate-pulse flex flex-col gap-2">
              {[...Array(2)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-800" />)}
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center">
              <p className="text-sm text-zinc-500">No rules yet. Add one above.</p>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Pattern</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Label</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Category</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Necessity</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {rules.map(rule => (
                    <tr key={rule.id} className={editingId === rule.id ? "bg-blue-950/20" : "bg-zinc-950 hover:bg-zinc-900/60"}>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-300 max-w-[180px] truncate" title={rule.pattern}>
                        {rule.pattern}
                      </td>
                      <td className="px-5 py-3 text-zinc-200 font-medium">
                        {rule.label || <span className="text-zinc-600">—</span>}
                        {rule.isTransfer && (
                          <span className="ml-2 text-[10px] text-zinc-500 font-normal">transfer</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">{rule.category}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${NECESSITY_COLORS[rule.necessity] ?? "bg-zinc-800 text-zinc-400"}`}>
                          {rule.necessity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(rule)}
                            className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="text-xs font-medium text-red-500 hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
