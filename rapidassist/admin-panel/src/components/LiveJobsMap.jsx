import { useEffect } from "react";

export function LiveJobsMap({ jobs, onSelect }) {
  useEffect(() => {
    function receive(event) {
      if (event.data?.source === "rapidassist-map" && event.data?.jobId) onSelect?.(event.data.jobId);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onSelect]);

  const markers = jobs.flatMap((job) => {
    const result = [{ jobId: job.id, kind: "pickup", label: job.customer?.name || "Customer", lat: job.pickupLocation.lat, lng: job.pickupLocation.lng }];
    const location = job.provider?.location;
    if (Number.isFinite(location?.lat) && Number.isFinite(location?.lng)) result.push({ jobId: job.id, kind: "provider", label: job.provider.name, lat: location.lat, lng: location.lng });
    return result;
  });
  if (!markers.length) return <div style={styles.empty}>No active jobs match these filters.</div>;
  const payload = JSON.stringify(markers).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body,#map{height:100%;margin:0;overflow:hidden;background:#edf4f0;font-family:Arial,sans-serif}.tile{position:absolute;width:256px;height:256px}.pin{position:absolute;transform:translate(-50%,-50%);z-index:3;border:3px solid white;border-radius:50%;width:20px;height:20px;box-shadow:0 2px 8px #0005;cursor:pointer}.provider{background:#087f5b}.pickup{background:#dc2626}.label{position:absolute;transform:translate(-50%,14px);z-index:4;background:#fffffff2;padding:4px 7px;border-radius:7px;font-size:11px;white-space:nowrap;cursor:pointer}.legend{position:absolute;left:10px;top:10px;z-index:5;background:#fffffff2;padding:8px;border-radius:8px;font-size:11px}.credit{position:absolute;right:5px;bottom:4px;z-index:5;background:#fffffff2;font-size:9px}
  </style></head><body><div id="map"></div><script>const markers=${payload},map=document.getElementById('map');function point(c,z){const lat=Math.max(-85,Math.min(85,c.lat)),sin=Math.sin(lat*Math.PI/180),s=256*Math.pow(2,z);return{x:(c.lng+180)/360*s,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*s}}function draw(){const w=innerWidth,h=innerHeight;let z=15,b;for(;z>2;z--){const p=markers.map(c=>point(c,z));b={l:Math.min(...p.map(v=>v.x)),r:Math.max(...p.map(v=>v.x)),t:Math.min(...p.map(v=>v.y)),d:Math.max(...p.map(v=>v.y))};if(b.r-b.l<w-100&&b.d-b.t<h-120)break}const left=(b.l+b.r)/2-w/2,top=(b.t+b.d)/2-h/2;map.replaceChildren();for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){const img=document.createElement('img');img.className='tile';img.src='https://basemaps.cartocdn.com/rastertiles/voyager/'+z+'/'+x+'/'+y+'.png';img.style.left=x*256-left+'px';img.style.top=y*256-top+'px';map.append(img)}markers.forEach(m=>{const p=point(m,z),pin=document.createElement('button'),label=document.createElement('button');pin.className='pin '+m.kind;label.className='label';label.textContent=m.label+' · '+m.kind;[pin,label].forEach(el=>{el.style.left=p.x-left+'px';el.style.top=p.y-top+'px';el.onclick=()=>parent.postMessage({source:'rapidassist-map',jobId:m.jobId},'*');map.append(el)})});const legend=document.createElement('div');legend.className='legend';legend.textContent='Red: pickup · Green: provider';map.append(legend);const credit=document.createElement('div');credit.className='credit';credit.textContent='© OpenStreetMap · © CARTO';map.append(credit)}addEventListener('resize',draw);draw();</script></body></html>`;
  return <iframe title="Active RapidAssist jobs" srcDoc={html} style={styles.frame} sandbox="allow-scripts" />;
}

const styles = {
  frame: { width: "100%", height: 520, border: "1px solid var(--border)", borderRadius: 18, background: "white" },
  empty: { height: 300, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 18, color: "var(--muted)", background: "white" }
};
