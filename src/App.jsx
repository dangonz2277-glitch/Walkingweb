"use client";

import { useState } from 'react';
import Catalog from './components/Catalog.jsx';
import Guide from './components/Guide.jsx';
import Report from './components/Report.jsx';
import { exportData, importData } from './data/importExport.js';
import { initStore } from './data/store.js';

const pages={catalog:'Catálogo',guide:'Guía',report:'Mi Reporte'};

export default function App({ initialData }) {
  useState(() => {
    if (initialData) initStore(initialData);
  });
  
  const [page,setPage]=useState('catalog');
  const [message,setMessage]=useState('');
  const [revision,setRevision]=useState(0);
  
  async function upload(e){
    const file=e.target.files?.[0];
    if(!file)return;
    try{
      const result=importData(await file.text());
      setMessage(`Importación: ${result.added} registros agregados; ${result.conflicts} conflictos conservados sin sobrescribir.`);
      setRevision(revision+1);
    }catch(err){
      setMessage(err.message);
    }
    e.target.value='';
  }
  
  return (
    <>
      <header>
        <h1>WalkingPad · Catálogo</h1>
        <p>Consulta y trabajo local sin servidor</p>
      </header>
      <nav>
        {Object.entries(pages).map(([key,label])=>
          <button key={key} className={page===key?'active':''} onClick={()=>setPage(key)}>{label}</button>
        )}
        <button onClick={()=>{
          try{
            exportData();
            setMessage('Respaldo descargado. Guárdalo antes de cambiar de archivo.');
          }catch(err){
            setMessage(err.message);
          }
        }}>Exportar respaldo</button>
        <label className="import-button">
          Importar respaldo<input type="file" accept=".json,application/json" onChange={upload}/>
        </label>
      </nav>
      {message&&<p role="status" className="notice">{message}</p>}
      <main key={revision}>
        {page==='catalog'?<Catalog notify={setMessage}/>:page==='guide'?<Guide/>:<Report notify={setMessage}/>}
      </main>
    </>
  );
}
