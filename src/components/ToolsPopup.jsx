import Modal from './Modal.jsx';
import { toolLinks } from '../data/toolLinks.js';

export default function ToolsPopup({ isOpen, onClose, triggerRef }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} title="Herramientas">
      {isOpen && <>
        <p className="popup-description">Tus accesos de trabajo. Se abren en una nueva pestaña.</p>
        <div className="tool-shortcuts">
          {toolLinks.map(link => (
            <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer" className="tool-shortcut">
              <span>{link.label}</span><span aria-hidden="true">↗</span>
              <span className="tool-link-hint">Abrir en nueva pestaña</span>
            </a>
          ))}
        </div>
      </>}
    </Modal>
  );
}
