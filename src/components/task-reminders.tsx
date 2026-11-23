"use client";

import { useEffect, useState } from "react";

type Reminder = { key: string; taskId: number; taskNo: string; title: string; channel: string; at: string; start: string };

const SEEN = "task-reminders-seen";
const pkt = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 16);

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN) ?? "[]"));
  } catch {
    return new Set();
  }
}
function remember(keys: string[]) {
  try {
    localStorage.setItem(SEEN, JSON.stringify(keys.slice(-300)));
  } catch {
    /* private mode: banner may show again after reload */
  }
}

/**
 * Polls the signed-in user's task reminders every minute. When one comes due it
 * raises a system notification (if the user allowed them — on a phone this is
 * the installed app's notification) and always shows a banner in the app.
 * Works while the app is open; nothing runs when it is closed.
 */
const POLL = 5 * 60000;
const CACHE = "task-reminders";

export function TaskReminders() {
  const [due, setDue] = useState<Reminder[]>([]);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [onTasks, setOnTasks] = useState(false);

  useEffect(() => {
    const init = setTimeout(() => {
      setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      setOnTasks(/^\/(tasks|my-tasks)(\/|$)/.test(window.location.pathname));
    }, 0);
    let all: Reminder[] = [];
    let stop = false;

    const fire = () => {
      const now = pkt();
      const done = seen();
      const fresh = all.filter((r) => r.at <= now && !done.has(r.key));
      if (!fresh.length) return;
      for (const r of fresh) {
        done.add(r.key);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const n = new Notification(`Task ${r.taskNo}`, { body: `${r.title}\nStart ${r.start}`, tag: r.key });
            n.onclick = () => { window.focus(); window.location.href = `/tasks/${r.taskId}`; };
          } catch {
            /* some mobile browsers only allow notifications from a service worker */
          }
        }
      }
      remember(Array.from(done));
      setDue((d) => [...d, ...fresh]);
    };

    // Shell remounts on every page, so the list is shared across pages for
    // POLL ms instead of being refetched on each navigation (Vercel CPU).
    const load = async () => {
      if (document.hidden) return;
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE) ?? "null");
        if (c && Date.now() - c.t < POLL && Array.isArray(c.reminders)) {
          all = c.reminders;
          if (!stop) fire();
          return;
        }
      } catch {
        /* no storage: fetch */
      }
      try {
        const res = await fetch("/tasks/reminders", { cache: "no-store" });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
        const j = await res.json();
        all = Array.isArray(j.reminders) ? j.reminders : [];
        try { sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), reminders: all })); } catch { /* full */ }
        if (!stop) fire();
      } catch {
        /* offline: try again next minute */
      }
    };

    const onShow = () => { if (!document.hidden) load(); };
    load();
    const poll = setInterval(load, POLL);
    const tick = setInterval(fire, 30000);
    document.addEventListener("visibilitychange", onShow);
    return () => { stop = true; clearTimeout(init); clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  const ask = perm === "default" && onTasks;
  if (!due.length && !ask) return null;
  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-2 max-w-[340px] no-print">
      {due.map((r) => (
        <div key={r.key} className="bg-white border-2 border-black p-3 shadow-lg text-[13px]">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-[11px] text-[var(--muted)]">Reminder · {r.taskNo} · start {r.start}</div>
              <a href={`/tasks/${r.taskId}`} className="font-semibold underline">{r.title}</a>
              {r.channel !== "APP" && <div className="text-[11px] mt-1">Open the task to send the {r.channel === "WHATSAPP" ? "WhatsApp" : "email"} reminder.</div>}
            </div>
            <button type="button" aria-label="Dismiss" className="text-[16px] leading-none px-1" onClick={() => setDue((d) => d.filter((x) => x.key !== r.key))}>×</button>
          </div>
        </div>
      ))}
      {ask && (
        <button
          type="button"
          className="btn btn-outline btn-sm bg-white"
          onClick={async () => setPerm(await Notification.requestPermission())}
        >
          Turn on task notifications
        </button>
      )}
    </div>
  );
}
