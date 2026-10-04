var i=`
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
`,n,r;async function p(){n||(r||(r=(async()=>{let a=performance.now(),o=new URL("/agriculture-ai/engine/",self.location.origin).href,{loadPyodide:s}=await import(`${o}pyodide/pyodide.mjs`),e=await s({indexURL:`${o}pyodide/`});await e.loadPackage("jsonschema");let t=await(await fetch(`${o}backend.zip`)).arrayBuffer();e.unpackArchive(t,"zip",{extractDir:"/repo"}),e.runPython("import sys; sys.path.insert(0, '/repo/backend')"),e.runPython(i),n=e,self.postMessage({type:"ready",ms:Math.round(performance.now()-a),python:e.runPython("import sys; sys.version.split()[0]")})})()),await r)}self.onmessage=async a=>{let{type:o,id:s}=a.data;try{if(await p(),o==="load")return;let e=performance.now(),t;if(o==="observe")t=JSON.parse(n.globals.get("bridge_observe")(JSON.stringify(a.data.raw),JSON.stringify(a.data.context)));else if(o==="analyze")t=JSON.parse(n.globals.get("bridge_analyze")(JSON.stringify(a.data.observation),a.data.now??"",JSON.stringify(a.data.weather??[])));else throw new Error(`unknown message ${o}`);self.postMessage({type:"result",id:s,value:t,ms:Math.round(performance.now()-e)})}catch(e){self.postMessage({type:"error",id:s,message:String(e&&e.message||e)})}};
