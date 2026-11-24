import { tokens } from "../../design/tokens";
import { LEGACY_MAP_TILES } from "./legacyMapTiles";
import { MAP_CANVAS_EDGE, MAP_CANVAS_FOCUS_ZOOM, type MapCanvasProps } from "./MapCanvas.types";
import { BOOKING_MAP_CENTER } from "../GoogleMap.shared";
import { safeNumber, safePoint, safePoints, safeText, scriptJson } from "./mapHtmlSafety";
import type { MapCanvasMarker } from "./MapCanvas.types";

const c = tokens.color;
const s = tokens.sizes;

const MARKER_KINDS: ReadonlyArray<MapCanvasMarker["kind"]> = ["pickup", "destination", "provider", "user"];

/**
 * Serialisable state pushed into the tile canvas document (initially and on every update).
 * Coordinates are forced through Number(), text through String(), and the marker kind (used as a CSS class)
 * is whitelisted, so nothing from requests, providers or addresses can change the document's structure.
 */
export function tileCanvasState(props: MapCanvasProps) {
  const focusPoint = props.focus ? safePoint(props.focus.coordinate) : null;
  return {
    markers: (props.markers ?? []).flatMap((m) => {
      const coordinate = safePoint(m.coordinate);
      if (!coordinate) return [];
      const kind = MARKER_KINDS.includes(m.kind) ? m.kind : "pickup";
      return [{ id: String(m.id), kind, coordinate, label: safeText(m.label) }];
    }),
    route: safePoints(props.route),
    focus: focusPoint ? { coordinate: focusPoint, requestId: safeNumber(props.focus!.requestId) } : null,
    inset: { top: safeNumber(props.inset?.top), bottom: safeNumber(props.inset?.bottom) },
    pinMode: Boolean(props.onCenterChange),
    initialCenter: safePoint(props.initialCenter) ?? BOOKING_MAP_CENTER
  };
}

/** JS expression for the live-update call (Android injectJavaScript); escaped like the boot payload. */
export function tileCanvasUpdateScript(props: MapCanvasProps) {
  return `window.rapidassistUpdate(${scriptJson(tileCanvasState(props))});true;`;
}

/**
 * Self-contained OSM raster map (pan, zoom, fit, recentre, centre reporting) for builds without a
 * Google Maps key. The same document runs in the Android WebView and the web iframe.
 * Text values only ever reach the DOM through textContent.
 */
