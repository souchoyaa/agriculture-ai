// The agricultural analysis engine (the tested Python backend) running in the browser via Pyodide.
// No server: Pyodide, the jsonschema wheels and the backend code/data are served by this app (public/engine).
//
// In:  {type:'load'}
//      {type:'observe', id, raw, context}             → canonical observation via LabelListVLMAdapter (model output boundary)
//      {type:'analyze', id, observation, now?, weather?: [open-meteo cache payloads]} → canonical analysis
// Out: {type:'ready', ms, python} | {type:'result', id, value, ms} | {type:'error', id?, message}

const BRIDGE = `
import json, os
from datetime import datetime, timezone
from app.domain import analysis, weather
from app.adapters.vlm import LabelListVLMAdapter

def _install_weather(payloads_json):
    payloads = json.loads(payloads_json) if payloads_json else []
    os.makedirs(weather.CACHE_DIR, exist_ok=True)
    for p in payloads:
        try:
            lat, lon = float(p["request"]["latitude"]), float(p["request"]["longitude"])
        except (KeyError, TypeError, ValueError):
            continue  # unusable synced entry: the engine degrades instead of failing
        path = weather.cache_path(lat, lon)
        tmp = str(path) + ".tmp"
        with open(tmp, "w") as f:
            json.dump(p, f)
        os.replace(tmp, path)

def bridge_observe(raw_json, context_json):
    return json.dumps(LabelListVLMAdapter().observe(json.loads(raw_json), json.loads(context_json)))

def bridge_analyze(observation_json, now_iso, weather_json):
    _install_weather(weather_json)
    now = datetime.fromisoformat(now_iso.replace("Z", "+00:00")) if now_iso else datetime.now(timezone.utc)
    return json.dumps(analysis.analyze(json.loads(observation_json), now=now, allow_network=False))
`;

let py, loading;

async function load() {
  if (py) return;
  if (!loading) loading = (async () => {
    const t0 = performance.now();
    const base = new URL('/engine/', self.location.origin).href;
    const { loadPyodide } = await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`);
    const p = await loadPyodide({ indexURL: `${base}pyodide/` });
    await p.loadPackage('jsonschema'); // resolved from the self-hosted lockfile/wheels
    const zip = await (await fetch(`${base}backend.zip`)).arrayBuffer();
    p.unpackArchive(zip, 'zip', { extractDir: '/repo' });
    p.runPython("import sys; sys.path.insert(0, '/repo/backend')");
    p.runPython(BRIDGE);
    py = p;
    self.postMessage({ type: 'ready', ms: Math.round(performance.now() - t0), python: p.runPython('import sys; sys.version.split()[0]') });
  })();
  await loading;
}

self.onmessage = async e => {
  const { type, id } = e.data;
  try {
    await load();
    if (type === 'load') return;
    const t0 = performance.now();
    let value;
    if (type === 'observe') value = JSON.parse(py.globals.get('bridge_observe')(JSON.stringify(e.data.raw), JSON.stringify(e.data.context)));
    else if (type === 'analyze') value = JSON.parse(py.globals.get('bridge_analyze')(JSON.stringify(e.data.observation), e.data.now ?? '', JSON.stringify(e.data.weather ?? [])));
    else throw new Error(`unknown message ${type}`);
    self.postMessage({ type: 'result', id, value, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
