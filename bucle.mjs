const a = "https://beepromo.cl/categoria/audio-y-tecnologia/tecnologia/pendrive-personalizados/";
const b = "https://beepromo.cl/categoria/escritorio-y-oficina/pendrive-personalizados/";
for (const u of [a, b]) {
  const r = await fetch(u, { redirect: "manual", headers: {"User-Agent":"Mozilla/5.0"} });
  console.log("  " + r.status + "  " + u.replace("https://beepromo.cl","") + "\n      → " + (r.headers.get("location")||"").replace("https://beepromo.cl",""));
}
