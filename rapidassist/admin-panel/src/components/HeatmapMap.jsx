// Twin-cities heatmap drawn on CARTO raster tiles inside a sandboxed iframe (no map library, same approach as
// LiveJobsMap). It receives only aggregated grid cells (centre + count) and the cell size; never raw coordinates.
import { MAP_TILES } from "../config/mapTiles";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const cells = (list) => (Array.isArray(list) ? list.map((c) => ({ lat: num(c.lat), lng: num(c.lng), count: Math.max(0, Math.round(num(c.count))) })) : []);

export function HeatmapMap({ data, showRequests, showProviders }) {
  if (!data) return <div style={styles.empty}>Loading heatmap…</div>;
  const payload = JSON.stringify({
    requests: showRequests ? cells(data.requests) : [],
    providers: showProviders ? cells(data.providers) : [],
    cell: { lat: num(data.cell?.latDeg), lng: num(data.cell?.lngDeg) },
    bounds: { s: num(data.bounds?.south), n: num(data.bounds?.north), w: num(data.bounds?.west), e: num(data.bounds?.east) },
    tiles: MAP_TILES
  }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body,#map{height:100%;margin:0;overflow:hidden;background:#edf4f0;font-family:Arial,sans-serif}
  .tile{position:absolute;width:256px;height:256px;filter:saturate(.6)}
  .cell{position:absolute;box-sizing:border-box;border:1px solid rgba(200,50,43,.35);z-index:2}
  .prov{position:absolute;transform:translate(-50%,-50%);z-index:3;border:2px solid white;border-radius:50%;background:#12805C;color:white;font-size:11px;font-weight:700;display:grid;place-items:center;box-shadow:0 2px 6px #0004}
  .legend{position:absolute;left:10px;top:10px;z-index:5;background:#fffffff2;padding:8px 10px;border-radius:8px;font-size:11px;display:grid;gap:6px}
  .ramp{display:flex;align-items:center;gap:6px}.ramp i{display:inline-block;width:80px;height:10px;border-radius:3px;background:linear-gradient(90deg,rgba(200,50,43,.18),rgba(200,50,43,.85))}
  .dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#12805C;vertical-align:middle;margin-right:6px}
  .credit{position:absolute;right:5px;bottom:4px;z-index:5;background:#fffffff2;font-size:9px;padding:1px 3px}
  </style></head><body><div id="map"></div><script>
  const d=${payload},map=document.getElementById('map');
  function point(lat,lng,z){const s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180),n=256*Math.pow(2,z);return{x:(lng+180)/360*n,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n};}
  function draw(){const w=innerWidth,h=innerHeight,all=d.requests.concat(d.providers);
   // Frame the data (padded by two cells), or the whole service area when there is none.
   let b=all.length?{s:Math.min(...all.map(c=>c.lat))-2*d.cell.lat,n:Math.max(...all.map(c=>c.lat))+2*d.cell.lat,w:Math.min(...all.map(c=>c.lng))-2*d.cell.lng,e:Math.max(...all.map(c=>c.lng))+2*d.cell.lng}:d.bounds;
   let z=14;for(;z>8;z--){const a=point(b.n,b.w,z),c=point(b.s,b.e,z);if(c.x-a.x<w-40&&c.y-a.y<h-40)break;}
   const a=point(b.n,b.w,z),c=point(b.s,b.e,z),left=(a.x+c.x)/2-w/2,top=(a.y+c.y)/2-h/2;map.replaceChildren();
   for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){const img=document.createElement('img');img.className='tile';img.alt='';img.src=d.tiles.baseUrl+'/'+z+'/'+x+'/'+y+'.png'+d.tiles.query;img.style.left=x*256-left+'px';img.style.top=y*256-top+'px';map.append(img);}
   const max=Math.max(1,...d.requests.map(c=>c.count));
   d.requests.forEach(c=>{const p=point(c.lat+d.cell.lat/2,c.lng-d.cell.lng/2,z),q=point(c.lat-d.cell.lat/2,c.lng+d.cell.lng/2,z),t=Math.sqrt(c.count/max),el=document.createElement('div');
    el.className='cell';el.style.left=p.x-left+'px';el.style.top=p.y-top+'px';el.style.width=q.x-p.x+'px';el.style.height=q.y-p.y+'px';el.style.background='rgba(200,50,43,'+(.18+.67*t).toFixed(2)+')';el.title=c.count+' request'+(c.count===1?'':'s');map.append(el);});
   d.providers.forEach(c=>{const p=point(c.lat,c.lng,z),s=Math.min(34,18+4*Math.log2(c.count)),el=document.createElement('div');
    el.className='prov';el.style.left=p.x-left+'px';el.style.top=p.y-top+'px';el.style.width=el.style.height=s+'px';el.textContent=String(c.count);el.title=c.count+' online provider'+(c.count===1?'':'s');map.append(el);});
   const legend=document.createElement('div');legend.className='legend';const r=document.createElement('div');r.className='ramp';r.append('Requests per ~1 km cell: few',document.createElement('i'),'many');
   const pv=document.createElement('div');const dot=document.createElement('span');dot.className='dot';pv.append(dot,'Online providers (count per cell)');legend.append(r,pv);map.append(legend);
   const credit=document.createElement('div');credit.className='credit';credit.textContent='© OpenStreetMap contributors · © CARTO';map.append(credit);}
  addEventListener('resize',draw);draw();</script></body></html>`;
  return <iframe title="Request heatmap for Islamabad and Rawalpindi" srcDoc={html} style={styles.frame} sandbox="allow-scripts" />;
}

const styles = {
  frame: { width: "100%", height: 560, border: "1px solid var(--border)", borderRadius: 18, background: "white" },
  empty: { height: 300, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 18, color: "var(--muted)", background: "white" }
};
