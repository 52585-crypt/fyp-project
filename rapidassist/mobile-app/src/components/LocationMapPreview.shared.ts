import type { Coordinate } from "../utils/distance";
import { tokens } from "../design/tokens";
import { LEGACY_MAP_TILES } from "./maps/legacyMapTiles";

const c = tokens.color;

export type MapPreviewProps = {
  pickup: Coordinate;
  destination?: Coordinate | null;
  route?: Coordinate[];
  providers?: Array<{ id: string; name: string; distanceKm?: number | null; location: Coordinate }>;
  pickupLabel?: string;
  destinationLabel?: string;
  title?: string;
  requiresGoogleMap?: boolean;
  interactive?: boolean;
};

// One renderer for web iframe and native WebView. Text never enters HTML markup.
export function buildPreviewHtml(props: MapPreviewProps) {
  const payload = JSON.stringify({
    ...props,
    route: props.route || [],
    providers: props.providers || [],
    tileConfig: LEGACY_MAP_TILES
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body,#map{height:100%;margin:0;overflow:hidden;background:${c.surfaceAlt};font-family:Arial,sans-serif}
  .tile{position:absolute;width:256px;height:256px}.pin{position:absolute;width:18px;height:18px;border:3px solid ${c.surface};border-radius:50%;margin:-12px;z-index:3;box-shadow:0 2px 8px ${c.overlay}}
  .label{position:absolute;transform:translate(-50%,15px);background:${c.surface};border-radius:7px;padding:4px 6px;font-size:11px;color:${c.text};z-index:4;max-width:130px;text-align:center}
  .hint{position:absolute;top:10px;left:10px;right:10px;padding:9px;background:${c.surface};border-radius:10px;z-index:5;font-size:12px;text-align:center}
  .credit{position:absolute;bottom:4px;right:4px;background:${c.surface};font-size:9px;z-index:5;padding:3px}.credit a{color:${c.muted}}
  #map.interactive{touch-action:none;cursor:grab;user-select:none}
  .controls{position:absolute;right:8px;bottom:25px;z-index:6;display:grid;gap:3px}
  .controls button{width:44px;height:44px;background:${c.surface};border:1px solid ${c.border};border-radius:8px;color:${c.text};font-size:20px;cursor:pointer}
  </style></head><body><div id="map"></div><div class="controls" hidden id="controls" style="display:none">
  <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
  <button type="button" id="zoom-out" aria-label="Zoom out">−</button>
  <button type="button" id="reset" aria-label="Fit map to route">⌖</button>
  </div><script>
  const data=${payload};const map=document.getElementById('map');
  let zoomOffset=0, panX=0, panY=0, drag=null;
  function point(c,z){const lat=Math.max(-85,Math.min(85,c.latitude));const sin=Math.sin(lat*Math.PI/180);const s=256*Math.pow(2,z);return{x:(c.longitude+180)/360*s,y:(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*s};}
  function draw(){
    const w=innerWidth,h=innerHeight;const coords=[data.pickup,...(data.destination?[data.destination]:[]),...data.providers.map(p=>p.location),...data.route];
    function bounds(z){const p=coords.map(c=>point(c,z));return{left:Math.min(...p.map(p=>p.x)),right:Math.max(...p.map(p=>p.x)),top:Math.min(...p.map(p=>p.y)),bottom:Math.max(...p.map(p=>p.y))};}
    let fitZoom=16;
    for(;fitZoom>2;fitZoom--){const b=bounds(fitZoom);if(b.right-b.left<w-90&&b.bottom-b.top<h-110)break;}
    const z=Math.max(2,Math.min(19,fitZoom+zoomOffset)),b=bounds(z);
    const left=(b.left+b.right)/2-w/2-panX,top=(b.top+b.bottom)/2-h/2-panY;map.replaceChildren();
    document.getElementById('zoom-in').disabled=z>=19;
    document.getElementById('zoom-out').disabled=z<=2;
    for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){
      const img=document.createElement('img');img.className='tile';img.alt='';const tileSrc=data.tileConfig.baseUrl+'/'+z+'/'+x+'/'+y+'.png'+data.tileConfig.query;let retries=0;img.onerror=()=>{if(retries>=2)return;retries++;setTimeout(()=>{img.src=tileSrc+(tileSrc.includes('?')?'&':'?')+'retry='+retries;},retries*600);};img.src=tileSrc;img.style.left=(x*256-left)+'px';img.style.top=(y*256-top)+'px';map.append(img);
    }
    if(data.route.length>1){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',w);svg.setAttribute('height',h);svg.style.position='absolute';const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',data.route.map(c=>{const p=point(c,z);return(p.x-left)+','+(p.y-top)}).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','${c.primary}');line.setAttribute('stroke-width','5');line.setAttribute('stroke-linecap','round');svg.append(line);map.append(svg);}
    function pin(c,color,text){const p=point(c,z);const dot=document.createElement('div');dot.className='pin';dot.style.cssText='left:'+(p.x-left)+'px;top:'+(p.y-top)+'px;background:'+color;const label=document.createElement('div');label.className='label';label.style.left=(p.x-left)+'px';label.style.top=(p.y-top)+'px';label.textContent=text;map.append(dot,label);}
    pin(data.pickup,'${c.primary}',data.pickupLabel||'Pickup');if(data.destination)pin(data.destination,'${c.danger}',data.destinationLabel||'Destination');data.providers.forEach(p=>pin(p.location,'${c.primary}',p.name));
    if(data.title){const hint=document.createElement('div');hint.className='hint';hint.textContent=data.title;map.append(hint);}
    const credit=document.createElement('div');credit.className='credit';const osm=document.createElement('a');osm.href='https://www.openstreetmap.org/copyright';osm.textContent='© OpenStreetMap';osm.target='_blank';osm.rel='noreferrer';credit.append(osm);if(data.tileConfig.usesCarto){const carto=document.createElement('a');carto.href='https://carto.com/attributions';carto.textContent=' © CARTO';carto.target='_blank';carto.rel='noreferrer';credit.append(carto);}map.append(credit);
  }
  if(data.interactive){
    map.classList.add('interactive');
    const controls=document.getElementById('controls');controls.hidden=false;controls.style.display='grid';
    document.getElementById('zoom-in').onclick=()=>{zoomOffset++;panX*=2;panY*=2;draw();};
    document.getElementById('zoom-out').onclick=()=>{zoomOffset--;panX/=2;panY/=2;draw();};
    document.getElementById('reset').onclick=()=>{zoomOffset=0;panX=0;panY=0;draw();};
    map.addEventListener('pointerdown',(event)=>{
      if(!event.isPrimary||event.button!==0||event.target.closest('a'))return;
      event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY};map.setPointerCapture(event.pointerId);
    });
    map.addEventListener('pointerup',(event)=>{
      if(!drag||event.pointerId!==drag.id)return;
      panX+=event.clientX-drag.x;panY+=event.clientY-drag.y;drag=null;draw();
    });
    map.addEventListener('pointercancel',()=>{drag=null;});
  }
  window.addEventListener('resize',draw);draw();
  </script></body></html>`;
}
