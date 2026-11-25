import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Cloud,Play,Folder,Home,Star,ChartNoAxesColumn,Music,Server,LayoutGrid} from 'lucide-react';
import {writeFileSync} from 'node:fs';
const tiles=[
 [Cloud,'#78dcff','#3584e3'],[Play,'#ffb49f','#e97591'],[Folder,'#c3adff','#8970d8'],
 [Home,'#8be8c6','#3ba999'],[Star,'#ffe19a','#dfaa51'],[ChartNoAxesColumn,'#9fb9ff','#5c76d3'],
 [Music,'#f6b3df','#c66eaf'],[Server,'#91e2e6','#49a6c2'],[LayoutGrid,'#b0c4ff','#7988d8']
];
const defs=tiles.map(([,a,b],i)=>`<linearGradient id="t${i}" x2=".25" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('');
const cells=tiles.map(([Icon],i)=>{
 const x=190+(i%3)*228,y=190+Math.floor(i/3)*228;
 const glyph=renderToStaticMarkup(React.createElement(Icon,{x:48,y:48,width:92,height:92,color:'white',strokeWidth:1.7,fill:i===1?'white':'none'}));
 return `<g transform="translate(${x} ${y})"><rect width="188" height="188" rx="48" fill="url(#t${i})" filter="url(#shadow)"/><rect x="1" y="1" width="186" height="186" rx="47" fill="none" stroke="white" stroke-opacity=".28" stroke-width="2"/>${glyph}</g>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="base" x2="1" y2="1"><stop stop-color="#141c3a"/><stop offset="1" stop-color="#28345e"/></linearGradient><radialGradient id="glow"><stop stop-color="#7c8fd7" stop-opacity=".28"/><stop offset="1" stop-color="#7c8fd7" stop-opacity="0"/></radialGradient><filter id="shadow" x="-30%" y="-25%" width="160%" height="175%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#040b24" flood-opacity=".3"/></filter>${defs}</defs><rect width="1024" height="1024" fill="url(#base)"/><circle cx="700" cy="200" r="720" fill="url(#glow)"/>${cells}</svg>`;
writeFileSync(new URL('../public/icons/launcher.svg',import.meta.url),svg);
console.log('Created launcher icon SVG.');
