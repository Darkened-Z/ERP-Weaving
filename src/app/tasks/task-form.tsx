"use client";

import { useEffect, useRef, useState } from "react";
import { DateBox } from "@/components/date-box";
import { ImageAttach } from "@/components/image-attach";
import { REMINDER_CHANNELS, REPEAT_RULES, WEEKDAYS, type RepeatRule } from "@/lib/task-schedule";

type Opt = { value: string; label: string };
type Reminder = { channel: string; amount: number; unit: string; timing: string };

export type TaskFormInitial = {
  title: string;
  description: string;
  checklist: string[];
  assignees: number[];
  loop: number[];
  startDate: string;
  startTime: string;
  priority: string;
  category: string;
  repeatRule: RepeatRule;
  repeatEvery: number | null;
  repeatUnit: "WEEK" | "MONTH";
  repeatDays: number[];
  repeatDates: number[];
  repeatEnd: string;
  reminders: Reminder[];
  loom: string;
  img: string;
  voice: string;
};

const Icon = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const I = {
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  flag: "M4 22V4M4 4h13l-2 4 2 4H4",
  cat: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  loop: "M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  alarm: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M5 3 2 6M22 6l-3-3",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
};

function Pop({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white border border-black w-full sm:w-[440px] max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-light)]">
          <div className="font-bold text-[14px]">{title}</div>
          <button type="button" className="text-[18px] leading-none px-2" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function PeoplePick({ users, value, onChange, exclude }: { users: Opt[]; value: number[]; onChange: (v: number[]) => void; exclude?: number[] }) {
  const [q, setQ] = useState("");
  const list = users.filter((u) => u.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="input-box mb-2" placeholder="Search user" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-col">
        {list.map((u) => {
          const id = Number(u.value);
          const on = value.includes(id);
          const blocked = exclude?.includes(id);
          return (
            <label key={u.value} className={`flex items-center gap-2 py-2 border-b border-[var(--border-light)] text-[13px] ${blocked ? "opacity-40" : ""}`}>
              <input type="checkbox" disabled={blocked} checked={on} onChange={() => onChange(on ? value.filter((x) => x !== id) : [...value, id])} />
              {u.label}
              {blocked && <span className="text-[11px] text-[var(--muted)]">(assigned)</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function VoiceNote({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 1_500_000) {
          setErr("Voice note too long — keep it under about 2 minutes.");
          return;
        }
        const r = new FileReader();
        r.onload = () => onChange(String(r.result));
        r.readAsDataURL(blob);
      };
      mr.start();
      setRec(mr);
      setSecs(0);
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      setErr("Microphone not available or permission denied.");
    }
  }
  function stop() {
    rec?.stop();
    setRec(null);
    if (timer.current) clearInterval(timer.current);
  }
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  return (
    <div className="flex flex-col gap-2">
      {!rec ? (
        <button type="button" className="btn btn-sm" onClick={start}>Record voice note</button>
      ) : (
        <button type="button" className="btn btn-danger btn-sm" onClick={stop}>Stop · {secs}s</button>
      )}
      {value && !rec && (
        <div className="flex items-center gap-2">
          <audio controls src={value} className="w-full" />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange("")}>Remove</button>
        </div>
      )}
      {err && <div className="text-[12px] text-[var(--danger)]">{err}</div>}
    </div>
  );
}

export function TaskForm({
  initial,
  users,
  categories,
  priorities,
  looms,
  isEdit,
}: {
  initial: TaskFormInitial;
  users: Opt[];
  categories: Opt[];
  priorities: Opt[];
  looms: Opt[];
  isEdit: boolean;
}) {
  const [checklist, setChecklist] = useState<string[]>(initial.checklist);
  const [showChecklist, setShowChecklist] = useState(initial.checklist.length > 0);
  const [assignees, setAssignees] = useState<number[]>(initial.assignees);
  const [loop, setLoop] = useState<number[]>(initial.loop);
  const [priority, setPriority] = useState(initial.priority);
  const [category, setCategory] = useState(initial.category);
  const [repeat, setRepeat] = useState(initial.repeatRule !== "NONE");
  const [rule, setRule] = useState<RepeatRule>(initial.repeatRule === "NONE" ? "DAILY" : initial.repeatRule);
  const [days, setDays] = useState<number[]>(initial.repeatDays);
  const [dates, setDates] = useState<number[]>(initial.repeatDates);
  const [unit, setUnit] = useState<"WEEK" | "MONTH">(initial.repeatUnit);
  const [reminders, setReminders] = useState<Reminder[]>(initial.reminders);
  const [draft, setDraft] = useState<Reminder[]>([]);
  const [voice, setVoice] = useState(initial.voice);
  const [loom, setLoom] = useState(initial.loom);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [pop, setPop] = useState<"" | "users" | "loop" | "date" | "priority" | "category" | "remind" | "voice" | "more" | "attach">("");

  const name = (ids: number[]) => ids.map((i) => users.find((u) => Number(u.value) === i)?.label ?? `#${i}`);
  const chip = "btn btn-outline btn-sm justify-center gap-2 !h-10 w-full";
  const active = "!border-[var(--accent)] !text-[var(--accent)] hover:!text-white font-semibold";

  const openRemind = () => {
    setDraft(reminders.length ? reminders : [{ channel: "APP", amount: 10, unit: "minutes", timing: "BEFORE" }]);
    setPop("remind");
  };

  return (
    <div className="flex flex-col gap-4">
      {assignees.map((id) => <input key={`a${id}`} type="hidden" name="assignee" value={id} />)}
      {loop.map((id) => <input key={`l${id}`} type="hidden" name="loop" value={id} />)}
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="start_date" value={startDate} />
      <input type="hidden" name="start_time" value={startTime} />
      <input type="hidden" name="repeat_rule" value={repeat ? rule : "NONE"} />
      <input type="hidden" name="repeat_days" value={days.join(",")} />
      <input type="hidden" name="repeat_dates" value={dates.join(",")} />
      <input type="hidden" name="repeat_unit" value={unit} />
      <input type="hidden" name="reminders" value={JSON.stringify(reminders)} />
      <input type="hidden" name="voice" value={voice} />
      <input type="hidden" name="loom" value={loom} />

      <div>
        <label className="label block mb-1">Add Title *</label>
        <input name="title" className="input-box !h-10 text-[14px]" required defaultValue={initial.title} placeholder="What needs to be done" />
      </div>
      <div>
        <label className="label block mb-1">Add Description</label>
        <textarea name="description" className="input-box text-[14px]" rows={3} defaultValue={initial.description} />
      </div>

      <div>
        <button type="button" className="text-[13px] font-semibold text-[var(--accent)]" onClick={() => { setShowChecklist(true); if (!checklist.length) setChecklist([""]); }}>
          + Add Checklist
        </button>
        {showChecklist && (
          <div className="flex flex-col gap-1 mt-2">
            {checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="mono text-[11px] text-[var(--muted)] w-5 text-right">{i + 1}</span>
                <input
                  name="checklist"
                  className="input-box"
                  autoFocus={i === checklist.length - 1 && c === ""}
                  value={c}
                  placeholder="Checklist item"
                  onChange={(e) => setChecklist(checklist.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      setChecklist([...checklist, ""]);
                    }
                  }}
                />
                <button type="button" className="px-2 text-[16px]" aria-label="Remove item" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="text-[12px] self-start text-[var(--accent)] mt-1" onClick={() => setChecklist([...checklist, ""])}>+ item</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={`${chip} ${assignees.length ? active : ""}`} onClick={() => setPop("users")}>
          <Icon d={I.users} /> {assignees.length ? `Users (${assignees.length})` : "Users"}
        </button>
        <button type="button" className={`${chip} ${startDate ? active : ""}`} onClick={() => setPop("date")}>
          <Icon d={I.cal} /> {startDate ? `${startDate.slice(8, 10)}/${startDate.slice(5, 7)}${startTime ? ` ${startTime}` : ""}` : "Start Date"}
        </button>
        <button type="button" className={`${chip} ${active}`} onClick={() => setPop("priority")}>
          <Icon d={I.flag} /> {priorities.find((p) => p.value === priority)?.label}
        </button>
        <button type="button" className={`${chip} ${category !== "GENERAL" ? active : ""}`} onClick={() => setPop("category")}>
          <Icon d={I.cat} /> {category === "GENERAL" ? "Category" : categories.find((c) => c.value === category)?.label}
        </button>
        <button type="button" className={`${chip} ${loop.length ? active : ""}`} onClick={() => setPop("loop")}>
          <Icon d={I.loop} /> {loop.length ? `In Loop (${loop.length})` : "In Loop"}
        </button>
      </div>
      {(assignees.length > 0 || loop.length > 0) && (
        <div className="text-[12px] text-[var(--muted)] -mt-2">
          {assignees.length > 0 && <div>Assigned: <span className="text-[var(--fg)]">{name(assignees).join(", ")}</span></div>}
          {loop.length > 0 && <div>In loop: <span className="text-[var(--fg)]">{name(loop).join(", ")}</span></div>}
        </div>
      )}

      <div className="border-t border-[var(--border-light)] pt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat
        </label>
        {repeat && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select className="input-box !w-[160px]" value={rule} onChange={(e) => setRule(e.target.value as RepeatRule)}>
                {REPEAT_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {(rule === "PERIODICALLY" || rule === "CUSTOM") && (
                <label className="flex items-center gap-2 text-[13px]">
                  every <input name="repeat_every" type="number" min={1} className="input-box mono !w-[70px]" defaultValue={initial.repeatEvery ?? (rule === "PERIODICALLY" ? 2 : 1)} />
                  {rule === "PERIODICALLY" ? "days" : (
                    <select className="input-box !w-[100px]" value={unit} onChange={(e) => setUnit(e.target.value === "MONTH" ? "MONTH" : "WEEK")}>
                      <option value="WEEK">weeks</option>
                      <option value="MONTH">months</option>
                    </select>
                  )}
                </label>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[var(--muted)]">End Date</span>
                <DateBox name="repeat_end" defaultValue={initial.repeatEnd} className="input-box mono !w-[140px]" />
              </div>
            </div>
            {(rule === "WEEKLY" || (rule === "CUSTOM" && unit === "WEEK")) && (
              <div>
                <div className="text-[12px] text-[var(--muted)] mb-1">On these days of the week</div>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      className={`btn btn-sm !min-w-[46px] ${days.includes(i) ? "" : "btn-outline"}`}
                      onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort((x, y) => x - y))}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                {!days.length && <div className="text-[11px] text-[var(--muted)] mt-1">None picked: the Start Date&apos;s weekday.</div>}
              </div>
            )}
            {(rule === "MONTHLY" || (rule === "CUSTOM" && unit === "MONTH")) && (
              <div>
                <div className="text-[12px] text-[var(--muted)] mb-1">On these dates of the month</div>
                <div className="grid grid-cols-7 gap-1 max-w-[340px]">
                  {[...Array.from({ length: 31 }, (_, i) => i + 1), 0].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`btn btn-sm !px-0 mono ${d === 0 ? "col-span-2" : ""} ${dates.includes(d) ? "" : "btn-outline"}`}
                      onClick={() => setDates(dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d].sort((x, y) => x - y))}
                    >
                      {d === 0 ? "Last" : d}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-1">
                  {dates.length ? "29–31 fall on the last day in shorter months." : "None picked: the Start Date's date."}
                </div>
              </div>
            )}
            <div className="text-[11px] text-[var(--muted)]">
              A new copy of this task is created on each repeat date, for the same users, from the Start Date until the End Date (blank = no end).
              {!startDate && <span className="text-[var(--danger)]"> Pick a Start Date — repeats count from it.</span>}
            </div>
          </div>
        )}
      </div>

      {reminders.length > 0 && (
        <div className="text-[12px] flex flex-wrap gap-1">
          {reminders.map((r, i) => (
            <span key={i} className="border border-[var(--border)] px-2 py-0.5">
              {REMINDER_CHANNELS.find((c) => c.value === r.channel)?.label} · {r.amount} {r.unit} {r.timing === "AFTER" ? "after" : "before"}
            </span>
          ))}
        </div>
      )}
      {voice && <div className="text-[12px] text-[var(--muted)]">Voice note attached</div>}
      {loom && <div className="text-[12px] text-[var(--muted)]">Loom: {looms.find((l) => l.value === loom)?.label}</div>}

      <div className="flex items-center gap-1 border-t border-[var(--border-light)] pt-3">
        <button type="button" className="p-2" title="Attachments" onClick={() => setPop("attach")}>
          <Icon d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
        </button>
        <button type="button" className={`p-2 ${reminders.length ? "text-[var(--accent)]" : ""}`} title="Reminders" onClick={openRemind}><Icon d={I.alarm} /></button>
        <button type="button" className={`p-2 ${voice ? "text-[var(--accent)]" : ""}`} title="Voice note" onClick={() => setPop("voice")}><Icon d={I.mic} /></button>
        <button type="button" className="p-2 ml-auto" title="More" onClick={() => setPop("more")}><Icon d={I.more} /></button>
        <button type="submit" className="btn gap-2 !h-10 !px-5" style={{ background: "var(--success)", borderColor: "var(--success)" }}>
          <Icon d={I.send} /> {isEdit ? "Save Task" : "Assign Task"}
        </button>
      </div>

      <div style={{ display: pop === "attach" ? "block" : "none" }} className="border border-[var(--border)] p-3">
        <div className="label mb-2">Attachments</div>
        <ImageAttach name="img" defaultValue={initial.img} max={5} />
      </div>

      <Pop open={pop === "users"} onClose={() => setPop("")} title="Assign to users">
        <PeoplePick users={users} value={assignees} onChange={(v) => { setAssignees(v); setLoop(loop.filter((x) => !v.includes(x))); }} />
      </Pop>
      <Pop open={pop === "loop"} onClose={() => setPop("")} title="Keep in loop">
        <div className="text-[12px] text-[var(--muted)] mb-2">They see the task and its updates, but it is not theirs to do.</div>
        <PeoplePick users={users} value={loop} exclude={assignees} onChange={setLoop} />
      </Pop>
      <Pop open={pop === "date"} onClose={() => setPop("")} title="Start Date">
        <div className="flex flex-col gap-3">
          <input type="date" className="input-box mono" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="time" className="input-box mono" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setPop("")}>Done</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setStartDate(""); setStartTime(""); }}>Clear</button>
          </div>
        </div>
      </Pop>
      <Pop open={pop === "priority"} onClose={() => setPop("")} title="Priority">
        {priorities.map((p) => (
          <button key={p.value} type="button" className={`block w-full text-left py-2 px-2 border-b border-[var(--border-light)] text-[13px] ${p.value === priority ? "font-bold text-[var(--accent)]" : ""}`} onClick={() => { setPriority(p.value); setPop(""); }}>
            {p.label}
          </button>
        ))}
      </Pop>
      <Pop open={pop === "category"} onClose={() => setPop("")} title="Category">
        {categories.map((c) => (
          <button key={c.value} type="button" className={`block w-full text-left py-2 px-2 border-b border-[var(--border-light)] text-[13px] ${c.value === category ? "font-bold text-[var(--accent)]" : ""}`} onClick={() => { setCategory(c.value); setPop(""); }}>
            {c.label}
          </button>
        ))}
      </Pop>
      <Pop open={pop === "voice"} onClose={() => setPop("")} title="Voice note">
        <VoiceNote value={voice} onChange={setVoice} />
      </Pop>
      <Pop open={pop === "more"} onClose={() => setPop("")} title="More">
        <label className="label block mb-1">Loom (optional)</label>
        <select className="input-box mono" value={loom} onChange={(e) => setLoom(e.target.value)}>
          <option value="">—</option>
          {looms.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Pop>
      <Pop open={pop === "remind"} onClose={() => setPop("")} title="Schedule Task Reminders">
        <div className="flex flex-col gap-4">
          {draft.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-[var(--border-light)] pb-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold">Where should we remind you?</div>
                {draft.length > 1 && <button type="button" className="text-[16px] px-2" aria-label="Remove reminder" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>×</button>}
              </div>
              <div className="flex gap-4 text-[13px]">
                {REMINDER_CHANNELS.map((c) => (
                  <label key={c.value} className="flex items-center gap-1">
                    <input type="radio" checked={r.channel === c.value} onChange={() => setDraft(draft.map((x, j) => (j === i ? { ...x, channel: c.value } : x)))} /> {c.label}
                  </label>
                ))}
              </div>
              <div className="text-[12px] font-semibold">When should we remind you?</div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="number" min={0} className="input-box mono !w-[80px]" value={r.amount} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, amount: Math.max(0, parseInt(e.target.value, 10) || 0) } : x)))} />
                <select className="input-box !w-[110px]" value={r.unit} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <label className="flex items-center gap-1 text-[13px]"><input type="radio" checked={r.timing === "BEFORE"} onChange={() => setDraft(draft.map((x, j) => (j === i ? { ...x, timing: "BEFORE" } : x)))} /> Before</label>
                <label className="flex items-center gap-1 text-[13px]"><input type="radio" checked={r.timing === "AFTER"} onChange={() => setDraft(draft.map((x, j) => (j === i ? { ...x, timing: "AFTER" } : x)))} /> After</label>
              </div>
            </div>
          ))}
          {!startDate && <div className="text-[12px] text-[var(--danger)]">Reminders count from the Start Date — set one, or they fire at 09:00 on the day the task is due.</div>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline btn-sm flex-1" onClick={() => setDraft([...draft, { channel: "APP", amount: 10, unit: "minutes", timing: "BEFORE" }])}>+ Add More</button>
            <button type="button" className="btn btn-sm flex-1" style={{ background: "var(--success)", borderColor: "var(--success)" }} onClick={() => { setReminders(draft); setPop(""); }}>Save</button>
          </div>
          {reminders.length > 0 && <button type="button" className="text-[12px] text-[var(--danger)] self-start" onClick={() => { setReminders([]); setDraft([]); setPop(""); }}>Remove all reminders</button>}
        </div>
      </Pop>
    </div>
  );
}
