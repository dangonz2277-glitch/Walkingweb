import { useEffect, useRef } from 'react';
import Guide from './Guide.jsx';

export default function GuidePopup({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  
  useEffect(() => {
    if (!dialogRef.current) return;
    if (isOpen) {
      dialogRef.current.showModal();
    } else {
      dialogRef.current.close();
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  return (
    <dialog ref={dialogRef} onCancel={handleClose} onClose={handleClose} className="report-modal">
      <div className="report-modal-content">
        <button className="close-btn" onClick={handleClose}>X</button>
        {isOpen && <Guide />}
      </div>
    </dialog>
  );
}