export function buildTileCanvasHtml(instance: string, props: MapCanvasProps) {
  const boot = scriptJson({ id: String(instance), tiles: LEGACY_MAP_TILES, state: tileCanvasState(props) });
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
html,body{height:100%;margin:0;overflow:hidden;background:${c.surfaceAlt};font-family:Inter,Arial,sans-serif;-webkit-tap-highlight-color:transparent}
#map{position:absolute;inset:0;touch-action:none;cursor:grab;user-select:none}
.tile{position:absolute;width:256px;height:256px;filter:saturate(.75)}
.m{position:absolute;transform:translate(-50%,-50%);border-radius:50%;box-sizing:border-box;z-index:3}
.pickup{width:${s.mapMarker}px;height:${s.mapMarker}px;background:${c.primary};border:4px solid ${c.surface};box-shadow:0 2px 8px ${c.shadowSoft}}
.destination{width:${s.mapMarker}px;height:${s.mapMarker}px;background:${c.red};border:4px solid ${c.surface};box-shadow:0 2px 8px ${c.shadowSoft}}
.user{width:16px;height:16px;background:${c.primary};border:3px solid ${c.surface};box-shadow:0 0 0 8px ${c.primaryHalo}}
.provider{width:${s.mapMarkerProvider}px;height:${s.mapMarkerProvider}px;background:${c.amber};border:3px solid ${c.surface};box-shadow:0 3px 10px ${c.shadowSoft};display:flex;align-items:center;justify-content:center}
.provider:after{content:"";width:10px;height:10px;border-radius:50%;background:${c.ink}}
.lbl{position:absolute;transform:translate(-50%,16px);background:${c.ink};color:${c.surface};border-radius:8px;padding:3px 7px;font-size:11px;font-weight:600;white-space:nowrap;z-index:4}
.credit{position:absolute;right:6px;background:${c.surfaceGlass};font-size:9px;padding:2px 4px;border-radius:4px;z-index:5}.credit a{color:${c.slate};text-decoration:none}
.ctl{position:absolute;right:12px;display:grid;gap:8px;z-index:6}
.ctl button{width:44px;height:44px;border-radius:14px;border:1px solid ${c.line};background:${c.surface};color:${c.ink};font-size:20px;box-shadow:0 2px 8px ${c.shadowSoft};cursor:pointer}
</style></head><body><div id="map"></div><div class="ctl" id="ctl">
<button type="button" id="zin" aria-label="Zoom in">+</button><button type="button" id="zout" aria-label="Zoom out">−</button></div>
<div class="credit" id="credit"></div><script>
const boot=${boot};let st=boot.state;const map=document.getElementById('map');
let cam={lat:st.initialCenter.latitude,lng:st.initialCenter.longitude,z:13},moved=false,lastFocus=null,drag=null,pinch=null;
const W=()=>innerWidth,H=()=>innerHeight;
function px(lat,lng,z){const s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180),n=256*Math.pow(2,z);return{x:(lng+180)/360*n,y:(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n};}
function ll(x,y,z){const n=256*Math.pow(2,z),lng=x/n*360-180,k=Math.PI-2*Math.PI*y/n;return{lat:180/Math.PI*Math.atan(0.5*(Math.exp(k)-Math.exp(-k))),lng};}
function send(m){m.id=boot.id;const t=JSON.stringify(m);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(t);else parent.postMessage({rapidassistMap:t},'*');}
function pts(){return st.markers.map(m=>m.coordinate).concat(st.route);}
// Pin mode keeps the target under the fixed centre pin; otherwise centre it in the gap between overlays.
function centerOn(lat,lng,z){const o=px(lat,lng,z);const c=ll(o.x,o.y+(st.pinMode?0:(st.inset.bottom-st.inset.top)/2),z);cam={lat:c.lat,lng:c.lng,z};}
function fit(){const p=pts();const top=st.inset.top+${MAP_CANVAS_EDGE},bot=st.inset.bottom+${MAP_CANVAS_EDGE};
 if(p.length===0)return;if(p.length===1){centerOn(p[0].latitude,p[0].longitude,${MAP_CANVAS_FOCUS_ZOOM});return;}
 else{let z=17;for(;z>3;z--){const q=p.map(c=>px(c.latitude,c.longitude,z));const w=Math.max(...q.map(a=>a.x))-Math.min(...q.map(a=>a.x)),h=Math.max(...q.map(a=>a.y))-Math.min(...q.map(a=>a.y));if(w<W()-2*${MAP_CANVAS_EDGE}&&h<H()-top-bot)break;}
  const q=p.map(c=>px(c.latitude,c.longitude,z));const cx=(Math.max(...q.map(a=>a.x))+Math.min(...q.map(a=>a.x)))/2,cy=(Math.max(...q.map(a=>a.y))+Math.min(...q.map(a=>a.y)))/2+(bot-top)/2;const c=ll(cx,cy,z);cam={lat:c.lat,lng:c.lng,z};}
}
function draw(){const z=Math.round(cam.z),o=px(cam.lat,cam.lng,z),L=o.x-W()/2,T=o.y-H()/2;map.replaceChildren();
 for(let x=Math.floor(L/256);x<=Math.floor((L+W())/256);x++)for(let y=Math.floor(T/256);y<=Math.floor((T+H())/256);y++){const n=Math.pow(2,z);if(y<0||y>=n)continue;const i=document.createElement('img');i.className='tile';i.alt='';i.draggable=false;i.src=boot.tiles.baseUrl+'/'+z+'/'+(((x%n)+n)%n)+'/'+y+'.png'+boot.tiles.query;i.style.left=(x*256-L)+'px';i.style.top=(y*256-T)+'px';map.append(i);}
 if(st.route.length>1){const g=document.createElementNS('http://www.w3.org/2000/svg','svg');g.setAttribute('width',W());g.setAttribute('height',H());g.style.cssText='position:absolute;left:0;top:0;z-index:2';const pts=st.route.map(c=>{const p=px(c.latitude,c.longitude,z);return(p.x-L)+','+(p.y-T);}).join(' ');
  [['${c.surface}',10],['${c.primary}',6]].forEach(([col,w])=>{const l=document.createElementNS(g.namespaceURI,'polyline');l.setAttribute('points',pts);l.setAttribute('fill','none');l.setAttribute('stroke',col);l.setAttribute('stroke-width',w);l.setAttribute('stroke-linecap','round');l.setAttribute('stroke-linejoin','round');g.append(l);});map.append(g);}
 st.markers.forEach(m=>{const p=px(m.coordinate.latitude,m.coordinate.longitude,z);const d=document.createElement('div');d.className='m '+m.kind;d.style.left=(p.x-L)+'px';d.style.top=(p.y-T)+'px';map.append(d);
  if(m.label){const b=document.createElement('div');b.className='lbl';b.textContent=m.label;b.style.left=d.style.left;b.style.top=d.style.top;map.append(b);}});
 document.getElementById('ctl').style.top=(st.inset.top+16)+'px';document.getElementById('credit').style.bottom=(st.inset.bottom+4)+'px';}
function update(next){st=next;const f=st.focus;if(f&&(!lastFocus||f.requestId!==lastFocus)){lastFocus=f.requestId;moved=false;centerOn(f.coordinate.latitude,f.coordinate.longitude,${MAP_CANVAS_FOCUS_ZOOM});}
 else if(!moved&&!st.pinMode)fit();draw();}
window.rapidassistUpdate=update;
addEventListener('message',e=>{const d=e.data;if(d&&d.rapidassistMapState)update(JSON.parse(d.rapidassistMapState));});
function report(){if(st.pinMode)send({type:'center',latitude:cam.lat,longitude:cam.lng});}
function panBy(dx,dy){const o=px(cam.lat,cam.lng,cam.z);const c=ll(o.x-dx,o.y-dy,cam.z);cam.lat=c.lat;cam.lng=c.lng;}
function zoom(d){cam.z=Math.max(3,Math.min(19,Math.round(cam.z)+d));moved=true;draw();report();}
map.addEventListener('pointerdown',e=>{if(!e.isPrimary)return;drag={x:e.clientX,y:e.clientY};map.setPointerCapture(e.pointerId);});
map.addEventListener('pointermove',e=>{if(!drag)return;panBy(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};moved=true;draw();});
map.addEventListener('pointerup',()=>{if(drag){drag=null;report();}});map.addEventListener('pointercancel',()=>{drag=null;});
map.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1:-1);},{passive:false});
document.getElementById('zin').onclick=()=>zoom(1);document.getElementById('zout').onclick=()=>zoom(-1);
const cr=document.getElementById('credit');const a=document.createElement('a');a.href='https://www.openstreetmap.org/copyright';a.target='_blank';a.rel='noreferrer';a.textContent='© OpenStreetMap contributors'+(boot.tiles.usesCarto?' © CARTO':'');cr.append(a);
addEventListener('resize',()=>{if(!moved&&!st.pinMode)fit();draw();});update(st);
</script></body></html>`;
}
