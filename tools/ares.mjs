#!/usr/bin/env node
// Herramienta de Ares para leer los datos de Cuerpo Ares y dejar el plan.
// Usa `gh` (sesión de GitHub del PC). Los datos viven en el repo PRIVADO cuerpo-ares-datos.
//   node ares.mjs leer [días=14]     resumen compacto para el entrenador
//   node ares.mjs plan archivo.json  sube el plan (coach.json) que la app muestra en "Plan de Ares"
//   node ares.mjs ver-plan           muestra el plan vigente
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = process.env.ARES_REPO || "orduzchiqui-sudo/cuerpo-ares-datos";
const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 << 20 });
const raw = path => gh(["api", "-H", "Accept: application/vnd.github.raw+json", `repos/${REPO}/contents/${path}`]);
const sha = path => { try { return JSON.parse(gh(["api", `repos/${REPO}/contents/${path}`])).sha; } catch { return null; } };

const r0 = n => Math.round(n || 0), r1 = n => Math.round((n || 0) * 10) / 10;
const iso = d => d.toISOString().slice(0, 10);
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const toMin = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const sleepH = d => { if (!d?.bed || !d?.wake) return null; let h = (toMin(d.wake) - toMin(d.bed)) / 60; if (h <= 0) h += 24; return h; };
const naps = d => (d?.naps || []).reduce((a, n) => a + (+n.min || 0), 0) / 60;
const sum = (ms, k) => (ms || []).reduce((a, m) => a + (+m[k] || 0), 0);

function leer(dias = 14) {
  const { at, data: c } = JSON.parse(raw("datos.json"));
  const p = c.profile || {}, out = [];
  out.push(`DATOS al ${at?.slice(0, 16).replace("T", " ")} UTC`);
  out.push(`PERFIL: ${p.name || "-"} · ${p.age ?? "?"} años · ${p.height ?? "?"} cm · meta ${p.goalW ?? "?"} kg · modo ${p.goal || "-"} · ejercicio ${p.exercise || "-"} · días entreno ${(p.trainDays || []).map(i => DIAS[i]).join(",") || "-"} · se levanta ${p.wakeGoal || "-"} · entrena ${p.trainTime || "-"} (${p.sessMin || "?"} min)`);
  if (c.coach) out.push(`PLAN VIGENTE: ${c.coach.fecha || "?"} → revisar ${c.coach.revisar || "?"} · ${JSON.stringify(c.coach.metas || {})}`);

  const keys = Object.keys(c).filter(k => k.startsWith("d-")).sort();
  const pesos = keys.filter(k => c[k].weight).map(k => `${k.slice(2)}: ${c[k].weight}`);
  out.push(`PESOS (${pesos.length}): ${pesos.slice(-10).join(" | ") || "ninguno"}`);
  out.push(`DÍAS CON DATOS: ${keys.length} (desde ${keys[0]?.slice(2) || "-"})`);
  out.push("");
  out.push("fecha     | kcal  prot carb grasa | sueño (acostó→levantó) | ejercicio | pasos | agua sol relax | E/Á/Ans | notas");

  const hoy = new Date(), tot = { n: 0, kcal: 0, prot: 0, sue: 0, ns: 0, fz: 0 };
  for (let i = dias - 1; i >= 0; i--) {
    const f = new Date(hoy); f.setDate(hoy.getDate() - i);
    const id = iso(f), d = c["d-" + id];
    if (!d) { out.push(`${id.slice(5)} ${DIAS[f.getDay()]} | sin datos`); continue; }
    const M = d.meals || [], kcal = sum(M, "kcal"), prot = sum(M, "prot");
    const sh = sleepH(d), sn = naps(d);
    const acts = (d.acts || []).map(a => `${a.type} ${a.min}m`).join("+") || d.exType || "-";
    const w = d.workout, wtxt = w?.sets ? " [" + Object.entries(w.sets).map(([n, S]) => `${n}: ${S.filter(s => s?.kg || s?.reps).map(s => `${s.kg ?? 0}×${s.reps ?? 0}`).join(",")}`).join("; ") + "]" : "";
    if (M.length) { tot.n++; tot.kcal += kcal; tot.prot += prot; }
    if (sh != null) { tot.sue += sh + sn; tot.ns++; }
    if ((d.acts || []).some(a => a.type === "fuerza") || d.exType === "fuerza") tot.fz++;
    const extra = [d.alcohol && "ALCOHOL", d.lateCaffeine && "café tarde", d.screensOff && "sin pantallas", d.earlyDinner && "cena temprano", d.weight && `PESO ${d.weight}`].filter(Boolean).join(", ");
    out.push(`${id.slice(5)} ${DIAS[f.getDay()]} | ${r0(kcal)} ${r0(prot)} ${r0(sum(M, "carb"))} ${r0(sum(M, "fat"))} (${M.length} comidas) | ${sh != null ? r1(sh) + "h" : "-"}${sn ? "+" + r1(sn) + "siesta" : ""} (${d.bed || "?"}→${d.wake || "?"}) | ${acts}${wtxt} | ${d.steps ?? "-"} | ${d.water || 0} ${d.sun ?? "-"} ${d.relax || 0} | ${d.energy || "-"}/${d.mood || "-"}/${d.anxiety || "-"} | ${[extra, d.notes].filter(Boolean).join(" · ")}`);
    if (M.length) out.push(`          comió: ${M.map(m => `${m.name} (${r0(m.kcal)}/${r0(m.prot)}p)`).join("; ")}`);
  }
  out.push("");
  out.push(`PROMEDIOS ${dias}d: kcal ${tot.n ? r0(tot.kcal / tot.n) : "-"} · proteína ${tot.n ? r0(tot.prot / tot.n) : "-"} g (${tot.n} días con comida) · sueño ${tot.ns ? r1(tot.sue / tot.ns) : "-"} h (${tot.ns} noches) · fuerza ${tot.fz} sesiones`);
  if (c.labs?.items?.length) out.push(`EXÁMENES: ${c.labs.items.map(l => `${l.date} ${l.name}=${l.val} ${l.unit || ""} (ref ${l.ref || "-"})`).join(" | ")}`);
  console.log(out.join("\n"));
}

function plan(file) {
  const txt = readFileSync(file, "utf8"), j = JSON.parse(txt);
  if (!j.metas && !j.mensaje && !j.tareas) throw new Error("El plan necesita metas, mensaje o tareas");
  const s = sha("coach.json");
  const body = JSON.stringify({ message: `plan ${j.fecha || iso(new Date())}`, content: Buffer.from(JSON.stringify(j, null, 2)).toString("base64"), ...(s ? { sha: s } : {}) });
  gh(["api", "-X", "PUT", `repos/${REPO}/contents/coach.json`, "--input", "-"], body);
  console.log(`Plan subido a ${REPO}/coach.json. La app lo toma al abrirse (o con "Sincronizar ahora").`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "leer") leer(+arg || 14);
  else if (cmd === "plan" && arg) plan(arg);
  else if (cmd === "ver-plan") console.log(raw("coach.json"));
  else console.log("Uso: node ares.mjs leer [días] | plan archivo.json | ver-plan");
} catch (e) {
  const m = String(e.stderr || e.message || e);
  console.error(/404|Not Found/.test(m) ? "Todavía no hay datos: Alejandro tiene que pegar la llave en Ajustes → Conexión con Ares." : m.slice(0, 400));
  process.exit(1);
}
