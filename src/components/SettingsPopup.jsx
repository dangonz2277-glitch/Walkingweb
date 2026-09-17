import Modal from './Modal.jsx';
import { exportData, importData } from '../data/importExport.js';
import { useState } from 'react';

export default function SettingsPopup({ isOpen, onClose, triggerRef, onImportSuccess }) {
  const [message, setMessage] = useState('');

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = importData(await file.text());
      setMessage(`Importación: ${result.added} registros agregados; ${result.conflicts} conflictos conservados sin sobrescribir.`);
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
    e.target.value = '';
  }

  function handleExport() {
    try {
      exportData();
      setMessage('Respaldo descargado. Guárdalo antes de cambiar de archivo.');
    } catch (err) {
      setMessage(`Error al exportar: ${err.message}`);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustes" triggerRef={triggerRef}>
      <p>Gestión de datos locales y configuraciones.</p>
      
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
        <button onClick={handleExport}>Exportar respaldo</button>
        <label className="import-button">
          Importar respaldo
          <input type="file" accept=".json,application/json" onChange={upload} />
        </label>
      </div>

      {message && <div role={message.startsWith('Error') ? 'alert' : 'status'} className="notice" style={{ marginTop: '16px', marginLeft: 0, marginRight: 0 }}>{message}</div>}
    </Modal>
  );
}
